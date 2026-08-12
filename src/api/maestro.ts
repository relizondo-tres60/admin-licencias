// Maestro de usuarios (destinatarios de licencias).
// - GET  /api/maestro            → listado (para el selector de asignación).
// - POST /api/maestro/sincronizar/repo    → lee public/usuarios.xlsx (binding ASSETS).
// - POST /api/maestro/sincronizar/archivo → carga manual de un .xlsx.

import { Hono } from 'hono'
import type { Env, Variables } from '../tipos'
import { requireRol } from '../lib/auth-middleware'
import { consultar } from '../lib/db'
import { sincronizarMaestro } from '../lib/maestro-sync'
import { ErrorMaestro } from '../lib/xlsx-maestro'

export const maestro = new Hono<{ Bindings: Env; Variables: Variables }>()

interface FilaMaestro {
  id: number
  identificador: string
  nombre: string
  email: string | null
  area: string | null
  cargo: string | null
  activo: number
  sincronizado_en: string
}

// Listado. ?activos=1 filtra solo activos; ?q= busca por nombre/email/área.
maestro.get('/', async (c) => {
  const soloActivos = c.req.query('activos') === '1'
  const q = c.req.query('q')?.trim().toLowerCase()

  let sql = `SELECT id, identificador, nombre, email, area, cargo, activo, sincronizado_en
             FROM usuarios_maestro`
  const cond: string[] = []
  const params: unknown[] = []
  if (soloActivos) cond.push('activo = 1')
  if (q) {
    cond.push('(lower(nombre) LIKE ? OR lower(email) LIKE ? OR lower(area) LIKE ?)')
    const like = `%${q}%`
    params.push(like, like, like)
  }
  if (cond.length) sql += ` WHERE ${cond.join(' AND ')}`
  sql += ` ORDER BY nombre COLLATE NOCASE`

  const filas = await consultar<FilaMaestro>(c.env, sql, ...params)
  return c.json({ usuarios: filas })
})

// Sincronización desde el repositorio (public/usuarios.xlsx vía ASSETS).
maestro.post('/sincronizar/repo', requireRol('admin', 'operador'), async (c) => {
  const url = new URL(c.req.url)
  url.pathname = '/usuarios.xlsx'
  const resp = await c.env.ASSETS.fetch(new Request(url, { method: 'GET' }))
  if (!resp.ok) {
    return c.json(
      { error: 'No se encontró public/usuarios.xlsx en los assets del despliegue.' },
      404,
    )
  }
  const datos = await resp.arrayBuffer()
  try {
    const resumen = await sincronizarMaestro(
      c.env,
      datos,
      c.get('actor'),
      'repositorio',
      c.get('ip'),
    )
    return c.json({ resumen })
  } catch (e) {
    if (e instanceof ErrorMaestro) return c.json({ error: e.message }, 400)
    throw e
  }
})

// Sincronización por carga manual (multipart/form-data, campo 'archivo').
maestro.post('/sincronizar/archivo', requireRol('admin', 'operador'), async (c) => {
  let form: FormData
  try {
    form = await c.req.formData()
  } catch {
    return c.json({ error: 'Se esperaba un formulario con un archivo .xlsx.' }, 400)
  }
  const archivo = form.get('archivo')
  if (!(archivo instanceof File)) {
    return c.json({ error: 'Adjunte un archivo .xlsx en el campo "archivo".' }, 400)
  }
  const datos = await archivo.arrayBuffer()
  try {
    const resumen = await sincronizarMaestro(
      c.env,
      datos,
      c.get('actor'),
      'carga manual',
      c.get('ip'),
    )
    return c.json({ resumen })
  } catch (e) {
    if (e instanceof ErrorMaestro) return c.json({ error: e.message }, 400)
    throw e
  }
})
