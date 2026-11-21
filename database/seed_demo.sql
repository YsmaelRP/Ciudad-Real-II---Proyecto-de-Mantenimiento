-- SOLO desarrollo local: cuentas ficticias con contraseña pública demo123.
-- No ejecutar en producción ni contra una base con datos reales.
-- Repetir este archivo no cambia cuentas existentes ni sus contraseñas.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO usuarios (nombre, correo, contrasena, rol)
VALUES
    ('María Fernández', 'residente@cr2.do', crypt('demo123', gen_salt('bf', 10)), 'residente'),
    ('Carlos Méndez', 'carlos@cr2.do', crypt('demo123', gen_salt('bf', 10)), 'residente'),
    ('Laura Castillo', 'admin@cr2.do', crypt('demo123', gen_salt('bf', 10)), 'administrador'),
    ('José Ramírez', 'mantenimiento@cr2.do', crypt('demo123', gen_salt('bf', 10)), 'mantenimiento'),
    ('Miguel Santos', 'miguel@cr2.do', crypt('demo123', gen_salt('bf', 10)), 'mantenimiento')
ON CONFLICT (correo) DO NOTHING;

-- Se conservan las categorías originales y se agregan las opciones que usa
-- el prototipo. La API será la fuente del catálogo al integrar React.
INSERT INTO categorias (nombre, descripcion)
VALUES
    ('Climatización', 'Problemas con aire acondicionado y ventilación.'),
    ('Carpintería', 'Reparaciones de puertas, muebles y elementos de madera.')
ON CONFLICT (nombre) DO NOTHING;

COMMIT;
