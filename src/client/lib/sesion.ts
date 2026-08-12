// Hook de sesión: identidad y rol del usuario autenticado.

import { useQuery } from '@tanstack/react-query'
import { apiGet } from './api'

export type Rol = 'admin' | 'operador' | 'consulta'

export interface Usuario {
  id: number
  email: string
  nombre: string
  rol: Rol
}

export function useSesion() {
  return useQuery({
    queryKey: ['sesion'],
    queryFn: () => apiGet<{ usuario: Usuario }>('/sesion/yo'),
    staleTime: 5 * 60 * 1000,
  })
}

/** Permisos derivados del rol (el backend valida igual en cada endpoint). */
export function puede(rol: Rol | undefined) {
  return {
    editarLicencias: rol === 'admin' || rol === 'operador',
    asignar: rol === 'admin' || rol === 'operador',
    sincronizar: rol === 'admin' || rol === 'operador',
    darDeBaja: rol === 'admin',
    administrarUsuarios: rol === 'admin',
  }
}
