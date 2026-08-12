// Pestaña de asignaciones vigentes de una licencia, con acción de liberar.

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiEnviar } from '../lib/api'
import { useToast } from './Toast'
import { Cargando, ErrorMsg, Vacio } from './Estado'
import { Boton } from './ui'
import { Modal } from './Modal'
import { fechaHora } from '../lib/formato'

export interface Asignacion {
  id: number
  usuario_nombre: string
  usuario_email: string | null
  usuario_area: string | null
  key_asignada: string | null
  aprobador: string | null
  ticket_referencia: string | null
  observacion_asignacion: string | null
  fecha_asignacion: string
  asignada_por_email: string | null
}

export function AsignacionesLicencia({
  licenciaId,
  puedeLiberar,
}: {
  licenciaId: number
  puedeLiberar: boolean
}) {
  const toast = useToast()
  const qc = useQueryClient()
  const [aLiberar, setALiberar] = useState<Asignacion | null>(null)
  const [motivo, setMotivo] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['asignaciones', licenciaId, 'asignada'],
    queryFn: () =>
      apiGet<{ asignaciones: Asignacion[] }>(
        `/asignaciones?licencia_id=${licenciaId}&estado=asignada`,
      ),
  })

  const liberar = useMutation({
    mutationFn: (id: number) =>
      apiEnviar(`/asignaciones/${id}/liberar`, 'PUT', { motivo_liberacion: motivo }),
    onSuccess: () => {
      toast.exito('Asignación liberada.')
      qc.invalidateQueries({ queryKey: ['asignaciones'] })
      qc.invalidateQueries({ queryKey: ['licencia'] })
      qc.invalidateQueries({ queryKey: ['licencias'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setALiberar(null)
      setMotivo('')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (isLoading) return <Cargando />
  if (error) return <ErrorMsg error={error} />
  const filas = data?.asignaciones ?? []
  if (filas.length === 0)
    return <Vacio texto="Esta licencia no tiene asignaciones vigentes." />

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-2">Usuario</th>
            <th className="px-4 py-2">Área</th>
            <th className="px-4 py-2">Key</th>
            <th className="px-4 py-2">Aprobador</th>
            <th className="px-4 py-2">Ticket</th>
            <th className="px-4 py-2">Asignada</th>
            {puedeLiberar && <th className="px-4 py-2"></th>}
          </tr>
        </thead>
        <tbody>
          {filas.map((a) => (
            <tr key={a.id} className="border-b border-slate-100">
              <td className="px-4 py-2">
                <div className="font-medium text-slate-700">{a.usuario_nombre}</div>
                <div className="text-xs text-slate-400">{a.usuario_email ?? '—'}</div>
              </td>
              <td className="px-4 py-2 text-slate-600">{a.usuario_area ?? '—'}</td>
              <td className="px-4 py-2 font-mono text-xs text-slate-600">
                {a.key_asignada ?? '—'}
              </td>
              <td className="px-4 py-2 text-slate-600">{a.aprobador ?? '—'}</td>
              <td className="px-4 py-2 text-slate-600">{a.ticket_referencia ?? '—'}</td>
              <td className="px-4 py-2 text-xs text-slate-500">{fechaHora(a.fecha_asignacion)}</td>
              {puedeLiberar && (
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => setALiberar(a)}
                    className="text-xs font-medium text-red-600 hover:underline"
                  >
                    Liberar
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <Modal
        abierto={aLiberar != null}
        onCerrar={() => setALiberar(null)}
        titulo="Liberar asignación"
      >
        <p className="text-sm text-slate-600">
          Va a liberar la licencia asignada a <strong>{aLiberar?.usuario_nombre}</strong>. La
          asignación quedará registrada como liberada (no se elimina).
        </p>
        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            Motivo de liberación *
          </span>
          <textarea
            className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            autoFocus
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <Boton variante="secundario" onClick={() => setALiberar(null)}>
            Cancelar
          </Boton>
          <Boton
            variante="peligro"
            disabled={motivo.trim() === '' || liberar.isPending}
            onClick={() => aLiberar && liberar.mutate(aLiberar.id)}
          >
            {liberar.isPending ? 'Liberando…' : 'Confirmar liberación'}
          </Boton>
        </div>
      </Modal>
    </div>
  )
}
