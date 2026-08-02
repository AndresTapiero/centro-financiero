# Centro Financiero

Tracker financiero personal — cuentas, movimientos, pendientes, presupuesto y metas — conectado a [Supabase](https://supabase.com) (Postgres + Auth) y publicado con GitHub Pages.

🔗 **App en vivo:** https://andrestapiero.github.io/centro-financiero/

## Stack

- **Frontend:** HTML + CSS + JavaScript vanilla (sin framework, sin build step)
- **Backend:** [Supabase](https://supabase.com) — Postgres con Row Level Security, Auth por correo/contraseña
- **Hosting:** GitHub Pages (estático, gratis)
- **Cliente:** [`@supabase/supabase-js`](https://github.com/supabase/supabase-js) v2, vía CDN

## Estructura de datos (Supabase)

Todas las tablas usan el prefijo `fin_` (para convivir con otros proyectos futuros en el mismo proyecto de Supabase) y tienen RLS activo — cada usuario solo ve sus propias filas:

| Tabla | Contenido |
|---|---|
| `fin_accounts` | Cuentas (líquidas, tarjetas de crédito, bolsillos de ahorro creados dinámicamente) |
| `fin_movimientos` | Ingresos y gastos |
| `fin_pendientes` | Pagos/cobros pendientes, incluidos los recurrentes mensuales |
| `fin_metas` | Metas de ahorro, por cuenta o acumuladas por categoría |
| `fin_presupuesto_topes` | Topes de presupuesto mensual por categoría |
| `fin_configuracion` | TRM (tasa de cambio) y lista de vehículos |

## Desarrollo local

No requiere instalación — es un solo archivo HTML. Para probarlo localmente:

```bash
open index.html
```

**Importante:** el preview de artifacts de Claude bloquea peticiones de red externas — para probar la conexión con Supabase, el archivo debe abrirse directamente en un navegador (no dentro del chat de Claude).

## Desplegar cambios

```bash
git add index.html
git commit -m "Descripción del cambio"
git push
```

GitHub Pages redespliega automáticamente en 1-2 minutos.

## Seguridad

- La `anon`/`publishable key` de Supabase está expuesta en el código a propósito — es segura por diseño, ya que el acceso real está controlado por Row Level Security en la base de datos, no por ocultar esta llave.
- La `service_role`/`secret key` **nunca** va en este repositorio — solo se usa desde scripts locales de migración, fuera de control de versiones.

## Historial

Migrado en agosto de 2026 desde un artifact de Claude (almacenamiento vía `window.storage`) a Supabase, para tener acceso confiable multi-dispositivo sin las limitaciones de la API de almacenamiento de artifacts.
