// Tests: abono a capital de una tarjeta de crédito
// node tests/abono-capital.test.js

import { cargarFuente } from './helpers/cargar-fuente.js';

const src = cargarFuente([
  'js/constantes.js','js/modales.js','js/movimientos.js','js/cuentas-carga.js','js/metas.js',
  'js/balances-formato.js','js/filtros-busqueda.js',
  'js/movimiento-list-renderer.js','js/pendiente-list-renderer.js',
  'js/render-metricas.js','js/pendientes-transferencias.js',
]);
const ev = c => src.__eval(c);
const set = (n, v) => { src.__fijarTmp = v; ev(`${n} = globalThis.__fijarTmp`); };
const { calcularAbono, estadoPagoMinimo, tarjetaDePago } = src;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch(e) { console.log(`  ✗ ${name}\n    → ${e.message}`); failed++; }
}
function assert(a, b, msg) {
  if(a!==b) throw new Error(`${msg||''}: esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)}`);
}

set('accounts', { davtc: 3000000, rappitc: 0, debito: 5000000, arq: 100, trm: 4000 });

console.log('\ncalcularAbono:');
test('abono válido deja la deuda restada', () => {
  const c = calcularAbono({tarjeta:'davtc',origen:'debito',monto:1000000});
  assert(c.error, null); assert(c.deudaNueva, 2000000);
});
test('pagar toda la deuda es válido', () =>
  assert(calcularAbono({tarjeta:'davtc',origen:'debito',monto:3000000}).deudaNueva, 0));
test('abonar más que la deuda da error', () =>
  assert(calcularAbono({tarjeta:'davtc',origen:'debito',monto:3000001}).error, 'excede'));
test('monto 0 o vacío da error', () => {
  assert(calcularAbono({tarjeta:'davtc',origen:'debito',monto:0}).error, 'monto');
  assert(calcularAbono({tarjeta:'davtc',origen:'debito',monto:NaN}).error, 'monto');
});
test('tarjeta sin deuda da error', () =>
  assert(calcularAbono({tarjeta:'rappitc',origen:'debito',monto:1000}).error, 'sinDeuda'));
test('no se puede abonar a una cuenta que no es tarjeta', () =>
  assert(calcularAbono({tarjeta:'debito',origen:'nequi',monto:1000}).error, 'tarjeta'));
test('el origen no puede ser otra tarjeta ni una cuenta en dólares', () => {
  assert(calcularAbono({tarjeta:'davtc',origen:'rappitc',monto:1000}).error, 'origen');
  assert(calcularAbono({tarjeta:'davtc',origen:'arq',monto:1000}).error, 'origen');
});

console.log('\nestadoPagoMinimo (el abono solo se habilita después del pago mínimo):');
const hoy = () => src.__eval('todayStr()');
const pago = (name, extra={}) => ({ id: Math.random(), date: hoy(), name, amount: 785246, cat: 'Pago Deuda', acc: 'debito', txType: 'gasto', ...extra });
test('tarjetaDePago reconoce la tarjeta por el nombre', () => {
  assert(tarjetaDePago('Pago mínimo Davivienda TC'), 'davtc');
  assert(tarjetaDePago('Pago Rappi Card'), 'rappitc');
  assert(tarjetaDePago('Netflix'), null);
});
test('sin ningún pago en el ciclo: no está hecho', () => {
  set('entries', []); set('pendientes', []);
  assert(estadoPagoMinimo('davtc').hecho, false);
});
test('con el pago mínimo registrado: habilitado', () => {
  set('entries', [pago('Pago mínimo Davivienda TC')]); set('pendientes', []);
  assert(estadoPagoMinimo('davtc').hecho, true);
});
test('el pago de una tarjeta no habilita la otra', () => {
  set('entries', [pago('Pago mínimo Davivienda TC')]); set('pendientes', []);
  assert(estadoPagoMinimo('rappitc').hecho, false);
});
test('un abono previo no cuenta como pago mínimo', () => {
  set('entries', [pago('Abono a capital Davivienda TC')]); set('pendientes', []);
  assert(estadoPagoMinimo('davtc').hecho, false);
});
test('si el pendiente del pago sigue ahí, todavía no está hecho', () => {
  set('entries', [pago('Pago mínimo Davivienda TC')]);
  set('pendientes', [{ id: 1, name: 'Pago mínimo Davivienda TC', amount: 785246, cat: 'Pago Deuda', acc: 'debito', isIncome: false }]);
  const e = estadoPagoMinimo('davtc');
  assert(e.hecho, false); assert(e.pendienteSinPagar.name, 'Pago mínimo Davivienda TC');
});
test('un pago de otro ciclo no cuenta', () => {
  set('entries', [pago('Pago mínimo Davivienda TC', { date: '2020-01-10' })]); set('pendientes', []);
  assert(estadoPagoMinimo('davtc').hecho, false);
});
test('un pago registrado directamente sobre la tarjeta también cuenta', () => {
  set('entries', [pago('Pago TC', { acc: 'davtc' })]); set('pendientes', []);
  assert(estadoPagoMinimo('davtc').hecho, true);
});

console.log(`\n${passed} pasaron, ${failed} fallaron`);
process.exit(failed ? 1 : 0);
