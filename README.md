# Administración de Licencias de Software · Tres60

Aplicación web para administrar el inventario y la asignación de licencias de
software corporativo, con una **bitácora histórica inmutable** de cada
movimiento.

Proyecto **independiente**: un solo Worker sirve la API y el frontend, con su
propia base de datos D1. Interfaz, validaciones y datos en **español (es-CL)**.
Fechas `DD-MM-AAAA HH:mm`, zona horaria `America/Santiago`.

Prioridades de diseño: **trazabilidad > integridad de datos > simplicidad
operativa > estética**.

---

## Stack

| Capa | Tecnología |
|---|---|
| Runtime | Cloudflare Workers |
| API | Hono (TypeScript) |
| Base de datos | Cloudflare D1 (SQLite), sentencias preparadas |
| Frontend | React + Vite + TypeScript, Tailwind CSS |
| Gráficos | Recharts |
| Excel | SheetJS (`xlsx`) |
| Auth | Cloudflare Access (Zero Trust) + roles en D1 |

Un solo Worker sirve la API (`/api/*`) y el frontend (binding `ASSETS`), sin CORS
ni dominios separados.

### Estructura

```
.
├─ public/usuarios.xlsx        # maestro de destinatarios (ejemplo, 10 registros)
├─ migrations/                 # migraciones D1 versionadas
├─ scripts/                    # generador del usuarios.xlsx de ejemplo
├─ src/
│  ├─ index.ts                 # Hono: API + assets con fallback SPA
│  ├─ api/                     # sesion, maestro, licencias, asignaciones,
│  │                           # dashboard, historial, reportes, usuarios
│  ├─ lib/                     # access (JWKS), auth-middleware, db, historial,
│  │                           # xlsx-maestro, maestro-sync, validaciones (Zod)
│  └─ client/                  # aplicación React
└─ wrangler.jsonc
```

---

## Requisitos previos

- Node.js ≥ 20 y npm.
- Cuenta de Cloudflare con Workers y D1 habilitados.
- `wrangler` (incluido como dependencia de desarrollo).

## Instalación

```bash
npm install
cp .dev.vars.example .dev.vars      # variables locales (ignorado por git)
```

## Crear la base de datos D1

```bash
npx wrangler d1 create admin-licencias
```

Copie el `database_id` que entrega el comando y reemplácelo en `wrangler.jsonc`
(campo `database_id`, en `d1_databases` y en `env.dev`). En el despliegue por
GitHub Actions este paso se resuelve automáticamente.

## Desarrollo local

```bash
npm run db:migrate:local     # aplica migraciones a la D1 local
npm run dev                  # Worker (8787) + Vite (5173) con proxy /api
```

Abra `http://127.0.0.1:5173`. En desarrollo el acceso usa un **bypass local**
(no requiere Zero Trust): se toma `ADMIN_EMAIL` de `.dev.vars`, o la cabecera
`X-Dev-Email`. Para simular otro usuario desde el navegador:

```js
localStorage.setItem('dev-email', 'oper@empresa.cl')  // recargar la página
```

> El usuario debe existir en `usuarios_app` (salvo el `ADMIN_EMAIL`, que se
> autoaprovisiona como `admin` en su primer acceso).

---

## Autenticación y siembra del administrador

El acceso se controla con **Cloudflare Access (Zero Trust)**: Access valida al
usuario en el edge e inyecta un JWT que el Worker verifica contra el JWKS del
equipo (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`), comprobando firma RS256, audiencia
y expiración (con caché de 1 hora).

**No hay contraseñas** en la aplicación: no se almacenan hashes ni se gestionan
restablecimientos. El rol (`admin` / `operador` / `consulta`) se administra en la
tabla `usuarios_app`.

**Siembra del administrador:** no se ejecuta ningún script. El correo definido en
`ADMIN_EMAIL` se promueve automáticamente a `admin` la primera vez que ingresa.
Desde ahí, ese administrador da de alta al resto de los usuarios y sus roles en
la pantalla *Usuarios del sistema*.

### Configuración de Access (producción)

En el panel de Cloudflare Zero Trust:

1. Cree una aplicación de tipo *Self-hosted* apuntando al dominio del Worker.
2. Defina la política de acceso (por ejemplo, correos del equipo autorizado).
3. Tome el **Application Audience (AUD) Tag** y el **team domain**
   (`https://<equipo>.cloudflareaccess.com`) y configúrelos como variables del
   Worker:

```bash
npx wrangler deploy   # publica con las vars de wrangler.jsonc
# o defínalas en el panel de Cloudflare: ACCESS_TEAM_DOMAIN, ACCESS_AUD, ADMIN_EMAIL
```

Con `ENTORNO=prod` y Access sin configurar, la API responde `401` (sin bypass).

---

## Roles y permisos

| Acción | admin | operador | consulta |
|---|:--:|:--:|:--:|
| Ver dashboard, licencias, histórico, reportes | ✅ | ✅ | ✅ |
| Crear / editar licencias | ✅ | ✅ | ❌ |
| Asignar / liberar licencias | ✅ | ✅ | ❌ |
| Sincronizar maestro de usuarios | ✅ | ✅ | ❌ |
| Dar de baja licencias | ✅ | ❌ | ❌ |
| Administrar usuarios del sistema | ✅ | ❌ | ❌ |

El backend valida el rol en **cada** endpoint; el frontend nunca decide permisos
por sí solo.

---

## Maestro de usuarios (`usuarios.xlsx`)

Solo los usuarios del maestro con `activo = 1` pueden recibir licencias. Hay dos
vías de sincronización, ambas con el mismo pipeline (parseo + *upsert*):

1. **Vía repositorio (fuente de verdad):** el archivo vive en
   `public/usuarios.xlsx` y se publica como asset en `/usuarios.xlsx`. El Worker
   lo lee con el binding `ASSETS`. Actualizarlo implica commit + redeploy. En la
   app: *Maestro de usuarios → Sincronizar desde repositorio*.
2. **Vía carga manual (operativa):** *Maestro de usuarios → Cargar archivo
   .xlsx*, sin necesidad de desplegar.

Encabezados esperados: `NOMBRE`, `EMAIL`, `AREA` (obligatorios); `CARGO`, `RUT`
(opcionales). La detección es tolerante (sin distinción de mayúsculas, tildes ni
espacios extra). Clave natural: `EMAIL` en minúsculas o, si no hay, `RUT`. Los
registros ausentes se marcan `activo = 0` (nunca se eliminan). Cada sincronización
registra en la bitácora el total leído, altas, actualizaciones y desactivaciones.

Para regenerar el `usuarios.xlsx` de ejemplo:

```bash
node scripts/generar-usuarios-ejemplo.mjs
```

---

## Respaldo y restauración de la base

```bash
# Respaldo completo (esquema + datos) a un archivo SQL
npx wrangler d1 export admin-licencias --remote --output respaldo.sql

# Restauración sobre una base existente
npx wrangler d1 execute admin-licencias --remote --file respaldo.sql
```

Para D1 local, use `--local` en vez de `--remote`.

---

## Despliegue (GitHub Actions → Cloudflare)

El workflow `.github/workflows/deploy.yml` valida typecheck + build en cada
push/PR y, en push a `main`, resuelve el `database_id`, aplica migraciones
remotas y publica el Worker.

Secrets del repositorio requeridos: `CLOUDFLARE_API_TOKEN` y
`CLOUDFLARE_ACCOUNT_ID`.

---

## Reglas de negocio (resumen)

- **Disponibles** = `cantidad_total` − asignaciones vigentes (siempre calculado).
- No se asigna sin disponibilidad; no se reduce `cantidad_total` bajo las
  vigentes; liberar no borra (cambia estado y exige motivo); las licencias solo
  se dan de baja lógicamente y sin asignaciones vigentes.
- Toda operación de escritura registra en `historial` dentro de la misma
  transacción (`db.batch()`): si falla la bitácora, falla la operación.
- La bitácora es de solo lectura desde la aplicación (sin `PUT`/`DELETE`).
