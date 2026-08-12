// Cliente HTTP hacia /api. Incluye credenciales (cookie de Access) y, en
// desarrollo, la cabecera X-Dev-Email para el bypass local del Worker.

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

function cabeceras(extra?: HeadersInit): Headers {
  const h = new Headers(extra)
  if (import.meta.env.DEV) {
    const devEmail = localStorage.getItem('dev-email')
    if (devEmail) h.set('X-Dev-Email', devEmail)
  }
  return h
}

async function procesar<T>(resp: Response): Promise<T> {
  const texto = await resp.text()
  const data = texto ? JSON.parse(texto) : null
  if (!resp.ok) {
    const msg = data?.error ?? `Error ${resp.status}`
    throw new ApiError(resp.status, msg)
  }
  return data as T
}

export async function apiGet<T>(ruta: string): Promise<T> {
  const resp = await fetch(`/api${ruta}`, {
    headers: cabeceras(),
    credentials: 'same-origin',
  })
  return procesar<T>(resp)
}

export async function apiSubir<T>(ruta: string, form: FormData): Promise<T> {
  const resp = await fetch(`/api${ruta}`, {
    method: 'POST',
    headers: cabeceras(), // sin Content-Type: el navegador fija el boundary
    credentials: 'same-origin',
    body: form,
  })
  return procesar<T>(resp)
}

export async function apiEnviar<T>(
  ruta: string,
  metodo: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  cuerpo?: unknown,
): Promise<T> {
  const resp = await fetch(`/api${ruta}`, {
    method: metodo,
    headers: cabeceras({ 'Content-Type': 'application/json' }),
    credentials: 'same-origin',
    body: cuerpo != null ? JSON.stringify(cuerpo) : undefined,
  })
  return procesar<T>(resp)
}
