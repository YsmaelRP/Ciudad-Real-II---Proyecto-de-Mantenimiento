# API de mantenimiento

Servidor Express con TypeScript. Esta primera etapa incluye configuración, errores JSON, salud del servidor y comprobación de conexión a PostgreSQL. Todavía no hay autenticación ni operaciones de solicitudes.

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

## Verificar y compilar

```bash
npm run typecheck
npm test
npm run build
npm start
```

Las dependencias del frontend y del backend tienen archivos `package-lock.json` separados. Las pruebas HTTP no necesitan abrir un puerto fijo.

Las pruebas normales usan conexiones simuladas. Para habilitar también la prueba real de PostgreSQL, definir `TEST_DATABASE_URL` en la terminal apuntando a una base de prueba y ejecutar `npm test`. Esta prueba solo hace `SELECT 1`, no crea ni modifica tablas. Sin esa variable aparece como omitida.
