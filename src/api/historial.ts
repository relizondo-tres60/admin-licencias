// Histórico global (bitácora) con filtros combinables y paginación server-side.
// La bitácora es de solo lectura: no se exponen PUT ni DELETE.

import { Hono } from 'hono'
import type { Env, Variables, Actor } from '../tipos'
import { consultar, primera } from '../lib/db'
import { permisoLicencias } from '../lib/alcance'

export const historial = new Hono<{ Bindings: Env; Variables: Variables }>()

const ACCIONES = ['CREAR', 'EDITAR', 'ELIMINAR', 'ASIGNAR', 'LIBERAR', 'LOGIN', 'SINCRONIZAR']

historial.get('/', async (c) => {
  const q = c.req.query()
  const cond: string[] = []
  const params: unknown[] = []

  if (q.licencia_id && Number.isInteger(Number(q.licencia_id))) {
    cond.push('h.licencia_id = ?')
    params.push(Number(q.licencia_id))
  }
  if (q.accion && ACCIONES.includes(q.accion)) {
    cond.push('h.accion = ?')
    params.push(q.accion)
  }
  if (q.desde) {
    cond.push('date(h.ts) >= date(?)')
    params.push(q.desde)
  }
  if (q.hasta) {
    cond.push('date(h.ts) <= date(?)')
    params.push(q.hasta)
  }
  if (q.usuario_app) {
    cond.push('lower(h.usuario_app_email) LIKE ?')
    params.push(`%${q.usuario_app.toLowerCase()}%`)
  }
  if (q.destinatario) {
    cond.push('lower(h.usuario_maestro_nombre) LIKE ?')
    params.push(`%${q.destinatario.toLowerCase()}%`)
  }
  if (q.aplicacion) {
    cond.push('lower(l.nombre_aplicacion) LIKE ?')
    params.push(`%${q.aplicacion.toLowerCase()}%`)
  }

  // Alcance: usuarios restringidos solo ven eventos de sus licencias autorizadas.
  const permiso = await permisoLicencias(c.env, c.get('actor') as Actor)
  if (permiso.restringido) {
    if (permiso.ids.size === 0) cond.push('1 = 0')
    else {
      cond.push(`h.licencia_id IN (${Array.from(permiso.ids).map(() => '?').join(',')})`)
      params.push(...permiso.ids)
    }
  }

  const where = cond.length ? ` WHERE ${cond.join(' AND ')}` : ''
  const join = ` FROM historial h LEFT JOIN licencias l ON l.id = h.licencia_id`

  const page = Math.max(1, Number(q.page) || 1)
  const pageSize = Math.min(100, Math.max(5, Number(q.pageSize) || 25))
  const offset = (page - 1) * pageSize

  const totalRow = await primera<{ n: number }>(
    c.env,
    `SELECT COUNT(*) AS n${join}${where}`,
    ...params,
  )
  const total = totalRow?.n ?? 0

  const rows = await consultar(
    c.env,
    `SELECT h.id, h.ts, h.entidad, h.entidad_id, h.licencia_id, h.accion,
            h.usuario_app_email, h.usuario_maestro_nombre, h.detalle,
            l.nombre_aplicacion
     ${join}${where}
     ORDER BY h.id DESC
     LIMIT ? OFFSET ?`,
    ...params,
    pageSize,
    offset,
  )

  return c.json({ movimientos: rows, total, page, pageSize })
})
