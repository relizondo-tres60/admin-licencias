// Worker principal: monta la API (/api/*) con Hono y sirve el frontend (assets)
// con fallback SPA. Un solo Worker, sin CORS.

import { Hono } from 'hono'
import type { Env, Variables } from './tipos'
import { auth } from './lib/auth-middleware'
import { autenticacion } from './api/auth'
import { verificarSesion, leerCookie } from './lib/session'
import { sesion } from './api/sesion'
import { maestro } from './api/maestro'
import { licencias } from './api/licencias'
import { asignaciones } from './api/asignaciones'
import { dashboard } from './api/dashboard'
import { historial } from './api/historial'
import { reportes } from './api/reportes'
import { usuarios } from './api/usuarios'

const app = new Hono<{ Bindings: Env; Variables: Variables }>()

// ── Cabeceras de seguridad en todas las respuestas ──────────────────────────
app.use('*', async (c, next) => {
  await next()
  const h = c.res.headers
  h.set('X-Content-Type-Options', 'nosniff')
  h.set('X-Frame-Options', 'DENY')
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  h.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  )
})

// ── Autenticación (rutas públicas, sin sesión previa) ───────────────────────
app.route('/api/auth', autenticacion)

// ── API ─────────────────────────────────────────────────────────────────────
const api = new Hono<{ Bindings: Env; Variables: Variables }>()

// Toda la API exige sesión autenticada.
api.use('*', auth())

api.route('/sesion', sesion)
api.route('/maestro', maestro)
api.route('/licencias', licencias)
api.route('/asignaciones', asignaciones)
api.route('/dashboard', dashboard)
api.route('/historial', historial)
api.route('/reportes', reportes)
api.route('/usuarios', usuarios)

api.get('/salud', (c) => c.json({ ok: true, entorno: c.env.ENTORNO }))

// 404 de API en JSON (evita devolver el index.html a llamadas /api inexistentes)
api.all('*', (c) => c.json({ error: 'Recurso no encontrado' }, 404))

app.route('/api', api)

// ── Asset protegido: el maestro (usuarios.xlsx) solo para autenticados ──────
// Con run_worker_first el Worker ve esta ruta antes que Assets, evitando que el
// archivo con datos de personal quede públicamente descargable.
async function sesionValida(env: Env, req: Request): Promise<boolean> {
  if (env.ENTORNO === 'dev') return true
  const token = leerCookie(req.headers, 'sesion')
  if (!token) return false
  return (await verificarSesion(env, token)) != null
}

// Reconstruye una respuesta de Assets con headers mutables (el middleware de
// seguridad no puede escribir sobre los headers inmutables de ASSETS.fetch).
function reempaquetar(resp: Response): Response {
  return new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers: new Headers(resp.headers),
  })
}

app.get('/usuarios.xlsx', async (c) => {
  if (!(await sesionValida(c.env, c.req.raw))) return c.text('No autorizado', 401)
  const url = new URL(c.req.url)
  url.pathname = '/usuarios.xlsx'
  return reempaquetar(await c.env.ASSETS.fetch(new Request(url, { method: 'GET' })))
})

// ── Frontend: assets estáticos + fallback SPA ───────────────────────────────
// El Worker corre primero (run_worker_first): sirve el asset si existe; si no,
// devuelve index.html para las rutas de cliente (SPA).
app.get('*', async (c) => {
  const resp = await c.env.ASSETS.fetch(c.req.raw)
  if (resp.status !== 404) return reempaquetar(resp)
  const url = new URL(c.req.url)
  url.pathname = '/index.html'
  const idx = await c.env.ASSETS.fetch(new Request(url, { method: 'GET' }))
  return c.html(await idx.text())
})

export default app
