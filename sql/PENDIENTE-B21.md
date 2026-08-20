# Cifras personales incrustadas en el código (B21)

Estas viven fijas en el código y cambiarlas exige editar un archivo y desplegar:

| Cifra | Dónde |
|---|---|
| `DEBT_ORIGINAL` (pico de deuda por tarjeta) | `js/constantes.js` |
| `CREDIT_LIMITS` (cupo aprobado) | `js/constantes.js` |
| Meta del fondo de emergencia ($7.000.000) | `js/balances-formato.js`, `js/render-metricas.js` |
| Día 10 de vencimiento de tarjetas | `js/cuentas-carga.js` (`updateDueDates`) |
| `LOW_BALANCE_THRESHOLD` | `js/cuentas-carga.js` |
| `RECURRENTES` (pendientes automáticos del mes) | `js/filtros-busqueda.js` |

## Por qué NO se movieron todavía

Llevarlas a `fin_configuracion` requiere columnas nuevas en Supabase. Como el
esquema no está versionado (ver README.md), escribir código que lea columnas que
quizá no existen rompería la app en producción sin forma de comprobarlo antes.

## Orden correcto

1. Resolver B23 (versionar el esquema).
2. Añadir las columnas a `fin_configuracion` con valores por defecto iguales a los
   de hoy, para que nada cambie al desplegar.
3. Leerlas en `loadData()` con respaldo a las constantes actuales.
