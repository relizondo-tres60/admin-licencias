// Utilidades de acceso a D1 con sentencias preparadas.
// Prohibida la concatenación de SQL: siempre .bind().

import type { Env } from '../tipos'

/** Fecha/hora actual en formato SQLite UTC 'YYYY-MM-DD HH:MM:SS'. */
export function ahora(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

/** Ejecuta una consulta preparada y devuelve todas las filas tipadas. */
export async function consultar<T = Record<string, unknown>>(
  env: Env,
  sql: string,
  ...params: unknown[]
): Promise<T[]> {
  const res = await env.DB.prepare(sql).bind(...params).all<T>()
  return res.results ?? []
}

/** Ejecuta una consulta preparada y devuelve la primera fila o null. */
export async function primera<T = Record<string, unknown>>(
  env: Env,
  sql: string,
  ...params: unknown[]
): Promise<T | null> {
  const row = await env.DB.prepare(sql).bind(...params).first<T>()
  return (row as T) ?? null
}
