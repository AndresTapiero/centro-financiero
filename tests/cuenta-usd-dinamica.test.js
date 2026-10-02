// Tests: una cuenta creada por el usuario en dólares ("Lulo X") participa en TODA la lógica
// node tests/cuenta-usd-dinamica.test.js

import { cargarFuente } from './helpers/cargar-fuente.js';

const src = cargarFuente([
  'js/constantes.js','js/movimientos.js','js/cuentas-carga.js','js/metas.js',
  'js/balances-formato.js','js/filtros-busqueda.js','js/render-metricas.js',
]);
const ev = c => src.__eval(c);
const set = (n, v) => { src.__fijarTmp = v; ev(`${n} = globalThis.__fijarTmp`); };
const { cuentasDeAhorro, cuentasDeGastoDiario, apartadoAAhorro, calcularSaldoDisponible,
        calcularLiquidezTotal, calcularPatrimonioMes, esIngresoReal, esGastoReal, cicloDe } = src;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch(e) { console.log(`  ✗ ${name}\n    → ${e.message}`); failed++; }
}
function assert(a, b, msg) {
  if(Math.abs(a-b) > 0.01) throw new Error(`${msg||''}: esperado ${b}, obtenido ${a}`);
}
function ok(c, m) { if(!c) throw new Error(m||'falló'); }

const K = 'acc_lulo_x_ab12';
const montar = (movs, saldoLuloX) => {
  ev(`ACCOUNTS_META['${K}']={label:'Lulo X',currency:'USD',type:'debito'}`);
  set('dynamicAccounts', {[K]:{label:'Lulo X',currency:'USD'}});
  set('goals', []); set('pendientes', []);
  set('accounts', {nequi:500000,debito:2000000,nu:0,lulo:0,arq:0,ontop:0,trm:4000,davtc:0,rappitc:0,[K]:saldoLuloX});
  set('entries', movs);
};

console.log('\nLulo X (USD) frente a la lógica de ahorro/disponible:');

test('cuenta como ahorro, no como gasto diario', () => {
  montar([], 0);
  ok(cuentasDeAhorro().has(K));
  ok(!cuentasDeGastoDiario().includes(K));
});
test('su saldo NO entra en el disponible para gastar', () => {
  montar([], 100);
  assert(calcularSaldoDisponible(), 2500000, 'solo Nequi + Davivienda');
});
test('su saldo SÍ entra en el patrimonio, convertido con la TRM', () => {
  montar([], 100);
  assert(calcularLiquidezTotal(), 2500000 + 100*4000);
});

console.log('\nUn ingreso directo a Lulo X:');

const INGRESO = {id:'i1',date:'2026-10-02',name:'Depósito',amount:150,cat:'Ingreso · Otro',acc:K,txType:'ingreso'};
test('cuenta como ingreso del ciclo (convertido a COP)', () => {
  montar([INGRESO], 150);
  const ing = src.__eval('entries').filter(e=>esIngresoReal(e)).reduce((s,e)=>s+src.entryCOP(e),0);
  assert(ing, 150*4000);
});
test('se contabiliza como apartado a ahorro, no como plata para gastar', () => {
  montar([INGRESO], 150);
  assert(apartadoAAhorro(cicloDe('2026-10-02')), 150*4000);
});
test('el desglose cuadra: Ingresos − Gastos − Apartado = Disponible', () => {
  const salario = {id:'s',date:'2026-10-01',name:'Salario',amount:1000000,cat:'Ingreso · Salario',acc:'debito',txType:'ingreso'};
  montar([salario, INGRESO], 150);
  set('accounts', {nequi:500000,debito:3000000,nu:0,lulo:0,arq:0,ontop:0,trm:4000,davtc:0,rappitc:0,[K]:150});
  const c = cicloDe('2026-10-02');
  const e = src.__eval('entries').filter(x=>cicloDe(x.date)===c);
  const ing = e.filter(esIngresoReal).reduce((s,x)=>s+src.entryCOP(x),0);
  const gas = e.filter(esGastoReal).reduce((s,x)=>s+src.entryCOP(x),0);
  // el salario entró a una cuenta de gasto: el disponible sube solo por él; lo de Lulo X queda apartado
  assert(ing - gas - apartadoAAhorro(c), 1000000);
});

console.log('\nPatrimonio histórico (antes ignoraba las cuentas nuevas):');

test('el dinero de Lulo X aparece en el patrimonio de un mes pasado', () => {
  montar([], 100);
  const p = calcularPatrimonioMes('2020-01');
  ok(p, 'debería reconstruir un mes pasado');
  assert(p.liquido, 2500000 + 100*4000);
});
test('si el ingreso fue DESPUÉS de ese mes, se deshace en la reconstrucción', () => {
  montar([{...INGRESO, date:'2026-10-02'}], 150);
  const p = calcularPatrimonioMes('2026-08');
  assert(p.liquido, 2500000, 'en agosto Lulo X todavía no tenía los 150 USD');
});

console.log(`\n${'─'.repeat(46)}`);
console.log(`  ${passed} passed  |  ${failed} failed`);
if(failed > 0) process.exit(1);
