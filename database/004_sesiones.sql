-- Aplicar una sola vez después de 003_preparar_api.sql.
BEGIN;

CREATE TABLE sesiones (
    token_hash CHAR(64) PRIMARY KEY
        CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    id_usuario INTEGER NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
    fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_expiracion TIMESTAMPTZ NOT NULL,
    CHECK (fecha_expiracion > fecha_creacion)
);

CREATE INDEX idx_sesiones_usuario ON sesiones(id_usuario);
CREATE INDEX idx_sesiones_expiracion ON sesiones(fecha_expiracion);

COMMENT ON COLUMN sesiones.token_hash IS
    'SHA-256 del token aleatorio de sesión. Nunca guardar el token de la cookie en texto plano.';

COMMIT;
