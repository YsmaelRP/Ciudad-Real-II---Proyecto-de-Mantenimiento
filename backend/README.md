# API de mantenimiento

Servidor Express con TypeScript. Esta primera etapa incluye configuración, errores JSON y una ruta de salud. Todavía no hay autenticación ni operaciones de solicitudes.

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

## Verificar y compilar

```bash
npm run typecheck
npm test
npm run build
npm start
```

Las dependencias del frontend y del backend tienen archivos `package-lock.json` separados. Las pruebas HTTP no necesitan abrir un puerto fijo.
