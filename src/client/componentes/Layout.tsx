import { NavLink, Outlet } from 'react-router-dom'
import { useSesion, puede } from '../lib/sesion'

interface ItemNav {
  a: string
  etiqueta: string
  soloAdmin?: boolean
}

const NAV: ItemNav[] = [
  { a: '/', etiqueta: 'Dashboard' },
  { a: '/licencias', etiqueta: 'Licencias' },
  { a: '/asignar', etiqueta: 'Asignar' },
  { a: '/historial', etiqueta: 'Histórico' },
  { a: '/reportes', etiqueta: 'Reportes' },
  { a: '/maestro', etiqueta: 'Maestro de usuarios' },
  { a: '/usuarios', etiqueta: 'Usuarios del sistema', soloAdmin: true },
]

export default function Layout() {
  const { data } = useSesion()
  const usuario = data?.usuario
  const permisos = puede(usuario?.rol)

  return (
    <div className="flex min-h-screen">
      {/* Barra lateral */}
      <aside className="hidden w-64 shrink-0 flex-col bg-marca-800 text-marca-50 md:flex">
        <div className="border-b border-marca-700 px-5 py-4">
          <div className="text-lg font-semibold">Licencias</div>
          <div className="text-xs text-marca-100/70">Tres60</div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.filter((i) => !i.soloAdmin || permisos.administrarUsuarios).map((i) => (
            <NavLink
              key={i.a}
              to={i.a}
              end={i.a === '/'}
              className={({ isActive }) =>
                `block rounded px-3 py-2 text-sm transition ${
                  isActive
                    ? 'bg-marca-600 font-medium text-white'
                    : 'text-marca-100 hover:bg-marca-700'
                }`
              }
            >
              {i.etiqueta}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-marca-700 px-5 py-3 text-xs">
          <div className="font-medium">{usuario?.nombre ?? '—'}</div>
          <div className="text-marca-100/70">{usuario?.email}</div>
          <div className="mt-1 inline-block rounded bg-marca-600 px-2 py-0.5 uppercase tracking-wide">
            {usuario?.rol ?? '—'}
          </div>
        </div>
      </aside>

      {/* Contenido */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b bg-white px-6 py-3 md:hidden">
          <span className="font-semibold text-marca-800">Licencias · Tres60</span>
          <span className="text-xs text-slate-500">{usuario?.rol}</span>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
