// Tipos compartidos del Worker

export interface Env {
  DB: D1Database
  ASSETS: Fetcher
  ENTORNO: string
  ADMIN_EMAIL: string
  // Inicio de sesión con Google (OIDC) + sesión propia.
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  JWT_SECRET: string
}

export type Rol = 'admin' | 'operador' | 'consulta'

export interface Actor {
  id: number
  email: string
  nombre: string
  rol: Rol
  alcance: 'todas' | 'seleccion'
}

// Variables que el middleware de auth deja disponibles en el contexto Hono
export interface Variables {
  actor: Actor
  ip: string
}
