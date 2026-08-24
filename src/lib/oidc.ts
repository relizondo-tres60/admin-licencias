// Cliente OIDC de Google: construye la URL de autorización y canjea el código
// por la identidad del usuario (email + nombre).

import type { Env } from '../tipos'

const AUTORIZACION = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN = 'https://oauth2.googleapis.com/token'
const ISS_VALIDOS = ['accounts.google.com', 'https://accounts.google.com']

/** URL a la que se redirige al usuario para iniciar sesión con Google. */
export function urlAutorizacion(env: Env, redirectUri: string, state: string): string {
  const p = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  })
  return `${AUTORIZACION}?${p.toString()}`
}

function decodificarPayload(idToken: string): Record<string, unknown> | null {
  const partes = idToken.split('.')
  if (partes.length !== 3) return null
  try {
    const b64 = partes[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(decodeURIComponent(escape(atob(b64))))
  } catch {
    return null
  }
}

export interface IdentidadGoogle {
  email: string
  name?: string
}

export type ResultadoCanje = { identidad: IdentidadGoogle } | { error: string }

/**
 * Canjea el código de autorización por el id_token de Google y valida sus
 * claims (aud, iss, exp, email_verified). El id_token llega directo del token
 * endpoint de Google por TLS, por lo que la validación de claims es suficiente.
 * Devuelve un motivo corto en caso de fallo (para diagnóstico).
 */
export async function intercambiarCodigo(
  env: Env,
  code: string,
  redirectUri: string,
): Promise<ResultadoCanje> {
  if (!env.GOOGLE_CLIENT_SECRET) return { error: 'falta_client_secret' }
  if (!env.JWT_SECRET) return { error: 'falta_jwt_secret' }

  const resp = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  })
  if (!resp.ok) {
    const cuerpo = await resp.text()
    console.error('Google token endpoint error', resp.status, cuerpo)
    let motivo = `http_${resp.status}`
    try {
      motivo = (JSON.parse(cuerpo).error as string) || motivo
    } catch {
      /* cuerpo no-JSON */
    }
    return { error: motivo }
  }
  const data = (await resp.json()) as { id_token?: string }
  if (!data.id_token) return { error: 'sin_id_token' }

  const claims = decodificarPayload(data.id_token)
  if (!claims) return { error: 'id_token_ilegible' }

  const aud = claims.aud as string | undefined
  const iss = claims.iss as string | undefined
  const exp = claims.exp as number | undefined
  const email = claims.email as string | undefined
  const emailVerificado = claims.email_verified as boolean | string | undefined
  const name = claims.name as string | undefined

  if (aud !== env.GOOGLE_CLIENT_ID) return { error: 'aud_invalida' }
  if (!iss || !ISS_VALIDOS.includes(iss)) return { error: 'iss_invalida' }
  if (exp && exp * 1000 < Date.now()) return { error: 'expirado' }
  if (!email) return { error: 'sin_email' }
  if (emailVerificado === false || emailVerificado === 'false') {
    return { error: 'email_no_verificado' }
  }

  return { identidad: { email: email.toLowerCase(), name } }
}
