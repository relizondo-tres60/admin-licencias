// CRUD de licencias con disponibilidad calculada en consulta.
// Reglas 1–6: disponibles = cantidad_total − asignaciones vigentes; no se
// permite reducir por debajo de las vigentes; baja lógica sin vigentes; toda
// escritura registra en historial dentro de la misma transacción.

import { Hono } from 'hono'
import type { Env, Variables, Actor } from '../tipos'
import { requireRol } from '../lib/auth-middleware'
import { ahora, consultar, primera } from '../lib/db'
import { stmtHistorial } from '../lib/historial'
import { licenciaSchema, normalizarLicencia, aprobadorSchema } from '../lib/validaciones'
import { permisoLicencias, puedeVer } from '../lib/alcance'

export const licencias = new Hono<{ Bindings: Env; Variables: Variables }>()

const SELECT_BASE = `
  SELECT l.*, COALESCE(a.vig, 0) AS asignadas,
         (l.cantidad_total - COALESCE(a.vig, 0)) AS disponibles,
         (SELECT group_concat(nombre, ', ') FROM licencia_aprobadores ap
            WHERE ap.licencia_id = l.id) AS aprobadores
  FROM licencias l
  LEFT JOIN (
    SELECT licencia_id, COUNT(*) AS vig
    FROM asignaciones WHERE estado = 'asignada' GROUP BY licencia_id
  ) a ON a.licencia_id = l.id`

function errorZod(e: import('zod').ZodError): string {
  return e.errors.map((x) => x.message).join('. ')
}

/** Cantidad de asignaciones vigentes de una licencia. */
async function vigentes(env: Env, licenciaId: number): Promise<number> {
  const r = await primera<{ n: number }>(
    env,
    `SELECT COUNT(*) AS n FROM asignaciones WHERE licencia_id = ? AND estado = 'asignada'`,
    licenciaId,
  )
  return r?.n ?? 0
}

// ── Listado con filtros, búsqueda y orden ───────────────────────────────────
licencias.get('/', async (c) => {
  const { tipo, estado, disponibilidad, q, orden, dir } = c.req.query()
  const cond: string[] = []
  const params: unknown[] = []

  if (tipo && ['key', 'flotante', 'archivo'].includes(tipo)) {
    cond.push('l.tipo = ?')
    params.push(tipo)
  }
  if (estado === 'activas') cond.push('l.activo = 1')
  else if (estado === 'inactivas') cond.push('l.activo = 0')

  if (q) {
    cond.push('(lower(l.nombre_aplicacion) LIKE ? OR lower(l.proveedor) LIKE ?)')
    const like = `%${q.toLowerCase()}%`
    params.push(like, like)
  }

  // Alcance: usuarios restringidos solo ven sus licencias autorizadas.
  const permiso = await permisoLicencias(c.env, c.get('actor') as Actor)
  if (permiso.restringido) {
    if (permiso.ids.size === 0) cond.push('1 = 0')
    else {
      cond.push(`l.id IN (${Array.from(permiso.ids).map(() => '?').join(',')})`)
      params.push(...permiso.ids)
    }
  }

  // Filtro por disponibilidad se aplica sobre la columna calculada.
  const having =
    disponibilidad === 'con'
      ? ' WHERE disponibles > 0'
      : disponibilidad === 'sin'
        ? ' WHERE disponibles <= 0'
        : ''

  const columnasOrden: Record<string, string> = {
    aplicacion: 'nombre_aplicacion',
    tipo: 'tipo',
    total: 'cantidad_total',
    asignadas: 'asignadas',
    disponibles: 'disponibles',
    vencimiento: 'fecha_vencimiento',
  }
  const colOrden = columnasOrden[orden ?? 'aplicacion'] ?? 'nombre_aplicacion'
  const dirOrden = dir === 'desc' ? 'DESC' : 'ASC'

  let sql = SELECT_BASE
  if (cond.length) sql += ` WHERE ${cond.join(' AND ')}`
  sql = `SELECT * FROM (${sql})${having} ORDER BY ${colOrden} ${dirOrden}, nombre_aplicacion ASC`

  const filas = await consultar(c.env, sql, ...params)
  return c.json({ licencias: filas })
})

// ── Detalle (ficha) ─────────────────────────────────────────────────────────
licencias.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) return c.json({ error: 'Identificador inválido' }, 400)
  const permiso = await permisoLicencias(c.env, c.get('actor') as Actor)
  if (!puedeVer(permiso, id)) return c.json({ error: 'Licencia no encontrada' }, 404)
  const lic = await primera(c.env, `SELECT * FROM (${SELECT_BASE}) WHERE id = ?`, id)
  if (!lic) return c.json({ error: 'Licencia no encontrada' }, 404)
  return c.json({ licencia: lic })
})

// ── Crear ───────────────────────────────────────────────────────────────────
licencias.post('/', requireRol('admin', 'operador'), async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = licenciaSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: errorZod(parsed.error) }, 400)
  const d = normalizarLicencia(parsed.data)
  const actor = c.get('actor') as Actor

  // Alcance: usuarios restringidos no pueden crear licencias.
  const permiso = await permisoLicencias(c.env, actor)
  if (permiso.restringido) {
    return c.json({ error: 'No tiene permisos para crear licencias' }, 403)
  }

  const ts = ahora()

  const insertLic = c.env.DB.prepare(
    `INSERT INTO licencias
      (nombre_aplicacion, version, tipo, cantidad_total, modo_key, key_compartida,
       servidor_licencias, ruta_archivo_licencia, key_user_nombre, key_user_email,
       aprobador_nombre, aprobador_email, proveedor, fecha_vencimiento, notas,
       activo, creado_en, creado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  ).bind(
    d.nombre_aplicacion, d.version, d.tipo, d.cantidad_total, d.modo_key, d.key_compartida,
    d.servidor_licencias, d.ruta_archivo_licencia, d.key_user_nombre, d.key_user_email,
    d.aprobador_nombre, d.aprobador_email, d.proveedor, d.fecha_vencimiento, d.notas,
    ts, actor.id,
  )

  // Bitácora en la misma transacción; last_insert_rowid() = id recién creado.
  const insertHist = c.env.DB.prepare(
    `INSERT INTO historial
       (ts, entidad, entidad_id, licencia_id, accion, usuario_app_id, usuario_app_email, detalle, detalle_json, ip)
     VALUES (?, 'licencia', last_insert_rowid(), last_insert_rowid(), 'CREAR', ?, ?, ?, ?, ?)`,
  ).bind(
    ts, actor.id, actor.email,
    `Creación de licencia "${d.nombre_aplicacion}" (${d.tipo}), ${d.cantidad_total} unidad(es)`,
    JSON.stringify({ despues: d }),
    c.get('ip'),
  )

  await c.env.DB.batch([insertLic, insertHist])
  const creada = await primera(
    c.env,
    `SELECT * FROM (${SELECT_BASE}) WHERE id = (SELECT MAX(id) FROM licencias)`,
  )
  return c.json({ licencia: creada }, 201)
})

// ── Editar ──────────────────────────────────────────────────────────────────
licencias.put('/:id', requireRol('admin', 'operador'), async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) return c.json({ error: 'Identificador inválido' }, 400)

  const antes = await primera<Record<string, unknown>>(
    c.env,
    `SELECT * FROM licencias WHERE id = ?`,
    id,
  )
  if (!antes) return c.json({ error: 'Licencia no encontrada' }, 404)

  // Alcance: usuarios restringidos no pueden editar licencias.
  const permisoEd = await permisoLicencias(c.env, c.get('actor') as Actor)
  if (permisoEd.restringido) {
    return c.json({ error: 'No tiene permisos para editar licencias' }, 403)
  }

  const body = await c.req.json().catch(() => null)
  const parsed = licenciaSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: errorZod(parsed.error) }, 400)
  const d = normalizarLicencia(parsed.data)

  // Regla 3: no reducir cantidad_total por debajo de las vigentes.
  const vig = await vigentes(c.env, id)
  if (d.cantidad_total < vig) {
    return c.json(
      {
        error: `No se puede reducir la cantidad a ${d.cantidad_total}: hay ${vig} asignación(es) vigente(s).`,
      },
      409,
    )
  }

  const actor = c.get('actor') as Actor
  const ts = ahora()

  const update = c.env.DB.prepare(
    `UPDATE licencias SET
       nombre_aplicacion = ?, version = ?, tipo = ?, cantidad_total = ?, modo_key = ?,
       key_compartida = ?, servidor_licencias = ?, ruta_archivo_licencia = ?,
       key_user_nombre = ?, key_user_email = ?, aprobador_nombre = ?, aprobador_email = ?,
       proveedor = ?, fecha_vencimiento = ?, notas = ?, actualizado_en = ?, actualizado_por = ?
     WHERE id = ?`,
  ).bind(
    d.nombre_aplicacion, d.version, d.tipo, d.cantidad_total, d.modo_key, d.key_compartida,
    d.servidor_licencias, d.ruta_archivo_licencia, d.key_user_nombre, d.key_user_email,
    d.aprobador_nombre, d.aprobador_email, d.proveedor, d.fecha_vencimiento, d.notas,
    ts, actor.id, id,
  )

  const hist = stmtHistorial(c.env, {
    entidad: 'licencia',
    entidadId: id,
    licenciaId: id,
    accion: 'EDITAR',
    actor,
    detalle: `Edición de licencia "${d.nombre_aplicacion}"`,
    detalleJson: { antes, despues: d },
    ip: c.get('ip'),
  })

  await c.env.DB.batch([update, hist])
  const actualizada = await primera(c.env, `SELECT * FROM (${SELECT_BASE}) WHERE id = ?`, id)
  return c.json({ licencia: actualizada })
})

// ── Baja lógica (solo admin) ────────────────────────────────────────────────
licencias.delete('/:id', requireRol('admin'), async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) return c.json({ error: 'Identificador inválido' }, 400)

  const lic = await primera<{ id: number; nombre_aplicacion: string; activo: number }>(
    c.env,
    `SELECT id, nombre_aplicacion, activo FROM licencias WHERE id = ?`,
    id,
  )
  if (!lic) return c.json({ error: 'Licencia no encontrada' }, 404)
  if (lic.activo === 0) return c.json({ error: 'La licencia ya está dada de baja' }, 409)

  // Regla 5: solo si no tiene asignaciones vigentes.
  const vig = await vigentes(c.env, id)
  if (vig > 0) {
    return c.json(
      { error: `No se puede dar de baja: hay ${vig} asignación(es) vigente(s).` },
      409,
    )
  }

  const actor = c.get('actor') as Actor
  const ts = ahora()
  const update = c.env.DB.prepare(
    `UPDATE licencias SET activo = 0, actualizado_en = ?, actualizado_por = ? WHERE id = ?`,
  ).bind(ts, actor.id, id)
  const hist = stmtHistorial(c.env, {
    entidad: 'licencia',
    entidadId: id,
    licenciaId: id,
    accion: 'ELIMINAR',
    actor,
    detalle: `Baja lógica de licencia "${lic.nombre_aplicacion}"`,
    ip: c.get('ip'),
  })
  await c.env.DB.batch([update, hist])
  return c.json({ ok: true })
})

// ── Aprobadores de una licencia (múltiples; CRUD) ───────────────────────────
interface FilaAprobador {
  id: number
  licencia_id: number
  nombre: string
  email: string | null
  creado_en: string
}

// Listado (visible si el usuario tiene acceso a la licencia).
licencias.get('/:id/aprobadores', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) return c.json({ error: 'Identificador inválido' }, 400)
  const permiso = await permisoLicencias(c.env, c.get('actor') as Actor)
  if (!puedeVer(permiso, id)) return c.json({ error: 'Licencia no encontrada' }, 404)
  const filas = await consultar<FilaAprobador>(
    c.env,
    `SELECT id, licencia_id, nombre, email, creado_en FROM licencia_aprobadores
     WHERE licencia_id = ? ORDER BY nombre COLLATE NOCASE`,
    id,
  )
  return c.json({ aprobadores: filas })
})

// Gestión de aprobadores: solo admin/operador sin restricción de alcance.
async function bloqueaRestringido(env: Env, actor: Actor): Promise<boolean> {
  const permiso = await permisoLicencias(env, actor)
  return permiso.restringido
}

licencias.post('/:id/aprobadores', requireRol('admin', 'operador'), async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) return c.json({ error: 'Identificador inválido' }, 400)
  if (await bloqueaRestringido(c.env, c.get('actor') as Actor)) {
    return c.json({ error: 'No tiene permisos para gestionar aprobadores' }, 403)
  }
  const lic = await primera<{ id: number; nombre_aplicacion: string }>(
    c.env,
    `SELECT id, nombre_aplicacion FROM licencias WHERE id = ?`,
    id,
  )
  if (!lic) return c.json({ error: 'Licencia no encontrada' }, 404)

  const parsed = aprobadorSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: errorZod(parsed.error) }, 400)
  const actor = c.get('actor') as Actor
  const ts = ahora()

  const insert = c.env.DB.prepare(
    `INSERT INTO licencia_aprobadores (licencia_id, nombre, email, creado_en) VALUES (?, ?, ?, ?)`,
  ).bind(id, parsed.data.nombre, parsed.data.email ?? null, ts)
  const hist = stmtHistorial(c.env, {
    entidad: 'licencia',
    entidadId: id,
    licenciaId: id,
    accion: 'EDITAR',
    actor,
    detalle: `Alta de aprobador "${parsed.data.nombre}" en "${lic.nombre_aplicacion}"`,
    ip: c.get('ip'),
  })
  await c.env.DB.batch([insert, hist])
  return c.json({ ok: true }, 201)
})

licencias.put('/:id/aprobadores/:apId', requireRol('admin', 'operador'), async (c) => {
  const id = Number(c.req.param('id'))
  const apId = Number(c.req.param('apId'))
  if (!Number.isInteger(id) || !Number.isInteger(apId)) {
    return c.json({ error: 'Identificador inválido' }, 400)
  }
  if (await bloqueaRestringido(c.env, c.get('actor') as Actor)) {
    return c.json({ error: 'No tiene permisos para gestionar aprobadores' }, 403)
  }
  const ap = await primera<FilaAprobador>(
    c.env,
    `SELECT * FROM licencia_aprobadores WHERE id = ? AND licencia_id = ?`,
    apId,
    id,
  )
  if (!ap) return c.json({ error: 'Aprobador no encontrado' }, 404)

  const parsed = aprobadorSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: errorZod(parsed.error) }, 400)
  const actor = c.get('actor') as Actor

  const update = c.env.DB.prepare(
    `UPDATE licencia_aprobadores SET nombre = ?, email = ? WHERE id = ?`,
  ).bind(parsed.data.nombre, parsed.data.email ?? null, apId)
  const hist = stmtHistorial(c.env, {
    entidad: 'licencia',
    entidadId: id,
    licenciaId: id,
    accion: 'EDITAR',
    actor,
    detalle: `Edición de aprobador "${ap.nombre}" → "${parsed.data.nombre}"`,
    ip: c.get('ip'),
  })
  await c.env.DB.batch([update, hist])
  return c.json({ ok: true })
})

licencias.delete('/:id/aprobadores/:apId', requireRol('admin', 'operador'), async (c) => {
  const id = Number(c.req.param('id'))
  const apId = Number(c.req.param('apId'))
  if (!Number.isInteger(id) || !Number.isInteger(apId)) {
    return c.json({ error: 'Identificador inválido' }, 400)
  }
  if (await bloqueaRestringido(c.env, c.get('actor') as Actor)) {
    return c.json({ error: 'No tiene permisos para gestionar aprobadores' }, 403)
  }
  const ap = await primera<FilaAprobador>(
    c.env,
    `SELECT * FROM licencia_aprobadores WHERE id = ? AND licencia_id = ?`,
    apId,
    id,
  )
  if (!ap) return c.json({ error: 'Aprobador no encontrado' }, 404)

  const actor = c.get('actor') as Actor
  const del = c.env.DB.prepare(`DELETE FROM licencia_aprobadores WHERE id = ?`).bind(apId)
  const hist = stmtHistorial(c.env, {
    entidad: 'licencia',
    entidadId: id,
    licenciaId: id,
    accion: 'EDITAR',
    actor,
    detalle: `Eliminación de aprobador "${ap.nombre}"`,
    ip: c.get('ip'),
  })
  await c.env.DB.batch([del, hist])
  return c.json({ ok: true })
})
