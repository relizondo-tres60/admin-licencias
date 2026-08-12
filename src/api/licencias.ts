// CRUD de licencias con disponibilidad calculada en consulta.
// Reglas 1–6: disponibles = cantidad_total − asignaciones vigentes; no se
// permite reducir por debajo de las vigentes; baja lógica sin vigentes; toda
// escritura registra en historial dentro de la misma transacción.

import { Hono } from 'hono'
import type { Env, Variables, Actor } from '../tipos'
import { requireRol } from '../lib/auth-middleware'
import { ahora, consultar, primera } from '../lib/db'
import { stmtHistorial } from '../lib/historial'
import { licenciaSchema, normalizarLicencia } from '../lib/validaciones'

export const licencias = new Hono<{ Bindings: Env; Variables: Variables }>()

const SELECT_BASE = `
  SELECT l.*, COALESCE(a.vig, 0) AS asignadas,
         (l.cantidad_total - COALESCE(a.vig, 0)) AS disponibles
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
