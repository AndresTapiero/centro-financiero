-- Limpia los títulos de movimientos de tipo suscripción que llevan el sufijo
-- redundante "(suscripción)" — ej. "Spotify (suscripción)" → "Spotify".
-- Aplica tanto a movimientos del mes actual como a todo el historial.

-- 1) PREVIEW — revisa qué filas se van a modificar antes de tocar nada
select
  id,
  fecha,
  nombre as titulo_actual,
  trim(regexp_replace(nombre, '\s*\(suscripci[oó]n\)\s*$', '', 'i')) as titulo_nuevo,
  categoria,
  monto
from fin_movimientos
where nombre ~* '\(suscripci[oó]n\)'
order by fecha desc;

-- 2) UPDATE — corre esto solo después de revisar el preview de arriba
update fin_movimientos
set nombre = trim(regexp_replace(nombre, '\s*\(suscripci[oó]n\)\s*$', '', 'i'))
where nombre ~* '\(suscripci[oó]n\)';

-- 3) Verificación — no debería devolver ninguna fila si todo quedó limpio
select id, fecha, nombre, categoria
from fin_movimientos
where nombre ~* '\(suscripci[oó]n\)';
