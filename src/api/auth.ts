// Rutas públicas de autenticación (fuera del middleware de sesión):
//  GET /api/auth/login    → redirige a Google (OIDC).
//  GET /api/auth/callback → canjea el código, crea la sesión y redirige a /.
//  GET /api/auth/logout   → borra la sesión y redirige a /.

import { Hono } from 'hono'
import type { Env, Variables } from '../tipos'
import { urlAutorizacion, intercambiarCodigo } from '../lib/oidc'
import { firmarSesion, cookieSesion, leerCookie, nonce } from '../lib/session'
import { resolverActor } from '../lib/auth-middleware'

export const autenticacion = new Hono<{ Bindings: Env; Variables: Variables }>()

function redirect(location: string, cookies: string[] = []): Response {
  const h = new Headers({ Location: location })
  for (const c of cookies) h.append('Set-Cookie', c)
  return new Response(null, { status: 302, headers: h })
}

const cookieEstado = (valor: string, borrar = false) =>
  `oauth_state=${valor}; HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=${borrar ? 0 : 600}`

autenticacion.get('/login', (c) => {
  const url = new URL(c.req.url)
  const redirectUri = `${url.origin}/api/auth/callback`
  const state = nonce()
  return redirect(urlAutorizacion(c.env, redirectUri, state), [cookieEstado(state)])
})

autenticacion.get('/callback', async (c) => {
  const url = new URL(c.req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const estadoCookie = leerCookie(c.req.raw.headers, 'oauth_state')

  if (!state || !estadoCookie || state !== estadoCookie) {
    return redirect('/?error=estado', [cookieEstado('', true)])
  }
  if (!code) return redirect('/?error=google', [cookieEstado('', true)])

  const redirectUri = `${url.origin}/api/auth/callback`
  const r = await intercambiarCodigo(c.env, code, redirectUri)
  if ('error' in r) {
    return redirect(`/?error=google&motivo=${encodeURIComponent(r.error)}`, [cookieEstado('', true)])
  }
  const identidad = r.identidad

  const ip = c.req.header('cf-connecting-ip') ?? ''
  const actor = await resolverActor(c.env, identidad.email, ip)
  if (!actor) return redirect('/?error=sin_acceso', [cookieEstado('', true)])

  const token = await firmarSesion(c.env, { email: actor.email, name: actor.nombre })
  return redirect('/', [cookieSesion(token), cookieEstado('', true)])
})

autenticacion.get('/logout', () => redirect('/', [cookieSesion('', true)]))

// Diagnóstico: reporta qué variables/secrets ve el Worker (solo booleanos).
autenticacion.get('/estado', (c) =>
  c.json({
    entorno: c.env.ENTORNO,
    google_client_id: !!c.env.GOOGLE_CLIENT_ID,
    google_client_secret: !!c.env.GOOGLE_CLIENT_SECRET,
    jwt_secret: !!c.env.JWT_SECRET,
  }),
)
