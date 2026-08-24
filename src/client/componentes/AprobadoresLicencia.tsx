// Gestión de aprobadores de una licencia (múltiples): listar, agregar, editar y
// eliminar. La alta rotación de personal hace necesario mantenerlos al día.

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiEnviar } from '../lib/api'
import { useToast } from './Toast'
import { Cargando, ErrorMsg, Vacio } from './Estado'
import { Boton } from './ui'
import { Modal } from './Modal'
import type { Aprobador } from '../lib/tipos'

const claseInput = 'w-full rounded border border-slate-300 px-3 py-1.5 text-sm'

export function AprobadoresLicencia({
  licenciaId,
  puedeGestionar,
}: {
  licenciaId: number
  puedeGestionar: boolean
}) {
  const toast = useToast()
  const qc = useQueryClient()
  const [modal, setModal] = useState<'nuevo' | 'editar' | null>(null)
  const [editando, setEditando] = useState<Aprobador | null>(null)
  const [form, setForm] = useState({ nombre: '', email: '' })
  const [aEliminar, setAEliminar] = useState<Aprobador | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['aprobadores', licenciaId],
    queryFn: () => apiGet<{ aprobadores: Aprobador[] }>(`/licencias/${licenciaId}/aprobadores`),
  })

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['aprobadores', licenciaId] })
    qc.invalidateQueries({ queryKey: ['licencia', String(licenciaId)] })
    qc.invalidateQueries({ queryKey: ['licencias'] })
  }

  const crear = useMutation({
    mutationFn: () =>
      apiEnviar(`/licencias/${licenciaId}/aprobadores`, 'POST', form),
    onSuccess: () => {
      toast.exito('Aprobador agregado.')
      invalidar()
      setModal(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const editar = useMutation({
    mutationFn: () =>
      apiEnviar(`/licencias/${licenciaId}/aprobadores/${editando!.id}`, 'PUT', form),
    onSuccess: () => {
      toast.exito('Aprobador actualizado.')
      invalidar()
      setModal(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => apiEnviar(`/licencias/${licenciaId}/aprobadores/${id}`, 'DELETE'),
    onSuccess: () => {
      toast.exito('Aprobador eliminado.')
      invalidar()
      setAEliminar(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const abrirNuevo = () => {
    setForm({ nombre: '', email: '' })
    setEditando(null)
    setModal('nuevo')
  }
  const abrirEditar = (a: Aprobador) => {
    setForm({ nombre: a.nombre, email: a.email ?? '' })
    setEditando(a)
    setModal('editar')
  }

  if (isLoading) return <Cargando />
  if (error) return <ErrorMsg error={error} />
  const filas = data?.aprobadores ?? []

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <h3 className="font-semibold text-slate-700">Aprobadores ({filas.length})</h3>
        {puedeGestionar && <Boton onClick={abrirNuevo}>Agregar aprobador</Boton>}
      </div>
      <div className="p-5">
        {filas.length === 0 ? (
          <Vacio texto="Esta licencia no tiene aprobadores registrados." />
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">Nombre</th>
                <th className="py-2 pr-4">Email</th>
                {puedeGestionar && <th className="py-2 pr-4"></th>}
              </tr>
            </thead>
            <tbody>
              {filas.map((a) => (
                <tr key={a.id} className="border-b border-slate-100">
                  <td className="py-2 pr-4 font-medium text-slate-700">{a.nombre}</td>
                  <td className="py-2 pr-4 text-slate-600">{a.email ?? '—'}</td>
                  {puedeGestionar && (
                    <td className="py-2 pr-4 text-right">
                      <button
                        onClick={() => abrirEditar(a)}
                        className="mr-3 text-xs text-marca-600 hover:underline"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => setAEliminar(a)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Eliminar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Alta / edición */}
      <Modal
        abierto={modal !== null}
        onCerrar={() => setModal(null)}
        titulo={modal === 'editar' ? 'Editar aprobador' : 'Agregar aprobador'}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            modal === 'editar' ? editar.mutate() : crear.mutate()
          }}
        >
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Nombre *</span>
            <input
              className={claseInput}
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              required
              autoFocus
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Email</span>
            <input
              type="email"
              className={claseInput}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Boton type="button" variante="secundario" onClick={() => setModal(null)}>
              Cancelar
            </Boton>
            <Boton type="submit" disabled={crear.isPending || editar.isPending}>
              {crear.isPending || editar.isPending ? 'Guardando…' : 'Guardar'}
            </Boton>
          </div>
        </form>
      </Modal>

      {/* Confirmar eliminación */}
      <Modal
        abierto={aEliminar != null}
        onCerrar={() => setAEliminar(null)}
        titulo="Eliminar aprobador"
      >
        <p className="text-sm text-slate-600">
          ¿Eliminar al aprobador <strong>{aEliminar?.nombre}</strong> de esta licencia?
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Boton variante="secundario" onClick={() => setAEliminar(null)}>
            Cancelar
          </Boton>
          <Boton
            variante="peligro"
            disabled={eliminar.isPending}
            onClick={() => aEliminar && eliminar.mutate(aEliminar.id)}
          >
            {eliminar.isPending ? 'Eliminando…' : 'Eliminar'}
          </Boton>
        </div>
      </Modal>
    </div>
  )
}
