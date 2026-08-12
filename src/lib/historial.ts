// Helper único de escritura de bitácora.
// Devuelve una sentencia preparada para incluirla en el mismo db.batch() de la
// operación, de modo que si falla la bitácora, falla toda la operación (regla 6).

import type { Env, Actor } from '../tipos'
import { ahora } from './db'

export type Entidad = 'licencia' | 'asignacion' | 'usuario_app' | 'maestro' | 'sesion'
export type Accion =
  | 'CREAR'
  | 'EDITAR'
  | 'ELIMINAR'
  | 'ASIGNAR'
  | 'LIBERAR'
  | 'LOGIN'
  | 'SINCRONIZAR'

export interface EventoHistorial {
  entidad: Entidad
  entidadId?: number | null
  licenciaId?: number | null
  accion: Accion
  actor: Pick<Actor, 'id' | 'email'> | null
  usuarioMaestroNombre?: string | null
  detalle: string
  detalleJson?: unknown
  ip?: string | null
}

export function stmtHistorial(env: Env, e: EventoHistorial): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO historial
       (ts, entidad, entidad_id, licencia_id, accion,
        usuario_app_id, usuario_app_email, usuario_maestro_nombre,
        detalle, detalle_json, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    ahora(),
    e.entidad,
    e.entidadId ?? null,
    e.licenciaId ?? null,
    e.accion,
    e.actor?.id ?? null,
    e.actor?.email ?? null,
    e.usuarioMaestroNombre ?? null,
    e.detalle,
    e.detalleJson != null ? JSON.stringify(e.detalleJson) : null,
    e.ip ?? null,
  )
}

/** Escribe un evento de bitácora de forma independiente (fuera de una transacción). */
export async function registrar(env: Env, e: EventoHistorial): Promise<void> {
  await stmtHistorial(env, e).run()
}
