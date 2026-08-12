// Pestaña de histórico de una licencia (orden cronológico descendente).

import { useQuery } from '@tanstack/react-query'
import { apiGet } from '../lib/api'
import { Cargando, ErrorMsg, Vacio } from './Estado'
import { Insignia } from './ui'
import { fechaHora } from '../lib/formato'

interface Movimiento {
  id: number
  ts: string
  accion: string
  detalle: string
  usuario_app_email: string | null
}

export function HistorialLicencia({ licenciaId }: { licenciaId: number }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['historial', 'licencia', licenciaId],
    queryFn: () =>
      apiGet<{ movimientos: Movimiento[] }>(`/historial?licencia_id=${licenciaId}&pageSize=100`),
  })

  if (isLoading) return <Cargando />
  if (error) return <ErrorMsg error={error} />
  const filas = data?.movimientos ?? []
  if (filas.length === 0) return <Vacio texto="Sin movimientos registrados para esta licencia." />

  return (
    <ol className="relative border-l border-slate-200 pl-5">
      {filas.map((m) => (
        <li key={m.id} className="mb-4">
          <span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full bg-marca-600" />
          <div className="flex items-center gap-2">
            <Insignia tono="gris">{m.accion}</Insignia>
            <span className="text-xs text-slate-400">{fechaHora(m.ts)}</span>
          </div>
          <p className="mt-1 text-sm text-slate-700">{m.detalle}</p>
          {m.usuario_app_email && (
            <p className="text-xs text-slate-400">{m.usuario_app_email}</p>
          )}
        </li>
      ))}
    </ol>
  )
}
