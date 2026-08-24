// Worker principal: monta la API (/api/*) con Hono y sirve el frontend (assets)
// con fallback SPA. Un solo Worker, sin CORS.

import { Hono } from 'hono'
import type { Env, Variables } from './tipos'
import { auth } from './lib/auth-middleware'
import { autenticacion } from './api/auth'
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

// ── Frontend: fallback SPA ──────────────────────────────────────────────────
// Los assets estáticos los sirve Cloudflare Assets antes de invocar al Worker.
// Las rutas de cliente que no corresponden a un asset caen aquí y reciben el
// index.html de la SPA.
app.get('*', async (c) => {
  const url = new URL(c.req.url)
  url.pathname = '/index.html'
  const resp = await c.env.ASSETS.fetch(new Request(url, { method: 'GET' }))
  const html = await resp.text()
  return c.html(html)
})

export default app
