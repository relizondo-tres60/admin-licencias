// Utilidades de formato es-CL. Fechas en DD-MM-AAAA HH:mm.

/** Convierte una marca de tiempo SQLite UTC ('YYYY-MM-DD HH:MM:SS') a
 *  'DD-MM-AAAA HH:mm' en hora de Chile. */
export function fechaHora(ts: string | null | undefined): string {
  if (!ts) return '—'
  // Las marcas de D1 son UTC sin zona; se interpretan como UTC.
  const iso = ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ts
  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Santiago',
  })
    .format(d)
    .replace(',', '')
}

/** Formatea una fecha 'YYYY-MM-DD' a 'DD-MM-AAAA'. */
export function fecha(f: string | null | undefined): string {
  if (!f) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(f)
  if (!m) return f
  return `${m[3]}-${m[2]}-${m[1]}`
}

export function porcentaje(n: number): string {
  return `${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 }).format(n)}%`
}
