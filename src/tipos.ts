// Tipos compartidos del Worker

export interface Env {
  DB: D1Database
  ASSETS: Fetcher
  ENTORNO: string
  ADMIN_EMAIL: string
  ACCESS_TEAM_DOMAIN: string
  ACCESS_AUD: string
}

export type Rol = 'admin' | 'operador' | 'consulta'

export interface Actor {
  id: number
  email: string
  nombre: string
  rol: Rol
}

// Variables que el middleware de auth deja disponibles en el contexto Hono
export interface Variables {
  actor: Actor
  ip: string
}
