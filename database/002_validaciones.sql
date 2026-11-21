-- ACTUALIZACIÓN 002
-- Validaciones e índices para Ciudad Real II

-- 1. Validar que quien registra una solicitud sea residente
CREATE OR REPLACE FUNCTION validar_residente_solicitud()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM usuarios
        WHERE id_usuario = NEW.id_residente
          AND rol = 'residente'
    ) THEN
        RAISE EXCEPTION 'La solicitud debe pertenecer a un residente.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validar_residente_solicitud
BEFORE INSERT OR UPDATE OF id_residente
ON solicitudes
FOR EACH ROW
EXECUTE FUNCTION validar_residente_solicitud();

-- 2. Validar los roles de una asignación
CREATE OR REPLACE FUNCTION validar_roles_asignacion()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM usuarios
        WHERE id_usuario = NEW.id_trabajador
          AND rol = 'mantenimiento'
    ) THEN
        RAISE EXCEPTION 'El trabajador debe tener rol de mantenimiento.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM usuarios
        WHERE id_usuario = NEW.id_administrador
          AND rol = 'administrador'
    ) THEN
        RAISE EXCEPTION 'La asignación debe ser realizada por un administrador.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validar_roles_asignacion
BEFORE INSERT OR UPDATE OF id_trabajador, id_administrador
ON asignaciones
FOR EACH ROW
EXECUTE FUNCTION validar_roles_asignacion();

-- 3. Índices para mejorar las consultas

CREATE INDEX IF NOT EXISTS idx_solicitudes_residente
ON solicitudes(id_residente);

CREATE INDEX IF NOT EXISTS idx_solicitudes_estado
ON solicitudes(estado);

CREATE INDEX IF NOT EXISTS idx_asignaciones_trabajador
ON asignaciones(id_trabajador);

CREATE INDEX IF NOT EXISTS idx_historial_solicitud
ON historial_estados(id_solicitud);

-- 4. Insertar las categorías iniciales

INSERT INTO categorias (nombre, descripcion)
VALUES
    ('Plomería', 'Problemas de tuberías, filtraciones y agua.'),
    ('Electricidad', 'Problemas eléctricos e iluminación.'),
    ('Pintura', 'Trabajos de pintura y acabados.'),
    ('Daños en áreas comunes', 'Daños en espacios compartidos.'),
    ('Otros', 'Otras solicitudes de mantenimiento.')
ON CONFLICT (nombre) DO NOTHING;