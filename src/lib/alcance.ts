// Permisos por licencia. Un usuario con alcance = 'seleccion' solo puede ver y
// actuar sobre las licencias autorizadas (tabla usuario_licencias). Los admin y
// los usuarios con alcance = 'todas' no tienen restricción.

import type { Env, Actor } from '../tipos'
import { consultar, primera } from './db'

export interface Permiso {
  restringido: boolean
  ids: Set<number>
}

export async function permisoLicencias(env: Env, actor: Actor): Promise<Permiso> {
  if (actor.rol === 'admin') return { restringido: false, ids: new Set() }
  const row = await primera<{ alcance: string }>(
    env,
    `SELECT alcance FROM usuarios_app WHERE id = ?`,
    actor.id,
  )
  if (!row || row.alcance !== 'seleccion') return { restringido: false, ids: new Set() }
  const rows = await consultar<{ licencia_id: number }>(
    env,
    `SELECT licencia_id FROM usuario_licencias WHERE usuario_app_id = ?`,
    actor.id,
  )
  return { restringido: true, ids: new Set(rows.map((r) => r.licencia_id)) }
}

/** Cláusula SQL para restringir por columna de licencia_id. */
export function filtroSQL(p: Permiso, columna: string): { sql: string; params: number[] } {
  if (!p.restringido) return { sql: '', params: [] }
  if (p.ids.size === 0) return { sql: ' AND 1 = 0', params: [] }
  const marcas = Array.from(p.ids).map(() => '?').join(',')
  return { sql: ` AND ${columna} IN (${marcas})`, params: Array.from(p.ids) }
}

export function puedeVer(p: Permiso, licenciaId: number): boolean {
  return !p.restringido || p.ids.has(licenciaId)
}
