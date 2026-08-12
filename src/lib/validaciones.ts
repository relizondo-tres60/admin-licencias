// Esquemas de validación (Zod) para los payloads de la API.

import { z } from 'zod'

// Convierte '' y espacios en undefined; deja el resto como string recortado.
const textoOpcional = z
  .string()
  .trim()
  .transform((v) => (v === '' ? undefined : v))
  .optional()
  .nullable()
  .transform((v) => v ?? undefined)

const fechaISO = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato AAAA-MM-DD')
  .optional()
  .nullable()
  .transform((v) => (v ? v : undefined))

const emailOpcional = z
  .string()
  .trim()
  .email('Correo electrónico inválido')
  .optional()
  .or(z.literal(''))
  .transform((v) => (v ? v : undefined))

export const licenciaSchema = z
  .object({
    nombre_aplicacion: z.string().trim().min(1, 'El nombre de la aplicación es obligatorio'),
    version: textoOpcional,
    tipo: z.enum(['key', 'flotante', 'archivo'], {
      errorMap: () => ({ message: 'Tipo de licencia inválido' }),
    }),
    cantidad_total: z
      .number({ invalid_type_error: 'La cantidad debe ser un número' })
      .int('La cantidad debe ser un entero')
      .min(0, 'La cantidad no puede ser negativa'),
    modo_key: z.enum(['unica', 'por_asignacion']).optional().nullable(),
    key_compartida: textoOpcional,
    servidor_licencias: textoOpcional,
    ruta_archivo_licencia: textoOpcional,
    key_user_nombre: textoOpcional,
    key_user_email: emailOpcional,
    aprobador_nombre: textoOpcional,
    aprobador_email: emailOpcional,
    proveedor: textoOpcional,
    fecha_vencimiento: fechaISO,
    notas: textoOpcional,
  })
  .superRefine((v, ctx) => {
    if (v.tipo === 'key') {
      if (!v.modo_key) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['modo_key'],
          message: 'Debe indicar el modo de key (única o por asignación)',
        })
      }
      if (v.modo_key === 'unica' && !v.key_compartida) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['key_compartida'],
          message: 'La key compartida es obligatoria para el modo "única"',
        })
      }
    }
    if (v.tipo === 'flotante' && !v.servidor_licencias) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['servidor_licencias'],
        message: 'El servidor de licencias es obligatorio para el tipo flotante',
      })
    }
    if (v.tipo === 'archivo' && !v.ruta_archivo_licencia) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ruta_archivo_licencia'],
        message: 'La ruta del archivo de licencia es obligatoria para el tipo archivo',
      })
    }
  })

export type LicenciaInput = z.infer<typeof licenciaSchema>

// Normaliza los campos que no corresponden al tipo (se guardan en null).
export function normalizarLicencia(v: LicenciaInput) {
  const esKey = v.tipo === 'key'
  return {
    nombre_aplicacion: v.nombre_aplicacion,
    version: v.version ?? null,
    tipo: v.tipo,
    cantidad_total: v.cantidad_total,
    modo_key: esKey ? (v.modo_key ?? null) : null,
    key_compartida: esKey && v.modo_key === 'unica' ? (v.key_compartida ?? null) : null,
    servidor_licencias: v.tipo === 'flotante' ? (v.servidor_licencias ?? null) : null,
    ruta_archivo_licencia: v.tipo === 'archivo' ? (v.ruta_archivo_licencia ?? null) : null,
    key_user_nombre: v.key_user_nombre ?? null,
    key_user_email: v.key_user_email ?? null,
    aprobador_nombre: v.aprobador_nombre ?? null,
    aprobador_email: v.aprobador_email ?? null,
    proveedor: v.proveedor ?? null,
    fecha_vencimiento: v.fecha_vencimiento ?? null,
    notas: v.notas ?? null,
  }
}

// ── Asignaciones (usado en F4) ──────────────────────────────────────────────
export const asignacionSchema = z.object({
  licencia_id: z.number().int().positive(),
  usuario_maestro_id: z.number().int().positive(),
  key_asignada: textoOpcional,
  aprobador: textoOpcional,
  ticket_referencia: textoOpcional,
  observacion_asignacion: textoOpcional,
})

// ── Usuarios del sistema (roles) ────────────────────────────────────────────
export const usuarioAppSchema = z.object({
  email: z
    .string()
    .trim()
    .email('Correo electrónico inválido')
    .transform((v) => v.toLowerCase()),
  nombre: z.string().trim().min(1, 'El nombre es obligatorio'),
  rol: z.enum(['admin', 'operador', 'consulta'], {
    errorMap: () => ({ message: 'Rol inválido' }),
  }),
})

export const usuarioAppUpdateSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio'),
  rol: z.enum(['admin', 'operador', 'consulta'], {
    errorMap: () => ({ message: 'Rol inválido' }),
  }),
  activo: z.boolean(),
})

export const liberacionSchema = z.object({
  motivo_liberacion: z
    .string({ required_error: 'El motivo de liberación es obligatorio' })
    .trim()
    .min(1, 'El motivo de liberación es obligatorio'),
})
