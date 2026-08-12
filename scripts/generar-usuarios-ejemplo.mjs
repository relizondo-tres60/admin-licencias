// Genera public/usuarios.xlsx con 10 registros ficticios de ejemplo.
// Uso: node scripts/generar-usuarios-ejemplo.mjs
import * as XLSX from 'xlsx'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const filas = [
  ['NOMBRE', 'EMAIL', 'AREA', 'CARGO', 'RUT'],
  ['María González Rivas', 'maria.gonzalez@empresa.cl', 'Finanzas', 'Analista Contable', '11.111.111-1'],
  ['Juan Pérez Soto', 'juan.perez@empresa.cl', 'TI', 'Ingeniero de Soporte', '12.222.222-2'],
  ['Camila Rojas Díaz', 'camila.rojas@empresa.cl', 'Operaciones', 'Jefa de Turno', '13.333.333-3'],
  ['Pedro Muñoz Lagos', 'pedro.munoz@empresa.cl', 'TI', 'Administrador de Redes', '14.444.444-4'],
  ['Fernanda Silva Toro', 'fernanda.silva@empresa.cl', 'Recursos Humanos', 'Analista de RRHH', '15.555.555-5'],
  ['Diego Castro Vega', 'diego.castro@empresa.cl', 'Finanzas', 'Controller', '16.666.666-6'],
  ['Valentina Araya Núñez', 'valentina.araya@empresa.cl', 'Operaciones', 'Supervisora', '17.777.777-7'],
  ['Andrés Fuentes Pino', 'andres.fuentes@empresa.cl', 'TI', 'Desarrollador', '18.888.888-8'],
  ['Josefa Morales Reyes', 'josefa.morales@empresa.cl', 'Legal', 'Abogada', '19.999.999-9'],
  ['Ricardo Tapia Bravo', 'ricardo.tapia@empresa.cl', 'Gerencia', 'Gerente de Operaciones', '20.000.000-0'],
]

const hoja = XLSX.utils.aoa_to_sheet(filas)
const libro = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(libro, hoja, 'Usuarios')

const salida = resolve(__dirname, '../public/usuarios.xlsx')
XLSX.writeFile(libro, salida)
console.log(`Generado: ${salida} (${filas.length - 1} registros)`)
