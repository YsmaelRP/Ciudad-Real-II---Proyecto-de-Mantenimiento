# API de mantenimiento

Servidor Express con TypeScript. Incluye configuración, errores JSON, salud, conexión a PostgreSQL, autenticación con cuentas precreadas y la API de solicitudes. React ya integra el acceso, el catálogo, el registro, los listados, las asignaciones, los estados y el historial.

## Ejecutar

Se necesita Node.js 22.12 o superior en la rama 22 (también compatible con Node 24 o posterior).

Desde la raíz del repositorio:

```bash
cd backend
npm ci
```

Copiar `.env.example` a `.env` y ajustar los valores locales. El archivo `.env` no se sube a Git. Se puede iniciar sin él con los valores por defecto.

```bash
npm run dev
```

Abrir `http://127.0.0.1:3001/api/health`. Debe responder:

```json
{ "status": "ok" }
```

El frontend se ejecuta por separado, desde la raíz del repositorio, con `npm run dev`. `FRONTEND_ORIGIN` debe coincidir con la dirección desde la que se abre React (por defecto `http://localhost:8443`). CORS no sustituye la autenticación ni los permisos.

## Conectar PostgreSQL

Preparar la base siguiendo [database/README.md](../database/README.md). Completar `DATABASE_URL` en `backend/.env` con el usuario, contraseña, servidor y nombre reales de tu base local. No compartir este archivo ni incluir la URL completa en capturas.

```dotenv
DATABASE_URL=postgresql://USUARIO:CONTRASENA@127.0.0.1:5432/ciudad_real_ii
```

Los valores en mayúsculas son marcadores, no credenciales utilizables. Codificar los caracteres especiales del usuario y contraseña para una URL. Reiniciar la API después de cambiar `.env`.

| Ruta | Respuesta |
|---|---|
| `GET /api/health` | 200 con `{"status":"ok"}` si Express funciona. No consulta PostgreSQL. |
| `GET /api/ready` | 200 con `{"status":"ready"}` si `SELECT 1` funciona; 503 con `{"status":"not_ready"}` si falta configuración o falla la conexión. |

`ready` solo comprueba conectividad; no asegura que existan las tablas, migraciones o cuentas. El pool limita conexiones y tiempos de espera, y se cierra al detener el servidor. No se desactiva la validación de certificados SSL.

## Inicio de sesión y permisos

Antes de probar el acceso, aplicar **una sola vez** `database/004_sesiones.sql` sobre una base que ya tenga los scripts anteriores. No volver a crear la base ni repetir `schema.sql`. Las cuentas ficticias se cargan con `seed_demo.sql` como se explica en el README de la base.

| Método y ruta | Acceso / resultado |
|---|---|
| `POST /api/auth/login` | JSON con `email` y `password`. Devuelve `{ "user": ... }` y una cookie de sesión. |
| `GET /api/auth/me` | Devuelve el usuario de la sesión; sin sesión válida responde 401. |
| `POST /api/auth/logout` | Enviar JSON `{}`. Revoca la sesión y borra la cookie; responde 204. |
| `GET /api/technicians` | Solo administración. Lista técnicos activos; sin sesión responde 401 y con otro rol 403. |

Las respuestas de usuario contienen `id` (texto), `name`, `email`, `role` e `initials`, nunca contraseña ni hash. Los roles de respuesta son `resident`, `admin` y `maintenance`, compatibles con React. Los permisos se comprueban con el rol almacenado en PostgreSQL, no con datos enviados por el cliente.

Las sesiones duran dos horas, no se renuevan por actividad y sobreviven al reinicio de Express. El navegador recibe un token aleatorio de 256 bits en una cookie HttpOnly, SameSite=Lax; PostgreSQL conserva únicamente su hash SHA-256. Un nuevo login rota la sesión de ese navegador. Cada consulta autenticada verifica expiración y usuario activo. El cierre de sesión revoca el token en el servidor.

`NODE_ENV=production` habilita cookies Secure y exige `FRONTEND_ORIGIN` con HTTPS. En local usar `development`. React llama a `/api` con `credentials: 'include'`; el proxy de Vite reenvía al backend y permite usar cookies bajo el mismo sitio. Abrir React en `http://localhost:8443`, coincidiendo con `FRONTEND_ORIGIN`. En producción se necesita un proxy equivalente en el servidor web.

Login y logout exigen `Content-Type: application/json` y rechazan un `Origin` distinto al configurado. Los clientes REST sin `Origin` están permitidos, salvo que declaren `Sec-Fetch-Site: cross-site`. El login acepta hasta 10 intentos por IP cada 15 minutos; el límite se guarda en memoria de cada proceso. No configurar `trust proxy` sin revisar el despliegue.

## Solicitudes

Todas las rutas de esta sección exigen una sesión válida. Las mutaciones también exigen `Content-Type: application/json` y un `Origin` de confianza. Los datos de autor, rol y fecha se toman de la sesión y de PostgreSQL; nunca del cuerpo enviado por React.

| Método y ruta | Acceso / resultado |
|---|---|
| `GET /api/categories` | Cualquier rol. Devuelve `{ "categories": [{ "id": "3", "name": "Climatización", "description": "..." }] }` con los datos reales de la base. |
| `POST /api/requests` | Solo residentes. Cuerpo `{ "categoryId": "1", "location": "...", "description": "..." }`. Devuelve 201 con `{ "request": ... }`. |
| `GET /api/requests` | Residente: propias. Mantenimiento: asignadas. Administración: todas. Acepta `?search=...&status=Pendiente`. |
| `GET /api/requests/:id` | Devuelve el detalle con su historial. Un caso ajeno o inexistente responde 404 sin revelar su existencia. |
| `PATCH /api/requests/:id/assignment` | Solo administración. Cuerpo `{ "technicianId": "4" }`. Solo casos `Pendiente`; conserva el estado. |
| `PATCH /api/requests/:id/status` | Solo el trabajador asignado. Cuerpo `{ "status": "En proceso" }` o `{ "status": "Resuelta", "description": "..." }`. |

El catálogo vive en su propio módulo (`backend/src/categories/`) y React lo consume desde `src/api/categories.ts`; las solicitudes están en `backend/src/requests/` y `src/api/requests.ts`. No hay dos rutas `GET /api/categories` ni dos clientes del catálogo.

El código `CR2-<id>` lo genera PostgreSQL al insertar; no se acepta desde el cliente. Las transiciones son `Pendiente → En proceso → Resuelta`: no se permiten saltos, retrocesos ni reapertura. Al resolver se exige la descripción del trabajo, que se guarda en `historial_estados.observacion` y se devuelve como `resolution`.

Cada operación de escritura usa una sola conexión y transacción con `SELECT ... FOR UPDATE` cuando hay que bloquear la solicitud. La creación, la asignación y el cambio de estado insertan su evento de historial antes de `COMMIT`; si falla el historial, `ROLLBACK` revierte también el cambio principal. El índice parcial de `asignaciones` impide dos asignaciones activas.

Errores de dominio: `400 INVALID_INPUT` (campos obligatorios o categoría/trabajador no válidos), `403 FORBIDDEN` (rol no autorizado), `404 NOT_FOUND` (caso inexistente o no visible), `409 INVALID_STATE` (asignar un caso que ya no está pendiente) y `409 INVALID_TRANSITION` (salto o retroceso de estado). Si falta el catálogo, `/api/categories` responde `503 CATALOG_UNAVAILABLE`; si falta el acceso, `503 AUTH_UNAVAILABLE`; si falta el servicio de solicitudes, `503 REQUESTS_UNAVAILABLE`. Los errores inesperados siguen respondiendo `500 INTERNAL_ERROR` sin detalles.

### Prueba manual en PowerShell

Con Express funcionando, ejecutar en otra terminal. Son credenciales públicas de demostración, no las de conexión a PostgreSQL:

```powershell
$login = @{ email = 'admin@cr2.do'; password = 'demo123' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3001/api/auth/login' -ContentType 'application/json' -Body $login -SessionVariable sesion
Invoke-RestMethod -Uri 'http://127.0.0.1:3001/api/auth/me' -WebSession $sesion
Invoke-RestMethod -Uri 'http://127.0.0.1:3001/api/technicians' -WebSession $sesion
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3001/api/auth/logout' -ContentType 'application/json' -Body '{}' -WebSession $sesion
```

Después del logout, repetir `/api/auth/me` debe dar 401. Repetir el login con `residente@cr2.do` o `mantenimiento@cr2.do` y contraseña `demo123` debe permitir `/auth/me`, pero denegar `/technicians` con 403.

Para probar una solicitud completa, iniciar sesión como residente y guardar la cookie en `$sesion`:

```powershell
$categorias = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/api/categories' -WebSession $sesion
$idCategoria = $categorias.categories[0].id
$nueva = @{ categoryId = $idCategoria; location = 'Torre B · Apto 3C'; description = 'Fuga de agua en la tubería del baño' } | ConvertTo-Json
$solicitud = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3001/api/requests' -ContentType 'application/json' -Body $nueva -WebSession $sesion
$solicitud.request.code
```

Con la sesión de administración se asigna con `PATCH /api/requests/<id>/assignment` y cuerpo `{ "technicianId": "<id>" }`. Con la del técnico se envía `PATCH /api/requests/<id>/status` con `{ "status": "En proceso" }` y después `{ "status": "Resuelta", "description": "..." }`. El residente debe poder consultar el mismo caso y su historial. Estas pruebas verifican la API directamente; el recorrido también puede probarse desde React.

Antes de un despliegue real, revisar HTTPS, permisos del usuario de conexión, límites de acceso compartidos entre procesos y limpieza programada de sesiones expiradas. No usar las cuentas demo en producción.

## Verificar y compilar

```bash
npm run typecheck
npm test
npm run build
npm start
```

Las dependencias del frontend y del backend tienen archivos `package-lock.json` separados. Las pruebas HTTP no necesitan abrir un puerto fijo.

Las pruebas normales usan conexiones simuladas: cubren salud, configuración, sesiones, permisos, validación, transiciones de estado, historial y `ROLLBACK` cuando falla una inserción. Las pruebas reales se habilitan explícitamente y no cargan `.env`:

- `TEST_DATABASE_URL`: prueba de conectividad con `SELECT 1`, sin modificar tablas.
- `TEST_AUTH_DATABASE_URL`: base de prueba con los scripts hasta `004_sesiones.sql` y el seed cargados. Verifica login bcrypt de los tres roles, sesión persistida, permisos, rotación, expiración y logout. También comprueba en solo lectura que `/api/categories` devuelve el catálogo activo. Crea y elimina solo sus propias sesiones; no modifica cuentas ni categorías y no ejecuta migraciones.
- `TEST_REQUESTS_DATABASE_URL`: base de prueba con el esquema completo y el seed cargados. Recorre categoría → registro → asignación → inicio → resolución, comprueba la persistencia del historial y los permisos por rol, y elimina solo la solicitud y las sesiones creadas por la prueba.

Definir las variables en la terminal antes de `npm test`, nunca en archivos versionados. Sin esas variables se omiten cuatro pruebas; con las 45 pruebas simuladas se obtiene un total de 49. Las integraciones reales deben ejecutarse en una base aislada antes de la entrega; las simuladas no sustituyen una prueba integral desde React contra PostgreSQL.
