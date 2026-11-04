-- ════════════════════════════════════════════════════════════════════════════
-- Corrige los movimientos en PESOS que quedaron guardados como DÓLARES
-- (ej. 270.000 escrito en ARQ / Ontop / Lulo X → la app lo leía como 270.000 USD
-- ≈ $972M). Eso inflaba los gastos del ciclo, la tasa de ahorro y el patrimonio
-- histórico de los meses anteriores.
--
-- Cómo usarlo (Supabase → SQL Editor):
--   0. CIERRA la app en todos tus dispositivos (si queda abierta puede volver a
--      guardar los saldos viejos encima).
--   1. Corre el PASO 1 (solo lee). Revisa la lista y el resumen por cuenta.
--   2. Corre el PASO 2 completo (desde «begin» hasta «commit»). Hace respaldo,
--      corrige y al final te muestra qué hizo en cada cuenta.
--   3. Abre la app y recarga.
--
-- Si algo no te convence, el PASO 3 (al final) restaura todo desde el respaldo.
-- ════════════════════════════════════════════════════════════════════════════


-- ─── PASO 1 · Diagnóstico (solo lectura) ─────────────────────────────────────

-- 1a. Movimientos y ajustes de monto absurdo en cuentas en dólares
with yo  as (select id from auth.users where email = 'andrestapiero72@gmail.com'),
     trm as (select trm from fin_configuracion where user_id = (select id from yo))
select m.fecha, a.label as cuenta, m.nombre, m.categoria, m.tx_type,
       m.monto as monto_usd_guardado,
       round(m.monto * (select trm from trm)) as asi_se_contaba_en_cop,
       case when m.categoria = '[Ajuste de saldo]' then 'ajuste de saldo'
            else 'movimiento → se marcará como pesos' end as que_es
from fin_movimientos m
join fin_accounts a on a.id = m.account_id
where m.user_id = (select id from yo)
  and a.currency = 'USD'
  and coalesce(m.moneda_override, a.currency) = 'USD'
  and m.monto >= 10000
order by a.label, m.fecha;

-- 1b. Resumen por cuenta: qué va a hacer el PASO 2 con cada una
--   error_usd   = cuánto se le descontó de más al saldo por los pesos tomados como dólares
--   ajustes_usd = cuánto subiste el saldo con ajustes manuales grandes (≥ 10.000 USD)
--   Si los dos casi coinciden, ya habías arreglado el saldo a mano: el saldo de hoy está
--   bien y lo que sobra son esos ajustes (que descuadran el historial). Si no hubo ajustes,
--   el saldo de hoy está corrido y hay que devolverle el error.
with yo  as (select id from auth.users where email = 'andrestapiero72@gmail.com'),
     trm as (select trm from fin_configuracion where user_id = (select id from yo)),
     base as (
       select a.id as account_id, a.label, a.balance, m.categoria, m.tx_type, m.monto
       from fin_movimientos m join fin_accounts a on a.id = m.account_id
       where m.user_id = (select id from yo) and a.currency = 'USD'
         and coalesce(m.moneda_override, a.currency) = 'USD' and m.monto >= 10000),
     resumen as (
       select account_id, label, balance,
              round(sum(case when categoria <> '[Ajuste de saldo]'
                    then (case when tx_type = 'gasto' then 1 else -1 end) * (monto - monto / (select trm from trm))
                    else 0 end), 2) as error_usd,
              round(sum(case when categoria = '[Ajuste de saldo]'
                    then (case when tx_type = 'ingreso' then 1 else -1 end) * monto
                    else 0 end), 2) as ajustes_usd
       from base group by account_id, label, balance)
select label as cuenta, balance as saldo_hoy_usd, error_usd, ajustes_usd,
       case when error_usd = 0 then 'solo ajustes raros → revisar a mano'
            when ajustes_usd = 0 then 'devolver el error al saldo'
            when abs(ajustes_usd - error_usd) <= abs(error_usd) * 0.10 then 'saldo ya corregido a mano → borrar esos ajustes'
            else 'mixto → no se toca, revisar a mano' end as accion
from resumen order by label;

-- 1c. (Aparte) Movimientos en PESOS de 50 millones o más: no se tocan aquí; si alguno
--     está mal, corrígelo desde la app (aviso rojo → «✏️ Revisar»).
with yo as (select id from auth.users where email = 'andrestapiero72@gmail.com')
select m.fecha, a.label as cuenta, m.nombre, m.categoria, m.monto
from fin_movimientos m join fin_accounts a on a.id = m.account_id
where m.user_id = (select id from yo) and m.categoria <> '[Ajuste de saldo]'
  and coalesce(m.moneda_override, a.currency) = 'COP' and m.monto >= 50000000
order by m.fecha;


-- ─── PASO 2 · Corrección (córrelo completo, de begin a commit) ───────────────
begin;

-- Respaldo de las dos tablas antes de tocar nada. Con RLS activo y sin políticas, nadie
-- puede leerlas desde la app ni con la clave pública: solo tú, desde este editor.
create table if not exists respaldo_fin_movimientos_montos as select * from fin_movimientos;
create table if not exists respaldo_fin_accounts_montos    as select * from fin_accounts;
alter table respaldo_fin_movimientos_montos enable row level security;
alter table respaldo_fin_accounts_montos    enable row level security;

create temp table _sosp on commit drop as
  select m.id, m.account_id, m.categoria, m.tx_type, m.monto
  from fin_movimientos m join fin_accounts a on a.id = m.account_id
  where m.user_id = (select id from auth.users where email = 'andrestapiero72@gmail.com')
    and a.currency = 'USD'
    and coalesce(m.moneda_override, a.currency) = 'USD'
    and m.monto >= 10000;

create temp table _cuentas on commit drop as
  with trm as (select trm from fin_configuracion
               where user_id = (select id from auth.users where email = 'andrestapiero72@gmail.com')),
  r as (
    select account_id,
           round(sum(case when categoria <> '[Ajuste de saldo]'
                 then (case when tx_type = 'gasto' then 1 else -1 end) * (monto - monto / (select trm from trm))
                 else 0 end), 2) as error_usd,
           round(sum(case when categoria = '[Ajuste de saldo]'
                 then (case when tx_type = 'ingreso' then 1 else -1 end) * monto
                 else 0 end), 2) as ajustes_usd
    from _sosp group by account_id)
  select r.*,
         case when error_usd = 0 then 'revisar'
              when ajustes_usd = 0 then 'devolver_error'
              when abs(ajustes_usd - error_usd) <= abs(error_usd) * 0.10 then 'borrar_ajustes'
              else 'revisar' end as accion
  from r;

-- a) Los movimientos pasan a pesos (en las cuentas que no quedaron para revisar a mano)
update fin_movimientos set moneda_override = 'COP'
where id in (select s.id from _sosp s join _cuentas c using (account_id)
             where s.categoria <> '[Ajuste de saldo]' and c.accion <> 'revisar');

-- b) Saldo ya arreglado a mano: sobran los ajustes que compensaban el error
delete from fin_movimientos
where id in (select s.id from _sosp s join _cuentas c using (account_id)
             where s.categoria = '[Ajuste de saldo]' and c.accion = 'borrar_ajustes');

-- c) Saldo nunca arreglado: se le devuelve lo que se descontó de más
update fin_accounts a set balance = round((a.balance + c.error_usd)::numeric, 2)
from _cuentas c
where a.id = c.account_id and c.accion = 'devolver_error';

-- Qué se hizo en cada cuenta
select a.label as cuenta, c.error_usd, c.ajustes_usd, c.accion,
       a.balance as saldo_final_usd
from _cuentas c join fin_accounts a on a.id = c.account_id
order by a.label;

commit;


-- ─── PASO 3 · Solo si quieres DESHACER el paso 2 ─────────────────────────────
-- begin;
-- delete from fin_movimientos where user_id = (select id from auth.users where email = 'andrestapiero72@gmail.com');
-- insert into fin_movimientos select * from respaldo_fin_movimientos_montos
--   where user_id = (select id from auth.users where email = 'andrestapiero72@gmail.com');
-- update fin_accounts a set balance = r.balance from respaldo_fin_accounts_montos r where r.id = a.id;
-- commit;
--
-- Cuando confirmes que todo quedó bien, puedes borrar los respaldos:
-- drop table respaldo_fin_movimientos_montos; drop table respaldo_fin_accounts_montos;
