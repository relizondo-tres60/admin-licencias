// Maestro de usuarios (destinatarios de licencias).
// - GET  /api/maestro            → listado (para el selector de asignación).
// - POST /api/maestro/sincronizar/repo    → lee public/usuarios.xlsx (binding ASSETS).
// - POST /api/maestro/sincronizar/archivo → carga manual de un .xlsx.

import { Hono } from 'hono'
import type { Env, Variables } from '../tipos'
import { requireRol } from '../lib/auth-middleware'
import { ahora, consultar } from '../lib/db'
import { sincronizarMaestro } from '../lib/maestro-sync'
import { ErrorMaestro, parsearDesvinculados } from '../lib/xlsx-maestro'
import { stmtHistorial } from '../lib/historial'
import { permisoLicencias } from '../lib/alcance'
import type { Actor } from '../tipos'

export const maestro = new Hono<{ Bindings: Env; Variables: Variables }>()

interface FilaMaestro {
  id: number
  identificador: string
  nombre: string
  email: string | null
  area: string | null
  cargo: string | null
  activo: number
  desvinculado: number
  licencias_vigentes: number
  sincronizado_en: string
}

// Listado. ?activos=1 filtra solo activos; ?q= busca por nombre/email/área.
// Incluye si está desvinculado y cuántas licencias vigentes tiene (con alcance).
maestro.get('/', async (c) => {
  const soloActivos = c.req.query('activos') === '1'
  const q = c.req.query('q')?.trim().toLowerCase()

  // Alcance para el conteo de licencias vigentes por usuario.
  const permiso = await permisoLicencias(c.env, c.get('actor') as Actor)
  let condAlcance = ''
  const paramsAlcance: unknown[] = []
  if (permiso.restringido) {
    if (permiso.ids.size === 0) condAlcance = ' AND 1 = 0'
    else {
      condAlcance = ` AND a.licencia_id IN (${Array.from(permiso.ids).map(() => '?').join(',')})`
      paramsAlcance.push(...permiso.ids)
    }
  }

  let sql = `SELECT m.id, m.identificador, m.nombre, m.email, m.area, m.cargo, m.activo,
                    m.sincronizado_en,
                    (EXISTS (SELECT 1 FROM usuarios_desvinculados d
                             WHERE d.identificador = m.identificador)) AS desvinculado,
                    (SELECT COUNT(*) FROM asignaciones a
                       WHERE a.usuario_maestro_id = m.id AND a.estado = 'asignada'${condAlcance})
                      AS licencias_vigentes
             FROM usuarios_maestro m`
  const cond: string[] = []
  const params: unknown[] = [...paramsAlcance]
  if (soloActivos) cond.push('m.activo = 1')
  if (q) {
    cond.push('(lower(m.nombre) LIKE ? OR lower(m.email) LIKE ? OR lower(m.area) LIKE ?)')
    const like = `%${q}%`
    params.push(like, like, like)
  }
  if (cond.length) sql += ` WHERE ${cond.join(' AND ')}`
  sql += ` ORDER BY m.nombre COLLATE NOCASE`

  const filas = await consultar<FilaMaestro>(c.env, sql, ...params)
  return c.json({ usuarios: filas })
})

// Carga de usuarios desvinculados / dados de baja en AD (multipart .xlsx).
// Acumula (upsert por identificador). Solo admin/operador.
maestro.post('/desvinculados', requireRol('admin', 'operador'), async (c) => {
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
  let parseado
  try {
    parseado = parsearDesvinculados(await archivo.arrayBuffer())
  } catch (e) {
    if (e instanceof ErrorMaestro) return c.json({ error: e.message }, 400)
    throw e
  }

  const actor = c.get('actor') as Actor
  const ts = ahora()
  const stmts = parseado.registros.map((r) =>
    c.env.DB.prepare(
      `INSERT INTO usuarios_desvinculados (identificador, nombre, email, fecha_carga, cargado_por)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(identificador) DO UPDATE SET
         nombre = COALESCE(excluded.nombre, usuarios_desvinculados.nombre),
         email = COALESCE(excluded.email, usuarios_desvinculados.email),
         fecha_carga = excluded.fecha_carga,
         cargado_por = excluded.cargado_por`,
    ).bind(r.identificador, r.nombre, r.email, ts, actor.id),
  )
  for (let i = 0; i < stmts.length; i += 40) await c.env.DB.batch(stmts.slice(i, i + 40))

  // Cuántos de los cargados tienen licencias vigentes (informativo).
  const con = await consultar<{ n: number }>(
    c.env,
    `SELECT COUNT(DISTINCT m.id) AS n
     FROM usuarios_maestro m
     JOIN usuarios_desvinculados d ON d.identificador = m.identificador
     JOIN asignaciones a ON a.usuario_maestro_id = m.id AND a.estado = 'asignada'`,
  )
  const conLicencias = con[0]?.n ?? 0

  await stmtHistorial(c.env, {
    entidad: 'maestro',
    accion: 'SINCRONIZAR',
    actor,
    detalle:
      `Carga de desvinculados: ${parseado.registros.length} cargados` +
      (parseado.ignoradas ? `, ${parseado.ignoradas} ignoradas` : '') +
      `. ${conLicencias} con licencias vigentes.`,
    detalleJson: { cargados: parseado.registros.length, ignoradas: parseado.ignoradas, conLicencias },
    ip: c.get('ip'),
  }).run()

  return c.json({
    resumen: {
      cargados: parseado.registros.length,
      ignoradas: parseado.ignoradas,
      conLicencias,
    },
  })
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
