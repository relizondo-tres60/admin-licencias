// Estados de carga, vacío y error reutilizables.

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center py-16 text-slate-500">
      <span className="animate-pulse">{texto}</span>
    </div>
  )
}

export function Vacio({ texto = 'No hay datos para mostrar.' }: { texto?: string }) {
  return (
    <div className="rounded border border-dashed border-slate-300 bg-white py-12 text-center text-slate-500">
      {texto}
    </div>
  )
}

export function ErrorMsg({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : 'Ocurrió un error inesperado.'
  return (
    <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {msg}
    </div>
  )
}

export function EnConstruccion({ modulo }: { modulo: string }) {
  return (
    <div className="rounded border border-dashed border-slate-300 bg-white p-10 text-center">
      <h2 className="text-lg font-semibold text-slate-700">{modulo}</h2>
      <p className="mt-2 text-sm text-slate-500">Módulo en construcción.</p>
    </div>
  )
}
