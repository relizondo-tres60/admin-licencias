-- Migración inicial — Administración de licencias de software
-- Autenticación vía Cloudflare Access: usuarios_app guarda solo el mapeo de roles
-- por correo (identidad de Access), sin hashes de contraseña.

-- Usuarios del sistema (acceso a la aplicación). La identidad la provee Access;
-- aquí se administra el rol y el estado.
CREATE TABLE usuarios_app (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,            -- identidad de Cloudflare Access (minúsculas)
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('admin','operador','consulta')),
  activo INTEGER NOT NULL DEFAULT 1,
  ultimo_acceso TEXT,
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  creado_por INTEGER REFERENCES usuarios_app(id)
);

-- Espejo del archivo usuarios.xlsx (destinatarios de licencias)
CREATE TABLE usuarios_maestro (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identificador TEXT NOT NULL UNIQUE,    -- clave natural: email (o RUT si no hay email)
  nombre TEXT NOT NULL,
  email TEXT,
  area TEXT,
  cargo TEXT,
  activo INTEGER NOT NULL DEFAULT 1,     -- se desactiva, nunca se borra
  sincronizado_en TEXT NOT NULL
);

-- Bolsa de licencias por aplicación
CREATE TABLE licencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre_aplicacion TEXT NOT NULL,
  version TEXT,
  tipo TEXT NOT NULL CHECK (tipo IN ('key','flotante','archivo')),
  cantidad_total INTEGER NOT NULL CHECK (cantidad_total >= 0),
  modo_key TEXT CHECK (modo_key IN ('unica','por_asignacion')),  -- solo tipo 'key'
  key_compartida TEXT,                   -- solo si modo_key = 'unica'
  servidor_licencias TEXT,               -- solo tipo 'flotante'
  ruta_archivo_licencia TEXT,            -- solo tipo 'archivo'
  key_user_nombre TEXT,
  key_user_email TEXT,
  aprobador_nombre TEXT,
  aprobador_email TEXT,
  proveedor TEXT,
  fecha_vencimiento TEXT,
  notas TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  creado_por INTEGER REFERENCES usuarios_app(id),
  actualizado_en TEXT,
  actualizado_por INTEGER REFERENCES usuarios_app(id)
);

-- Asignaciones (entregas de licencia)
CREATE TABLE asignaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  licencia_id INTEGER NOT NULL REFERENCES licencias(id),
  usuario_maestro_id INTEGER NOT NULL REFERENCES usuarios_maestro(id),
  estado TEXT NOT NULL DEFAULT 'asignada' CHECK (estado IN ('asignada','liberada')),
  key_asignada TEXT,                     -- si modo_key = 'por_asignacion'
  aprobador TEXT,
  ticket_referencia TEXT,
  observacion_asignacion TEXT,
  fecha_asignacion TEXT NOT NULL DEFAULT (datetime('now')),
  asignada_por INTEGER NOT NULL REFERENCES usuarios_app(id),
  fecha_liberacion TEXT,
  liberada_por INTEGER REFERENCES usuarios_app(id),
  motivo_liberacion TEXT
);

-- Un usuario no puede tener dos asignaciones VIGENTES de la misma licencia
CREATE UNIQUE INDEX ux_asignacion_vigente
  ON asignaciones(licencia_id, usuario_maestro_id) WHERE estado = 'asignada';

-- Índice de apoyo para el cálculo de disponibles
CREATE INDEX ix_asignaciones_licencia_estado ON asignaciones(licencia_id, estado);

-- Bitácora inmutable: solo INSERT, nunca UPDATE ni DELETE
CREATE TABLE historial (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  entidad TEXT NOT NULL,                 -- licencia | asignacion | usuario_app | maestro | sesion
  entidad_id INTEGER,
  licencia_id INTEGER,                   -- desnormalizado para consultar histórico por licencia
  accion TEXT NOT NULL,                  -- CREAR|EDITAR|ELIMINAR|ASIGNAR|LIBERAR|LOGIN|SINCRONIZAR
  usuario_app_id INTEGER,
  usuario_app_email TEXT,                -- congelado al momento del evento
  usuario_maestro_nombre TEXT,           -- congelado al momento del evento
  detalle TEXT,                          -- texto legible en español
  detalle_json TEXT,                     -- antes/después en JSON
  ip TEXT
);

CREATE INDEX ix_historial_licencia_ts ON historial(licencia_id, ts);
CREATE INDEX ix_historial_ts ON historial(ts);
