# Ciudad Real II — Mantenimiento

Proyecto de la asignatura INF-386-03 de la UNPHU. El sistema permitirá a los residentes registrar solicitudes de mantenimiento, a la administración asignarlas y al personal de mantenimiento actualizar su estado.

## Estado actual

El frontend está hecho con React, TypeScript y Vite. Incluye acceso con cuentas de demostración, paneles para los tres roles, registro de solicitudes, asignaciones, estados, historial y filtros.

Por ahora las solicitudes se guardan en el navegador y el acceso es simulado. La base de datos PostgreSQL ya tiene scripts de instalación. En `backend/` está la base de la API con Node.js, Express y TypeScript; las funciones de acceso y solicitudes y su integración con React siguen pendientes.

## Ejecutar el frontend

Se necesita Git y Node.js 22.12 o superior en la rama 22. La versión probada es 22.23.5.

```bash
git clone https://github.com/YsmaelRP/Ciudad-Real-II---Proyecto-de-Mantenimiento.git
cd Ciudad-Real-II---Proyecto-de-Mantenimiento
npm ci --include=optional
npm run dev
```

Abrir http://localhost:8443. Para entrar, seleccionar una cuenta de demostración y pulsar **Iniciar sesión**.

El archivo `.figma/make/site.json` debe mantenerse porque lo utiliza la configuración de Vite.

## Verificar el proyecto

```bash
npm run typecheck
npm run build
```

La compilación se genera en `dist/`.

## Base de datos

Los scripts, el orden de instalación y las cuentas ficticias de PostgreSQL están en [database/README.md](database/README.md). La conexión del frontend con la base se hará a través de la API; React no debe conectarse directamente a PostgreSQL.

## API

Para instalar, ejecutar y probar Express, consultar [backend/README.md](backend/README.md). El backend se inicia en una terminal separada y usa el puerto 3001; el frontend mantiene el puerto 8443.

## Trabajo en equipo

Crear una rama por tarea y enviar un pull request a `main`. Hacer commits pequeños que permitan revisar el avance de cada funcionalidad.

No subir `node_modules/`, `dist/`, archivos `.env` ni credenciales. Las dependencias se instalan con el archivo `package-lock.json` incluido en el repositorio.
