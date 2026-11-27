# Ciudad Real II — Mantenimiento

Proyecto de la asignatura INF-386-03 de la UNPHU. El sistema permitirá a los residentes registrar solicitudes de mantenimiento, a la administración asignarlas y al personal de mantenimiento actualizar su estado.

## Estado actual

El frontend está hecho con React, TypeScript y Vite. Incluye paneles para los tres roles, registro de solicitudes, asignaciones, estados, historial y filtros. La API en `backend/`, con Node.js, Express y TypeScript, cubre el recorrido completo de la beta contra PostgreSQL.

El acceso usa sesiones persistidas, la lista de técnicos y el catálogo de categorías vienen del servidor, y las solicitudes ya no se leen ni se escriben en `localStorage`. La API verifica permisos en cada ruta: un residente solo ve sus casos, administración ve todos y asigna, y el trabajador asignado es el único que puede avanzar el estado. Creación, asignación y cambios de estado registran su historial en la misma transacción.

## Ejecutar el frontend

Se necesita Git y Node.js 22.12 o superior en la rama 22. La versión probada es 22.23.5.

```bash
git clone https://github.com/YsmaelRP/Ciudad-Real-II---Proyecto-de-Mantenimiento.git
cd Ciudad-Real-II---Proyecto-de-Mantenimiento
npm ci --include=optional
```

Preparar PostgreSQL con los scripts de [database/README.md](database/README.md), incluida la migración `004_sesiones.sql`, y configurar `backend/.env` siguiendo [backend/README.md](backend/README.md). Si la base ya está creada, aplicar solo las migraciones pendientes.

Iniciar la API en una terminal:

```bash
cd backend
npm ci
npm run dev
```

En otra terminal, desde la raíz del repositorio, iniciar React:

```bash
npm run dev
```

Abrir **http://localhost:8443**. Ingresar correo y contraseña de una cuenta precreada en PostgreSQL. Las cuentas ficticias del seed están documentadas en `database/README.md`; no hay registro público ni selección de roles desde el formulario.

Vite reenvía `/api` al backend en `127.0.0.1:3001`, tanto en desarrollo como en `npm run preview`. Mantener `FRONTEND_ORIGIN=http://localhost:8443` en el backend y usar esa dirección para abrir el frontend; otro origen será rechazado al iniciar sesión. No hace falta una variable `VITE_` con credenciales o datos de PostgreSQL.

En un despliegue, configurar el servidor web para reenviar `/api` al backend bajo el mismo sitio. El proxy de Vite no forma parte de los archivos compilados.

El archivo `.figma/make/site.json` debe mantenerse porque lo utiliza la configuración de Vite.

## Verificar el proyecto

```bash
npm run typecheck
npm test
npm run build
```

La compilación se genera en `dist/`.

Las 35 pruebas del frontend simulan las respuestas HTTP y comprueban acceso, restauración de sesión, catálogo, registro, listados filtrados, asignación, estados y ausencia de `localStorage`. Las pruebas de la API y las integraciones opcionales con PostgreSQL se ejecutan desde `backend/` como indica su README.

## Probar la beta desde React

1. Iniciar sesión con `residente@cr2.do` y contraseña `demo123`; debe aparecer el panel del residente.
2. Recargar la página: el usuario se recupera de `/api/auth/me`, no de `sessionStorage`.
3. Crear una solicitud: el formulario carga las categorías de `GET /api/categories` y muestra el código devuelto por PostgreSQL.
4. Entrar con `admin@cr2.do` y asignar el caso a un técnico activo: el estado debe permanecer `Pendiente`.
5. Entrar con `mantenimiento@cr2.do`, iniciar el trabajo y resolverlo con una descripción: el historial debe mostrar las cuatro operaciones.
6. Volver al residente y consultar el detalle: debe mostrar el estado final y el trabajo realizado.
7. Cerrar sesión y recargar: debe volver al formulario. Si la API está detenida, debe aparecer un mensaje de conexión, sin datos de respaldo.

La sesión también se vuelve a comprobar al recuperar el foco de la ventana y cada minuto mientras la página está visible. El token queda en una cookie HttpOnly; React no lo lee ni lo guarda en el almacenamiento del navegador.

Los casos ficticios de la versión anterior usan IDs incompatibles con PostgreSQL. No se cargan en este flujo ni se borran de su almacenamiento anterior; las solicitudes actuales provienen únicamente de la API.

## Base de datos

Los scripts, el orden de instalación y las cuentas ficticias de PostgreSQL están en [database/README.md](database/README.md). No hace falta una migración nueva para las solicitudes: la API usa el esquema y los tipos de historial preparados en `003_preparar_api.sql`. React no se conecta directamente a PostgreSQL.

## API

Para instalar, ejecutar y probar Express, consultar [backend/README.md](backend/README.md). El backend se inicia en una terminal separada y usa el puerto 3001; el frontend mantiene el puerto 8443.

| Método | Ruta | Acceso |
|---|---|---|
| `GET` | `/api/categories` | Cualquier sesión válida. |
| `POST` | `/api/requests` | Solo residentes. |
| `GET` | `/api/requests` | Residente: propias. Mantenimiento: asignadas. Administración: todas. Acepta `search` y `status`. |
| `GET` | `/api/requests/:id` | Según el rol y la asignación; un caso ajeno responde 404. |
| `PATCH` | `/api/requests/:id/assignment` | Solo administración, mientras esté `Pendiente`. |
| `PATCH` | `/api/requests/:id/status` | Solo el trabajador asignado; avanza un paso y exige descripción al resolver. |

## Trabajo en equipo

Crear una rama por tarea y enviar un pull request a `main`. Hacer commits pequeños que permitan revisar el avance de cada funcionalidad.

No subir `node_modules/`, `dist/`, archivos `.env` ni credenciales. Las dependencias se instalan con el archivo `package-lock.json` incluido en el repositorio.
