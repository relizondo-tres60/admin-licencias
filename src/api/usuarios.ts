// Administración de usuarios del sistema (roles y alcance por licencia).
// Solo rol 'admin'. La identidad la provee Cloudflare Access; aquí se administra
// el rol, el estado y qué licencias puede administrar cada usuario.
// Regla: prohibido desactivar o quitar admin al último admin activo.

import { Hono } from 'hono'
import type { Env, Variables, Actor } from '../tipos'
import { requireRol } from '../lib/auth-middleware'
import { ahora, consultar, primera } from '../lib/db'
import { stmtHistorial } from '../lib/historial'
import { usuarioAppSchema, usuarioAppUpdateSchema } from '../lib/validaciones'

export const usuarios = new Hono<{ Bindings: Env; Variables: Variables }>()

function errorZod(e: import('zod').ZodError): string {
  return e.errors.map((x) => x.message).join('. ')
}

async function adminsActivos(env: Env): Promise<number> {
  const r = await primera<{ n: number }>(
    env,
    `SELECT COUNT(*) AS n FROM usuarios_app WHERE rol = 'admin' AND activo = 1`,
  )
  return r?.n ?? 0
}

// Normaliza alcance: los admin siempre ven todo (sin selección de licencias).
function normalizarAlcance(rol: string, alcance: string, licencias: number[]) {
  if (rol === 'admin' || alcance !== 'seleccion') return { alcance: 'todas', licencias: [] as number[] }
  return { alcance: 'seleccion', licencias }
}

// Inserta el conjunto de licencias autorizadas de un usuario (en lotes).
async function guardarLicencias(env: Env, usuarioId: number, licencias: number[]): Promise<void> {
  const stmts = licencias.map((lid) =>
    env.DB.prepare(
      `INSERT OR IGNORE INTO usuario_licencias (usuario_app_id, licencia_id) VALUES (?, ?)`,
    ).bind(usuarioId, lid),
  )
  for (let i = 0; i < stmts.length; i += 40) await env.DB.batch(stmts.slice(i, i + 40))
}

// Toda la administración de usuarios es exclusiva de admin.
usuarios.use('*', requireRol('admin'))

usuarios.get('/', async (c) => {
  const filas = await consultar<{
    id: number
    email: string
    nombre: string
    rol: string
    activo: number
    alcance: string
    ultimo_acceso: string | null
    creado_en: string
    licencia_ids: string | null
  }>(
    c.env,
    `SELECT u.id, u.email, u.nombre, u.rol, u.activo, u.alcance, u.ultimo_acceso, u.creado_en,
            (SELECT group_concat(licencia_id) FROM usuario_licencias ul
               WHERE ul.usuario_app_id = u.id) AS licencia_ids
     FROM usuarios_app u
     ORDER BY u.activo DESC, u.nombre COLLATE NOCASE`,
  )
  const usuariosOut = filas.map((u) => ({
    ...u,
    licencias: u.licencia_ids ? u.licencia_ids.split(',').map(Number) : [],
  }))
  return c.json({ usuarios: usuariosOut })
})

usuarios.post('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = usuarioAppSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: errorZod(parsed.error) }, 400)
  const { email, nombre, rol } = parsed.data
  const norm = normalizarAlcance(rol, parsed.data.alcance, parsed.data.licencias)

  const existe = await primera<{ id: number }>(
    c.env,
    `SELECT id FROM usuarios_app WHERE email = ?`,
    email,
  )
  if (existe) return c.json({ error: 'Ya existe un usuario con ese correo' }, 409)

  const actor = c.get('actor') as Actor
  const ts = ahora()
  const insert = c.env.DB.prepare(
    `INSERT INTO usuarios_app (email, nombre, rol, alcance, activo, creado_en, creado_por)
     VALUES (?, ?, ?, ?, 1, ?, ?)`,
  ).bind(email, nombre, rol, norm.alcance, ts, actor.id)
  const hist = c.env.DB.prepare(
    `INSERT INTO historial (ts, entidad, entidad_id, accion, usuario_app_id, usuario_app_email, detalle, ip)
     VALUES (?, 'usuario_app', last_insert_rowid(), 'CREAR', ?, ?, ?, ?)`,
  ).bind(
    ts,
    actor.id,
    actor.email,
    `Alta de usuario ${email} con rol ${rol}` +
      (norm.alcance === 'seleccion' ? ` (acceso a ${norm.licencias.length} licencia(s))` : ''),
    c.get('ip'),
  )
  await c.env.DB.batch([insert, hist])

  if (norm.alcance === 'seleccion' && norm.licencias.length) {
    const nuevo = await primera<{ id: number }>(
      c.env,
      `SELECT id FROM usuarios_app WHERE email = ?`,
      email,
    )
    if (nuevo) await guardarLicencias(c.env, nuevo.id, norm.licencias)
  }
  return c.json({ ok: true }, 201)
})

usuarios.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) return c.json({ error: 'Identificador inválido' }, 400)

  const body = await c.req.json().catch(() => null)
  const parsed = usuarioAppUpdateSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: errorZod(parsed.error) }, 400)
  const { nombre, rol, activo } = parsed.data
  const norm = normalizarAlcance(rol, parsed.data.alcance, parsed.data.licencias)

  const antes = await primera<{ id: number; email: string; rol: string; activo: number }>(
    c.env,
    `SELECT id, email, rol, activo FROM usuarios_app WHERE id = ?`,
    id,
  )
  if (!antes) return c.json({ error: 'Usuario no encontrado' }, 404)

  // Protección del último admin activo.
  const eraAdminActivo = antes.rol === 'admin' && antes.activo === 1
  const dejaDeSerAdminActivo = rol !== 'admin' || activo === false
  if (eraAdminActivo && dejaDeSerAdminActivo && (await adminsActivos(c.env)) <= 1) {
    return c.json(
      { error: 'No se puede desactivar ni cambiar el rol del último administrador activo.' },
      409,
    )
  }

  const actor = c.get('actor') as Actor
  const update = c.env.DB.prepare(
    `UPDATE usuarios_app SET nombre = ?, rol = ?, activo = ?, alcance = ? WHERE id = ?`,
  ).bind(nombre, rol, activo ? 1 : 0, norm.alcance, id)
  const hist = stmtHistorial(c.env, {
    entidad: 'usuario_app',
    entidadId: id,
    accion: 'EDITAR',
    actor,
    detalle:
      `Edición de usuario ${antes.email}: rol ${rol}, ${activo ? 'activo' : 'inactivo'}` +
      (norm.alcance === 'seleccion' ? `, acceso a ${norm.licencias.length} licencia(s)` : ', acceso a todas'),
    detalleJson: { antes, despues: { nombre, rol, activo, alcance: norm.alcance } },
    ip: c.get('ip'),
  })
  // Reemplaza el conjunto de licencias autorizadas.
  const borra = c.env.DB.prepare(`DELETE FROM usuario_licencias WHERE usuario_app_id = ?`).bind(id)
  await c.env.DB.batch([update, hist, borra])
  if (norm.alcance === 'seleccion' && norm.licencias.length) {
    await guardarLicencias(c.env, id, norm.licencias)
  }
  return c.json({ ok: true })
})
