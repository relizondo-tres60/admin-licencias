import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { apiGet } from '../lib/api'
import { Cargando, ErrorMsg, Vacio } from '../componentes/Estado'
import { Insignia, Tarjeta, Titulo } from '../componentes/ui'
import { fecha, fechaHora, porcentaje } from '../lib/formato'
import { ETIQUETA_TIPO } from '../lib/tipos'

interface DashboardData {
  kpis: { total: number; asignadas: number; disponibles: number; utilizacion: number }
  utilizacionPorApp: {
    id: number
    aplicacion: string
    tipo: string
    total: number
    asignadas: number
    disponibles: number
  }[]
  porTipo: { tipo: 'key' | 'flotante' | 'archivo'; n: number; unidades: number }[]
  alertas: {
    sinDisponibilidad: { id: number; aplicacion: string }[]
    porVencer: { id: number; nombre_aplicacion: string; fecha_vencimiento: string }[]
    sinResponsable: {
      id: number
      nombre_aplicacion: string
      key_user_nombre: string | null
      sin_aprobador: number
    }[]
  }
  movimientos: {
    id: number
    ts: string
    accion: string
    entidad: string
    detalle: string
    usuario_app_email: string | null
    nombre_aplicacion: string | null
  }[]
}

// Colores accesibles y consistentes con la paleta corporativa.
const COLOR_ASIGNADAS = '#1d4e89'
const COLOR_DISPONIBLES = '#93c5b5'
const COLOR_TIPO: Record<string, string> = {
  key: '#1d4e89',
  flotante: '#0e9f6e',
  archivo: '#d97706',
}

function Kpi({ etiqueta, valor, tono }: { etiqueta: string; valor: string; tono?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{etiqueta}</div>
      <div className={`mt-1 text-2xl font-semibold ${tono ?? 'text-slate-800'}`}>{valor}</div>
    </div>
  )
}

const claseFiltro = 'rounded border border-slate-300 px-3 py-1.5 text-sm'

export default function Dashboard() {
  const [tipo, setTipo] = useState('')
  const [aplicacion, setAplicacion] = useState('')

  const params = new URLSearchParams()
  if (tipo) params.set('tipo', tipo)
  if (aplicacion) params.set('aplicacion', aplicacion)

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard', tipo, aplicacion],
    queryFn: () => apiGet<DashboardData>(`/dashboard?${params.toString()}`),
  })

  if (isLoading) return <Cargando />
  if (error) return <ErrorMsg error={error} />
  if (!data) return null

  const { kpis, utilizacionPorApp, porTipo, alertas, movimientos } = data
  const datosTipo = porTipo.map((t) => ({
    nombre: ETIQUETA_TIPO[t.tipo],
    tipo: t.tipo,
    value: t.n,
  }))

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Titulo>Dashboard</Titulo>
        <div className="flex gap-2">
          <input
            type="search"
            placeholder="Filtrar por aplicación…"
            value={aplicacion}
            onChange={(e) => setAplicacion(e.target.value)}
            className={claseFiltro}
          />
          <select className={claseFiltro} value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Todos los tipos</option>
            <option value="key">Key</option>
            <option value="flotante">Flotante</option>
            <option value="archivo">Archivo</option>
          </select>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi etiqueta="Total contratadas" valor={String(kpis.total)} />
        <Kpi etiqueta="Asignadas" valor={String(kpis.asignadas)} tono="text-marca-700" />
        <Kpi
          etiqueta="Disponibles"
          valor={String(kpis.disponibles)}
          tono={kpis.disponibles <= 0 ? 'text-red-600' : 'text-emerald-700'}
        />
        <Kpi etiqueta="% de utilización" valor={porcentaje(kpis.utilizacion)} />
      </div>

      {/* Gráficos */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Tarjeta titulo="Utilización por aplicación">
            {utilizacionPorApp.length === 0 ? (
              <Vacio texto="Sin licencias para graficar." />
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(240, utilizacionPorApp.length * 38)}>
                <BarChart
                  data={utilizacionPorApp}
                  layout="vertical"
                  margin={{ left: 20, right: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="aplicacion"
                    width={140}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="asignadas" name="Asignadas" stackId="a" fill={COLOR_ASIGNADAS} />
                  <Bar
                    dataKey="disponibles"
                    name="Disponibles"
                    stackId="a"
                    fill={COLOR_DISPONIBLES}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Tarjeta>
        </div>

        <Tarjeta titulo="Distribución por tipo">
          {datosTipo.length === 0 ? (
            <Vacio texto="Sin datos." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={datosTipo}
                  dataKey="value"
                  nameKey="nombre"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={(e) => `${e.nombre}: ${e.value}`}
                >
                  {datosTipo.map((d) => (
                    <Cell key={d.tipo} fill={COLOR_TIPO[d.tipo]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Tarjeta>
      </div>

      {/* Alertas */}
      <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-3">
        <Tarjeta titulo="Sin disponibilidad">
          {alertas.sinDisponibilidad.length === 0 ? (
            <p className="text-sm text-slate-400">Sin alertas.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {alertas.sinDisponibilidad.map((a) => (
                <li key={a.id}>
                  <Link to={`/licencias/${a.id}`} className="text-marca-700 hover:underline">
                    {a.aplicacion}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
        <Tarjeta titulo="Vencen en 60 días">
          {alertas.porVencer.length === 0 ? (
            <p className="text-sm text-slate-400">Sin alertas.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {alertas.porVencer.map((a) => (
                <li key={a.id} className="flex justify-between gap-2">
                  <Link to={`/licencias/${a.id}`} className="text-marca-700 hover:underline">
                    {a.nombre_aplicacion}
                  </Link>
                  <span className="text-xs text-amber-600">{fecha(a.fecha_vencimiento)}</span>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
        <Tarjeta titulo="Sin key user o aprobador">
          {alertas.sinResponsable.length === 0 ? (
            <p className="text-sm text-slate-400">Sin alertas.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {alertas.sinResponsable.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2">
                  <Link to={`/licencias/${a.id}`} className="text-marca-700 hover:underline">
                    {a.nombre_aplicacion}
                  </Link>
                  <span className="flex gap-1">
                    {!a.key_user_nombre && <Insignia tono="ambar">key user</Insignia>}
                    {!!a.sin_aprobador && <Insignia tono="ambar">aprobador</Insignia>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </div>

      {/* Últimos movimientos */}
      <div className="mt-5">
        <Tarjeta titulo="Últimos movimientos">
          {movimientos.length === 0 ? (
            <Vacio texto="Sin movimientos registrados." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-4">Fecha</th>
                    <th className="py-2 pr-4">Acción</th>
                    <th className="py-2 pr-4">Detalle</th>
                    <th className="py-2 pr-4">Usuario</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.map((m) => (
                    <tr key={m.id} className="border-b border-slate-100">
                      <td className="py-2 pr-4 whitespace-nowrap text-xs text-slate-500">
                        {fechaHora(m.ts)}
                      </td>
                      <td className="py-2 pr-4">
                        <Insignia tono="gris">{m.accion}</Insignia>
                      </td>
                      <td className="py-2 pr-4 text-slate-600">{m.detalle}</td>
                      <td className="py-2 pr-4 text-xs text-slate-500">
                        {m.usuario_app_email ?? '—'}
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
