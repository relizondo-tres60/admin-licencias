import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiEnviar } from '../lib/api'
import { useToast } from '../componentes/Toast'
import { Cargando, ErrorMsg, Vacio } from '../componentes/Estado'
import { Boton, Insignia, Tarjeta, Titulo } from '../componentes/ui'
import { Modal } from '../componentes/Modal'
import { fechaHora } from '../lib/formato'
import type { Rol } from '../lib/sesion'

interface UsuarioApp {
  id: number
  email: string
  nombre: string
  rol: Rol
  activo: number
  ultimo_acceso: string | null
  creado_en: string
}

const claseInput = 'w-full rounded border border-slate-300 px-3 py-1.5 text-sm'

export default function Usuarios() {
  const toast = useToast()
  const qc = useQueryClient()
  const [modal, setModal] = useState<'nuevo' | 'editar' | null>(null)
  const [editando, setEditando] = useState<UsuarioApp | null>(null)
  const [form, setForm] = useState({ email: '', nombre: '', rol: 'consulta' as Rol, activo: true })

  const { data, isLoading, error } = useQuery({
    queryKey: ['usuarios'],
    queryFn: () => apiGet<{ usuarios: UsuarioApp[] }>('/usuarios'),
  })

  const invalidar = () => qc.invalidateQueries({ queryKey: ['usuarios'] })

  const crear = useMutation({
    mutationFn: () =>
      apiEnviar('/usuarios', 'POST', { email: form.email, nombre: form.nombre, rol: form.rol }),
    onSuccess: () => {
      toast.exito('Usuario creado.')
      invalidar()
      setModal(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const editar = useMutation({
    mutationFn: () =>
      apiEnviar(`/usuarios/${editando!.id}`, 'PUT', {
        nombre: form.nombre,
        rol: form.rol,
        activo: form.activo,
      }),
    onSuccess: () => {
      toast.exito('Usuario actualizado.')
      invalidar()
      setModal(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const abrirNuevo = () => {
    setForm({ email: '', nombre: '', rol: 'consulta', activo: true })
    setEditando(null)
    setModal('nuevo')
  }
  const abrirEditar = (u: UsuarioApp) => {
    setForm({ email: u.email, nombre: u.nombre, rol: u.rol, activo: u.activo === 1 })
    setEditando(u)
    setModal('editar')
  }

  const usuarios = data?.usuarios ?? []
  const tonoRol: Record<Rol, 'azul' | 'verde' | 'gris'> = {
    admin: 'azul',
    operador: 'verde',
    consulta: 'gris',
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <Titulo sub="El acceso lo controla Cloudflare Access; aquí se administra el rol y el estado. No hay contraseñas que restablecer.">
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
