// Sesión propia de la aplicación: JWT HS256 firmado con JWT_SECRET (Web Crypto),
// entregado en cookie HttpOnly. Reemplaza la validación de Cloudflare Access.

import type { Env } from '../tipos'

const DURACION_SEG = 8 * 60 * 60 // 8 horas

function b64urlEncode(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

const enc = new TextEncoder()

async function claveHmac(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

export interface Sesion {
  email: string
  name?: string
}

/** Firma una sesión y devuelve el JWT. */
export async function firmarSesion(env: Env, s: Sesion): Promise<string> {
  const ahora = Math.floor(Date.now() / 1000)
  const header = { alg: 'HS256', typ: 'JWT' }
  const payload = { sub: s.email, name: s.name ?? '', iat: ahora, exp: ahora + DURACION_SEG }
  const h = b64urlEncode(enc.encode(JSON.stringify(header)))
  const p = b64urlEncode(enc.encode(JSON.stringify(payload)))
  const clave = await claveHmac(env.JWT_SECRET)
  const firma = new Uint8Array(
    await crypto.subtle.sign('HMAC', clave, enc.encode(`${h}.${p}`)),
  )
  return `${h}.${p}.${b64urlEncode(firma)}`
}

/** Verifica el JWT de sesión y devuelve sus datos, o null si es inválido/expiró. */
export async function verificarSesion(env: Env, token: string): Promise<Sesion | null> {
  if (!env.JWT_SECRET) return null
  const partes = token.split('.')
  if (partes.length !== 3) return null
  const [h, p, firmaB64] = partes
  const clave = await claveHmac(env.JWT_SECRET)
  const valida = await crypto.subtle.verify(
    'HMAC',
    clave,
    b64urlDecode(firmaB64) as unknown as BufferSource,
    enc.encode(`${h}.${p}`) as unknown as BufferSource,
  )
  if (!valida) return null
  let payload: { sub?: string; name?: string; exp?: number }
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlDecode(p)))
  } catch {
    return null
  }
  if (!payload.sub) return null
  if (payload.exp && payload.exp * 1000 < Date.now()) return null
  return { email: payload.sub, name: payload.name }
}

/** Cadena Set-Cookie para la sesión (o para borrarla si token = ''). */
export function cookieSesion(token: string, borrar = false): string {
  const base = 'sesion=' + token + '; HttpOnly; Secure; SameSite=Lax; Path=/'
  return borrar ? base + '; Max-Age=0' : base + `; Max-Age=${DURACION_SEG}`
}

/** Lee una cookie por nombre desde la cabecera Cookie. */
export function leerCookie(headers: Headers, nombre: string): string | null {
  const raw = headers.get('cookie')
  if (!raw) return null
  for (const parte of raw.split(';')) {
    const idx = parte.indexOf('=')
    if (idx === -1) continue
    if (parte.slice(0, idx).trim() === nombre) return parte.slice(idx + 1).trim()
  }
  return null
}

/** Genera un valor aleatorio (state CSRF). */
export function nonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return b64urlEncode(bytes)
}
