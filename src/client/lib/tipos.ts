// Tipos compartidos del frontend.

export type TipoLicencia = 'key' | 'flotante' | 'archivo'
export type ModoKey = 'unica' | 'por_asignacion'

export interface Licencia {
  id: number
  nombre_aplicacion: string
  version: string | null
  tipo: TipoLicencia
  cantidad_total: number
  modo_key: ModoKey | null
  key_compartida: string | null
  servidor_licencias: string | null
  ruta_archivo_licencia: string | null
  key_user_nombre: string | null
  key_user_email: string | null
  aprobador_nombre: string | null
  aprobador_email: string | null
  proveedor: string | null
  fecha_vencimiento: string | null
  notas: string | null
  activo: number
  creado_en: string
  actualizado_en: string | null
  asignadas: number
  disponibles: number
}

export const ETIQUETA_TIPO: Record<TipoLicencia, string> = {
  key: 'Key',
  flotante: 'Flotante',
  archivo: 'Archivo',
}

export const ETIQUETA_MODO: Record<ModoKey, string> = {
  unica: 'Key única compartida',
  por_asignacion: 'Key por asignación',
}
