// Administración de usuarios del sistema (roles). Solo rol 'admin'.
// La identidad la provee Cloudflare Access; aquí se administra el rol y el
// estado. No hay contraseñas que restablecer.
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

// Toda la administración de usuarios es exclusiva de admin.
usuarios.use('*', requireRol('admin'))

usuarios.get('/', async (c) => {
  const filas = await consultar(
    c.env,
    `SELECT id, email, nombre, rol, activo, ultimo_acceso, creado_en FROM usuarios_app
     ORDER BY activo DESC, nombre COLLATE NOCASE`,
  )
  return c.json({ usuarios: filas })
})

usuarios.post('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = usuarioAppSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: errorZod(parsed.error) }, 400)
  const { email, nombre, rol } = parsed.data

  const existe = await primera<{ id: number }>(
    c.env,
    `SELECT id FROM usuarios_app WHERE email = ?`,
    email,
  )
  if (existe) return c.json({ error: 'Ya existe un usuario con ese correo' }, 409)

  const actor = c.get('actor') as Actor
  const ts = ahora()
  const insert = c.env.DB.prepare(
    `INSERT INTO usuarios_app (email, nombre, rol, activo, creado_en, creado_por)
     VALUES (?, ?, ?, 1, ?, ?)`,
  ).bind(email, nombre, rol, ts, actor.id)
  const hist = c.env.DB.prepare(
    `INSERT INTO historial (ts, entidad, entidad_id, accion, usuario_app_id, usuario_app_email, detalle, ip)
     VALUES (?, 'usuario_app', last_insert_rowid(), 'CREAR', ?, ?, ?, ?)`,
  ).bind(ts, actor.id, actor.email, `Alta de usuario ${email} con rol ${rol}`, c.get('ip'))
  await c.env.DB.batch([insert, hist])
  return c.json({ ok: true }, 201)
})

usuarios.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) return c.json({ error: 'Identificador inválido' }, 400)

  const body = await c.req.json().catch(() => null)
  const parsed = usuarioAppUpdateSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: errorZod(parsed.error) }, 400)
  const { nombre, rol, activo } = parsed.data

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
    `UPDATE usuarios_app SET nombre = ?, rol = ?, activo = ? WHERE id = ?`,
  ).bind(nombre, rol, activo ? 1 : 0, id)
  const hist = stmtHistorial(c.env, {
    entidad: 'usuario_app',
    entidadId: id,
    accion: 'EDITAR',
    actor,
    detalle: `Edición de usuario ${antes.email}: rol ${rol}, ${activo ? 'activo' : 'inactivo'}`,
    detalleJson: { antes, despues: { nombre, rol, activo } },
    ip: c.get('ip'),
  })
  await c.env.DB.batch([update, hist])
  return c.json({ ok: true })
})
