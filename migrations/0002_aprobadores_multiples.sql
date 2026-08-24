-- Aprobadores múltiples por licencia (agregar/editar/eliminar).
-- Antes había un único aprobador en columnas de la licencia; ahora es una tabla.

CREATE TABLE licencia_aprobadores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  licencia_id INTEGER NOT NULL REFERENCES licencias(id),
  nombre TEXT NOT NULL,
  email TEXT,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX ix_aprobadores_licencia ON licencia_aprobadores(licencia_id);

-- Migrar el aprobador único existente a la nueva tabla.
INSERT INTO licencia_aprobadores (licencia_id, nombre, email, creado_en)
SELECT id, aprobador_nombre, aprobador_email, datetime('now')
FROM licencias
WHERE aprobador_nombre IS NOT NULL AND trim(aprobador_nombre) <> '';
