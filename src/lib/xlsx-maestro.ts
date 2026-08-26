// Parseo del archivo usuarios.xlsx (maestro de destinatarios de licencias).
// Detección de encabezados tolerante: sin distinción de mayúsculas, sin tildes,
// ignorando espacios extra. Clave natural: EMAIL (minúsculas) o, si no hay, RUT.

import * as XLSX from 'xlsx'

export interface RegistroMaestro {
  identificador: string
  nombre: string
  email: string | null
  area: string | null
  cargo: string | null
}

export interface ResultadoParseo {
  registros: RegistroMaestro[]
  totalFilas: number
  ignoradas: number
}

export class ErrorMaestro extends Error {}

function normalizar(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

// Mapea un encabezado normalizado a su nombre canónico.
const CANONICO: Record<string, 'nombre' | 'email' | 'area' | 'cargo' | 'rut'> = {
  nombre: 'nombre',
  email: 'email',
  correo: 'email',
  'correo electronico': 'email',
  area: 'area',
  cargo: 'cargo',
  rut: 'rut',
}

export function parsearMaestro(datos: ArrayBuffer): ResultadoParseo {
  let libro: XLSX.WorkBook
  try {
    libro = XLSX.read(datos, { type: 'array' })
  } catch {
    throw new ErrorMaestro('El archivo no es un Excel válido o está corrupto.')
  }

  const nombreHoja = libro.SheetNames[0]
  if (!nombreHoja) throw new ErrorMaestro('El archivo no contiene hojas.')
  const hoja = libro.Sheets[nombreHoja]

  const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, {
    header: 1,
    blankrows: false,
    defval: '',
  })
  if (filas.length === 0) throw new ErrorMaestro('El archivo está vacío.')

  // Fila de encabezados = primera fila con contenido.
  const encabezados = (filas[0] as unknown[]).map((c) => normalizar(c))
  const col: Partial<Record<'nombre' | 'email' | 'area' | 'cargo' | 'rut', number>> = {}
  encabezados.forEach((h, i) => {
    const canon = CANONICO[h]
    if (canon && col[canon] === undefined) col[canon] = i
  })

  const faltantes = (['nombre', 'email', 'area'] as const).filter((k) => col[k] === undefined)
  if (faltantes.length > 0) {
    throw new ErrorMaestro(
      `Faltan columnas obligatorias: ${faltantes.map((f) => f.toUpperCase()).join(', ')}.`,
    )
  }

  const registros: RegistroMaestro[] = []
  const vistos = new Set<string>()
  let ignoradas = 0

  for (let i = 1; i < filas.length; i++) {
    const fila = filas[i] as unknown[]
    const nombre = String(fila[col.nombre!] ?? '').trim()
    const emailRaw = String(fila[col.email!] ?? '').trim().toLowerCase()
    const rut = col.rut !== undefined ? String(fila[col.rut] ?? '').trim() : ''
    const area = col.area !== undefined ? String(fila[col.area] ?? '').trim() : ''
    const cargo = col.cargo !== undefined ? String(fila[col.cargo] ?? '').trim() : ''

    const identificador = emailRaw || rut
    // Filas sin nombre o sin clave natural se ignoran (no rompen la carga).
    if (!nombre || !identificador) {
      ignoradas++
      continue
    }
    // Deduplicar por identificador dentro del mismo archivo (último gana).
    if (vistos.has(identificador)) {
      const idx = registros.findIndex((r) => r.identificador === identificador)
      if (idx >= 0) registros.splice(idx, 1)
    }
    vistos.add(identificador)
    registros.push({
      identificador,
      nombre,
      email: emailRaw || null,
      area: area || null,
      cargo: cargo || null,
    })
  }

  return { registros, totalFilas: filas.length - 1, ignoradas }
}

export interface RegistroDesvinculado {
  identificador: string
  nombre: string | null
  email: string | null
}

export interface ResultadoDesvinculados {
  registros: RegistroDesvinculado[]
  totalFilas: number
  ignoradas: number
}

/**
 * Parsea la planilla de usuarios desvinculados (baja en AD). Tolerante: requiere
 * al menos EMAIL o RUT por fila (NOMBRE opcional). Clave natural: email o RUT.
 */
export function parsearDesvinculados(datos: ArrayBuffer): ResultadoDesvinculados {
  let libro: XLSX.WorkBook
  try {
    libro = XLSX.read(datos, { type: 'array' })
  } catch {
    throw new ErrorMaestro('El archivo no es un Excel válido o está corrupto.')
  }
  const nombreHoja = libro.SheetNames[0]
  if (!nombreHoja) throw new ErrorMaestro('El archivo no contiene hojas.')
  const filas = XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[nombreHoja], {
    header: 1,
    blankrows: false,
    defval: '',
  })
  if (filas.length === 0) throw new ErrorMaestro('El archivo está vacío.')

  const encabezados = (filas[0] as unknown[]).map((c) => normalizar(c))
  const col: Partial<Record<'nombre' | 'email' | 'rut', number>> = {}
  encabezados.forEach((h, i) => {
    const canon = CANONICO[h]
    if ((canon === 'nombre' || canon === 'email' || canon === 'rut') && col[canon] === undefined) {
      col[canon] = i
    }
  })
  if (col.email === undefined && col.rut === undefined) {
    throw new ErrorMaestro('La planilla debe tener al menos una columna EMAIL o RUT.')
  }

  const registros: RegistroDesvinculado[] = []
  const vistos = new Set<string>()
  let ignoradas = 0
  for (let i = 1; i < filas.length; i++) {
    const fila = filas[i] as unknown[]
    const nombre = col.nombre !== undefined ? String(fila[col.nombre] ?? '').trim() : ''
    const emailRaw =
      col.email !== undefined ? String(fila[col.email] ?? '').trim().toLowerCase() : ''
    const rut = col.rut !== undefined ? String(fila[col.rut] ?? '').trim() : ''
    const identificador = emailRaw || rut
    if (!identificador) {
      ignoradas++
      continue
    }
    if (vistos.has(identificador)) continue
    vistos.add(identificador)
    registros.push({ identificador, nombre: nombre || null, email: emailRaw || null })
  }
  return { registros, totalFilas: filas.length - 1, ignoradas }
}
