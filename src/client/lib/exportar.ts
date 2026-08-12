// Exportación de datos a XLSX y CSV en el cliente con SheetJS.

import * as XLSX from 'xlsx'

function marca(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
}

export function exportarXLSX(
  filas: Record<string, unknown>[],
  nombre: string,
  hoja = 'Datos',
): void {
  const ws = XLSX.utils.json_to_sheet(filas)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, hoja)
  XLSX.writeFile(wb, `${nombre}_${marca()}.xlsx`)
}

export function exportarCSV(filas: Record<string, unknown>[], nombre: string): void {
  const ws = XLSX.utils.json_to_sheet(filas)
  const csv = XLSX.utils.sheet_to_csv(ws, { FS: ';' }) // ';' para es-CL (Excel)
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${nombre}_${marca()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
