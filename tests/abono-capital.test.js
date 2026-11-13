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
const { calcularAbono } = src;

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

console.log(`\n${passed} pasaron, ${failed} fallaron`);
process.exit(failed ? 1 : 0);
