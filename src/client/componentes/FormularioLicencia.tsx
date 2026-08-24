import { useState, type ReactNode } from 'react'
import type { Licencia, TipoLicencia, ModoKey } from '../lib/tipos'
import { Boton } from './ui'

export interface PayloadLicencia {
  nombre_aplicacion: string
  version: string
  tipo: TipoLicencia
  cantidad_total: number
  modo_key: ModoKey | null
  key_compartida: string
  servidor_licencias: string
  ruta_archivo_licencia: string
  key_user_nombre: string
  key_user_email: string
  proveedor: string
  fecha_vencimiento: string
  notas: string
}

function Campo({
  etiqueta,
  children,
  ancho = '',
}: {
  etiqueta: string
  children: ReactNode
  ancho?: string
}) {
  return (
    <label className={`block ${ancho}`}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{etiqueta}</span>
      {children}
    </label>
  )
}

const claseInput =
  'w-full rounded border border-slate-300 px-3 py-1.5 text-sm focus:border-marca-600 focus:outline-none focus:ring-1 focus:ring-marca-600'

function estadoInicial(l?: Licencia): PayloadLicencia {
  return {
    nombre_aplicacion: l?.nombre_aplicacion ?? '',
    version: l?.version ?? '',
    tipo: l?.tipo ?? 'key',
    cantidad_total: l?.cantidad_total ?? 1,
    modo_key: l?.modo_key ?? 'unica',
    key_compartida: l?.key_compartida ?? '',
    servidor_licencias: l?.servidor_licencias ?? '',
    ruta_archivo_licencia: l?.ruta_archivo_licencia ?? '',
    key_user_nombre: l?.key_user_nombre ?? '',
    key_user_email: l?.key_user_email ?? '',
    proveedor: l?.proveedor ?? '',
    fecha_vencimiento: l?.fecha_vencimiento ?? '',
    notas: l?.notas ?? '',
  }
}

export function FormularioLicencia({
  licencia,
  onGuardar,
  onCancelar,
}: {
  licencia?: Licencia
  onGuardar: (p: PayloadLicencia) => Promise<void>
  onCancelar: () => void
}) {
  const [f, setF] = useState<PayloadLicencia>(() => estadoInicial(licencia))
  const [guardando, setGuardando] = useState(false)

  const set = <K extends keyof PayloadLicencia>(k: K, v: PayloadLicencia[K]) =>
    setF((prev) => ({ ...prev, [k]: v }))

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    try {
      await onGuardar({ ...f, cantidad_total: Number(f.cantidad_total) })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Campo etiqueta="Aplicación *" ancho="col-span-2">
          <input
            className={claseInput}
            value={f.nombre_aplicacion}
            onChange={(e) => set('nombre_aplicacion', e.target.value)}
            required
          />
        </Campo>
        <Campo etiqueta="Versión">
          <input
            className={claseInput}
            value={f.version}
            onChange={(e) => set('version', e.target.value)}
          />
        </Campo>
        <Campo etiqueta="Proveedor">
          <input
            className={claseInput}
            value={f.proveedor}
            onChange={(e) => set('proveedor', e.target.value)}
          />
        </Campo>

        <Campo etiqueta="Tipo *">
          <select
            className={claseInput}
            value={f.tipo}
            onChange={(e) => set('tipo', e.target.value as TipoLicencia)}
          >
            <option value="key">Key</option>
            <option value="flotante">Flotante</option>
            <option value="archivo">Archivo</option>
          </select>
        </Campo>
        <Campo etiqueta="Cantidad total *">
          <input
            type="number"
            min={0}
            className={claseInput}
            value={f.cantidad_total}
            onChange={(e) => set('cantidad_total', Number(e.target.value))}
            required
          />
        </Campo>

        {/* Campos condicionales por tipo */}
        {f.tipo === 'key' && (
          <>
            <Campo etiqueta="Modo de key *">
              <select
                className={claseInput}
                value={f.modo_key ?? 'unica'}
                onChange={(e) => set('modo_key', e.target.value as ModoKey)}
              >
                <option value="unica">Única compartida</option>
                <option value="por_asignacion">Por asignación</option>
              </select>
            </Campo>
            {f.modo_key === 'unica' && (
              <Campo etiqueta="Key compartida *">
                <input
                  className={claseInput}
                  value={f.key_compartida}
                  onChange={(e) => set('key_compartida', e.target.value)}
                  required
                />
              </Campo>
            )}
            {f.modo_key === 'por_asignacion' && (
              <div className="col-span-1 flex items-end text-xs text-slate-500">
                La key se ingresa en cada asignación.
              </div>
            )}
          </>
        )}
        {f.tipo === 'flotante' && (
          <Campo etiqueta="Servidor de licencias *" ancho="col-span-2">
            <input
              className={claseInput}
              value={f.servidor_licencias}
              onChange={(e) => set('servidor_licencias', e.target.value)}
              required
            />
          </Campo>
        )}
        {f.tipo === 'archivo' && (
          <Campo etiqueta="Ruta del archivo de licencia *" ancho="col-span-2">
            <input
              className={claseInput}
              value={f.ruta_archivo_licencia}
              onChange={(e) => set('ruta_archivo_licencia', e.target.value)}
              required
            />
          </Campo>
        )}

        <Campo etiqueta="Key user (nombre)">
          <input
            className={claseInput}
            value={f.key_user_nombre}
            onChange={(e) => set('key_user_nombre', e.target.value)}
          />
        </Campo>
        <Campo etiqueta="Key user (email)">
          <input
            type="email"
            className={claseInput}
            value={f.key_user_email}
            onChange={(e) => set('key_user_email', e.target.value)}
          />
        </Campo>
        <Campo etiqueta="Fecha de vencimiento">
          <input
            type="date"
            className={claseInput}
            value={f.fecha_vencimiento}
            onChange={(e) => set('fecha_vencimiento', e.target.value)}
          />
        </Campo>
        <Campo etiqueta="Notas" ancho="col-span-2">
          <textarea
            className={claseInput}
            rows={2}
            value={f.notas}
            onChange={(e) => set('notas', e.target.value)}
          />
        </Campo>
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Boton type="button" variante="secundario" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </Boton>
        <Boton type="submit" disabled={guardando}>
          {guardando ? 'Guardando…' : licencia ? 'Guardar cambios' : 'Crear licencia'}
        </Boton>
      </div>
    </form>
  )
}
