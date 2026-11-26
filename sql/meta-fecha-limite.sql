-- Fecha límite de las metas de ahorro.
-- Ejecutar una sola vez en Supabase → SQL Editor. Es seguro repetirlo.
--
-- Con la fecha, la app calcula cuánto conviene aportar a la meta en cada ciclo de pago.
-- No toca RLS: fin_metas ya tiene su política por user_id.

alter table public.fin_metas
  add column if not exists fecha_objetivo date;
