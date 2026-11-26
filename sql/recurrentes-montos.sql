-- Montos ajustados para los pagos que se repiten cada ciclo (pago mínimo de tarjetas, arriendo, etc.)
-- Ejecutar una sola vez en Supabase → SQL Editor. Es seguro repetirlo.
--
-- Guarda {"Pago Rappi Card": 1650000, ...}. Cuando llega el ciclo nuevo, la app crea el pendiente
-- con este monto en vez del valor fijo de fábrica.
-- No toca RLS: la tabla fin_configuracion ya tiene su política por user_id.

alter table public.fin_configuracion
  add column if not exists recurrentes jsonb not null default '{}'::jsonb;
