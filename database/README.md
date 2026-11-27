# Base de datos

Scripts de PostgreSQL para la beta de Ciudad Real II. Probados con PostgreSQL 18. Ejecutar primero en una base local de desarrollo; no contienen credenciales de conexión.

## Instalación nueva

Crear una base vacía llamada `ciudad_real_ii`. Desde la raíz del repositorio, con las herramientas de PostgreSQL disponibles en la terminal:

```bash
createdb -h localhost -U postgres ciudad_real_ii
psql -X -h localhost -U postgres -d ciudad_real_ii -v ON_ERROR_STOP=1 -f database/schema.sql
psql -X -h localhost -U postgres -d ciudad_real_ii -v ON_ERROR_STOP=1 -f database/002_validaciones.sql
psql -X -h localhost -U postgres -d ciudad_real_ii -v ON_ERROR_STOP=1 -f database/003_preparar_api.sql
psql -X -h localhost -U postgres -d ciudad_real_ii -v ON_ERROR_STOP=1 -f database/004_sesiones.sql
```

`schema.sql`, `003_preparar_api.sql` y `004_sesiones.sql` se ejecutan una sola vez. `002_validaciones.sql` se puede repetir: reemplaza los triggers existentes sin duplicarlos. No borrar tablas para actualizar una base existente.

## Base creada con la versión anterior

Hacer una copia de seguridad. Si ya se ejecutó `schema.sql`, **no volver a ejecutarlo**. Aplicar los scripts que falten, en orden: `002_validaciones.sql`, `003_preparar_api.sql`, `004_sesiones.sql`. La migración 003 mantiene las solicitudes existentes y calcula sus códigos a partir de sus identificadores. Si ya se aplicó la 003, no repetirla: aplicar solo la 004 para agregar sesiones.

La tabla `sesiones` usa fechas con zona horaria y guarda hashes SHA-256 de tokens aleatorios, nunca cookies en texto plano. La API rechaza sesiones expiradas o de cuentas inactivas. Como mantenimiento, se pueden eliminar las filas expiradas con `DELETE FROM sesiones WHERE fecha_expiracion <= CURRENT_TIMESTAMP;`; esto no elimina usuarios ni solicitudes.

## Datos ficticios

Solo para desarrollo y demostraciones locales:

```bash
psql -X -h localhost -U postgres -d ciudad_real_ii -v ON_ERROR_STOP=1 -f database/seed_demo.sql
```

El archivo requiere la extensión `pgcrypto`; debe ejecutarlo un usuario con permiso para instalarla. Las contraseñas se guardan como hashes bcrypt con sal aleatoria, nunca como texto plano.

| Correo ficticio | Rol |
|---|---|
| residente@cr2.do | residente |
| carlos@cr2.do | residente |
| admin@cr2.do | administrador |
| mantenimiento@cr2.do | mantenimiento |
| miguel@cr2.do | mantenimiento |

La contraseña pública de estas cuentas es `demo123`. No son cuentas de producción. Repetir el seed no modifica usuarios existentes ni restablece contraseñas; si esos correos ya existen, revisar sus datos antes de probar el acceso.

El seed agrega Climatización y Carpintería sin borrar categorías anteriores. Se mantienen los nombres de la base: `Daños en áreas comunes` y `Otros`. Al integrar React, el formulario debe obtener los IDs y nombres del catálogo desde `GET /api/categories`, no asumir que coinciden con las opciones actuales del prototipo.

## Acuerdos para implementar la API

- El código se genera en PostgreSQL con formato `CR2-<id_solicitud>` y restricción `UNIQUE`. No contiene año ni usa fragmentos de la hora. Omitir `codigo` al insertar y obtenerlo con `RETURNING id_solicitud, codigo`. Es normal que existan saltos en los números.
- `usuarios.contrasena` almacena el hash bcrypt. La API debe compararlo con una biblioteca compatible y nunca devolverlo en sus respuestas.
- Obtener el usuario y rol de la sesión, no del cuerpo enviado por React. Comprobar `activo` al autenticar y autorizar.
- El frontend usa roles `resident`, `admin`, `maintenance`; corresponden a `residente`, `administrador`, `mantenimiento` en PostgreSQL. Convertirlos en la capa de respuesta de la API o actualizar React de forma coordinada. Los identificadores de prueba `u-res-1`, etc. no corresponden a los IDs numéricos de la base.
- Los estados mantienen los valores `Pendiente`, `En proceso` y `Resuelta`.
- La asignación actual es la fila de `asignaciones` con `activa = TRUE`. Para reasignar, bloquear la solicitud, comprobar que siga pendiente, desactivar la asignación previa e insertar la nueva dentro de una transacción. El índice impide tener dos activas.
- `historial_estados.tipo` admite `created`, `assignment` y `status`. Registrar la creación, las asignaciones y los cambios desde el backend. Las filas antiguas reciben el tipo `status`; revisar si hay datos anteriores de otro tipo.
- Para iniciar o resolver: abrir transacción, bloquear la solicitud (`SELECT ... FOR UPDATE`), verificar trabajador asignado y transición, actualizar el estado e insertar el historial. Confirmar solo si ambas operaciones funcionan; ante errores ejecutar `ROLLBACK` usando la misma conexión.
- Al resolver, exigir la descripción del trabajo y guardarla en `historial_estados.observacion`. La API puede devolverla como `resolution` en el detalle.
- Las fechas actuales son `TIMESTAMP` sin zona. Acordar la zona de los datos antes de devolver fechas ISO con offset; no agregar `Z` a una fecha local sin convertirla. Una migración a `TIMESTAMPTZ` debe definir cómo interpretar las fechas existentes.

Los triggers validan roles referenciados y las restricciones protegen la integridad. **No sustituyen los permisos de la API ni garantizan por sí solos las transiciones y el historial conjunto.** React ya utiliza del backend el acceso, las sesiones, la lista de técnicos, el catálogo y todas las operaciones de solicitudes; `localStorage` ya no es la fuente de los casos. La API no introdujo columnas nuevas: el código generado y los tipos de historial de `003_preparar_api.sql` son suficientes para la beta.

## Pruebas

En una base de prueba con los scripts anteriores y el seed cargado:

```bash
psql -X -h localhost -U postgres -d ciudad_real_ii -v ON_ERROR_STOP=1 -f database/tests/validaciones.sql
```

Comprueba hashes de las cinco cuentas, generación de códigos distintos, estado inicial, roles de residentes y asignaciones, asignación activa única, tipos de historial y rollback del estado ante un historial inválido. Los registros temporales se revierten; las secuencias pueden avanzar.

Se verificó la instalación desde cero en PostgreSQL 18, repitiendo la actualización 002 y el seed para comprobar que no duplican datos ni triggers. También se probó la migración 003 con una solicitud anterior: se conservó el registro y se generó su código. Estas pruebas son de base de datos, no reemplazan los casos de autenticación, permisos y transacciones de la futura API.
