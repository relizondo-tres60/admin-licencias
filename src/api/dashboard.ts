// Dashboard: KPIs, utilización por aplicación, distribución por tipo, alertas y
// últimos movimientos. Filtro global opcional por tipo y por aplicación.

import { Hono } from 'hono'
import type { Env, Variables, Actor } from '../tipos'
import { consultar, primera } from '../lib/db'
import { permisoLicencias } from '../lib/alcance'

export const dashboard = new Hono<{ Bindings: Env; Variables: Variables }>()

dashboard.get('/', async (c) => {
  const tipo = c.req.query('tipo')
  const aplicacion = c.req.query('aplicacion')?.trim().toLowerCase()

  // Filtro reutilizable sobre licencias activas (alias l).
  const cond: string[] = ['l.activo = 1']
  const params: unknown[] = []
  if (tipo && ['key', 'flotante', 'archivo'].includes(tipo)) {
    cond.push('l.tipo = ?')
    params.push(tipo)
  }
  if (aplicacion) {
    cond.push('lower(l.nombre_aplicacion) LIKE ?')
    params.push(`%${aplicacion}%`)
  }

  // Alcance: usuarios restringidos solo ven sus licencias autorizadas.
  const permiso = await permisoLicencias(c.env, c.get('actor') as Actor)
  const idsRestringidos = permiso.restringido ? Array.from(permiso.ids) : null
  if (permiso.restringido) {
    if (permiso.ids.size === 0) cond.push('1 = 0')
    else {
      cond.push(`l.id IN (${idsRestringidos!.map(() => '?').join(',')})`)
      params.push(...idsRestringidos!)
    }
  }
  const where = cond.join(' AND ')

  // KPIs
  const totales = await primera<{ total: number }>(
    c.env,
    `SELECT COALESCE(SUM(l.cantidad_total), 0) AS total FROM licencias l WHERE ${where}`,
    ...params,
  )
  const asignadasRow = await primera<{ n: number }>(
    c.env,
    `SELECT COUNT(*) AS n FROM asignaciones a
     JOIN licencias l ON l.id = a.licencia_id
     WHERE a.estado = 'asignada' AND ${where}`,
    ...params,
  )
  const total = totales?.total ?? 0
  const asignadas = asignadasRow?.n ?? 0
  const disponibles = total - asignadas
  const utilizacion = total > 0 ? Math.round((asignadas / total) * 1000) / 10 : 0

  // Utilización por aplicación
  const porApp = await consultar<{
    id: number
    nombre_aplicacion: string
    tipo: string
    total: number
    asignadas: number
  }>(
    c.env,
    `SELECT l.id, l.nombre_aplicacion, l.tipo, l.cantidad_total AS total,
            COALESCE(v.n, 0) AS asignadas
     FROM licencias l
     LEFT JOIN (SELECT licencia_id, COUNT(*) n FROM asignaciones WHERE estado='asignada' GROUP BY licencia_id) v
       ON v.licencia_id = l.id
     WHERE ${where}
     ORDER BY l.nombre_aplicacion COLLATE NOCASE`,
    ...params,
  )
  const utilizacionPorApp = porApp.map((r) => ({
    id: r.id,
    aplicacion: r.nombre_aplicacion,
    tipo: r.tipo,
    total: r.total,
    asignadas: r.asignadas,
    disponibles: r.total - r.asignadas,
  }))

  // Distribución por tipo (cantidad de licencias)
  const porTipo = await consultar<{ tipo: string; n: number; unidades: number }>(
    c.env,
    `SELECT l.tipo, COUNT(*) AS n, COALESCE(SUM(l.cantidad_total),0) AS unidades
     FROM licencias l WHERE ${where} GROUP BY l.tipo`,
    ...params,
  )

  // Alertas
  const sinDisponibilidad = utilizacionPorApp.filter((r) => r.disponibles <= 0)
  const porVencer = await consultar<{
    id: number
    nombre_aplicacion: string
    fecha_vencimiento: string
  }>(
    c.env,
    `SELECT l.id, l.nombre_aplicacion, l.fecha_vencimiento
     FROM licencias l
     WHERE ${where} AND l.fecha_vencimiento IS NOT NULL
       AND l.fecha_vencimiento >= date('now')
       AND l.fecha_vencimiento <= date('now', '+60 days')
     ORDER BY l.fecha_vencimiento`,
    ...params,
  )
  const sinResponsable = await consultar<{
    id: number
    nombre_aplicacion: string
    key_user_nombre: string | null
    sin_aprobador: number
  }>(
    c.env,
    `SELECT l.id, l.nombre_aplicacion, l.key_user_nombre,
            (NOT EXISTS (SELECT 1 FROM licencia_aprobadores ap WHERE ap.licencia_id = l.id)) AS sin_aprobador
     FROM licencias l
     WHERE ${where}
       AND (l.key_user_nombre IS NULL
            OR NOT EXISTS (SELECT 1 FROM licencia_aprobadores ap WHERE ap.licencia_id = l.id))
     ORDER BY l.nombre_aplicacion COLLATE NOCASE`,
    ...params,
  )

  // Últimos 10 movimientos (restringidos solo a sus licencias autorizadas).
  const condMov: string[] = []
  const paramsMov: unknown[] = []
  if (idsRestringidos) {
    if (idsRestringidos.length === 0) condMov.push('1 = 0')
    else {
      condMov.push(`h.licencia_id IN (${idsRestringidos.map(() => '?').join(',')})`)
      paramsMov.push(...idsRestringidos)
    }
  }
  const whereMov = condMov.length ? ` WHERE ${condMov.join(' AND ')}` : ''
  const movimientos = await consultar(
    c.env,
    `SELECT h.id, h.ts, h.accion, h.entidad, h.detalle, h.usuario_app_email,
            l.nombre_aplicacion
     FROM historial h
     LEFT JOIN licencias l ON l.id = h.licencia_id
     ${whereMov}
     ORDER BY h.id DESC
     LIMIT 10`,
    ...paramsMov,
  )

  // Usuarios desvinculados (baja en AD) que aún tienen licencias vigentes.
  const condDesv = idsRestringidos
    ? idsRestringidos.length === 0
      ? ' AND 1 = 0'
      : ` AND a.licencia_id IN (${idsRestringidos.map(() => '?').join(',')})`
    : ''
  const desvinculados = await consultar<{
    id: number
    nombre: string
    identificador: string
    licencias: number
  }>(
    c.env,
    `SELECT m.id, m.nombre, m.identificador, COUNT(a.id) AS licencias
     FROM usuarios_maestro m
     JOIN usuarios_desvinculados d ON d.identificador = m.identificador
     JOIN asignaciones a ON a.usuario_maestro_id = m.id AND a.estado = 'asignada'${condDesv}
     GROUP BY m.id
     ORDER BY m.nombre COLLATE NOCASE`,
    ...(idsRestringidos ?? []),
  )

  return c.json({
    kpis: { total, asignadas, disponibles, utilizacion },
    utilizacionPorApp,
    porTipo,
    alertas: {
      sinDisponibilidad,
      porVencer,
      sinResponsable,
    },
    desvinculados: { total: desvinculados.length, lista: desvinculados },
    movimientos,
  })
})
