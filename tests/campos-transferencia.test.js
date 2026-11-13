// Tests: miles en los campos de transferencia y selección de origen/destino
// node tests/campos-transferencia.test.js

import { cargarFuente } from './helpers/cargar-fuente.js';

const src = cargarFuente([
  'js/constantes.js','js/modales.js','js/movimientos.js','js/cuentas-carga.js','js/metas.js',
  'js/balances-formato.js','js/filtros-busqueda.js',
  'js/movimiento-list-renderer.js','js/pendiente-list-renderer.js',
  'js/render-metricas.js','js/pendientes-transferencias.js',
]);
const { formatearCampoTransferencia, leerCampoTransferencia, textoCampoTransferencia } = src;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch(e) { console.log(`  ✗ ${name}\n    → ${e.message}`); failed++; }
}
function assert(a, b) { if(a!==b) throw new Error(`esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)}`); }
const campo = (v, dec) => { const el = { value: v, dataset: { decimales: dec ? '1' : '0' } }; formatearCampoTransferencia(el); return el.value; };

console.log('\nformato de campos:');
test('pesos: pone puntos cada 3 dígitos', () => assert(campo('1234567'), '1.234.567'));
test('pesos: ignora letras y decimales', () => assert(campo('12ab345,5'), '12.345'));
test('dólares: miles y coma decimal', () => assert(campo('1234,5', true), '1.234,5'));
test('dólares: máximo 2 decimales', () => assert(campo('10,999', true), '10,99'));
test('dólares: escribir la coma sola no pierde el entero', () => assert(campo('1000,', true), '1.000,'));
test('dólares: un punto decimal escrito a mano se entiende', () => assert(campo('12.5', true), '12,5'));
test('reformatear un valor ya formateado no lo daña', () => assert(campo('1.234.567'), '1.234.567'));
test('leer: ida y vuelta', () => {
  assert(leerCampoTransferencia('1.234,56'), 1234.56);
  assert(leerCampoTransferencia('1.000.000'), 1000000);
  assert(leerCampoTransferencia('100'), 100);
  assert(Number.isNaN(leerCampoTransferencia('')), true);
});
test('la TRM se muestra con miles', () => assert(textoCampoTransferencia(3596.5, true), '3.596,5'));

console.log('\norigen / destino:');
function selects(origen, destino) {
  const mk = (val, vals) => ({ value: val, options: vals.map(v => ({ value: v, disabled: false })) });
  const vals = ['debito','nequi','nu','arq'];
  const o = mk(origen, vals), d = mk(destino, vals);
  src.__fijarTmp = { o, d };
  src.__eval(`globalThis.document = { getElementById: id => id==='tr-origen' ? globalThis.__fijarTmp.o : id==='tr-destino' ? globalThis.__fijarTmp.d : { style:{}, dataset:{}, value:'', placeholder:'', textContent:'' } }`);
  src.onTransferAccChange();
  return { o, d };
}
test('el origen se puede cambiar a la cuenta que está de destino (nada deshabilitado en origen)', () => {
  const { o } = selects('debito', 'nequi');
  assert(o.options.every(x => !x.disabled), true);
});
test('el destino deshabilita solo la cuenta de origen', () => {
  const { d } = selects('debito', 'nequi');
  assert(d.options.filter(x => x.disabled).map(x => x.value).join(), 'debito');
});
test('si el origen pasa a ser el destino, el destino se mueve solo', () => {
  const { d } = selects('nequi', 'nequi');
  assert(d.value !== 'nequi', true);
});

console.log(`\n${passed} pasaron, ${failed} fallaron`);
process.exit(failed ? 1 : 0);
