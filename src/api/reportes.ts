// Reportes con filtros combinables. Devuelven filas en JSON; la exportación a
// XLSX/CSV se genera en el cliente con SheetJS.

import { Hono } from 'hono'
import type { Env, Variables } from '../tipos'
import { consultar } from '../lib/db'

export const reportes = new Hono<{ Bindings: Env; Variables: Variables }>()

const VIG = `LEFT JOIN (SELECT licencia_id, COUNT(*) n FROM asignaciones WHERE estado='asignada' GROUP BY licencia_id) v ON v.licencia_id = l.id`

function filtrosLicencia(q: Record<string, string>) {
  const cond: string[] = []
  const params: unknown[] = []
  if (q.tipo && ['key', 'flotante', 'archivo'].includes(q.tipo)) {
    cond.push('l.tipo = ?')
    params.push(q.tipo)
  }
  if (q.estado === 'activas') cond.push('l.activo = 1')
  else if (q.estado === 'inactivas') cond.push('l.activo = 0')
  if (q.aplicacion) {
    cond.push('lower(l.nombre_aplicacion) LIKE ?')
    params.push(`%${q.aplicacion.toLowerCase()}%`)
  }
  if (q.aprobador) {
    cond.push('lower(l.aprobador_nombre) LIKE ?')
    params.push(`%${q.aprobador.toLowerCase()}%`)
  }
  return { cond, params }
}

// Inventario general con disponibilidad
reportes.get('/inventario', async (c) => {
  const { cond, params } = filtrosLicencia(c.req.query())
  const where = cond.length ? ` WHERE ${cond.join(' AND ')}` : ''
  const filas = await consultar(
    c.env,
    `SELECT l.nombre_aplicacion AS aplicacion, l.version, l.tipo, l.proveedor,
            l.cantidad_total AS total, COALESCE(v.n,0) AS asignadas,
            (l.cantidad_total - COALESCE(v.n,0)) AS disponibles,
            l.key_user_nombre AS key_user, l.aprobador_nombre AS aprobador,
            l.fecha_vencimiento, CASE l.activo WHEN 1 THEN 'Activa' ELSE 'Baja' END AS estado
     FROM licencias l ${VIG}${where}
     ORDER BY l.nombre_aplicacion COLLATE NOCASE`,
    ...params,
  )
  return c.json({ filas })
})

// Asignaciones vigentes
reportes.get('/asignaciones-vigentes', async (c) => {
  const q = c.req.query()
  const cond = ["a.estado = 'asignada'"]
  const params: unknown[] = []
  if (q.tipo && ['key', 'flotante', 'archivo'].includes(q.tipo)) {
    cond.push('l.tipo = ?')
    params.push(q.tipo)
  }
  if (q.aplicacion) {
    cond.push('lower(l.nombre_aplicacion) LIKE ?')
    params.push(`%${q.aplicacion.toLowerCase()}%`)
  }
  if (q.area) {
    cond.push('lower(m.area) LIKE ?')
    params.push(`%${q.area.toLowerCase()}%`)
  }
  if (q.usuario) {
    cond.push('(lower(m.nombre) LIKE ? OR lower(m.email) LIKE ?)')
    params.push(`%${q.usuario.toLowerCase()}%`, `%${q.usuario.toLowerCase()}%`)
  }
  if (q.aprobador) {
    cond.push('lower(a.aprobador) LIKE ?')
    params.push(`%${q.aprobador.toLowerCase()}%`)
  }
  const filas = await consultar(
    c.env,
    `SELECT l.nombre_aplicacion AS aplicacion, l.tipo, m.nombre AS usuario,
            m.email, m.area, a.key_asignada AS key, a.aprobador,
            a.ticket_referencia AS ticket, a.fecha_asignacion
     FROM asignaciones a
     JOIN licencias l ON l.id = a.licencia_id
     JOIN usuarios_maestro m ON m.id = a.usuario_maestro_id
     WHERE ${cond.join(' AND ')}
     ORDER BY l.nombre_aplicacion COLLATE NOCASE, m.nombre COLLATE NOCASE`,
    ...params,
  )
  return c.json({ filas })
})

// Movimientos del período (asignaciones y liberaciones)
reportes.get('/movimientos', async (c) => {
  const q = c.req.query()
  const cond = ["h.accion IN ('ASIGNAR','LIBERAR')"]
  const params: unknown[] = []
  if (q.desde) {
    cond.push('date(h.ts) >= date(?)')
    params.push(q.desde)
  }
  if (q.hasta) {
    cond.push('date(h.ts) <= date(?)')
    params.push(q.hasta)
  }
  if (q.aplicacion) {
    cond.push('lower(l.nombre_aplicacion) LIKE ?')
    params.push(`%${q.aplicacion.toLowerCase()}%`)
  }
  const filas = await consultar(
    c.env,
    `SELECT h.ts AS fecha, h.accion, l.nombre_aplicacion AS aplicacion,
            h.usuario_maestro_nombre AS destinatario, h.usuario_app_email AS operador,
            h.detalle
     FROM historial h LEFT JOIN licencias l ON l.id = h.licencia_id
     WHERE ${cond.join(' AND ')}
     ORDER BY h.id DESC`,
    ...params,
  )
  return c.json({ filas })
})

// Utilización por aplicación (%)
reportes.get('/utilizacion', async (c) => {
  const { cond, params } = filtrosLicencia({ ...c.req.query(), estado: 'activas' })
  const where = cond.length ? ` WHERE ${cond.join(' AND ')}` : ''
  const filas = await consultar(
    c.env,
    `SELECT l.nombre_aplicacion AS aplicacion, l.tipo, l.cantidad_total AS total,
            COALESCE(v.n,0) AS asignadas,
            (l.cantidad_total - COALESCE(v.n,0)) AS disponibles,
            ROUND(COALESCE(v.n,0) * 100.0 / NULLIF(l.cantidad_total,0), 1) AS utilizacion
     FROM licencias l ${VIG}${where}
     ORDER BY utilizacion DESC, l.nombre_aplicacion COLLATE NOCASE`,
    ...params,
  )
  return c.json({ filas })
})

// Licencias por vencer
reportes.get('/por-vencer', async (c) => {
  const q = c.req.query()
  const dias = Number(q.dias) || 0
  const cond = ['l.activo = 1', 'l.fecha_vencimiento IS NOT NULL']
  const params: unknown[] = []
  if (dias > 0) {
    cond.push("l.fecha_vencimiento <= date('now', ?)")
    params.push(`+${dias} days`)
  }
  if (q.tipo && ['key', 'flotante', 'archivo'].includes(q.tipo)) {
    cond.push('l.tipo = ?')
    params.push(q.tipo)
  }
  const filas = await consultar(
    c.env,
    `SELECT l.nombre_aplicacion AS aplicacion, l.tipo, l.proveedor,
            l.fecha_vencimiento, l.aprobador_nombre AS aprobador,
            l.cantidad_total AS total
     FROM licencias l
     WHERE ${cond.join(' AND ')}
     ORDER BY l.fecha_vencimiento`,
    ...params,
  )
  return c.json({ filas })
})
