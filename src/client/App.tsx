import { Routes, Route } from 'react-router-dom'
import Layout from './componentes/Layout'
import { Cargando, EnConstruccion } from './componentes/Estado'
import { useSesion } from './lib/sesion'
import Login from './paginas/Login'
import Maestro from './paginas/Maestro'
import Licencias from './paginas/Licencias'
import DetalleLicencia from './paginas/DetalleLicencia'
import Asignar from './paginas/Asignar'
import Asignaciones from './paginas/Asignaciones'
import Dashboard from './paginas/Dashboard'
import Historico from './paginas/Historico'
import Reportes from './paginas/Reportes'
import Usuarios from './paginas/Usuarios'

export default function App() {
  const { isLoading, error } = useSesion()

  if (isLoading) return <Cargando texto="Verificando acceso…" />
  // Sin sesión válida (401/403) → pantalla de login con Google.
  if (error) return <Login />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="licencias" element={<Licencias />} />
        <Route path="licencias/:id" element={<DetalleLicencia />} />
        <Route path="asignar" element={<Asignar />} />
        <Route path="asignaciones" element={<Asignaciones />} />
        <Route path="historial" element={<Historico />} />
        <Route path="reportes" element={<Reportes />} />
        <Route path="maestro" element={<Maestro />} />
        <Route path="usuarios" element={<Usuarios />} />
        <Route path="*" element={<EnConstruccion modulo="Página no encontrada" />} />
      </Route>
    </Routes>
  )
}
