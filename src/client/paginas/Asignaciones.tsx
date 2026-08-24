import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiEnviar } from '../lib/api'
import { useSesion, puede } from '../lib/sesion'
import { useToast } from '../componentes/Toast'
import { Cargando, ErrorMsg, Vacio } from '../componentes/Estado'
import { Boton, Tarjeta, Titulo } from '../componentes/ui'
import { Modal } from '../componentes/Modal'
import { fechaHora } from '../lib/formato'

interface Asignacion {
  id: number
  licencia_id: number
  nombre_aplicacion: string
  licencia_tipo: 'key' | 'flotante' | 'archivo'
  usuario_nombre: string
  usuario_email: string | null
  usuario_area: string | null
  key_asignada: string | null
  aprobador: string | null
  ticket_referencia: string | null
  fecha_asignacion: string
  asignada_por_email: string | null
}

const claseInput = 'rounded border border-slate-300 px-3 py-1.5 text-sm'

export default function Asignaciones() {
  const toast = useToast()
  const qc = useQueryClient()
  const { data: sesion } = useSesion()
  const permisos = puede(sesion?.usuario)

  const [q, setQ] = useState('')
  const [aLiberar, setALiberar] = useState<Asignacion | null>(null)
  const [motivo, setMotivo] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['asignaciones', 'vigentes-todas'],
    queryFn: () => apiGet<{ asignaciones: Asignacion[] }>('/asignaciones?estado=asignada'),
  })

  const liberar = useMutation({
    mutationFn: (id: number) =>
      apiEnviar(`/asignaciones/${id}/liberar`, 'PUT', { motivo_liberacion: motivo }),
    onSuccess: () => {
      toast.exito('Asignación liberada.')
      qc.invalidateQueries({ queryKey: ['asignaciones'] })
      qc.invalidateQueries({ queryKey: ['licencias'] })
      qc.invalidateQueries({ queryKey: ['licencia'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setALiberar(null)
      setMotivo('')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const filas = useMemo(() => {
    const t = q.trim().toLowerCase()
    const todas = data?.asignaciones ?? []
    if (!t) return todas
    return todas.filter(
      (a) =>
        a.nombre_aplicacion.toLowerCase().includes(t) ||
        a.usuario_nombre.toLowerCase().includes(t) ||
        (a.usuario_email ?? '').toLowerCase().includes(t) ||
        (a.usuario_area ?? '').toLowerCase().includes(t),
    )
  }, [data, q])

  return (
    <div>
      <Titulo sub="Todas las asignaciones vigentes del sistema. Libera desde aquí sin entrar a cada licencia.">
        Asignaciones vigentes
      </Titulo>

      <Tarjeta
        titulo={`Vigentes (${filas.length})`}
        acciones={
          <input
            type="search"
            placeholder="Buscar aplicación, usuario o área…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className={`${claseInput} w-72`}
          />
        }
      >
        {isLoading ? (
          <Cargando />
        ) : error ? (
          <ErrorMsg error={error} />
        ) : filas.length === 0 ? (
          <Vacio texto="No hay asignaciones vigentes." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4">Aplicación</th>
                  <th className="py-2 pr-4">Usuario</th>
                  <th className="py-2 pr-4">Área</th>
                  <th className="py-2 pr-4">Key</th>
                  <th className="py-2 pr-4">Aprobador</th>
                  <th className="py-2 pr-4">Ticket</th>
                  <th className="py-2 pr-4">Asignada</th>
                  {permisos.asignar && <th className="py-2 pr-4"></th>}
                </tr>
              </thead>
              <tbody>
                {filas.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 pr-4">
                      <Link
                        to={`/licencias/${a.licencia_id}`}
                        className="font-medium text-marca-700 hover:underline"
                      >
                        {a.nombre_aplicacion}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">
                      <div className="font-medium text-slate-700">{a.usuario_nombre}</div>
                      <div className="text-xs text-slate-400">{a.usuario_email ?? '—'}</div>
                    </td>
                    <td className="py-2 pr-4 text-slate-600">{a.usuario_area ?? '—'}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-slate-600">
                      {a.key_asignada ?? '—'}
                    </td>
                    <td className="py-2 pr-4 text-slate-600">{a.aprobador ?? '—'}</td>
                    <td className="py-2 pr-4 text-slate-600">{a.ticket_referencia ?? '—'}</td>
                    <td className="py-2 pr-4 text-xs text-slate-500">
                      {fechaHora(a.fecha_asignacion)}
                    </td>
                    {permisos.asignar && (
                      <td className="py-2 pr-4 text-right">
                        <button
                          onClick={() => {
                            setALiberar(a)
                            setMotivo('')
                          }}
                          className="rounded border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          Liberar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>

      <Modal
        abierto={aLiberar != null}
        onCerrar={() => setALiberar(null)}
        titulo="Liberar asignación"
      >
        {aLiberar && (
          <p className="text-sm text-slate-600">
            Vas a liberar <strong>{aLiberar.nombre_aplicacion}</strong> asignada a{' '}
            <strong>{aLiberar.usuario_nombre}</strong>. Queda registrada como liberada (no se
            elimina).
          </p>
        )}
        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            Motivo de liberación *
          </span>
          <textarea
            className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
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
