// Sistema de notificaciones tipo toast, minimal y sin dependencias.

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

type Tipo = 'exito' | 'error' | 'info'
interface Toast {
  id: number
  tipo: Tipo
  texto: string
}

interface ContextoToast {
  exito: (texto: string) => void
  error: (texto: string) => void
  info: (texto: string) => void
}

const Ctx = createContext<ContextoToast | null>(null)

let contador = 0

export function ProveedorToast({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const agregar = useCallback((tipo: Tipo, texto: string) => {
    const id = ++contador
    setToasts((t) => [...t, { id, tipo, texto }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000)
  }, [])

  const api: ContextoToast = {
    exito: (t) => agregar('exito', t),
    error: (t) => agregar('error', t),
    info: (t) => agregar('info', t),
  }

  const estilos: Record<Tipo, string> = {
    exito: 'border-emerald-300 bg-emerald-50 text-emerald-800',
    error: 'border-red-300 bg-red-50 text-red-800',
    info: 'border-sky-300 bg-sky-50 text-sky-800',
  }

  return (
    <Ctx.Provider value={api}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-50 flex w-80 max-w-[90vw] flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded border px-4 py-3 text-sm shadow-sm ${estilos[t.tipo]}`}
          >
            {t.texto}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export function useToast(): ContextoToast {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast debe usarse dentro de ProveedorToast')
  return ctx
}
