# Centro Financiero

Tracker financiero personal — cuentas, movimientos, pendientes, presupuesto y metas — conectado a [Supabase](https://supabase.com) (Postgres + Auth) y publicado con GitHub Pages.

🔗 **App en vivo:** https://andrestapiero.github.io/centro-financiero/

## Estructura del proyecto

```
centro-financiero/
├── index.html                      # Marcado HTML — sin lógica de negocio
├── css/                            # Estilos, un archivo por responsabilidad (ver abajo)
└── js/
    ├── constantes.js               # Categorías, colores, cuentas, datos semilla
    ├── filtros-busqueda.js         # Filtros de Movimientos + buscador de historial
    ├── modales.js                  # Modales de confirmación reutilizables
    ├── guardado-core.js            # Diagnóstico, reintentos de guardado
    ├── metas.js                    # Metas de ahorro, cuentas dinámicas
    ├── cuentas-carga.js            # Carga inicial de datos (loadData), siembra de recurrentes
    ├── balances-formato.js         # Ajustes de saldo, formato de moneda, saldo histórico
    ├── movimientos.js              # Registrar/editar/eliminar movimientos
    ├── movimiento-list-renderer.js # Clase MovimientoListRenderer (POO) — lista agrupada por fecha
    ├── pendiente-list-renderer.js  # Clase PendienteListRenderer (POO) — hermana de la anterior
    ├── pendientes-transferencias.js# CRUD de pendientes + transferencias entre cuentas
    ├── render-metricas.js          # render() principal, gráficos de Métricas
    ├── respaldo.js                 # Exportar respaldo, guardar y verificar
    ├── verificacion-sync.js        # Sincronización manual/automática
    ├── auth-arranque.js            # Cliente de Supabase, login, arranque de la app
    ├── offline-sync.js             # Cola de reintentos cuando no hay red
    └── swipe-delete.js             # Gesto de deslizar para eliminar en la lista de movimientos
```

El proyecto se modularizó a partir de un solo archivo HTML monolítico — cada archivo tiene una responsabilidad clara (principio de responsabilidad única, SRP). Se usan `<script>` normales (no ES modules) a propósito, para que los `onclick="..."` del HTML sigan funcionando sin fricción de scope.

### CSS modularizado (`css/`)

Igual que el JS, los estilos están separados por componente en vez de vivir en un solo archivo. Cada archivo se importa con su propio `<link>` en `index.html` (sin bundler, sin build step) y trae sus propios media queries junto a la regla base, no en un archivo de "responsive" aparte — así un cambio en un componente queda contenido en un solo archivo:

| Archivo | Contenido |
|---|---|
| `tokens.css` | Variables de diseño (`:root`, `:root.dark`) y reset base |
| `layout.css` | Contenedor de la app, barra superior, navegación de tabs |
| `hero.css` | Tarjeta de saldo/liquidez (lo primero que se ve) |
| `cards.css` | Tarjeta genérica `.card` y tarjetas de cuentas |
| `forms.css` | Inputs, selects y grillas de formularios |
| `buttons.css` | `.btn-add` y sus variantes de color (`.is-ghost`, `.is-danger-outline`, etc.), botones de fila |
| `entries-list.css` | Lista agrupada por fecha (compartida por Movimientos y Pendientes) |
| `presupuesto.css` | Filas de topes mensuales |
| `metricas.css` | Tarjetas de métricas, gráfico de torta, barras de deuda |

Para agregar una variante de botón o un nuevo tono no hace falta tocar las reglas existentes (abierto a extensión, cerrado a modificación) — se agrega una clase `.is-*` nueva en `buttons.css`.

## Stack

- **Frontend:** HTML + CSS + JavaScript vanilla, sin framework ni build step
- **Backend:** [Supabase](https://supabase.com) — Postgres con Row Level Security, Auth por correo/contraseña
- **Hosting:** GitHub Pages (estático, gratis)
- **Cliente:** [`@supabase/supabase-js`](https://github.com/supabase/supabase-js) v2, vía CDN

## Estructura de datos (Supabase)

Todas las tablas usan el prefijo `fin_` (para convivir con otros proyectos futuros en el mismo proyecto de Supabase, ej. un dashboard de inversiones) y tienen RLS activo — cada usuario solo ve sus propias filas:

| Tabla | Contenido |
|---|---|
| `fin_accounts` | Cuentas (líquidas, tarjetas de crédito, bolsillos de ahorro creados dinámicamente) |
| `fin_movimientos` | Ingresos y gastos |
| `fin_pendientes` | Pagos/cobros pendientes, incluidos los recurrentes mensuales |
| `fin_metas` | Metas de ahorro, por cuenta o acumuladas por categoría |
| `fin_presupuesto_topes` | Topes de presupuesto mensual por categoría |
| `fin_configuracion` | TRM (tasa de cambio), lista de vehículos, y `seeded_months` (checkpoint de recurrentes) |

`window.storage` (la API de almacenamiento de artifacts de Claude) **no se usa en ningún lugar del código** — toda la persistencia vive en Supabase.

## Desarrollo local

No requiere instalación — abre `index.html` directamente en un navegador:

```bash
open index.html
```

**Importante:** el preview de artifacts de Claude bloquea peticiones de red externas — para probar la conexión con Supabase, el archivo debe abrirse directamente en un navegador (no dentro del chat de Claude).

## Desplegar cambios

```bash
git add .
git commit -m "Descripción del cambio"
git push
```

`git add .` (no solo `index.html`) es importante ahora que el proyecto está modularizado en varios archivos — sube todo lo que cambió, en `js/`, `styles.css` o la raíz. GitHub Pages redespliega automáticamente en 1-2 minutos.

## Migración histórica de datos

`migrar.js` y `migrar-historico.js` (fuera de control de versiones, se corren localmente) importan datos desde una fuente externa a Supabase usando la `service_role key`. No se usan en producción — son scripts de un solo uso para la migración inicial y para importar historial de una app anterior.

## Seguridad

- La `anon`/`publishable key` de Supabase está expuesta en el código a propósito — es segura por diseño, ya que el acceso real está controlado por Row Level Security en la base de datos, no por ocultar esta llave.
- La `service_role`/`secret key` **nunca** va en este repositorio — solo se usa desde scripts locales de migración, fuera de control de versiones.

## Historial

- **Agosto 2026:** migrado desde un artifact de Claude (almacenamiento vía `window.storage`) a Supabase, para tener acceso confiable multi-dispositivo sin las limitaciones de la API de almacenamiento de artifacts.
- **Agosto 2026:** modularizado de un solo archivo HTML a la estructura actual de `js/` + `styles.css`, y rediseñado de modo oscuro a modo claro.
- **Agosto 2026:** `styles.css` (un solo archivo) dividido en `css/` por componente, siguiendo el mismo criterio de responsabilidad única que ya se usaba en `js/`.
