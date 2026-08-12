// Verificación del JWT de Cloudflare Access (RS256) contra el JWKS del equipo.
// Se cachea el JWKS 1 hora. Devuelve el correo del usuario o null si el token
// no es válido / Access no está configurado.

import type { Env } from '../tipos'

interface Jwk {
  kid: string
  kty: string
  n: string
  e: string
  alg?: string
}

interface CacheJwks {
  claves: Map<string, CryptoKey>
  expira: number
}

const cacheJwks = new Map<string, CacheJwks>()
const UNA_HORA = 60 * 60 * 1000

function b64urlABytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function bytesATexto(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

async function obtenerClaves(env: Env): Promise<Map<string, CryptoKey> | null> {
  const dominio = env.ACCESS_TEAM_DOMAIN?.trim()
  if (!dominio) return null

  const cache = cacheJwks.get(dominio)
  if (cache && cache.expira > Date.now()) return cache.claves

  const url = `https://${dominio}/cdn-cgi/access/certs`
  const resp = await fetch(url)
  if (!resp.ok) return null
  const data = (await resp.json()) as { keys: Jwk[] }

  const claves = new Map<string, CryptoKey>()
  for (const jwk of data.keys ?? []) {
    try {
      const clave = await crypto.subtle.importKey(
        'jwk',
        { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify'],
      )
      claves.set(jwk.kid, clave)
    } catch {
      // Ignorar claves que no se puedan importar
    }
  }
  cacheJwks.set(dominio, { claves, expira: Date.now() + UNA_HORA })
  return claves
}

export async function verificarAccess(env: Env, token: string): Promise<string | null> {
  const aud = env.ACCESS_AUD?.trim()
  if (!aud) return null

  const partes = token.split('.')
  if (partes.length !== 3) return null
  const [cabeceraB64, cargaB64, firmaB64] = partes

  let cabecera: { kid?: string; alg?: string }
  let carga: { aud?: string | string[]; exp?: number; email?: string; iss?: string }
  try {
    cabecera = JSON.parse(bytesATexto(b64urlABytes(cabeceraB64)))
    carga = JSON.parse(bytesATexto(b64urlABytes(cargaB64)))
  } catch {
    return null
  }

  if (cabecera.alg !== 'RS256' || !cabecera.kid) return null

  const claves = await obtenerClaves(env)
  if (!claves) return null
  const clave = claves.get(cabecera.kid)
  if (!clave) return null

  const datos = new TextEncoder().encode(`${cabeceraB64}.${cargaB64}`)
  const firma = b64urlABytes(firmaB64)
  const valida = await crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5' },
    clave,
    firma as unknown as BufferSource,
    datos as unknown as BufferSource,
  )
  if (!valida) return null

  // Validar audiencia y expiración
  const audiencias = Array.isArray(carga.aud) ? carga.aud : carga.aud ? [carga.aud] : []
  if (!audiencias.includes(aud)) return null
  if (carga.exp && carga.exp * 1000 < Date.now()) return null

  return carga.email ?? null
}
