-- Aplicar después de schema.sql y 002_validaciones.sql.
-- No elimina registros existentes. El código no depende del reloj del cliente.
BEGIN;

ALTER TABLE solicitudes
    ADD COLUMN codigo TEXT GENERATED ALWAYS AS ('CR2-' || id_solicitud::TEXT) STORED;

ALTER TABLE solicitudes
    ALTER COLUMN codigo SET NOT NULL,
    ADD CONSTRAINT uq_solicitudes_codigo UNIQUE (codigo);

-- El historial también distinguirá creación y asignación, como la interfaz.
-- Las entradas existentes conservan su interpretación como cambio de estado.
ALTER TABLE historial_estados
    ADD COLUMN tipo VARCHAR(20) NOT NULL DEFAULT 'status',
    ADD CONSTRAINT chk_historial_tipo
        CHECK (tipo IN ('created', 'assignment', 'status'));

COMMENT ON COLUMN solicitudes.codigo IS
    'Código generado por PostgreSQL a partir del ID; devolver con INSERT ... RETURNING.';
COMMENT ON COLUMN usuarios.contrasena IS
    'Hash de contraseña, nunca texto plano. No incluir en respuestas de la API.';
COMMENT ON COLUMN historial_estados.observacion IS
    'Descripción del evento; al resolver contiene el trabajo realizado.';

COMMIT;
