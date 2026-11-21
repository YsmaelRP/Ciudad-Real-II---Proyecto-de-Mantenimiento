
-- PROYECTO: CIUDAD REAL II - SISTEMA DE MANTENIMIENTO
-- Base de datos: ciudad_real_ii

-- 1. TABLA DE USUARIOS
CREATE TABLE usuarios (
    id_usuario INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    correo VARCHAR(150) NOT NULL UNIQUE,
    contrasena VARCHAR(255) NOT NULL,
    rol VARCHAR(20) NOT NULL
        CHECK (rol IN ('residente', 'administrador', 'mantenimiento')),
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    activo BOOLEAN NOT NULL DEFAULT TRUE
);

-- 2. TABLA DE CATEGORÍAS
CREATE TABLE categorias (
    id_categoria INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre VARCHAR(80) NOT NULL UNIQUE,
    descripcion TEXT,
    activa BOOLEAN NOT NULL DEFAULT TRUE
);

-- 3. TABLA DE SOLICITUDES
CREATE TABLE solicitudes (
    id_solicitud INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_residente INTEGER NOT NULL,
    id_categoria INTEGER NOT NULL,
    descripcion TEXT NOT NULL,
    ubicacion VARCHAR(150) NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'Pendiente'
        CHECK (estado IN ('Pendiente', 'En proceso', 'Resuelta')),
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_solicitud_residente
        FOREIGN KEY (id_residente)
        REFERENCES usuarios(id_usuario),

    CONSTRAINT fk_solicitud_categoria
        FOREIGN KEY (id_categoria)
        REFERENCES categorias(id_categoria)
);

-- 4. TABLA DE ASIGNACIONES
CREATE TABLE asignaciones (
    id_asignacion INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_solicitud INTEGER NOT NULL,
    id_trabajador INTEGER NOT NULL,
    id_administrador INTEGER NOT NULL,
    fecha_asignacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    observacion TEXT,
    activa BOOLEAN NOT NULL DEFAULT TRUE,

    CONSTRAINT fk_asignacion_solicitud
        FOREIGN KEY (id_solicitud)
        REFERENCES solicitudes(id_solicitud),

    CONSTRAINT fk_asignacion_trabajador
        FOREIGN KEY (id_trabajador)
        REFERENCES usuarios(id_usuario),

    CONSTRAINT fk_asignacion_administrador
        FOREIGN KEY (id_administrador)
        REFERENCES usuarios(id_usuario)
);

-- Una solicitud no puede tener dos asignaciones activas
CREATE UNIQUE INDEX uq_asignacion_activa
ON asignaciones(id_solicitud)
WHERE activa = TRUE;

-- 5. TABLA DE HISTORIAL DE ESTADOS
CREATE TABLE historial_estados (
    id_historial INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_solicitud INTEGER NOT NULL,
    id_usuario INTEGER NOT NULL,
    estado_anterior VARCHAR(20),
    estado_nuevo VARCHAR(20) NOT NULL,
    fecha_cambio TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    observacion TEXT,

    CONSTRAINT fk_historial_solicitud
        FOREIGN KEY (id_solicitud)
        REFERENCES solicitudes(id_solicitud),

    CONSTRAINT fk_historial_usuario
        FOREIGN KEY (id_usuario)
        REFERENCES usuarios(id_usuario),

    CONSTRAINT chk_historial_estado_anterior
        CHECK (
            estado_anterior IS NULL OR
            estado_anterior IN ('Pendiente', 'En proceso', 'Resuelta')
        ),

    CONSTRAINT chk_historial_estado_nuevo
        CHECK (
            estado_nuevo IN ('Pendiente', 'En proceso', 'Resuelta')
        )
);

-- 6. VALIDAR QUE LA SOLICITUD PERTENEZCA A UN RESIDENTE
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

-- 7. VALIDAR LOS ROLES DE UNA ASIGNACIÓN
CREATE OR REPLACE FUNCTION validar_roles_asignacion()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM usuarios
        WHERE id_usuario = NEW.id_trabajador
          AND rol = 'mantenimiento'
    ) THEN
        RAISE EXCEPTION 'El trabajador asignado debe tener rol de mantenimiento.';
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

-- 8. ÍNDICES PARA CONSULTAS FRECUENTES
CREATE INDEX idx_solicitudes_residente
ON solicitudes(id_residente);

CREATE INDEX idx_solicitudes_estado
ON solicitudes(estado);

CREATE INDEX idx_asignaciones_trabajador
ON asignaciones(id_trabajador);

CREATE INDEX idx_historial_solicitud
ON historial_estados(id_solicitud);

-- 9. CATEGORÍAS INICIALES
INSERT INTO categorias (nombre, descripcion)
VALUES
    ('Plomería', 'Problemas de tuberías, filtraciones y agua.'),
    ('Electricidad', 'Problemas eléctricos e iluminación.'),
    ('Pintura', 'Trabajos de pintura y acabados.'),
    ('Daños en áreas comunes', 'Daños en espacios compartidos.'),
    ('Otros', 'Otras solicitudes de mantenimiento.')
ON CONFLICT (nombre) DO NOTHING;
