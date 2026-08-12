// Componentes UI básicos reutilizables.

import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variante = 'primario' | 'secundario' | 'peligro'

const CLASES: Record<Variante, string> = {
  primario: 'bg-marca-600 text-white hover:bg-marca-700 disabled:bg-slate-300',
  secundario:
    'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50',
  peligro: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-slate-300',
}

export function Boton({
  variante = 'primario',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante }) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed ${CLASES[variante]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function Insignia({
  children,
  tono = 'gris',
}: {
  children: ReactNode
  tono?: 'verde' | 'rojo' | 'ambar' | 'azul' | 'gris'
}) {
  const tonos: Record<string, string> = {
    verde: 'bg-emerald-100 text-emerald-800',
    rojo: 'bg-red-100 text-red-800',
    ambar: 'bg-amber-100 text-amber-800',
    azul: 'bg-sky-100 text-sky-800',
    gris: 'bg-slate-100 text-slate-700',
  }
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${tonos[tono]}`}>
      {children}
    </span>
  )
}

export function Tarjeta({
  titulo,
  children,
  acciones,
}: {
  titulo?: string
  children: ReactNode
  acciones?: ReactNode
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      {(titulo || acciones) && (
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          {titulo && <h2 className="font-semibold text-slate-700">{titulo}</h2>}
          {acciones}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  )
}

export function Titulo({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-xl font-semibold text-marca-800">{children}</h1>
      {sub && <p className="mt-1 text-sm text-slate-500">{sub}</p>}
    </div>
  )
}
