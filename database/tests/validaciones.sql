-- Ejecutar en una base de prueba después de las migraciones y seed_demo.sql.
-- Los datos de esta prueba se revierten; las secuencias pueden dejar huecos.
BEGIN;

DO $$
DECLARE
    residente INTEGER;
    administrador INTEGER;
    trabajador INTEGER;
    categoria INTEGER;
    solicitud INTEGER;
    otra_solicitud INTEGER;
    codigo_primero TEXT;
    codigo_segundo TEXT;
    rechazado BOOLEAN;
BEGIN
    SELECT id_usuario INTO STRICT residente FROM usuarios WHERE correo = 'residente@cr2.do';
    SELECT id_usuario INTO STRICT administrador FROM usuarios WHERE correo = 'admin@cr2.do';
    SELECT id_usuario INTO STRICT trabajador FROM usuarios WHERE correo = 'mantenimiento@cr2.do';
    SELECT id_categoria INTO STRICT categoria FROM categorias WHERE nombre = 'Plomería';

    ASSERT (SELECT count(*) = 5 FROM usuarios
        WHERE correo IN ('residente@cr2.do', 'carlos@cr2.do', 'admin@cr2.do',
                         'mantenimiento@cr2.do', 'miguel@cr2.do')
          AND contrasena LIKE '$2%'
          AND crypt('demo123', contrasena) = contrasena),
        'Las cinco cuentas de demo deben tener hashes bcrypt válidos';

    INSERT INTO solicitudes (id_residente, id_categoria, descripcion, ubicacion)
    VALUES (residente, categoria, 'Solicitud ficticia para verificar restricciones.', 'Ubicación ficticia')
    RETURNING id_solicitud, codigo INTO solicitud, codigo_primero;

    INSERT INTO solicitudes (id_residente, id_categoria, descripcion, ubicacion)
    VALUES (residente, categoria, 'Otra solicitud ficticia para verificar códigos.', 'Ubicación ficticia')
    RETURNING id_solicitud, codigo INTO otra_solicitud, codigo_segundo;

    ASSERT codigo_primero = 'CR2-' || solicitud::TEXT, 'Código generado incorrecto';
    ASSERT codigo_primero <> codigo_segundo, 'Los códigos deben ser distintos';
    ASSERT (SELECT estado = 'Pendiente' FROM solicitudes WHERE id_solicitud = solicitud),
        'El estado inicial debe ser Pendiente';

    rechazado := FALSE;
    BEGIN
        INSERT INTO solicitudes (id_residente, id_categoria, descripcion, ubicacion)
        VALUES (administrador, categoria, 'No debe aceptarse.', 'Ubicación ficticia');
    EXCEPTION WHEN raise_exception THEN
        rechazado := TRUE;
    END;
    ASSERT rechazado, 'Debe rechazarse un administrador como residente';

    rechazado := FALSE;
    BEGIN
        INSERT INTO asignaciones (id_solicitud, id_trabajador, id_administrador)
        VALUES (solicitud, residente, administrador);
    EXCEPTION WHEN raise_exception THEN
        rechazado := TRUE;
    END;
    ASSERT rechazado, 'Debe rechazarse un residente como trabajador';

    rechazado := FALSE;
    BEGIN
        INSERT INTO asignaciones (id_solicitud, id_trabajador, id_administrador)
        VALUES (solicitud, trabajador, residente);
    EXCEPTION WHEN raise_exception THEN
        rechazado := TRUE;
    END;
    ASSERT rechazado, 'Debe rechazarse un residente como administrador';

    INSERT INTO asignaciones (id_solicitud, id_trabajador, id_administrador)
    VALUES (solicitud, trabajador, administrador);

    rechazado := FALSE;
    BEGIN
        INSERT INTO asignaciones (id_solicitud, id_trabajador, id_administrador)
        VALUES (solicitud, trabajador, administrador);
    EXCEPTION WHEN unique_violation THEN
        rechazado := TRUE;
    END;
    ASSERT rechazado, 'Debe impedirse una segunda asignación activa';

    INSERT INTO historial_estados (id_solicitud, id_usuario, estado_nuevo, tipo, observacion)
    VALUES (solicitud, residente, 'Pendiente', 'created', 'Solicitud registrada');

    INSERT INTO historial_estados (id_solicitud, id_usuario, estado_anterior, estado_nuevo, tipo)
    VALUES (solicitud, administrador, 'Pendiente', 'Pendiente', 'assignment');

    -- Prueba de rollback conjunto. La futura API debe usar una transacción
    -- equivalente; esto NO implementa los permisos ni las transiciones de la API.
    rechazado := FALSE;
    BEGIN
        UPDATE solicitudes SET estado = 'En proceso' WHERE id_solicitud = solicitud;
        INSERT INTO historial_estados (id_solicitud, id_usuario, estado_nuevo)
        VALUES (solicitud, trabajador, 'Inválido');
    EXCEPTION WHEN check_violation THEN
        rechazado := TRUE;
    END;
    ASSERT rechazado, 'El historial inválido debe fallar';
    ASSERT (SELECT estado = 'Pendiente' FROM solicitudes WHERE id_solicitud = solicitud),
        'El cambio de estado debe revertirse junto al historial fallido';

    RAISE NOTICE 'Pruebas de base de datos completadas correctamente.';
END;
$$;

ROLLBACK;
