import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiEnviar } from '../lib/api'
import { useSesion, puede } from '../lib/sesion'
import { useToast } from '../componentes/Toast'
import { Cargando, ErrorMsg, Vacio } from '../componentes/Estado'
import { Boton, Insignia, Tarjeta, Titulo } from '../componentes/ui'
import { Modal } from '../componentes/Modal'
import { FormularioLicencia, type PayloadLicencia } from '../componentes/FormularioLicencia'
import type { Licencia } from '../lib/tipos'
import { ETIQUETA_TIPO } from '../lib/tipos'
import { fecha } from '../lib/formato'

const claseFiltro = 'rounded border border-slate-300 px-3 py-1.5 text-sm'

export default function Licencias() {
  const toast = useToast()
  const qc = useQueryClient()
  const { data: sesion } = useSesion()
  const permisos = puede(sesion?.usuario.rol)

  const [q, setQ] = useState('')
  const [tipo, setTipo] = useState('')
  const [estado, setEstado] = useState('activas')
  const [disponibilidad, setDisponibilidad] = useState('')
  const [modalAbierto, setModalAbierto] = useState(false)
  const [editando, setEditando] = useState<Licencia | undefined>(undefined)

  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (tipo) params.set('tipo', tipo)
  if (estado) params.set('estado', estado)
  if (disponibilidad) params.set('disponibilidad', disponibilidad)

  const { data, isLoading, error } = useQuery({
    queryKey: ['licencias', q, tipo, estado, disponibilidad],
    queryFn: () => apiGet<{ licencias: Licencia[] }>(`/licencias?${params.toString()}`),
  })

  const guardar = useMutation({
    mutationFn: (p: PayloadLicencia) =>
      editando
        ? apiEnviar(`/licencias/${editando.id}`, 'PUT', p)
        : apiEnviar('/licencias', 'POST', p),
    onSuccess: () => {
      toast.exito(editando ? 'Licencia actualizada.' : 'Licencia creada.')
      qc.invalidateQueries({ queryKey: ['licencias'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setModalAbierto(false)
      setEditando(undefined)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const abrirNueva = () => {
    setEditando(undefined)
    setModalAbierto(true)
  }
  const abrirEdicion = (l: Licencia) => {
    setEditando(l)
    setModalAbierto(true)
  }

  const licencias = data?.licencias ?? []

  return (
    <div>
      <div className="flex items-center justify-between">
        <Titulo sub="Inventario de licencias con disponibilidad calculada en tiempo real.">
          Licencias
        </Titulo>
        {permisos.editarLicencias && <Boton onClick={abrirNueva}>Nueva licencia</Boton>}
      </div>

      <Tarjeta>
        <div className="mb-4 flex flex-wrap gap-3">
          <input
            type="search"
            placeholder="Buscar aplicación o proveedor…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className={`${claseFiltro} min-w-[220px] flex-1`}
          />
          <select className={claseFiltro} value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Todos los tipos</option>
            <option value="key">Key</option>
            <option value="flotante">Flotante</option>
            <option value="archivo">Archivo</option>
          </select>
          <select
            className={claseFiltro}
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
          >
            <option value="activas">Activas</option>
            <option value="inactivas">Dadas de baja</option>
            <option value="">Todas</option>
          </select>
          <select
            className={claseFiltro}
            value={disponibilidad}
            onChange={(e) => setDisponibilidad(e.target.value)}
          >
            <option value="">Disponibilidad: todas</option>
            <option value="con">Con disponibles</option>
            <option value="sin">Sin disponibles</option>
          </select>
        </div>

        {isLoading ? (
          <Cargando />
        ) : error ? (
          <ErrorMsg error={error} />
        ) : licencias.length === 0 ? (
          <Vacio texto="No hay licencias que coincidan con los filtros." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4">Aplicación</th>
                  <th className="py-2 pr-4">Tipo</th>
                  <th className="py-2 pr-4 text-right">Total</th>
                  <th className="py-2 pr-4 text-right">Asignadas</th>
                  <th className="py-2 pr-4 text-right">Disponibles</th>
                  <th className="py-2 pr-4">Key user</th>
                  <th className="py-2 pr-4">Aprobador</th>
                  <th className="py-2 pr-4">Vencimiento</th>
                  {permisos.editarLicencias && <th className="py-2 pr-4"></th>}
                </tr>
              </thead>
              <tbody>
                {licencias.map((l) => (
                  <tr key={l.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 pr-4">
                      <Link
                        to={`/licencias/${l.id}`}
                        className="font-medium text-marca-700 hover:underline"
                      >
                        {l.nombre_aplicacion}
                      </Link>
                      {l.version && <span className="ml-1 text-xs text-slate-400">{l.version}</span>}
                      {!l.activo && (
                        <span className="ml-2">
                          <Insignia tono="rojo">Baja</Insignia>
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <Insignia tono="azul">{ETIQUETA_TIPO[l.tipo]}</Insignia>
                    </td>
                    <td className="py-2 pr-4 text-right">{l.cantidad_total}</td>
                    <td className="py-2 pr-4 text-right">{l.asignadas}</td>
                    <td className="py-2 pr-4 text-right">
                      <span
                        className={
                          l.disponibles <= 0 ? 'font-semibold text-red-600' : 'text-emerald-700'
                        }
                      >
                        {l.disponibles}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-slate-600">{l.key_user_nombre ?? '—'}</td>
                    <td className="py-2 pr-4 text-slate-600">{l.aprobador_nombre ?? '—'}</td>
                    <td className="py-2 pr-4 text-slate-600">{fecha(l.fecha_vencimiento)}</td>
                    {permisos.editarLicencias && (
                      <td className="py-2 pr-4 text-right">
                        <button
                          onClick={() => abrirEdicion(l)}
                          className="text-xs text-marca-600 hover:underline"
                        >
                          Editar
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
        abierto={modalAbierto}
        onCerrar={() => setModalAbierto(false)}
        titulo={editando ? 'Editar licencia' : 'Nueva licencia'}
        ancho="max-w-2xl"
      >
        <FormularioLicencia
          licencia={editando}
          onGuardar={async (p) => {
            await guardar.mutateAsync(p)
          }}
          onCancelar={() => setModalAbierto(false)}
        />
      </Modal>
    </div>
  )
}
