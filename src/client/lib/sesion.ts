// Hook de sesión: identidad y rol del usuario autenticado.

import { useQuery } from '@tanstack/react-query'
import { apiGet } from './api'

export type Rol = 'admin' | 'operador' | 'consulta'

export interface Usuario {
  id: number
  email: string
  nombre: string
  rol: Rol
  alcance: 'todas' | 'seleccion'
}

export function useSesion() {
  return useQuery({
    queryKey: ['sesion'],
    queryFn: () => apiGet<{ usuario: Usuario }>('/sesion/yo'),
    staleTime: 5 * 60 * 1000,
  })
}

/** Permisos derivados del rol y del alcance (el backend valida igual en cada
 *  endpoint). Un usuario restringido (alcance = 'seleccion') solo puede asignar
 *  y liberar sus licencias autorizadas: no crea/edita licencias ni aprobadores. */
export function puede(usuario: Usuario | undefined) {
  const rol = usuario?.rol
  const restringido = usuario?.alcance === 'seleccion'
  const gestion = rol === 'admin' || rol === 'operador'
  return {
    restringido,
    editarLicencias: gestion && !restringido,
    gestionarAprobadores: gestion && !restringido,
    asignar: gestion,
    sincronizar: gestion,
    darDeBaja: rol === 'admin',
    administrarUsuarios: rol === 'admin',
  }
}
