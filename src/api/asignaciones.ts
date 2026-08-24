// Asignaciones: asignar y liberar licencias.
// Reglas 2, 4, 7, 8: no asignar sin disponibilidad; liberar exige motivo y no
// borra; solo usuarios del maestro activos; comportamiento por tipo/modo_key.

import { Hono } from 'hono'
import type { Env, Variables, Actor } from '../tipos'
import { requireRol } from '../lib/auth-middleware'
import { ahora, consultar, primera } from '../lib/db'
import { stmtHistorial } from '../lib/historial'
import { asignacionSchema, liberacionSchema } from '../lib/validaciones'
import { permisoLicencias, puedeVer } from '../lib/alcance'

export const asignaciones = new Hono<{ Bindings: Env; Variables: Variables }>()

interface FilaLicencia {
  id: number
  nombre_aplicacion: string
  tipo: 'key' | 'flotante' | 'archivo'
  modo_key: 'unica' | 'por_asignacion' | null
  cantidad_total: number
  activo: number
}

function errorZod(e: import('zod').ZodError): string {
  return e.errors.map((x) => x.message).join('. ')
}

// ── Listado (para la pestaña de asignaciones de una licencia y reportes) ─────
asignaciones.get('/', async (c) => {
  const licenciaId = Number(c.req.query('licencia_id'))
  const estado = c.req.query('estado')
  const cond: string[] = []
  const params: unknown[] = []
  if (Number.isInteger(licenciaId)) {
    cond.push('a.licencia_id = ?')
    params.push(licenciaId)
  }
  if (estado === 'asignada' || estado === 'liberada') {
    cond.push('a.estado = ?')
    params.push(estado)
  }
  // Alcance: solo asignaciones de licencias autorizadas.
  const permiso = await permisoLicencias(c.env, c.get('actor') as Actor)
  if (permiso.restringido) {
    if (permiso.ids.size === 0) cond.push('1 = 0')
    else {
      cond.push(`a.licencia_id IN (${Array.from(permiso.ids).map(() => '?').join(',')})`)
      params.push(...permiso.ids)
    }
  }
  const where = cond.length ? ` WHERE ${cond.join(' AND ')}` : ''
  const filas = await consultar(
    c.env,
    `SELECT a.*, m.nombre AS usuario_nombre, m.email AS usuario_email, m.area AS usuario_area,
            l.nombre_aplicacion, l.tipo AS licencia_tipo,
            ua.email AS asignada_por_email, ul.email AS liberada_por_email
     FROM asignaciones a
     JOIN usuarios_maestro m ON m.id = a.usuario_maestro_id
     JOIN licencias l ON l.id = a.licencia_id
     LEFT JOIN usuarios_app ua ON ua.id = a.asignada_por
     LEFT JOIN usuarios_app ul ON ul.id = a.liberada_por
     ${where}
     ORDER BY a.fecha_asignacion DESC, a.id DESC`,
    ...params,
  )
  return c.json({ asignaciones: filas })
})

// ── Asignar ─────────────────────────────────────────────────────────────────
asignaciones.post('/', requireRol('admin', 'operador'), async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = asignacionSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: errorZod(parsed.error) }, 400)
  const d = parsed.data
  const actor = c.get('actor') as Actor

  const lic = await primera<FilaLicencia>(
    c.env,
    `SELECT id, nombre_aplicacion, tipo, modo_key, cantidad_total, activo FROM licencias WHERE id = ?`,
    d.licencia_id,
  )
  if (!lic) return c.json({ error: 'Licencia no encontrada' }, 404)
  if (lic.activo !== 1) return c.json({ error: 'La licencia está dada de baja' }, 409)

  // Alcance: solo puede asignar licencias autorizadas.
  const permisoAsig = await permisoLicencias(c.env, actor)
  if (!puedeVer(permisoAsig, d.licencia_id)) {
    return c.json({ error: 'No tiene permisos para asignar esta licencia.' }, 403)
  }

  // Regla 7: usuario del maestro debe existir y estar activo.
  const usuario = await primera<{ id: number; nombre: string; activo: number }>(
    c.env,
    `SELECT id, nombre, activo FROM usuarios_maestro WHERE id = ?`,
    d.usuario_maestro_id,
  )
  if (!usuario) return c.json({ error: 'Usuario del maestro no encontrado' }, 404)
  if (usuario.activo !== 1) {
    return c.json({ error: 'El usuario del maestro está inactivo y no puede recibir licencias' }, 409)
  }

  // Regla 2: no asignar sin disponibilidad.
  const vig = await primera<{ n: number }>(
    c.env,
    `SELECT COUNT(*) AS n FROM asignaciones WHERE licencia_id = ? AND estado = 'asignada'`,
    d.licencia_id,
  )
  const vigentes = vig?.n ?? 0
  if (vigentes >= lic.cantidad_total) {
    return c.json({ error: 'No hay licencias disponibles para asignar.' }, 409)
  }

  // No duplicar asignación vigente del mismo usuario (regla del índice único).
  const yaAsignada = await primera<{ id: number }>(
    c.env,
    `SELECT id FROM asignaciones WHERE licencia_id = ? AND usuario_maestro_id = ? AND estado = 'asignada'`,
    d.licencia_id,
    d.usuario_maestro_id,
  )
  if (yaAsignada) {
    return c.json({ error: 'El usuario ya tiene una asignación vigente de esta licencia.' }, 409)
  }

  // Regla 8: manejo de key según tipo/modo_key.
  let keyAsignada: string | null = null
  if (lic.tipo === 'key' && lic.modo_key === 'por_asignacion') {
    if (!d.key_asignada) {
      return c.json({ error: 'Debe indicar la key para esta asignación.' }, 400)
    }
    const dup = await primera<{ id: number }>(
      c.env,
      `SELECT id FROM asignaciones WHERE licencia_id = ? AND key_asignada = ? AND estado = 'asignada'`,
      d.licencia_id,
      d.key_asignada,
    )
    if (dup) return c.json({ error: 'Esa key ya está asignada en esta licencia.' }, 409)
    keyAsignada = d.key_asignada
  }
  // key/unica, flotante y archivo: no se guarda key en la asignación.

  const ts = ahora()
  const insert = c.env.DB.prepare(
    `INSERT INTO asignaciones
       (licencia_id, usuario_maestro_id, estado, key_asignada, aprobador,
        ticket_referencia, observacion_asignacion, fecha_asignacion, asignada_por)
     VALUES (?, ?, 'asignada', ?, ?, ?, ?, ?, ?)`,
  ).bind(
    d.licencia_id,
    d.usuario_maestro_id,
    keyAsignada,
    d.aprobador ?? null,
    d.ticket_referencia ?? null,
    d.observacion_asignacion ?? null,
    ts,
    actor.id,
  )

  const hist = c.env.DB.prepare(
    `INSERT INTO historial
       (ts, entidad, entidad_id, licencia_id, accion, usuario_app_id, usuario_app_email,
        usuario_maestro_nombre, detalle, detalle_json, ip)
     VALUES (?, 'asignacion', last_insert_rowid(), ?, 'ASIGNAR', ?, ?, ?, ?, ?, ?)`,
  ).bind(
    ts,
    d.licencia_id,
    actor.id,
    actor.email,
    usuario.nombre,
    `Asignación de "${lic.nombre_aplicacion}" a ${usuario.nombre}`,
    JSON.stringify({
      key_asignada: keyAsignada,
      aprobador: d.aprobador ?? null,
      ticket_referencia: d.ticket_referencia ?? null,
    }),
    c.get('ip'),
  )

  try {
    await c.env.DB.batch([insert, hist])
  } catch (e) {
    // El índice único puede saltar por concurrencia.
    if (String(e).includes('UNIQUE')) {
      return c.json({ error: 'El usuario ya tiene una asignación vigente de esta licencia.' }, 409)
    }
    throw e
  }
  return c.json({ ok: true }, 201)
})

// ── Liberar ─────────────────────────────────────────────────────────────────
asignaciones.put('/:id/liberar', requireRol('admin', 'operador'), async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) return c.json({ error: 'Identificador inválido' }, 400)

  const body = await c.req.json().catch(() => null)
  const parsed = liberacionSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: errorZod(parsed.error) }, 400)

  const asig = await primera<{
    id: number
    licencia_id: number
    estado: string
    usuario_nombre: string
    nombre_aplicacion: string
  }>(
    c.env,
    `SELECT a.id, a.licencia_id, a.estado, m.nombre AS usuario_nombre, l.nombre_aplicacion
     FROM asignaciones a
     JOIN usuarios_maestro m ON m.id = a.usuario_maestro_id
     JOIN licencias l ON l.id = a.licencia_id
     WHERE a.id = ?`,
    id,
  )
  if (!asig) return c.json({ error: 'Asignación no encontrada' }, 404)
  if (asig.estado !== 'asignada') {
    return c.json({ error: 'La asignación ya está liberada' }, 409)
  }

  const actor = c.get('actor') as Actor

  // Alcance: solo puede liberar asignaciones de licencias autorizadas.
  const permisoLib = await permisoLicencias(c.env, actor)
  if (!puedeVer(permisoLib, asig.licencia_id)) {
    return c.json({ error: 'No tiene permisos para liberar esta asignación.' }, 403)
  }

  const ts = ahora()

  // Regla 4: liberar no borra; cambia estado y registra datos de liberación.
  const update = c.env.DB.prepare(
    `UPDATE asignaciones
       SET estado = 'liberada', fecha_liberacion = ?, liberada_por = ?, motivo_liberacion = ?
     WHERE id = ? AND estado = 'asignada'`,
  ).bind(ts, actor.id, parsed.data.motivo_liberacion, id)

  const hist = stmtHistorial(c.env, {
    entidad: 'asignacion',
    entidadId: id,
    licenciaId: asig.licencia_id,
    accion: 'LIBERAR',
    actor,
    usuarioMaestroNombre: asig.usuario_nombre,
    detalle: `Liberación de "${asig.nombre_aplicacion}" de ${asig.usuario_nombre}. Motivo: ${parsed.data.motivo_liberacion}`,
    detalleJson: { motivo: parsed.data.motivo_liberacion },
    ip: c.get('ip'),
  })

  await c.env.DB.batch([update, hist])
  return c.json({ ok: true })
})
