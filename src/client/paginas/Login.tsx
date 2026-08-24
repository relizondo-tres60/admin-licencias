// Pantalla de inicio de sesión a medida. Único método: Google.

const MENSAJES: Record<string, string> = {
  sin_acceso:
    'Tu cuenta de Google no tiene acceso a esta aplicación. Solicita al administrador que te habilite.',
  google: 'No se pudo completar el inicio de sesión con Google. Inténtalo nuevamente.',
  estado: 'La sesión de inicio expiró. Vuelve a intentarlo.',
}

function IconoGoogle() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  )
}

export default function Login() {
  const params = new URLSearchParams(window.location.search)
  const error = params.get('error')
  const mensaje = error ? (MENSAJES[error] ?? 'No se pudo iniciar sesión.') : null

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-marca-800 via-marca-700 to-marca-600 p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="bg-marca-800 px-8 py-7 text-center text-white">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-2xl">
            🔑
          </div>
          <h1 className="text-lg font-semibold">Administración de Licencias</h1>
          <p className="mt-1 text-sm text-marca-100/80">Tres60</p>
        </div>

        <div className="px-8 py-8">
          <p className="mb-6 text-center text-sm text-slate-500">
            Ingresa con tu cuenta corporativa de Google para continuar.
          </p>

          {mensaje && (
            <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {mensaje}
            </div>
          )}

          <a
            href="/api/auth/login"
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 hover:shadow"
          >
            <IconoGoogle />
            Continuar con Google
          </a>

          <p className="mt-6 text-center text-xs text-slate-400">
            El acceso está restringido a usuarios autorizados.
          </p>
        </div>
      </div>
    </div>
  )
}
