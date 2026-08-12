import { Routes, Route } from 'react-router-dom'
import Layout from './componentes/Layout'
import { Cargando, ErrorMsg, EnConstruccion } from './componentes/Estado'
import { useSesion } from './lib/sesion'
import Maestro from './paginas/Maestro'
import Licencias from './paginas/Licencias'
import DetalleLicencia from './paginas/DetalleLicencia'
import Asignar from './paginas/Asignar'
import Dashboard from './paginas/Dashboard'
import Historico from './paginas/Historico'
import Reportes from './paginas/Reportes'
import Usuarios from './paginas/Usuarios'

export default function App() {
  const { isLoading, error } = useSesion()

  if (isLoading) return <Cargando texto="Verificando acceso…" />
  if (error) {
    return (
      <div className="mx-auto max-w-lg p-8">
        <h1 className="mb-4 text-xl font-semibold text-marca-800">
          Administración de Licencias · Tres60
        </h1>
        <ErrorMsg error={error} />
        <p className="mt-4 text-sm text-slate-500">
          El acceso a la aplicación se gestiona mediante Cloudflare Access. Si el
          problema persiste, contacte al administrador del sistema.
        </p>
      </div>
    )
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="licencias" element={<Licencias />} />
        <Route path="licencias/:id" element={<DetalleLicencia />} />
        <Route path="asignar" element={<Asignar />} />
        <Route path="historial" element={<Historico />} />
        <Route path="reportes" element={<Reportes />} />
        <Route path="maestro" element={<Maestro />} />
        <Route path="usuarios" element={<Usuarios />} />
        <Route path="*" element={<EnConstruccion modulo="Página no encontrada" />} />
      </Route>
    </Routes>
  )
}
