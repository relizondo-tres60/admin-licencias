-- Usuarios desvinculados / dados de baja en Active Directory.
-- Se cargan desde un Excel y se cruzan con las asignaciones vigentes para
-- alertar en el inicio cuántos ex-colaboradores aún tienen licencias.

CREATE TABLE usuarios_desvinculados (
  identificador TEXT PRIMARY KEY,   -- misma clave natural que el maestro (email o RUT)
  nombre TEXT,
  email TEXT,
  fecha_carga TEXT NOT NULL DEFAULT (datetime('now')),
  cargado_por INTEGER REFERENCES usuarios_app(id)
);
