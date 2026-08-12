import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '../lib/api'
import { useToast } from '../componentes/Toast'
import { Cargando, ErrorMsg, Vacio } from '../componentes/Estado'
import { Boton, Tarjeta, Titulo } from '../componentes/ui'
import { exportarXLSX, exportarCSV } from '../lib/exportar'

type ReporteId =
  | 'inventario'
  | 'asignaciones-vigentes'
  | 'movimientos'
  | 'utilizacion'
  | 'por-vencer'

const REPORTES: { id: ReporteId; nombre: string; descripcion: string }[] = [
  { id: 'inventario', nombre: 'Inventario general', descripcion: 'Licencias con disponibilidad.' },
  {
    id: 'asignaciones-vigentes',
    nombre: 'Asignaciones vigentes',
    descripcion: 'Entregas activas por usuario.',
  },
  {
    id: 'movimientos',
    nombre: 'Movimientos del período',
    descripcion: 'Asignaciones y liberaciones.',
  },
  { id: 'utilizacion', nombre: 'Utilización por aplicación', descripcion: '% de uso por licencia.' },
  { id: 'por-vencer', nombre: 'Licencias por vencer', descripcion: 'Con fecha de vencimiento.' },
]

const claseInput = 'rounded border border-slate-300 px-3 py-1.5 text-sm'

export default function Reportes() {
  const toast = useToast()
  const [reporte, setReporte] = useState<ReporteId>('inventario')
  const [filtros, setFiltros] = useState({
    aplicacion: '',
    tipo: '',
    estado: '',
    area: '',
    usuario: '',
    aprobador: '',
    desde: '',
    hasta: '',
  })

  const params = new URLSearchParams()
  Object.entries(filtros).forEach(([k, v]) => v && params.set(k, v))

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['reportes', reporte, filtros],
    queryFn: () => apiGet<{ filas: Record<string, unknown>[] }>(`/reportes/${reporte}?${params}`),
  })

  const filas = data?.filas ?? []
  const nombreArchivo = `reporte_${reporte}`

  const exportar = (formato: 'xlsx' | 'csv') => {
    if (filas.length === 0) {
      toast.info('No hay datos para exportar.')
      return
    }
    if (formato === 'xlsx') exportarXLSX(filas, nombreArchivo)
    else exportarCSV(filas, nombreArchivo)
  }

  const columnas = filas.length > 0 ? Object.keys(filas[0]) : []

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Titulo sub="Filtros combinables. Exportación a XLSX/CSV y hoja de impresión (PDF).">
          Reportes
        </Titulo>
        <div className="flex gap-2 print:hidden">
          <Boton variante="secundario" onClick={() => exportar('csv')}>
            Exportar CSV
          </Boton>
          <Boton variante="secundario" onClick={() => exportar('xlsx')}>
            Exportar XLSX
          </Boton>
          <Boton variante="secundario" onClick={() => window.print()}>
            Imprimir / PDF
          </Boton>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        {REPORTES.map((r) => (
          <button
            key={r.id}
            onClick={() => setReporte(r.id)}
            className={`rounded border px-3 py-1.5 text-sm ${
              reporte === r.id
                ? 'border-marca-600 bg-marca-50 font-medium text-marca-700'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
            }`}
            title={r.descripcion}
          >
            {r.nombre}
          </button>
        ))}
      </div>

      <Tarjeta>
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 print:hidden">
          <input
            className={claseInput}
            placeholder="Aplicación"
            value={filtros.aplicacion}
            onChange={(e) => setFiltros({ ...filtros, aplicacion: e.target.value })}
          />
          <select
            className={claseInput}
            value={filtros.tipo}
            onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value })}
          >
            <option value="">Todos los tipos</option>
            <option value="key">Key</option>
            <option value="flotante">Flotante</option>
            <option value="archivo">Archivo</option>
          </select>
          {reporte === 'inventario' && (
            <select
              className={claseInput}
              value={filtros.estado}
              onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })}
            >
              <option value="">Todos los estados</option>
              <option value="activas">Activas</option>
              <option value="inactivas">Baja</option>
            </select>
          )}
          {reporte === 'asignaciones-vigentes' && (
            <>
              <input
                className={claseInput}
                placeholder="Área"
                value={filtros.area}
                onChange={(e) => setFiltros({ ...filtros, area: e.target.value })}
              />
              <input
                className={claseInput}
                placeholder="Usuario"
                value={filtros.usuario}
                onChange={(e) => setFiltros({ ...filtros, usuario: e.target.value })}
              />
            </>
          )}
          {(reporte === 'inventario' || reporte === 'asignaciones-vigentes') && (
            <input
              className={claseInput}
              placeholder="Aprobador"
              value={filtros.aprobador}
              onChange={(e) => setFiltros({ ...filtros, aprobador: e.target.value })}
            />
          )}
          {reporte === 'movimientos' && (
            <>
              <input
                type="date"
                className={claseInput}
                value={filtros.desde}
                onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })}
              />
              <input
                type="date"
                className={claseInput}
                value={filtros.hasta}
                onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })}
              />
            </>
          )}
          <Boton variante="secundario" onClick={() => refetch()}>
            Aplicar filtros
          </Boton>
        </div>

        {isLoading ? (
          <Cargando />
        ) : error ? (
          <ErrorMsg error={error} />
        ) : filas.length === 0 ? (
          <Vacio texto="El reporte no tiene datos con los filtros aplicados." />
        ) : (
          <div className="overflow-x-auto">
            <div className="mb-2 text-xs text-slate-400 print:mb-4 print:text-sm">
              {filas.length} registro(s){isFetching && ' · actualizando…'}
            </div>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                  {columnas.map((col) => (
                    <th key={col} className="py-2 pr-4">
                      {col.replace(/_/g, ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map((fila, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    {columnas.map((col) => (
                      <td key={col} className="py-2 pr-4 text-slate-600">
                        {fila[col] == null ? '—' : String(fila[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
    </div>
  )
}
