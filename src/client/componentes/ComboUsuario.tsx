// Selector de usuario del maestro con búsqueda por nombre/email/área.
// No admite texto libre: solo permite elegir un usuario activo existente.

import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '../lib/api'

export interface UsuarioMaestro {
  id: number
  nombre: string
  email: string | null
  area: string | null
  desvinculado?: number
}

export function ComboUsuario({
  value,
  onChange,
}: {
  value: number | null
  onChange: (id: number | null, usuario?: UsuarioMaestro) => void
}) {
  const [texto, setTexto] = useState('')
  const [abierto, setAbierto] = useState(false)
  const cont = useRef<HTMLDivElement>(null)

  const { data } = useQuery({
    queryKey: ['maestro', 'combo'],
    queryFn: () => apiGet<{ usuarios: UsuarioMaestro[] }>('/maestro?activos=1'),
    staleTime: 60_000,
  })
  const usuarios = useMemo(() => data?.usuarios ?? [], [data])
  const seleccionado = usuarios.find((u) => u.id === value)

  const filtrados = useMemo(() => {
    const q = texto.trim().toLowerCase()
    if (!q) return usuarios.slice(0, 50)
    return usuarios
      .filter(
        (u) =>
          u.nombre.toLowerCase().includes(q) ||
          (u.email ?? '').toLowerCase().includes(q) ||
          (u.area ?? '').toLowerCase().includes(q),
      )
      .slice(0, 50)
  }, [usuarios, texto])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (cont.current && !cont.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <div ref={cont} className="relative">
      {seleccionado && !abierto ? (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="flex w-full items-center justify-between rounded border border-slate-300 px-3 py-1.5 text-left text-sm"
        >
          <span>
            <span className="font-medium text-slate-700">{seleccionado.nombre}</span>
            <span className="ml-2 text-xs text-slate-400">
              {seleccionado.email ?? seleccionado.area}
            </span>
          </span>
          <span className="text-xs text-marca-600">Cambiar</span>
        </button>
      ) : (
        <input
          autoFocus={abierto}
          className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm focus:border-marca-600 focus:outline-none focus:ring-1 focus:ring-marca-600"
          placeholder="Buscar por nombre, email o área…"
          value={texto}
          onFocus={() => setAbierto(true)}
          onChange={(e) => {
            setTexto(e.target.value)
            setAbierto(true)
          }}
        />
      )}

      {abierto && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded border border-slate-200 bg-white shadow-lg">
          {filtrados.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-400">Sin coincidencias</li>
          ) : (
            filtrados.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(u.id, u)
                    setAbierto(false)
                    setTexto('')
                  }}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-marca-50"
                >
                  <span className="font-medium text-slate-700">{u.nombre}</span>
                  {!!u.desvinculado && (
                    <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
                      desvinculado
                    </span>
                  )}
                  <span className="ml-2 text-xs text-slate-400">
                    {u.email ?? '—'} · {u.area ?? '—'}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
