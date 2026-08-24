import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiEnviar } from '../lib/api'
import { useSesion, puede } from '../lib/sesion'
import { useToast } from '../componentes/Toast'
import { Cargando, ErrorMsg, Vacio } from '../componentes/Estado'
import { Boton, Tarjeta, Titulo } from '../componentes/ui'
import { ComboUsuario } from '../componentes/ComboUsuario'
import type { Licencia, Aprobador } from '../lib/tipos'
import { ETIQUETA_TIPO } from '../lib/tipos'

const claseInput =
  'w-full rounded border border-slate-300 px-3 py-1.5 text-sm focus:border-marca-600 focus:outline-none focus:ring-1 focus:ring-marca-600'

export default function Asignar() {
  const toast = useToast()
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const { data: sesion } = useSesion()
  const permisos = puede(sesion?.usuario)

  const [licenciaId, setLicenciaId] = useState<number | null>(null)
  const [usuarioId, setUsuarioId] = useState<number | null>(null)
  const [keyAsignada, setKeyAsignada] = useState('')
  const [aprobador, setAprobador] = useState('')
  const [ticket, setTicket] = useState('')
  const [observacion, setObservacion] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['licencias', 'asignables'],
    queryFn: () =>
      apiGet<{ licencias: Licencia[] }>('/licencias?estado=activas&disponibilidad=con'),
  })
  const licencias = data?.licencias ?? []
  const licencia = licencias.find((l) => l.id === licenciaId)

  // Aprobadores de la licencia seleccionada (para el selector de aprobador).
  const { data: aprobData } = useQuery({
    queryKey: ['aprobadores', licenciaId],
    queryFn: () => apiGet<{ aprobadores: Aprobador[] }>(`/licencias/${licenciaId}/aprobadores`),
    enabled: licenciaId != null,
  })
  const aprobadores = aprobData?.aprobadores ?? []

  // Preselección por query param (?licencia=id) desde el detalle.
  useEffect(() => {
    const pre = Number(searchParams.get('licencia'))
    if (pre && licencias.some((l) => l.id === pre)) setLicenciaId(pre)
  }, [searchParams, licencias])

  const requiereKey = licencia?.tipo === 'key' && licencia?.modo_key === 'por_asignacion'

  const limpiar = () => {
    setUsuarioId(null)
    setKeyAsignada('')
    setAprobador('')
    setTicket('')
    setObservacion('')
  }

  const asignar = useMutation({
    mutationFn: () =>
      apiEnviar('/asignaciones', 'POST', {
        licencia_id: licenciaId,
        usuario_maestro_id: usuarioId,
        key_asignada: keyAsignada,
        aprobador,
        ticket_referencia: ticket,
        observacion_asignacion: observacion,
      }),
    onSuccess: () => {
      toast.exito('Licencia asignada correctamente.')
      qc.invalidateQueries({ queryKey: ['licencias'] })
      qc.invalidateQueries({ queryKey: ['licencia'] })
      qc.invalidateQueries({ queryKey: ['asignaciones'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      limpiar()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const puedeAsignar =
    licenciaId != null &&
    usuarioId != null &&
    aprobador.trim() !== '' &&
    ticket.trim() !== '' &&
    (!requiereKey || keyAsignada.trim() !== '')

  return (
    <div className="mx-auto max-w-2xl">
      <Titulo sub="Solo se listan licencias activas con disponibilidad y usuarios activos del maestro.">
        Asignar licencia
      </Titulo>

      {isLoading ? (
        <Cargando />
      ) : error ? (
        <ErrorMsg error={error} />
      ) : (
        <Tarjeta>
          {licencias.length === 0 ? (
            <Vacio texto="No hay licencias con disponibilidad para asignar." />
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                if (puedeAsignar) asignar.mutate()
              }}
            >
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Licencia *</span>
                <select
                  className={claseInput}
                  value={licenciaId ?? ''}
                  onChange={(e) => setLicenciaId(e.target.value ? Number(e.target.value) : null)}
                  required
                >
                  <option value="">Seleccione una licencia…</option>
                  {licencias.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nombre_aplicacion} · {ETIQUETA_TIPO[l.tipo]} · {l.disponibles} disp.
                    </option>
                  ))}
                </select>
              </label>

              <div>
                <span className="mb-1 block text-xs font-medium text-slate-600">
                  Usuario destinatario *
                </span>
                <ComboUsuario value={usuarioId} onChange={(id) => setUsuarioId(id)} />
              </div>

              {requiereKey && (
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">
                    Key de la asignación *
                  </span>
                  <input
                    className={claseInput}
                    value={keyAsignada}
                    onChange={(e) => setKeyAsignada(e.target.value)}
                    required
                  />
                  <span className="mt-1 block text-xs text-slate-400">
                    Debe ser única dentro de esta licencia.
                  </span>
                </label>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Aprobador *</span>
                  <div className="flex items-center gap-2">
                    <select
                      className={claseInput}
                      value={aprobador}
                      onChange={(e) => setAprobador(e.target.value)}
                      required
                      disabled={licenciaId == null || aprobadores.length === 0}
                    >
                      <option value="" disabled>
                        {aprobadores.length === 0 ? 'Sin aprobadores' : 'Seleccione…'}
                      </option>
                      {aprobadores.map((a) => (
                        <option key={a.id} value={a.nombre}>
                          {a.nombre}
                          {a.email ? ` (${a.email})` : ''}
                        </option>
                      ))}
                    </select>
                    {permisos.gestionarAprobadores && licenciaId != null && (
                      <Link
                        to={`/licencias/${licenciaId}?tab=aprobadores`}
                        title="Agregar aprobadores a esta licencia"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-slate-300 text-lg text-marca-600 hover:bg-marca-50"
                      >
                        +
                      </Link>
                    )}
                  </div>
                  {licenciaId != null && aprobadores.length === 0 && (
                    <span className="mt-1 block text-xs text-amber-600">
                      Esta licencia no tiene aprobadores.{' '}
                      {permisos.gestionarAprobadores
                        ? 'Agrega uno con el botón +.'
                        : 'Solicita a un administrador que agregue uno.'}
                    </span>
                  )}
                </div>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">
                    Ticket de referencia *
                  </span>
                  <input
                    className={claseInput}
                    value={ticket}
                    onChange={(e) => setTicket(e.target.value)}
                    required
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Observación</span>
                <textarea
                  className={claseInput}
                  rows={2}
                  value={observacion}
                  onChange={(e) => setObservacion(e.target.value)}
                />
              </label>

              <div className="flex justify-end border-t pt-4">
                <Boton type="submit" disabled={!puedeAsignar || asignar.isPending}>
                  {asignar.isPending ? 'Asignando…' : 'Asignar licencia'}
                </Boton>
              </div>
            </form>
          )}
        </Tarjeta>
      )}
    </div>
  )
}
