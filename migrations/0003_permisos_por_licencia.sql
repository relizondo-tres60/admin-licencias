-- Permisos por licencia: un usuario puede quedar restringido a un subconjunto
-- de licencias (alcance = 'seleccion'). Los admin siempre ven todo.

ALTER TABLE usuarios_app ADD COLUMN alcance TEXT NOT NULL DEFAULT 'todas';

-- Licencias autorizadas para un usuario con alcance = 'seleccion'.
CREATE TABLE usuario_licencias (
  usuario_app_id INTEGER NOT NULL REFERENCES usuarios_app(id),
  licencia_id INTEGER NOT NULL REFERENCES licencias(id),
  PRIMARY KEY (usuario_app_id, licencia_id)
);

CREATE INDEX ix_usuario_licencias_usuario ON usuario_licencias(usuario_app_id);
