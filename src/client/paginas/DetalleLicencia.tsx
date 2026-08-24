import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiEnviar } from '../lib/api'
import { useSesion, puede } from '../lib/sesion'
import { useToast } from '../componentes/Toast'
import { Cargando, ErrorMsg } from '../componentes/Estado'
import { Boton, Insignia, Tarjeta } from '../componentes/ui'
import { Modal } from '../componentes/Modal'
import { AsignacionesLicencia } from '../componentes/AsignacionesLicencia'
import { HistorialLicencia } from '../componentes/HistorialLicencia'
import { AprobadoresLicencia } from '../componentes/AprobadoresLicencia'
import type { Licencia } from '../lib/tipos'
import { ETIQUETA_TIPO, ETIQUETA_MODO } from '../lib/tipos'
import { fecha, fechaHora } from '../lib/formato'

type Pestana = 'ficha' | 'aprobadores' | 'asignaciones' | 'historico'

function Dato({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{etiqueta}</dt>
      <dd className="mt-0.5 text-sm text-slate-700">{valor ?? '—'}</dd>
    </div>
  )
}

export default function DetalleLicencia() {
  const { id } = useParams()
  const toast = useToast()
  const qc = useQueryClient()
  const { data: sesion } = useSesion()
  const permisos = puede(sesion?.usuario)
  const [pestana, setPestana] = useState<Pestana>('ficha')
  const [confirmarBaja, setConfirmarBaja] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['licencia', id],
    queryFn: () => apiGet<{ licencia: Licencia }>(`/licencias/${id}`),
    enabled: !!id,
  })

  const baja = useMutation({
    mutationFn: () => apiEnviar(`/licencias/${id}`, 'DELETE'),
    onSuccess: () => {
      toast.exito('Licencia dada de baja.')
      qc.invalidateQueries({ queryKey: ['licencia', id] })
      qc.invalidateQueries({ queryKey: ['licencias'] })
      setConfirmarBaja(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (isLoading) return <Cargando />
  if (error) return <ErrorMsg error={error} />
  const l = data?.licencia
  if (!l) return <ErrorMsg error={new Error('Licencia no encontrada')} />

  const pestanas: { id: Pestana; etiqueta: string }[] = [
    { id: 'ficha', etiqueta: 'Ficha' },
    { id: 'aprobadores', etiqueta: 'Aprobadores' },
    { id: 'asignaciones', etiqueta: 'Asignaciones vigentes' },
    { id: 'historico', etiqueta: 'Histórico' },
  ]

  return (
    <div>
      <div className="mb-4">
        <Link to="/licencias" className="text-sm text-marca-600 hover:underline">
          ← Volver a licencias
        </Link>
      </div>

      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-marca-800">
            {l.nombre_aplicacion}
            {l.version && <span className="ml-2 text-sm text-slate-400">{l.version}</span>}
          </h1>
          <div className="mt-2 flex items-center gap-2">
            <Insignia tono="azul">{ETIQUETA_TIPO[l.tipo]}</Insignia>
            {l.activo ? (
              <Insignia tono="verde">Activa</Insignia>
            ) : (
              <Insignia tono="rojo">Dada de baja</Insignia>
            )}
            <span className="text-sm text-slate-500">
              {l.asignadas} asignadas · {l.disponibles} disponibles de {l.cantidad_total}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {permisos.asignar && l.activo === 1 && l.disponibles > 0 && (
            <Link to={`/asignar?licencia=${l.id}`}>
              <Boton>Asignar</Boton>
            </Link>
          )}
          {permisos.darDeBaja && l.activo === 1 && (
            <Boton variante="peligro" onClick={() => setConfirmarBaja(true)}>
              Dar de baja
            </Boton>
          )}
        </div>
      </div>

      {/* Pestañas */}
      <div className="mb-4 flex gap-1 border-b">
        {pestanas.map((p) => (
          <button
            key={p.id}
            onClick={() => setPestana(p.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${
              pestana === p.id
                ? 'border-marca-600 font-medium text-marca-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      {pestana === 'ficha' && (
        <Tarjeta>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-4 md:grid-cols-3">
            <Dato etiqueta="Tipo" valor={ETIQUETA_TIPO[l.tipo]} />
            <Dato etiqueta="Cantidad total" valor={l.cantidad_total} />
            <Dato etiqueta="Proveedor" valor={l.proveedor} />
            {l.tipo === 'key' && (
              <Dato etiqueta="Modo de key" valor={l.modo_key ? ETIQUETA_MODO[l.modo_key] : '—'} />
            )}
            {l.tipo === 'key' && l.modo_key === 'unica' && (
              <Dato etiqueta="Key compartida" valor={l.key_compartida} />
            )}
            {l.tipo === 'flotante' && (
              <Dato etiqueta="Servidor de licencias" valor={l.servidor_licencias} />
            )}
            {l.tipo === 'archivo' && (
              <Dato etiqueta="Ruta del archivo" valor={l.ruta_archivo_licencia} />
            )}
            <Dato etiqueta="Key user" valor={l.key_user_nombre} />
            <Dato etiqueta="Key user (email)" valor={l.key_user_email} />
            <Dato etiqueta="Aprobadores" valor={l.aprobadores} />
            <Dato etiqueta="Vencimiento" valor={fecha(l.fecha_vencimiento)} />
            <Dato etiqueta="Creada" valor={fechaHora(l.creado_en)} />
            <Dato etiqueta="Actualizada" valor={fechaHora(l.actualizado_en)} />
            <Dato etiqueta="Notas" valor={l.notas} />
          </dl>
        </Tarjeta>
      )}

      {pestana === 'aprobadores' && (
        <AprobadoresLicencia licenciaId={l.id} puedeGestionar={permisos.gestionarAprobadores} />
      )}
      {pestana === 'asignaciones' && (
        <AsignacionesLicencia licenciaId={l.id} puedeLiberar={permisos.asignar} />
      )}
      {pestana === 'historico' && <HistorialLicencia licenciaId={l.id} />}

      <Modal
        abierto={confirmarBaja}
        onCerrar={() => setConfirmarBaja(false)}
        titulo="Confirmar baja de licencia"
      >
        <p className="text-sm text-slate-600">
          ¿Está seguro de dar de baja la licencia <strong>{l.nombre_aplicacion}</strong>? Esta
          acción es una baja lógica: la licencia se conserva en el sistema pero deja de estar
          activa.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Boton variante="secundario" onClick={() => setConfirmarBaja(false)}>
            Cancelar
          </Boton>
          <Boton variante="peligro" onClick={() => baja.mutate()} disabled={baja.isPending}>
            {baja.isPending ? 'Procesando…' : 'Confirmar baja'}
          </Boton>
        </div>
      </Modal>
    </div>
  )
}
