// Sincronización del maestro: upsert por clave natural, desactivación de los
// ausentes (nunca se eliminan) y registro en bitácora. Todo con sentencias
// preparadas y en lotes.

import type { Env, Actor } from '../tipos'
import { ahora, consultar } from './db'
import { stmtHistorial } from './historial'
import { parsearMaestro } from './xlsx-maestro'

export interface ResumenSync {
  leidas: number
  altas: number
  actualizaciones: number
  desactivaciones: number
  ignoradas: number
}

const TAM_LOTE = 40

async function ejecutarEnLotes(env: Env, stmts: D1PreparedStatement[]): Promise<void> {
  for (let i = 0; i < stmts.length; i += TAM_LOTE) {
    await env.DB.batch(stmts.slice(i, i + TAM_LOTE))
  }
}

/**
 * Aplica el contenido de un archivo xlsx al maestro.
 * @param origen 'repositorio' | 'carga manual' — solo para la bitácora.
 */
export async function sincronizarMaestro(
  env: Env,
  datos: ArrayBuffer,
  actor: Actor,
  origen: 'repositorio' | 'carga manual',
  ip: string,
): Promise<ResumenSync> {
  const { registros, totalFilas, ignoradas } = parsearMaestro(datos)

  // Estado actual: identificador -> activo
  const existentes = await consultar<{ identificador: string; activo: number }>(
    env,
    `SELECT identificador, activo FROM usuarios_maestro`,
  )
  const mapaExistentes = new Map(existentes.map((r) => [r.identificador, r.activo]))
  const idsArchivo = new Set(registros.map((r) => r.identificador))

  const ts = ahora()
  let altas = 0
  let actualizaciones = 0
  let desactivaciones = 0

  const stmts: D1PreparedStatement[] = []

  for (const r of registros) {
    if (mapaExistentes.has(r.identificador)) actualizaciones++
    else altas++
    stmts.push(
      env.DB.prepare(
        `INSERT INTO usuarios_maestro (identificador, nombre, email, area, cargo, activo, sincronizado_en)
         VALUES (?, ?, ?, ?, ?, 1, ?)
         ON CONFLICT(identificador) DO UPDATE SET
           nombre = excluded.nombre,
           email = excluded.email,
           area = excluded.area,
           cargo = excluded.cargo,
           activo = 1,
           sincronizado_en = excluded.sincronizado_en`,
      ).bind(r.identificador, r.nombre, r.email, r.area, r.cargo, ts),
    )
  }

  // Desactivar los que estaban activos y ya no aparecen en el archivo.
  for (const [identificador, activo] of mapaExistentes) {
    if (activo === 1 && !idsArchivo.has(identificador)) {
      desactivaciones++
      stmts.push(
        env.DB.prepare(
          `UPDATE usuarios_maestro SET activo = 0, sincronizado_en = ? WHERE identificador = ?`,
        ).bind(ts, identificador),
      )
    }
  }

  const resumen: ResumenSync = {
    leidas: totalFilas,
    altas,
    actualizaciones,
    desactivaciones,
    ignoradas,
  }

  await ejecutarEnLotes(env, stmts)

  // Bitácora de la sincronización (evento único).
  await stmtHistorial(env, {
    entidad: 'maestro',
    accion: 'SINCRONIZAR',
    actor,
    detalle:
      `Sincronización del maestro (${origen}): ${resumen.leidas} filas leídas, ` +
      `${resumen.altas} altas, ${resumen.actualizaciones} actualizaciones, ` +
      `${resumen.desactivaciones} desactivaciones` +
      (resumen.ignoradas ? `, ${resumen.ignoradas} ignoradas` : ''),
    detalleJson: { origen, ...resumen },
    ip,
  }).run()

  return resumen
}
