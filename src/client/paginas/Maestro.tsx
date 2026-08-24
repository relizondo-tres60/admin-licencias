import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiEnviar, apiSubir } from '../lib/api'
import { useSesion, puede } from '../lib/sesion'
import { useToast } from '../componentes/Toast'
import { Cargando, ErrorMsg, Vacio } from '../componentes/Estado'
import { Boton, Insignia, Tarjeta, Titulo } from '../componentes/ui'
import { fechaHora } from '../lib/formato'

interface UsuarioMaestro {
  id: number
  identificador: string
  nombre: string
  email: string | null
  area: string | null
  cargo: string | null
  activo: number
  sincronizado_en: string
}

interface ResumenSync {
  leidas: number
  altas: number
  actualizaciones: number
  desactivaciones: number
  ignoradas: number
}

function textoResumen(r: ResumenSync): string {
  return (
    `${r.leidas} filas leídas · ${r.altas} altas · ${r.actualizaciones} actualizaciones · ` +
    `${r.desactivaciones} desactivaciones` + (r.ignoradas ? ` · ${r.ignoradas} ignoradas` : '')
  )
}

export default function Maestro() {
  const toast = useToast()
  const qc = useQueryClient()
  const { data: sesion } = useSesion()
  const permisos = puede(sesion?.usuario)
  const [q, setQ] = useState('')
  const [soloActivos, setSoloActivos] = useState(true)
  const inputArchivo = useRef<HTMLInputElement>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['maestro', q, soloActivos],
    queryFn: () =>
      apiGet<{ usuarios: UsuarioMaestro[] }>(
        `/maestro?${soloActivos ? 'activos=1&' : ''}${q ? `q=${encodeURIComponent(q)}` : ''}`,
      ),
  })

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['maestro'] })
    qc.invalidateQueries({ queryKey: ['historial'] })
  }

  const syncRepo = useMutation({
    mutationFn: () => apiEnviar<{ resumen: ResumenSync }>('/maestro/sincronizar/repo', 'POST'),
    onSuccess: ({ resumen }) => {
      toast.exito(`Sincronizado desde repositorio: ${textoResumen(resumen)}`)
      invalidar()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const syncArchivo = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.append('archivo', file)
      return apiSubir<{ resumen: ResumenSync }>('/maestro/sincronizar/archivo', form)
    },
    onSuccess: ({ resumen }) => {
      toast.exito(`Sincronizado desde archivo: ${textoResumen(resumen)}`)
      invalidar()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const usuarios = data?.usuarios ?? []
  const sincronizando = syncRepo.isPending || syncArchivo.isPending

  return (
    <div>
      <Titulo sub="Destinatarios habilitados para recibir licencias. Solo los usuarios activos aparecen en el selector de asignación.">
        Maestro de usuarios
      </Titulo>

      {permisos.sincronizar && (
        <Tarjeta titulo="Sincronización">
          <div className="flex flex-wrap items-center gap-3">
            <Boton onClick={() => syncRepo.mutate()} disabled={sincronizando}>
              {syncRepo.isPending ? 'Sincronizando…' : 'Sincronizar desde repositorio'}
            </Boton>
            <Boton
              variante="secundario"
              onClick={() => inputArchivo.current?.click()}
              disabled={sincronizando}
            >
              {syncArchivo.isPending ? 'Procesando…' : 'Cargar archivo .xlsx'}
            </Boton>
            <input
              ref={inputArchivo}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) syncArchivo.mutate(f)
                e.target.value = ''
              }}
            />
            <p className="text-xs text-slate-500">
              El repositorio (public/usuarios.xlsx) es la fuente de verdad; la carga
              manual permite actualizar sin redesplegar.
            </p>
          </div>
        </Tarjeta>
      )}

      <div className="mt-5">
        <Tarjeta
          titulo={`Usuarios (${usuarios.length})`}
          acciones={
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={soloActivos}
                  onChange={(e) => setSoloActivos(e.target.checked)}
                />
                Solo activos
              </label>
              <input
                type="search"
                placeholder="Buscar…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
          }
        >
          {isLoading ? (
            <Cargando />
          ) : error ? (
            <ErrorMsg error={error} />
          ) : usuarios.length === 0 ? (
            <Vacio texto="No hay usuarios en el maestro. Sincronice el archivo usuarios.xlsx." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-4">Nombre</th>
                    <th className="py-2 pr-4">Email / Identificador</th>
                    <th className="py-2 pr-4">Área</th>
                    <th className="py-2 pr-4">Cargo</th>
                    <th className="py-2 pr-4">Estado</th>
                    <th className="py-2 pr-4">Sincronizado</th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((u) => (
                    <tr key={u.id} className="border-b border-slate-100">
                      <td className="py-2 pr-4 font-medium text-slate-700">{u.nombre}</td>
                      <td className="py-2 pr-4 text-slate-600">{u.email ?? u.identificador}</td>
                      <td className="py-2 pr-4 text-slate-600">{u.area ?? '—'}</td>
                      <td className="py-2 pr-4 text-slate-600">{u.cargo ?? '—'}</td>
                      <td className="py-2 pr-4">
                        {u.activo ? (
                          <Insignia tono="verde">Activo</Insignia>
                        ) : (
                          <Insignia tono="rojo">Inactivo</Insignia>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-xs text-slate-500">
                        {fechaHora(u.sincronizado_en)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Tarjeta>
      </div>
    </div>
  )
}
