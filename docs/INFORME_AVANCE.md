# Informe de avance de la API y su integración con React

Proyecto: INF-386-03 — Proyecto Integrador en Software y Bases de Datos, UNPHU.

Repositorio: https://github.com/YsmaelRP/Ciudad-Real-II---Proyecto-de-Mantenimiento

Rama de este avance: `feat/solicitudes-api`, a partir de `main` en la revisión `687a584` (integración de la autenticación de React).

## 1. Resumen

El informe anterior dejaba pendiente la API de solicitudes y su integración con React. Esas funciones ya están implementadas: un residente registra un caso, administración lo asigna, el trabajador lo inicia y lo resuelve, y el residente consulta el resultado y su historial. Todo se persiste en PostgreSQL y se protege con permisos comprobados en el servidor.

React ya no usa `localStorage` como fuente de solicitudes. Las pantallas existentes se conectaron al contrato de la API, manteniendo los tres roles y el mismo flujo visual.

## 2. Funcionalidades incorporadas

| Pendiente del informe anterior | Estado actual |
|---|---|
| `GET /api/categories` | Devuelve categorías activas desde PostgreSQL. El formulario usa sus IDs y nombres reales. |
| `POST /api/requests` | Solo residentes. El autor se toma de la sesión; PostgreSQL genera `CR2-<id>` y se registra el evento `created`. |
| `GET /api/requests` | Residente: propias. Mantenimiento: asignadas. Administración: todas. Acepta `search` y `status`. |
| `GET /api/requests/:id` | Devuelve el caso y su historial. Los casos ajenos responden 404 sin revelar su existencia. |
| `PATCH /api/requests/:id/assignment` | Solo administración y casos `Pendiente`. Reasigna en transacción y conserva el estado; registra `assignment`. |
| `PATCH /api/requests/:id/status` | Solo el trabajador asignado. Avanza un paso; al resolver exige descripción y la guarda como `resolution`. |
| Historial y rollback | Creación, asignación y cambio de estado comparten transacción. Un fallo del historial revierte la operación principal. |
| Integración de React | Carga de catálogo, registro, listados filtrados, detalle, asignación, estados e historial desde la API. |
| Pruebas | 41 pruebas simuladas del backend y 29 del frontend; tres integraciones reales quedan opt-in por variable de entorno. |

El contrato detallado de rutas, errores y permisos está en [backend/README.md](../backend/README.md); el recorrido de prueba desde React está en [README.md](../README.md).

## 3. Reglas verificadas en código y pruebas

- Toda solicitud nueva comienza en `Pendiente`; asignar o reasignar no cambia el estado.
- Solo se permiten `Pendiente → En proceso → Resuelta`. No hay saltos, retrocesos ni reapertura.
- Solo el trabajador asignado puede avanzar el estado; residente y administración reciben 403 en esa ruta.
- Resolver exige descripción del trabajo; se guarda en `historial_estados.observacion`.
- El servidor obtiene autor, rol y fechas de la sesión y de PostgreSQL, no del navegador.
- Las mutaciones usan `SELECT ... FOR UPDATE` sobre la misma conexión y confirman solo si todas las escrituras terminan bien.

## 4. Verificación ejecutada en este avance

| Ámbito | Resultado |
|---|---|
| Backend: `npm run typecheck` | Correcto. |
| Backend: `npm test` | 41 aprobadas, 0 fallidas, 3 omitidas (requieren PostgreSQL de prueba). |
| Backend: `npm run build` | Correcto. |
| Frontend: `npm run typecheck` y `npm test` | Correctos; 29 pruebas aprobadas. |
| Frontend: `npm run build` | Correcto. |

Las pruebas simuladas comprueban respuestas HTTP y lógica de pantallas con datos de ejemplo. No sustituyen la ejecución contra una instancia real ni la comprobación en el equipo de otro integrante.

## 5. Queda para la entrega final

1. Ejecutar las tres pruebas de integración con `TEST_DATABASE_URL`, `TEST_AUTH_DATABASE_URL` y `TEST_REQUESTS_DATABASE_URL` sobre una base aislada con los scripts y el seed aplicados.
2. Repetir la instalación siguiendo los README en el equipo de otro integrante.
3. Hacer el recorrido completo con las cinco cuentas ficticias y verificar los tres roles desde React.
4. Preparar el informe final de la actividad 18 con capturas y el registro de errores corregidos.

Sigue fuera de alcance el registro público, la administración de cuentas, pagos, inventario, mantenimiento preventivo, varios residenciales, asignación automática y mensajería. No introducir datos reales; la beta usa las cuentas ficticias del seed.
