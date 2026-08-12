import { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { apiGet } from '../lib/api'
import { Cargando, ErrorMsg, Vacio } from '../componentes/Estado'
import { Boton, Insignia, Tarjeta, Titulo } from '../componentes/ui'
import { fechaHora } from '../lib/formato'

interface Movimiento {
  id: number
  ts: string
  entidad: string
  licencia_id: number | null
  accion: string
  usuario_app_email: string | null
  usuario_maestro_nombre: string | null
  detalle: string
  nombre_aplicacion: string | null
}

interface Respuesta {
  movimientos: Movimiento[]
  total: number
  page: number
  pageSize: number
}

const claseInput = 'rounded border border-slate-300 px-3 py-1.5 text-sm'
const ACCIONES = ['CREAR', 'EDITAR', 'ELIMINAR', 'ASIGNAR', 'LIBERAR', 'LOGIN', 'SINCRONIZAR']

export default function Historico() {
  const [filtros, setFiltros] = useState({
    desde: '',
    hasta: '',
    aplicacion: '',
    destinatario: '',
    usuario_app: '',
    accion: '',
  })
  const [page, setPage] = useState(1)

  const params = new URLSearchParams()
  Object.entries(filtros).forEach(([k, v]) => v && params.set(k, v))
  params.set('page', String(page))

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['historial', 'global', filtros, page],
    queryFn: () => apiGet<Respuesta>(`/historial?${params.toString()}`),
    placeholderData: keepPreviousData,
  })

  const set = (k: keyof typeof filtros, v: string) => {
    setFiltros((f) => ({ ...f, [k]: v }))
    setPage(1)
  }

  const total = data?.total ?? 0
  const pageSize = data?.pageSize ?? 25
  const totalPaginas = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div>
      <Titulo sub="Bitácora consolidada de todos los movimientos. Solo lectura.">
        Histórico global
      </Titulo>

      <Tarjeta>
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <label className="text-xs text-slate-600">
            Desde
            <input
              type="date"
              className={`${claseInput} mt-1 w-full`}
              value={filtros.desde}
              onChange={(e) => set('desde', e.target.value)}
            />
          </label>
          <label className="text-xs text-slate-600">
            Hasta
            <input
              type="date"
              className={`${claseInput} mt-1 w-full`}
              value={filtros.hasta}
              onChange={(e) => set('hasta', e.target.value)}
            />
          </label>
          <label className="text-xs text-slate-600">
            Aplicación
            <input
              className={`${claseInput} mt-1 w-full`}
              value={filtros.aplicacion}
              onChange={(e) => set('aplicacion', e.target.value)}
            />
          </label>
          <label className="text-xs text-slate-600">
            Destinatario
            <input
              className={`${claseInput} mt-1 w-full`}
              value={filtros.destinatario}
              onChange={(e) => set('destinatario', e.target.value)}
            />
          </label>
          <label className="text-xs text-slate-600">
            Usuario del sistema
            <input
              className={`${claseInput} mt-1 w-full`}
              value={filtros.usuario_app}
              onChange={(e) => set('usuario_app', e.target.value)}
            />
          </label>
          <label className="text-xs text-slate-600">
            Acción
            <select
              className={`${claseInput} mt-1 w-full`}
              value={filtros.accion}
              onChange={(e) => set('accion', e.target.value)}
            >
              <option value="">Todas</option>
              {ACCIONES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
        </div>

        {isLoading ? (
          <Cargando />
        ) : error ? (
          <ErrorMsg error={error} />
        ) : !data || data.movimientos.length === 0 ? (
          <Vacio texto="No hay movimientos que coincidan con los filtros." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-4">Fecha</th>
                    <th className="py-2 pr-4">Acción</th>
                    <th className="py-2 pr-4">Aplicación</th>
                    <th className="py-2 pr-4">Detalle</th>
                    <th className="py-2 pr-4">Destinatario</th>
                    <th className="py-2 pr-4">Usuario</th>
                  </tr>
                </thead>
                <tbody>
                  {data.movimientos.map((m) => (
                    <tr key={m.id} className="border-b border-slate-100">
                      <td className="py-2 pr-4 whitespace-nowrap text-xs text-slate-500">
                        {fechaHora(m.ts)}
                      </td>
                      <td className="py-2 pr-4">
                        <Insignia tono="gris">{m.accion}</Insignia>
                      </td>
                      <td className="py-2 pr-4 text-slate-600">{m.nombre_aplicacion ?? '—'}</td>
                      <td className="py-2 pr-4 text-slate-600">{m.detalle}</td>
                      <td className="py-2 pr-4 text-slate-600">
                        {m.usuario_maestro_nombre ?? '—'}
                      </td>
                      <td className="py-2 pr-4 text-xs text-slate-500">
                        {m.usuario_app_email ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
              <span>
                {total} movimiento(s) · página {data.page} de {totalPaginas}
                {isFetching && ' · actualizando…'}
              </span>
              <div className="flex gap-2">
                <Boton
                  variante="secundario"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Anterior
                </Boton>
                <Boton
                  variante="secundario"
                  disabled={page >= totalPaginas}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Siguiente
                </Boton>
              </div>
            </div>
          </>
        )}
      </Tarjeta>
    </div>
  )
}
