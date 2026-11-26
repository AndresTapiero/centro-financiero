// Tests: resumen de todas las metas
// node tests/resumen-metas.test.js
import { cargarFuente } from './helpers/cargar-fuente.js';
const src = cargarFuente([
  'js/constantes.js','js/modales.js','js/movimientos.js','js/cuentas-carga.js','js/metas.js',
  'js/balances-formato.js','js/filtros-busqueda.js','js/movimiento-list-renderer.js','js/pendiente-list-renderer.js',
  'js/render-metricas.js','js/pendientes-transferencias.js',
]);
const ev = c => src.__eval(c);
const set = (n, v) => { src.__fijarTmp = v; ev(`${n} = globalThis.__fijarTmp`); };
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); console.log(`  ✓ ${name}`); passed++; } catch(e) { console.log(`  ✗ ${name}\n    → ${e.message}`); failed++; } }
function assert(a, b) { if(a!==b) throw new Error(`esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)}`); }

set('accounts', { nequi:0, debito:0, nu:5000000, lulo:1200000, arq:100, ontop:0, trm:4000, davtc:0, rappitc:0 });
const metas = [
  { id:'a', name:'Emergencia', type:'cuenta', acc:'nu', target:7000000 },
  { id:'b', name:'Vivienda', type:'cuenta', acc:'lulo', target:30000000 },
  { id:'c', name:'Bolsillo', type:'cuenta', acc:'nequi', target:0 },
];
console.log('\ncalcularResumenMetas:');
test('suma objetivos y lo ahorrado solo en metas con objetivo', () => {
  const r = src.calcularResumenMetas(metas);
  assert(r.totalObjetivo, 37000000); assert(r.ahorradoEnObjetivo, 6200000);
  assert(r.pct, 17); assert(r.faltaTotal, 30800000);
  assert(r.conObjetivo, 2); assert(r.sinObjetivo, 1);
});
test('la más cercana a cumplirse es la de mayor avance', () => assert(src.calcularResumenMetas(metas).masCerca.g.name, 'Emergencia'));
test('una meta pasada de su objetivo no tapa lo que falta en otra', () => {
  set('accounts', { nequi:0, debito:0, nu:20000000, lulo:1200000, arq:0, ontop:0, trm:4000, davtc:0, rappitc:0 });
  const r = src.calcularResumenMetas(metas);
  assert(r.ahorradoEnObjetivo, 8200000); // 7.000.000 (tope) + 1.200.000
  assert(r.cumplidas, 1); assert(r.enCurso, 1);
});
test('cuenta en dólares se convierte con la TRM', () => {
  set('accounts', { nequi:0, debito:0, nu:0, lulo:0, arq:500, ontop:0, trm:4000, davtc:0, rappitc:0 });
  const d = src.datosMeta({ id:'x', name:'USD', type:'cuenta', acc:'arq', target:4000000 });
  assert(d.actualCOP, 2000000); assert(d.pct, 50);
});
test('todas cumplidas', () => {
  set('accounts', { nequi:0, debito:0, nu:7000000, lulo:30000000, arq:0, ontop:0, trm:4000, davtc:0, rappitc:0 });
  const r = src.calcularResumenMetas(metas);
  assert(r.cumplidas, 2); assert(r.pct, 100); assert(r.masCerca, null);
});
test('sin metas', () => assert(src.calcularResumenMetas([]).total, 0));
console.log('\nfecha límite y consejo de aporte:');
set('accounts', { nequi:0, debito:0, nu:0, lulo:2000000, arq:0, ontop:0, trm:4000, davtc:0, rappitc:0 });
set('entries', []);
const meta = (extra = {}) => ({ id:'v', name:'Vivienda', type:'cuenta', acc:'lulo', target:10000000, deadline:'2027-06-30', ...extra });
test('ciclosHasta cuenta el ciclo actual y el de la fecha límite', () => {
  assert(src.ciclosHasta('2026-12-20', '2026-12-10'), 1);   // mismo ciclo
  assert(src.ciclosHasta('2027-01-20', '2026-12-10'), 2);
  assert(src.ciclosHasta('2027-06-30', '2026-12-10'), 8);   // el 30 de junio ya cae en el ciclo de julio
  assert(src.ciclosHasta('2026-11-01', '2026-12-10') < 1, true);
});
test('reparte lo que falta entre los ciclos que quedan', () => {
  const c = src.consejoMeta(meta(), '2026-12-10');
  assert(c.tipo, 'plan'); assert(c.ciclos, 8);
  assert(c.cuota, 1000000);          // faltan 8.000.000 / 8 ciclos
  assert(c.porAportar, 1000000); assert(c.alDia, false);
});
test('lo aportado este ciclo cuenta para la cuota y no se pide dos veces', () => {
  set('entries', [{ id:1, date:'2026-12-05', name:'Transferencia', amount:400000, cat:'Transferencia', acc:'lulo', txType:'ingreso' }]);
  set('accounts', { nequi:0, debito:0, nu:0, lulo:2400000, arq:0, ontop:0, trm:4000, davtc:0, rappitc:0 });
  const c = src.consejoMeta(meta(), '2026-12-10');
  assert(c.aportado, 400000); assert(c.cuota, 1000000); assert(c.porAportar, 600000);
});
test('cuota cubierta cuando ya aportaste lo que toca', () => {
  set('entries', [{ id:1, date:'2026-12-05', name:'Transferencia', amount:1500000, cat:'Transferencia', acc:'lulo', txType:'ingreso' }]);
  set('accounts', { nequi:0, debito:0, nu:0, lulo:3500000, arq:0, ontop:0, trm:4000, davtc:0, rappitc:0 });
  assert(src.consejoMeta(meta(), '2026-12-10').alDia, true);
});
test('un ajuste de saldo no cuenta como aporte', () => {
  set('entries', [{ id:1, date:'2026-12-05', name:'Ajuste', amount:900000, cat:'[Ajuste de saldo]', acc:'lulo', txType:'ingreso' }]);
  assert(src.consejoMeta(meta(), '2026-12-10').aportado, 0);
});
test('fecha vencida sin cumplir avisa; cumplida no pide nada; sin fecha no hay consejo', () => {
  set('entries', []); set('accounts', { nequi:0, debito:0, nu:0, lulo:2000000, arq:0, ontop:0, trm:4000, davtc:0, rappitc:0 });
  assert(src.consejoMeta(meta({ deadline:'2026-11-01' }), '2026-12-10').tipo, 'vencida');
  set('accounts', { nequi:0, debito:0, nu:0, lulo:12000000, arq:0, ontop:0, trm:4000, davtc:0, rappitc:0 });
  assert(src.consejoMeta(meta(), '2026-12-10').tipo, 'cumplida');
  assert(src.consejoMeta(meta({ deadline:null }), '2026-12-10'), null);
});
test('el resumen suma lo que conviene aportar en todas las metas con fecha', () => {
  set('accounts', { nequi:0, debito:0, nu:5000000, lulo:2000000, arq:0, ontop:0, trm:4000, davtc:0, rappitc:0 });
  set('goals', [meta(), { id:'e', name:'Emergencia', type:'cuenta', acc:'nu', target:7000000, deadline:'2027-02-10' }]);
  const r = src.resumenPlanes(ev('goals'));
  assert(r.conFecha, 2);
});

console.log(`\n${passed} pasaron, ${failed} fallaron`);
process.exit(failed ? 1 : 0);
