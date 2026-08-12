// Endpoints de sesión: identidad y rol del usuario autenticado.

import { Hono } from 'hono'
import type { Env, Variables } from '../tipos'

export const sesion = new Hono<{ Bindings: Env; Variables: Variables }>()

// Devuelve el actor actual (identidad + rol) para que el frontend adapte la UI.
// El backend sigue validando permisos en cada endpoint; el frontend nunca decide
// permisos por sí solo.
sesion.get('/yo', (c) => {
  const actor = c.get('actor')
  return c.json({ usuario: actor })
})
