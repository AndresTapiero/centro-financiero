-- Movimientos con montos absurdos: casi siempre pesos guardados en una cuenta en dólares
-- (ej. 270.000 escrito en ARQ / Ontop / Lulo X → la app lo lee como 270.000 USD ≈ $972M).
-- Solo lectura. Córrelo en Supabase → SQL Editor. Para corregirlos usa el aviso rojo de la app
-- (botón «💱 Eran pesos»), que además ofrece arreglar el saldo de la cuenta.
select m.id, m.fecha, m.nombre, m.monto, m.moneda_override,
       a.label as cuenta, a.currency as moneda_cuenta
from fin_movimientos m
join fin_accounts a on a.id = m.account_id
where m.categoria <> '[Ajuste de saldo]'
  and (
    (coalesce(m.moneda_override, a.currency) = 'USD' and m.monto >= 10000)
    or (coalesce(m.moneda_override, a.currency) = 'COP' and m.monto >= 50000000)
  )
order by m.fecha desc;
