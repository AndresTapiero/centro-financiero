// Tests: una cuenta creada por el usuario en dólares ("Lulo X", donde cae un segundo salario)
// participa en TODA la lógica como cuenta de GASTO
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
const montar = (movs, saldoLuloX, metaDeAhorro=false) => {
  ev(`ACCOUNTS_META['${K}']={label:'Lulo X',currency:'USD',type:'debito'}`);
  set('dynamicAccounts', {[K]:{label:'Lulo X',currency:'USD'}});
  set('goals', metaDeAhorro?[{id:'g',name:'Ahorro USD',type:'cuenta',acc:K,target:1}]:[]); set('pendientes', []);
  set('accounts', {nequi:500000,debito:2000000,nu:0,lulo:0,arq:0,ontop:0,trm:4000,davtc:0,rappitc:0,[K]:saldoLuloX});
  set('entries', movs);
};

console.log('\nLulo X (USD) como cuenta de gasto (segundo salario):');

test('es cuenta de gasto diario, no de ahorro', () => {
  montar([], 0);
  ok(!cuentasDeAhorro().has(K));
  ok(cuentasDeGastoDiario().includes(K));
});
test('su saldo SÍ entra en el disponible para gastar, convertido con la TRM', () => {
  montar([], 100);
  assert(calcularSaldoDisponible(), 2500000 + 100*4000);
});
test('su saldo entra también en el patrimonio', () => {
  montar([], 100);
  assert(calcularLiquidezTotal(), 2500000 + 100*4000);
});

console.log('\nUn segundo salario que cae en Lulo X:');

const SALARIO2 = {id:'i1',date:'2026-10-02',name:'Segundo salario',amount:1500,cat:'Ingreso · Salario',acc:K,txType:'ingreso'};
test('cuenta como ingreso real del ciclo (convertido a COP)', () => {
  montar([SALARIO2], 1500);
  const ing = src.__eval('entries').filter(e=>esIngresoReal(e)).reduce((s,e)=>s+src.entryCOP(e),0);
  assert(ing, 1500*4000);
});
test('NO se aparta a ahorro: queda disponible para gastar', () => {
  montar([SALARIO2], 1500);
  assert(apartadoAAhorro(cicloDe('2026-10-02')), 0);
});
test('el desglose cuadra: Ingresos − Gastos − Apartado = Disponible', () => {
  montar([SALARIO2], 1500);
  set('accounts', {nequi:0,debito:0,nu:0,lulo:0,arq:0,ontop:0,trm:4000,davtc:0,rappitc:0,[K]:1500});
  const c = cicloDe('2026-10-02');
  const e = src.__eval('entries').filter(x=>cicloDe(x.date)===c);
  const ing = e.filter(esIngresoReal).reduce((s,x)=>s+src.entryCOP(x),0);
  const gas = e.filter(esGastoReal).reduce((s,x)=>s+src.entryCOP(x),0);
  assert(ing - gas - apartadoAAhorro(c), calcularSaldoDisponible());
});
test('un gasto hecho desde Lulo X descuenta del disponible', () => {
  montar([SALARIO2,{id:'g1',date:'2026-10-03',name:'Compra',amount:100,cat:'Tecnología',acc:K,txType:'gasto'}], 1400);
  assert(calcularSaldoDisponible(), 2500000 + 1400*4000);
});

console.log('\nSi la vinculas a una meta, pasa a ser ahorro:');

test('con meta vinculada: sale del disponible y su ingreso queda apartado', () => {
  montar([SALARIO2], 1500, true);
  ok(cuentasDeAhorro().has(K));
  assert(calcularSaldoDisponible(), 2500000);
  assert(apartadoAAhorro(cicloDe('2026-10-02')), 1500*4000);
});

console.log('\nPatrimonio histórico (antes ignoraba las cuentas nuevas):');

test('el dinero de Lulo X aparece en el patrimonio de un mes pasado', () => {
  montar([], 100);
  const p = calcularPatrimonioMes('2020-01');
  ok(p, 'debería reconstruir un mes pasado');
  assert(p.liquido, 2500000 + 100*4000);
});
test('si el ingreso fue DESPUÉS de ese mes, se deshace en la reconstrucción', () => {
  montar([SALARIO2], 1500);
  set('accounts', {nequi:500000,debito:2000000,nu:0,lulo:0,arq:0,ontop:0,trm:4000,davtc:0,rappitc:0,[K]:1500});
  const p = calcularPatrimonioMes('2026-08');
  assert(p.liquido, 2500000, 'en agosto Lulo X todavía no tenía los 1.500 USD');
});

console.log('\nSaldo disponible histórico (antes tenía 4 cuentas fijas):');
test('un mes pasado incluye el saldo de Lulo X en el disponible', () => {
  montar([], 100);
  assert(src.calcularSaldoHistorico('2020-01').bruto, 2500000 + 100*4000);
});
test('el mes actual devuelve el disponible de hoy, con Lulo X incluida', () => {
  montar([], 100);
  assert(src.calcularSaldoHistorico(src.cicloActual()).bruto, 2500000 + 100*4000);
});

console.log(`\n${'─'.repeat(46)}`);
console.log(`  ${passed} passed  |  ${failed} failed`);
if(failed > 0) process.exit(1);
