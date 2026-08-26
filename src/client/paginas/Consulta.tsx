import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '../lib/api'
import { Cargando, ErrorMsg, Vacio } from '../componentes/Estado'
import { Insignia, Tarjeta, Titulo } from '../componentes/ui'
import { fechaHora } from '../lib/formato'
import { ETIQUETA_TIPO } from '../lib/tipos'

interface UsuarioMaestro {
  id: number
  nombre: string
  email: string | null
  area: string | null
  activo: number
  desvinculado: number
  licencias_vigentes: number
}

interface AsignacionUsuario {
  id: number
  licencia_id: number
  nombre_aplicacion: string
  licencia_tipo: 'key' | 'flotante' | 'archivo'
  key_asignada: string | null
  aprobador: string | null
  ticket_referencia: string | null
  fecha_asignacion: string
}

const claseInput =
  'w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-marca-600 focus:outline-none focus:ring-1 focus:ring-marca-600'

export default function Consulta() {
  const [searchParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [seleccionado, setSeleccionado] = useState<UsuarioMaestro | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['maestro', 'consulta', q],
    queryFn: () => apiGet<{ usuarios: UsuarioMaestro[] }>(`/maestro?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
  })
  const usuarios = data?.usuarios ?? []

  // Deep-link ?u=<id> (desde el dashboard): trae todos y selecciona.
  const preId = Number(searchParams.get('u'))
  const { data: todos } = useQuery({
    queryKey: ['maestro', 'consulta', 'todos'],
    queryFn: () => apiGet<{ usuarios: UsuarioMaestro[] }>('/maestro'),
    enabled: Number.isInteger(preId) && preId > 0,
  })
  useEffect(() => {
    if (preId && todos && !seleccionado) {
      const u = todos.usuarios.find((x) => x.id === preId)
      if (u) setSeleccionado(u)
    }
  }, [preId, todos, seleccionado])

  const { data: asigData, isLoading: cargandoAsig } = useQuery({
    queryKey: ['asignaciones', 'usuario', seleccionado?.id],
    queryFn: () =>
      apiGet<{ asignaciones: AsignacionUsuario[] }>(
        `/asignaciones?usuario_maestro_id=${seleccionado!.id}&estado=asignada`,
      ),
    enabled: seleccionado != null,
  })
  const asignaciones = asigData?.asignaciones ?? []

  return (
    <div>
      <Titulo sub="Busca un usuario para ver si tiene licencias asignadas y cuáles.">
        Consulta de usuario
      </Titulo>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Tarjeta titulo="Buscar usuario">
          <input
            type="search"
            autoFocus
            className={claseInput}
            placeholder="Nombre, email o área (mín. 2 caracteres)…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="mt-3">
            {q.trim().length < 2 ? (
              <p className="text-sm text-slate-400">Escribe al menos 2 caracteres para buscar.</p>
            ) : isLoading ? (
              <Cargando />
            ) : error ? (
              <ErrorMsg error={error} />
            ) : usuarios.length === 0 ? (
              <Vacio texto="Sin coincidencias." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {usuarios.map((u) => (
                  <li key={u.id}>
                    <button
                      onClick={() => setSeleccionado(u)}
                      className={`flex w-full items-center justify-between gap-2 px-1 py-2 text-left hover:bg-slate-50 ${
                        seleccionado?.id === u.id ? 'bg-marca-50' : ''
                      }`}
                    >
                      <span>
                        <span className="font-medium text-slate-700">{u.nombre}</span>
                        <span className="ml-2 text-xs text-slate-400">
                          {u.email ?? '—'} · {u.area ?? '—'}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        {!!u.desvinculado && <Insignia tono="rojo">Desvinculado</Insignia>}
                        {u.licencias_vigentes > 0 ? (
                          <Insignia tono="azul">{u.licencias_vigentes} licencia(s)</Insignia>
                        ) : (
                          <Insignia tono="gris">Sin licencias</Insignia>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Tarjeta>

        <Tarjeta titulo="Licencias del usuario">
          {!seleccionado ? (
            <Vacio texto="Selecciona un usuario para ver sus licencias." />
          ) : (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-800">{seleccionado.nombre}</div>
                  <div className="text-xs text-slate-500">{seleccionado.email ?? '—'}</div>
                </div>
                {!!seleccionado.desvinculado && <Insignia tono="rojo">Desvinculado</Insignia>}
              </div>

              {cargandoAsig ? (
                <Cargando />
              ) : asignaciones.length === 0 ? (
                <div className="rounded border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  Este usuario <strong>no tiene licencias asignadas</strong>.
                </div>
              ) : (
                <>
                  <p className="mb-2 text-sm text-slate-600">
                    Tiene <strong>{asignaciones.length}</strong> licencia(s) asignada(s):
                  </p>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                          <th className="py-2 pr-4">Aplicación</th>
                          <th className="py-2 pr-4">Tipo</th>
                          <th className="py-2 pr-4">Key</th>
                          <th className="py-2 pr-4">Ticket</th>
                          <th className="py-2 pr-4">Asignada</th>
                        </tr>
                      </thead>
                      <tbody>
                        {asignaciones.map((a) => (
                          <tr key={a.id} className="border-b border-slate-100">
                            <td className="py-2 pr-4 font-medium text-slate-700">
                              {a.nombre_aplicacion}
                            </td>
                            <td className="py-2 pr-4">
                              <Insignia tono="azul">{ETIQUETA_TIPO[a.licencia_tipo]}</Insignia>
                            </td>
                            <td className="py-2 pr-4 font-mono text-xs text-slate-600">
                              {a.key_asignada ?? '—'}
                            </td>
                            <td className="py-2 pr-4 text-slate-600">
                              {a.ticket_referencia ?? '—'}
                            </td>
                            <td className="py-2 pr-4 text-xs text-slate-500">
                              {fechaHora(a.fecha_asignacion)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </Tarjeta>
      </div>
    </div>
  )
}
