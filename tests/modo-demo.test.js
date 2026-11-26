// Tests: modo demo (fechas dentro del ciclo, respuestas de escritura falsas, guardias)
// node tests/modo-demo.test.js
import { cargarFuente } from './helpers/cargar-fuente.js';
const src = cargarFuente([
  'js/constantes.js','js/modales.js','js/movimientos.js','js/cuentas-carga.js','js/metas.js',
  'js/balances-formato.js','js/filtros-busqueda.js','js/movimiento-list-renderer.js','js/pendiente-list-renderer.js',
  'js/render-metricas.js','js/pendientes-transferencias.js','js/verificacion-sync.js','js/demo-mode.js',
]);
const ev = c => src.__eval(c);
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); console.log(`  ✓ ${name}`); passed++; } catch(e) { console.log(`  ✗ ${name}\n    → ${e.message}`); failed++; } }
function assert(a, b) { if(a!==b) throw new Error(`esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)}`); }
src.__fijarTmp = Headers; ev('globalThis.Headers = globalThis.__fijarTmp');
const resp = (method, headers, body) => src.respuestaEscrituraDemo(method, { headers, body });

console.log('\nrespuestaEscrituraDemo (misma forma que la real):');
test('DELETE y escrituras sin .select() devuelven 204 sin cuerpo', () => {
  assert(resp('DELETE', {}).status, 204);
  const r = resp('POST', {}, JSON.stringify({ nombre: 'x' })); assert(r.status, 204); assert(r.body, null);
});
test('insert con .select() devuelve un ARREGLO con una fila por registro y un id', () => {
  const r = resp('POST', { Prefer: 'return=representation' }, JSON.stringify([{ nombre: 'a' }, { nombre: 'b' }]));
  const filas = JSON.parse(r.body);
  assert(Array.isArray(filas), true); assert(filas.length, 2); assert(filas[0].nombre, 'a'); assert(!!filas[1].id, true);
});
test('con .single() devuelve un objeto', () => {
  const r = resp('POST', { Prefer: 'return=representation', Accept: 'application/vnd.pgrst.object+json' }, JSON.stringify({ nombre: 'a' }));
  assert(Array.isArray(JSON.parse(r.body)), false); assert(JSON.parse(r.body).nombre, 'a');
});
test('update con .select() devuelve al menos una fila (no parece bloqueado por RLS)', () => {
  const r = resp('PATCH', { Prefer: 'return=representation' }, JSON.stringify({ monto_objetivo: 5 }));
  assert(JSON.parse(r.body).length >= 1, true);
});

console.log('\nfechas del demo:');
test('los movimientos del demo caen todos en el ciclo ACTUAL', () => {
  const ciclo = ev('cicloActual()');
  const fechas = ev('_DEMO_ENTRIES_RAW.map(e => fechaDemoAtras(e.atras))');
  assert(fechas.every(f => ev(`cicloDe('${f}')`) === ciclo), true);
});
test('ninguna fecha de movimiento es futura', () => {
  const hoy = ev('todayStr()');
  assert(ev('_DEMO_ENTRIES_RAW.map(e => fechaDemoAtras(e.atras))').every(f => f <= hoy), true);
});
test('los pendientes quedan dentro del ciclo actual', () => {
  const ciclo = ev('cicloActual()');
  assert([-2, 3, 6, 9, 40].every(d => ev(`cicloDe(fechaDemoDentroDe(${d}))`) === ciclo), true);
});

console.log('\nactivar con cuentas propias:');
test('las cuentas creadas por el usuario no quedan sin saldo (sería $NaN)', () => {
  ev(`ACCOUNTS_META.bolsillo = {label:'Bolsillo',currency:'COP',type:'debito'}`);
  ev(`document.getElementById = () => ({ style:{}, dataset:{}, classList:{add(){},remove(){},toggle(){}}, value:'', textContent:'', innerHTML:'', querySelector(){return null}, querySelectorAll(){return []}, options:[], appendChild(){}, addEventListener(){} })`);
  ['fillAccountInputs','populateMonthSelector','render','renderPendientes','renderGoals','switchTab','limpiarFiltros'].forEach(f => ev(`globalThis.${f} = function(){}`));
  ev('activarModoDemo()');
  assert(ev('accounts.bolsillo'), 0);
  assert(ev('currentMonth'), ev('cicloActual()'));
  assert(ev('goals[0].deadline') > ev('todayStr()'), true);
});
test('en demo syncNow no recarga los datos reales', async () => {
  ev('lastSyncAttempt = 0');
  ev('globalThis.__llamo = false; globalThis.sb = { from(){ globalThis.__llamo = true; return {}; } }');
  await src.syncNow();
  assert(ev('globalThis.__llamo'), false);
});
console.log(`\n${passed} pasaron, ${failed} fallaron`);
process.exit(failed ? 1 : 0);
