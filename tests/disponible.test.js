// Tests: qué plata está disponible para gastar y cuánta quedó apartada en ahorro
// node tests/disponible.test.js

import { cargarFuente } from './helpers/cargar-fuente.js';

const src = cargarFuente([
  'js/constantes.js','js/movimientos.js','js/cuentas-carga.js','js/metas.js',
  'js/balances-formato.js','js/filtros-busqueda.js','js/render-metricas.js',
]);

const ev = c => src.__eval(c);
const set = (n, v) => { src.__fijarTmp = v; ev(`${n} = globalThis.__fijarTmp`); };
const { cuentasDeAhorro, cuentasDeGastoDiario, apartadoAAhorro,
        calcularSaldoDisponible, calcularLiquidezTotal, esGastoReal, esIngresoReal, cicloDe } = src;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch(e) { console.log(`  ✗ ${name}\n    → ${e.message}`); failed++; }
}
function assert(a, b, msg) {
  if(a!==b) throw new Error(`${msg||''}: esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)}`);
}
function ok(c, m) { if(!c) throw new Error(m||'falló'); }

const limpiar = () => {
  set('dynamicAccounts', {});
  set('goals', []);
  ev("delete ACCOUNTS_META['acc_viaje']");
};

// ─── Qué cuenta es de ahorro ─────────────────────────────────────────────────
console.log('\nQué cuentas NO son para gastar:');

test('Nu y Lulo son ahorro por defecto', () => {
  limpiar();
  const a = cuentasDeAhorro();
  ok(a.has('nu')); ok(a.has('lulo'));
});
test('las de gasto diario son el resto de las líquidas', () => {
  limpiar();
  assert(cuentasDeGastoDiario().sort().join(','), 'arq,debito,nequi,ontop');
});
test('las tarjetas de crédito nunca son "disponible"', () => {
  limpiar();
  for (const tc of ['davtc','rappitc']) ok(!cuentasDeGastoDiario().includes(tc));
});
test('un bolsillo que creaste cuenta como ahorro', () => {
  limpiar();
  ev("ACCOUNTS_META['acc_viaje']={label:'Viaje',currency:'COP',type:'debito'}");
  set('dynamicAccounts', {acc_viaje:{label:'Viaje',currency:'COP'}});
  ok(cuentasDeAhorro().has('acc_viaje'));
  ok(!cuentasDeGastoDiario().includes('acc_viaje'));
  limpiar();
});
test('vincular una meta a una cuenta la saca del disponible', () => {
  limpiar();
  ok(cuentasDeGastoDiario().includes('nequi'), 'Nequi debería empezar como disponible');
  set('goals', [{id:'g',name:'Viaje',type:'cuenta',acc:'nequi',target:5000000}]);
  ok(!cuentasDeGastoDiario().includes('nequi'), 'con meta encima ya no es disponible');
  limpiar();
});
test('una meta por categoría NO saca ninguna cuenta', () => {
  limpiar();
  set('goals', [{id:'g',name:'Cripto',type:'categoria',cat:'Inversiones',target:5000000}]);
  assert(cuentasDeGastoDiario().sort().join(','), 'arq,debito,nequi,ontop');
  limpiar();
});

// ─── Apartado a ahorro dentro del ciclo ──────────────────────────────────────
console.log('\nPlata apartada en el ciclo:');

const escenario = movs => {
  limpiar();
  set('goals', [{id:'g',name:'Ahorro Vivienda',type:'cuenta',acc:'lulo',target:30000000}]);
  set('accounts', {nequi:0,debito:2670000,nu:0,lulo:1000000,arq:0,ontop:0,trm:3596,davtc:0,rappitc:0});
  set('entries', movs);
  set('currentMonth', '2026-09');
};
const SUELDO   = {id:'1',date:'2026-08-26',name:'Salario',  amount:4500000,cat:'Ingreso · Salario',        acc:'debito',txType:'ingreso'};
const EXTRA    = {id:'2',date:'2026-09-02',name:'Freelance',amount:800000, cat:'Ingreso · Freelance/Media',acc:'debito',txType:'ingreso'};
const A_LULO   = {id:'3',date:'2026-09-04',name:'Transferencia Davivienda → Lulo (Ahorro Vivienda)',amount:1000000,cat:'Transferencia',acc:'debito',txType:'gasto'};
const ARRIENDO = {id:'4',date:'2026-09-05',name:'Arriendo', amount:1630000,cat:'Arriendo',acc:'debito',txType:'gasto'};

test('mover plata a Lulo cuenta como apartado', () => {
  escenario([SUELDO,EXTRA,A_LULO,ARRIENDO]);
  assert(apartadoAAhorro('2026-09'), 1000000);
});
test('sin transferencias a ahorro, no hay nada apartado', () => {
  escenario([SUELDO,EXTRA,ARRIENDO]);
  assert(apartadoAAhorro('2026-09'), 0);
});
test('una transferencia entre cuentas de gasto no aparta nada', () => {
  escenario([SUELDO,{id:'t',date:'2026-09-04',name:'Transferencia Davivienda → Nequi',amount:200000,cat:'Transferencia',acc:'debito',txType:'gasto'}]);
  assert(apartadoAAhorro('2026-09'), 0);
});
test('sacar plata del ahorro resta (vuelve a estar disponible)', () => {
  escenario([SUELDO,{id:'t',date:'2026-09-06',name:'Transferencia Lulo (Ahorro Vivienda) → Davivienda',amount:400000,cat:'Transferencia',acc:'lulo',txType:'gasto'}]);
  assert(apartadoAAhorro('2026-09'), -400000);
});
test('un ingreso que cae directo al ahorro también se aparta', () => {
  escenario([SUELDO,{id:'i',date:'2026-09-03',name:'Aporte fondo',amount:300000,cat:'Ingreso · Otro',acc:'nu',txType:'ingreso'}]);
  assert(apartadoAAhorro('2026-09'), 300000);
});
test('lo apartado en OTRO ciclo no se cuenta en este', () => {
  escenario([SUELDO,{...A_LULO,id:'v',date:'2026-07-04'}]);
  assert(apartadoAAhorro('2026-09'), 0);
});
test('un destino irreconocible no se cuenta (mejor corto que mal)', () => {
  escenario([SUELDO,{id:'r',date:'2026-09-04',name:'Transferencia Davivienda → Cuenta Que No Existe',amount:900000,cat:'Transferencia',acc:'debito',txType:'gasto'}]);
  assert(apartadoAAhorro('2026-09'), 0);
});

// ─── El desglose tiene que cuadrar ───────────────────────────────────────────
console.log('\nEl desglose del hero cuadra:');

test('Ingresos − Gastos − Apartado = Saldo disponible', () => {
  escenario([SUELDO,EXTRA,A_LULO,ARRIENDO]);
  const delCiclo = src.__eval('entries').filter(e => cicloDe(e.date) === '2026-09');
  const ing = delCiclo.filter(esIngresoReal).reduce((s,e)=>s+e.amount,0);
  const gas = delCiclo.filter(esGastoReal).reduce((s,e)=>s+e.amount,0);
  assert(ing - gas - apartadoAAhorro('2026-09'), calcularSaldoDisponible());
});

test('el ingreso extra sí queda disponible si no lo apartas', () => {
  // Mismo escenario sin la transferencia: el freelance debe sumar al disponible
  escenario([SUELDO,EXTRA,ARRIENDO]);
  set('accounts', {nequi:0,debito:3670000,nu:0,lulo:0,arq:0,ontop:0,trm:3596,davtc:0,rappitc:0});
  const delCiclo = src.__eval('entries').filter(e => cicloDe(e.date) === '2026-09');
  const ing = delCiclo.filter(esIngresoReal).reduce((s,e)=>s+e.amount,0);
  const gas = delCiclo.filter(esGastoReal).reduce((s,e)=>s+e.amount,0);
  assert(ing, 5300000, 'los dos ingresos cuentan');
  assert(ing - gas - apartadoAAhorro('2026-09'), calcularSaldoDisponible());
});

test('la plata en ahorro sigue contando en el patrimonio', () => {
  escenario([SUELDO,EXTRA,A_LULO,ARRIENDO]);
  ok(calcularLiquidezTotal() > calcularSaldoDisponible(),
     'el patrimonio incluye el ahorro; el disponible no');
  assert(calcularLiquidezTotal() - calcularSaldoDisponible(), 1000000);
});

console.log(`\n${'─'.repeat(46)}`);
console.log(`  ${passed} passed  |  ${failed} failed`);
if(failed > 0) process.exit(1);
