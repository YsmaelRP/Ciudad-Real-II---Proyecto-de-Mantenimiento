# Ciudad Real II — Mantenimiento

Proyecto de la asignatura INF-386-03 de la UNPHU. El sistema permitirá a los residentes registrar solicitudes de mantenimiento, a la administración asignarlas y al personal de mantenimiento actualizar su estado.

## Estado actual

El frontend está hecho con React, TypeScript y Vite. Incluye paneles para los tres roles, registro de solicitudes, asignaciones, estados, historial y filtros.

El acceso de React ya utiliza la API: inicio de sesión, recuperación de sesión y cierre. Las cuentas y sesiones se guardan en PostgreSQL, y la lista de técnicos se obtiene del servidor. Las solicitudes, asignaciones e historial siguen siendo una simulación local; sus rutas e integración todavía están pendientes.

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

Las 21 pruebas del frontend simulan las respuestas HTTP y comprueban el formulario, las cookies incluidas en las peticiones, restauración, errores y cierre de sesión. Las pruebas reales de PostgreSQL se ejecutan desde `backend/` como indica su README.

## Probar el acceso desde React

1. Iniciar sesión con una cuenta del seed; debe aparecer el panel de su rol.
2. Recargar la página: el usuario se recupera de `/api/auth/me`, no de `sessionStorage`.
3. Cerrar sesión y recargar: debe volver al formulario.
4. Intentar entrar con contraseña incorrecta: el servidor debe rechazarla.
5. Si la API está detenida, debe aparecer un mensaje de conexión, sin acceso de respaldo.

La sesión también se vuelve a comprobar al recuperar el foco de la ventana y cada minuto mientras la página está visible. El token queda en una cookie HttpOnly; React no lo lee ni lo guarda en el almacenamiento del navegador.

Los casos ficticios de la versión anterior usan IDs incompatibles con PostgreSQL. No se cargan en este flujo ni se borran de su almacenamiento anterior. Las nuevas solicitudes locales usan una clave distinta y no se guardan en PostgreSQL. No introducir datos reales hasta integrar y validar las rutas de solicitudes.

## Base de datos

Los scripts, el orden de instalación y las cuentas ficticias de PostgreSQL están en [database/README.md](database/README.md). La conexión del frontend con la base se hará a través de la API; React no debe conectarse directamente a PostgreSQL.

## API

Para instalar, ejecutar y probar Express, consultar [backend/README.md](backend/README.md). El backend se inicia en una terminal separada y usa el puerto 3001; el frontend mantiene el puerto 8443.

## Trabajo en equipo

Crear una rama por tarea y enviar un pull request a `main`. Hacer commits pequeños que permitan revisar el avance de cada funcionalidad.

No subir `node_modules/`, `dist/`, archivos `.env` ni credenciales. Las dependencias se instalan con el archivo `package-lock.json` incluido en el repositorio.
