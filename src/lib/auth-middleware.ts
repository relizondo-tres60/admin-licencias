// Autenticación vía Cloudflare Access (Zero Trust) + control de rol.
//
// - En producción: se valida el JWT RS256 que Access inyecta en la cabecera
//   'Cf-Access-Jwt-Assertion' contra el JWKS del equipo (ver verificarAccess,
//   implementación completa en la fase de auth).
// - En desarrollo (ENTORNO=dev): se acepta la cabecera 'X-Dev-Email' o, en su
//   defecto, ADMIN_EMAIL, para trabajar sin Zero Trust en local.
//
// El rol se resuelve desde la tabla usuarios_app. ADMIN_EMAIL se promueve a
// 'admin' en su primer acceso.

import type { MiddlewareHandler } from 'hono'
import type { Env, Actor, Rol, Variables } from '../tipos'
import { ahora, primera } from './db'
import { stmtHistorial } from './historial'
import { verificarAccess } from './access'

type Ctx = { Bindings: Env; Variables: Variables }

interface FilaUsuario {
  id: number
  email: string
  nombre: string
  rol: Rol
  activo: number
  ultimo_acceso: string | null
}

/** Conjunto de correos administradores semilla (ADMIN_EMAIL admite lista
 *  separada por comas). Todos se autopromueven a 'admin' en su primer acceso. */
function correosAdmin(env: Env): Set<string> {
  return new Set(
    (env.ADMIN_EMAIL ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  )
}

/** Extrae el correo autenticado según el entorno. */
async function obtenerEmail(env: Env, headers: Headers): Promise<string | null> {
  if (env.ENTORNO === 'dev') {
    const dev = headers.get('x-dev-email')?.trim().toLowerCase()
    if (dev) return dev
    // Fallback dev: primer correo administrador de la lista.
    const [primero] = correosAdmin(env)
    return primero ?? null
  }
  const token = headers.get('cf-access-jwt-assertion')
  if (!token) return null
  const email = await verificarAccess(env, token)
  return email ? email.trim().toLowerCase() : null
}

/**
 * Resuelve el actor (rol) a partir del correo autenticado.
 * Crea/promueve el ADMIN_EMAIL como 'admin'. Registra LOGIN en la bitácora
 * la primera vez y cuando cambia el día de acceso.
 */
async function resolverActor(env: Env, email: string, ip: string): Promise<Actor | null> {
  const admins = correosAdmin(env)
  let fila = await primera<FilaUsuario>(
    env,
    `SELECT id, email, nombre, rol, activo, ultimo_acceso FROM usuarios_app WHERE email = ?`,
    email,
  )

  const ts = ahora()

  if (!fila) {
    // Solo los administradores semilla se autoaprovisionan. El resto lo crea un admin.
    if (!admins.has(email)) return null
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO usuarios_app (email, nombre, rol, activo, ultimo_acceso, creado_en)
         VALUES (?, ?, 'admin', 1, ?, ?)`,
      ).bind(email, email, ts, ts),
    ])
    fila = await primera<FilaUsuario>(
      env,
      `SELECT id, email, nombre, rol, activo, ultimo_acceso FROM usuarios_app WHERE email = ?`,
      email,
    )
    if (fila) {
      await stmtHistorial(env, {
        entidad: 'usuario_app',
        entidadId: fila.id,
        accion: 'LOGIN',
        actor: { id: fila.id, email: fila.email },
        detalle: `Primer acceso del administrador semilla ${email}`,
        ip,
      }).run()
    }
  }

  if (!fila || fila.activo !== 1) return null

  // Registrar LOGIN al cambiar de día y actualizar último acceso.
  const diaAnterior = fila.ultimo_acceso?.slice(0, 10)
  const diaHoy = ts.slice(0, 10)
  const ops: D1PreparedStatement[] = [
    env.DB.prepare(`UPDATE usuarios_app SET ultimo_acceso = ? WHERE id = ?`).bind(ts, fila.id),
  ]
  if (diaAnterior !== diaHoy) {
    ops.push(
      stmtHistorial(env, {
        entidad: 'sesion',
        entidadId: fila.id,
        accion: 'LOGIN',
        actor: { id: fila.id, email: fila.email },
        detalle: `Acceso de ${fila.email}`,
        ip,
      }),
    )
  }
  await env.DB.batch(ops)

  return { id: fila.id, email: fila.email, nombre: fila.nombre, rol: fila.rol }
}

/** Middleware que exige sesión válida y deja el actor en el contexto. */
export function auth(): MiddlewareHandler<Ctx> {
  return async (c, next) => {
    const ip = c.req.header('cf-connecting-ip') ?? ''
    const email = await obtenerEmail(c.env, c.req.raw.headers)
    if (!email) return c.json({ error: 'No autenticado' }, 401)
    const actor = await resolverActor(c.env, email, ip)
    if (!actor) return c.json({ error: 'Usuario sin acceso al sistema' }, 403)
    c.set('actor', actor)
    c.set('ip', ip)
    await next()
  }
}

/** Middleware que exige uno de los roles indicados. */
export function requireRol(...roles: Rol[]): MiddlewareHandler<Ctx> {
  return async (c, next) => {
    const actor = c.get('actor')
    if (!actor || !roles.includes(actor.rol)) {
      return c.json({ error: 'No tiene permisos para realizar esta acción' }, 403)
    }
    await next()
  }
}
