import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiEnviar } from '../lib/api'
import { useToast } from '../componentes/Toast'
import { Cargando, ErrorMsg, Vacio } from '../componentes/Estado'
import { Boton, Insignia, Tarjeta, Titulo } from '../componentes/ui'
import { Modal } from '../componentes/Modal'
import { fechaHora } from '../lib/formato'
import type { Rol } from '../lib/sesion'
import type { Licencia } from '../lib/tipos'

type Alcance = 'todas' | 'seleccion'

interface UsuarioApp {
  id: number
  email: string
  nombre: string
  rol: Rol
  activo: number
  alcance: Alcance
  licencias: number[]
  ultimo_acceso: string | null
  creado_en: string
}

interface FormUsuario {
  email: string
  nombre: string
  rol: Rol
  activo: boolean
  alcance: Alcance
  licencias: number[]
}

const claseInput = 'w-full rounded border border-slate-300 px-3 py-1.5 text-sm'
const VACIO: FormUsuario = {
  email: '',
  nombre: '',
  rol: 'consulta',
  activo: true,
  alcance: 'todas',
  licencias: [],
}

export default function Usuarios() {
  const toast = useToast()
  const qc = useQueryClient()
  const [modal, setModal] = useState<'nuevo' | 'editar' | null>(null)
  const [editando, setEditando] = useState<UsuarioApp | null>(null)
  const [form, setForm] = useState<FormUsuario>(VACIO)

  const { data, isLoading, error } = useQuery({
    queryKey: ['usuarios'],
    queryFn: () => apiGet<{ usuarios: UsuarioApp[] }>('/usuarios'),
  })

  // Licencias activas para la selección de alcance.
  const { data: licData } = useQuery({
    queryKey: ['licencias', 'activas-simple'],
    queryFn: () => apiGet<{ licencias: Licencia[] }>('/licencias?estado=activas'),
  })
  const licencias = licData?.licencias ?? []

  const invalidar = () => qc.invalidateQueries({ queryKey: ['usuarios'] })

  const cuerpo = () => ({
    nombre: form.nombre,
    rol: form.rol,
    alcance: form.alcance,
    licencias: form.alcance === 'seleccion' ? form.licencias : [],
  })

  const crear = useMutation({
    mutationFn: () => apiEnviar('/usuarios', 'POST', { email: form.email, ...cuerpo() }),
    onSuccess: () => {
      toast.exito('Usuario creado.')
      invalidar()
      setModal(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const editar = useMutation({
    mutationFn: () =>
      apiEnviar(`/usuarios/${editando!.id}`, 'PUT', { activo: form.activo, ...cuerpo() }),
    onSuccess: () => {
      toast.exito('Usuario actualizado.')
      invalidar()
      setModal(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const abrirNuevo = () => {
    setForm(VACIO)
    setEditando(null)
    setModal('nuevo')
  }
  const abrirEditar = (u: UsuarioApp) => {
    setForm({
      email: u.email,
      nombre: u.nombre,
      rol: u.rol,
      activo: u.activo === 1,
      alcance: u.alcance,
      licencias: u.licencias ?? [],
    })
    setEditando(u)
    setModal('editar')
  }

  const toggleLicencia = (id: number) =>
    setForm((f) => ({
      ...f,
      licencias: f.licencias.includes(id)
        ? f.licencias.filter((x) => x !== id)
        : [...f.licencias, id],
    }))

  const usuarios = data?.usuarios ?? []
  const tonoRol: Record<Rol, 'azul' | 'verde' | 'gris'> = {
    admin: 'azul',
    operador: 'verde',
    consulta: 'gris',
  }
  // Los admin siempre ven todo; el alcance solo aplica a operador/consulta.
  const muestraAlcance = form.rol !== 'admin'

  return (
    <div>
      <div className="flex items-center justify-between">
        <Titulo sub="El acceso lo controla Cloudflare Access; aquí se administra el rol, el estado y qué licencias puede administrar cada usuario.">
          Usuarios del sistema
        </Titulo>
        <Boton onClick={abrirNuevo}>Nuevo usuario</Boton>
      </div>

      <Tarjeta>
        {isLoading ? (
          <Cargando />
        ) : error ? (
          <ErrorMsg error={error} />
        ) : usuarios.length === 0 ? (
          <Vacio texto="No hay usuarios registrados." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4">Nombre</th>
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Rol</th>
                  <th className="py-2 pr-4">Licencias</th>
                  <th className="py-2 pr-4">Estado</th>
                  <th className="py-2 pr-4">Último acceso</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => (
                  <tr key={u.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-medium text-slate-700">{u.nombre}</td>
                    <td className="py-2 pr-4 text-slate-600">{u.email}</td>
                    <td className="py-2 pr-4">
                      <Insignia tono={tonoRol[u.rol]}>{u.rol}</Insignia>
                    </td>
                    <td className="py-2 pr-4 text-slate-600">
                      {u.rol === 'admin' || u.alcance === 'todas' ? (
                        <span className="text-slate-400">Todas</span>
                      ) : (
                        <Insignia tono="ambar">{u.licencias.length} seleccionada(s)</Insignia>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      {u.activo ? (
                        <Insignia tono="verde">Activo</Insignia>
                      ) : (
                        <Insignia tono="rojo">Inactivo</Insignia>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-xs text-slate-500">
                      {fechaHora(u.ultimo_acceso)}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      <button
                        onClick={() => abrirEditar(u)}
                        className="text-xs text-marca-600 hover:underline"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>

      <Modal
        abierto={modal !== null}
        onCerrar={() => setModal(null)}
        titulo={modal === 'editar' ? 'Editar usuario' : 'Nuevo usuario'}
        ancho="max-w-xl"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            modal === 'editar' ? editar.mutate() : crear.mutate()
          }}
        >
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Email *</span>
            <input
              type="email"
              className={claseInput}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              disabled={modal === 'editar'}
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Nombre *</span>
            <input
              className={claseInput}
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Rol *</span>
            <select
              className={claseInput}
              value={form.rol}
              onChange={(e) => setForm({ ...form, rol: e.target.value as Rol })}
            >
              <option value="admin">admin</option>
              <option value="operador">operador</option>
              <option value="consulta">consulta</option>
            </select>
          </label>

          {muestraAlcance && (
            <div className="rounded border border-slate-200 p-3">
              <span className="mb-2 block text-xs font-medium text-slate-600">
                Licencias que puede administrar
              </span>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    checked={form.alcance === 'todas'}
                    onChange={() => setForm({ ...form, alcance: 'todas' })}
                  />
                  Todas
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    checked={form.alcance === 'seleccion'}
                    onChange={() => setForm({ ...form, alcance: 'seleccion' })}
                  />
                  Solo las seleccionadas
                </label>
              </div>

              {form.alcance === 'seleccion' && (
                <div className="mt-3 max-h-56 overflow-auto rounded border border-slate-200">
                  {licencias.length === 0 ? (
                    <p className="p-3 text-sm text-slate-400">No hay licencias activas.</p>
                  ) : (
                    licencias.map((l) => (
                      <label
                        key={l.id}
                        className="flex items-center gap-2 border-b border-slate-100 px-3 py-1.5 text-sm last:border-0 hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={form.licencias.includes(l.id)}
                          onChange={() => toggleLicencia(l.id)}
                        />
                        <span className="text-slate-700">{l.nombre_aplicacion}</span>
                        {l.version && <span className="text-xs text-slate-400">{l.version}</span>}
                      </label>
                    ))
                  )}
                </div>
              )}
              {form.alcance === 'seleccion' && (
                <p className="mt-2 text-xs text-slate-500">
                  Este usuario solo verá y podrá asignar/liberar las licencias marcadas. No verá
                  las demás ni sus keys ni disponibilidad.
                </p>
              )}
            </div>
          )}

          {modal === 'editar' && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.activo}
                onChange={(e) => setForm({ ...form, activo: e.target.checked })}
              />
              Usuario activo
            </label>
          )}
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
    </div>
  )
}
