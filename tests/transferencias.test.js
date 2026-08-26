// Tests: transferencias con las dos patas registradas (origen y destino)
// node tests/transferencias.test.js

import { cargarFuente } from './helpers/cargar-fuente.js';

const src = cargarFuente([
  'js/constantes.js','js/modales.js','js/movimientos.js','js/cuentas-carga.js','js/metas.js',
  'js/balances-formato.js','js/filtros-busqueda.js',
  'js/movimiento-list-renderer.js','js/pendiente-list-renderer.js',
  'js/render-metricas.js','js/pendientes-transferencias.js',
]);

const ev = c => src.__eval(c);
const set = (n, v) => { src.__fijarTmp = v; ev(`${n} = globalThis.__fijarTmp`); };
const { esIngresoReal, esGastoReal, apartadoAAhorro, parejaDeTransferencia,
        calcularSaldoDisponible, cicloDe } = src;

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch(e) { console.log(`  ✗ ${name}\n    → ${e.message}`); failed++; }
}
function assert(a, b, msg) {
  if(a!==b) throw new Error(`${msg||''}: esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)}`);
}
function ok(c, m) { if(!c) throw new Error(m||'falló'); }

const base = () => {
  set('dynamicAccounts', {});
  set('goals', [{id:'g',name:'Ahorro Vivienda',type:'cuenta',acc:'lulo',target:30000000}]);
  set('accounts', {nequi:500000,debito:2000000,nu:0,lulo:1000000,arq:100,ontop:0,trm:3596,davtc:0,rappitc:0});
  set('pendientes', []);
  set('currentUserId', 'test-user');
};

// ─── esIngresoReal excluye las transferencias ────────────────────────────────
console.log('\nLa pata de destino de una transferencia no es "ingreso real":');

test('una transferencia recibida (ingreso) no cuenta como ingreso', () =>
  ok(!esIngresoReal({txType:'ingreso',cat:'Transferencia'})));
test('la pata de origen (gasto) tampoco cuenta como gasto', () =>
  ok(!esGastoReal({txType:'gasto',cat:'Transferencia'})));
test('un ingreso normal sigue contando', () =>
  ok(esIngresoReal({txType:'ingreso',cat:'Ingreso · Salario'})));

// ─── Encontrar la pareja de una transferencia ────────────────────────────────
console.log('\nEmparejar las dos patas de una transferencia:');

const ORIGEN  = {id:'o1',date:'2026-09-04',name:'Transferencia Davivienda → Lulo (Ahorro Vivienda)',amount:1000000,cat:'Transferencia',acc:'debito',txType:'gasto'};
const DESTINO = {id:'d1',date:'2026-09-04',name:'Transferencia Davivienda → Lulo (Ahorro Vivienda)',amount:1000000,cat:'Transferencia',acc:'lulo',txType:'ingreso'};

test('encuentra el destino desde el origen', () => {
  base(); set('entries', [ORIGEN, DESTINO]);
  const p = parejaDeTransferencia(ORIGEN);
  ok(p && p.id === 'd1');
});
test('encuentra el origen desde el destino', () => {
  base(); set('entries', [ORIGEN, DESTINO]);
  const p = parejaDeTransferencia(DESTINO);
  ok(p && p.id === 'o1');
});
test('un movimiento normal no tiene pareja', () => {
  base(); set('entries', [{id:'x',date:'2026-09-04',name:'Almuerzo',amount:15000,cat:'Otro',acc:'nequi',txType:'gasto'}]);
  ok(parejaDeTransferencia(src.__eval('entries')[0]) === null);
});
test('una transferencia vieja de una sola pata no tiene pareja', () => {
  base(); set('entries', [ORIGEN]); // sin DESTINO
  ok(parejaDeTransferencia(ORIGEN) === null);
});
test('no empareja transferencias de días distintos', () => {
  base();
  const otroDia = {...DESTINO, id:'d2', date:'2026-09-05'};
  set('entries', [ORIGEN, otroDia]);
  ok(parejaDeTransferencia(ORIGEN) === null);
});

// ─── apartadoAAhorro ya no necesita adivinar el nombre ───────────────────────
console.log('\napartadoAAhorro con las dos patas (sin adivinar por nombre):');

test('con las dos patas, cuenta igual que antes', () => {
  base(); set('entries', [ORIGEN, DESTINO]);
  assert(apartadoAAhorro('2026-09'), 1000000);
});
test('funciona aunque el nombre no siga el patrón esperado', () => {
  // Antes dependía de parsear "X → Y" del nombre; ahora cada pata se juzga por su cuenta.
  base();
  set('entries', [
    {...ORIGEN, name:'movida al fondo'},
    {...DESTINO, name:'movida al fondo'},
  ]);
  assert(apartadoAAhorro('2026-09'), 1000000);
});
test('retirar de Lulo hacia Nequi libera exactamente lo retirado', () => {
  base();
  set('entries', [
    {id:'o2',date:'2026-09-06',name:'Transferencia Lulo (Ahorro Vivienda) → Nequi',amount:400000,cat:'Transferencia',acc:'lulo',txType:'gasto'},
    {id:'d2',date:'2026-09-06',name:'Transferencia Lulo (Ahorro Vivienda) → Nequi',amount:400000,cat:'Transferencia',acc:'nequi',txType:'ingreso'},
  ]);
  assert(apartadoAAhorro('2026-09'), -400000);
});
test('mover entre dos fondos de ahorro no cambia lo apartado', () => {
  base();
  set('goals', [
    {id:'g1',name:'Vivienda',type:'cuenta',acc:'lulo',target:1},
    {id:'g2',name:'Emergencia',type:'cuenta',acc:'nu',target:1},
  ]);
  set('entries', [
    {id:'o3',date:'2026-09-06',name:'Transferencia Lulo → Nu',amount:200000,cat:'Transferencia',acc:'lulo',txType:'gasto'},
    {id:'d3',date:'2026-09-06',name:'Transferencia Lulo → Nu',amount:200000,cat:'Transferencia',acc:'nu',txType:'ingreso'},
  ]);
  assert(apartadoAAhorro('2026-09'), 0);
});
test('transferencia vieja de una sola pata sigue funcionando (respaldo por nombre)', () => {
  base(); set('entries', [ORIGEN]); // sin la pata destino
  assert(apartadoAAhorro('2026-09'), 1000000);
});

// ─── deleteEntry revierte las DOS cuentas cuando hay pareja ──────────────────
console.log('\nBorrar una transferencia revierte las dos cuentas:');

// deleteEntry() también llama fillAccountInputs()/render(), que tocan bastante DOM real.
// El sandbox de cargar-fuente.js devuelve null en getElementById (a propósito, para quedarse
// simple para el resto de los tests); acá, solo en este archivo, se cambia por un elemento
// falso pero mutable, así deleteEntry corre completo sin que la UI real intervenga.
function prepararSbFalso(){
  const borrados = [];
  ev(`
    globalThis.__elementoFalso = function(){
      const el = { style:{}, dataset:{}, value:'', textContent:'', innerHTML:'', className:'',
        classList:{add(){},remove(){},toggle(){},contains(){return false}},
        appendChild(){}, addEventListener(){}, removeEventListener(){}, focus(){},
        querySelector(){return null}, querySelectorAll(){return []}, options:[] };
      return el;
    };
    globalThis.document.getElementById = function(){ return globalThis.__elementoFalso(); };
    globalThis.sb = { from(tabla){ return {
      delete(){ return { in(_,ids){ globalThis.__borrados.push(...ids); return Promise.resolve({error:null}); } }; },
      upsert(){ return { select(){ return Promise.resolve({data:[],error:null}); } }; },
      select(){ return this; }, eq(){ return this; },
    }; } };
    globalThis.customConfirm = function(){ return Promise.resolve(true); };
    // pendingSaves y registrarErrorDiagnostico viven en guardado-core.js, que no se carga aquí
    // porque su última línea toca el DOM real al cargar el archivo. Se definen a mano.
    globalThis.pendingSaves = 0;
    globalThis.registrarErrorDiagnostico = function(key, err){
      globalThis.__ultimoError = { key, mensaje: err && err.message };
    };
  `);
  src.__borrados = borrados;
  return borrados;
}

await test('con las dos patas: revierte AMBOS saldos y borra las DOS filas', async () => {
  base();
  set('entries', [ORIGEN, DESTINO]);
  const borrados = prepararSbFalso();
  const saldoDebitoAntes = src.__eval('accounts.debito');
  const saldoLuloAntes = src.__eval('accounts.lulo');

  await src.deleteEntry('o1');

  assert(src.__eval('accounts.debito'), saldoDebitoAntes + 1000000, 'debito debe recuperar lo transferido');
  assert(src.__eval('accounts.lulo'), saldoLuloAntes - 1000000, 'lulo debe perder lo recibido');
  assert(src.__eval('entries').length, 0, 'las dos entradas deben desaparecer');
  assert(borrados.sort().join(','), 'd1,o1', 'las dos filas deben borrarse en Supabase');
});

await test('sin pareja (transferencia vieja): revierte solo la cuenta con movimiento', async () => {
  base();
  set('entries', [ORIGEN]);
  const borrados = prepararSbFalso();
  const saldoDebitoAntes = src.__eval('accounts.debito');
  const saldoLuloAntes = src.__eval('accounts.lulo');

  await src.deleteEntry('o1');

  assert(src.__eval('accounts.debito'), saldoDebitoAntes + 1000000);
  assert(src.__eval('accounts.lulo'), saldoLuloAntes, 'lulo no tiene movimiento propio: no se toca');
  assert(borrados.join(','), 'o1', 'solo se borra la única fila que existía');
});

await test('borrar un movimiento normal no toca ninguna pareja', async () => {
  base();
  set('entries', [{id:'x1',date:'2026-09-06',name:'Almuerzo',amount:15000,cat:'Otro',acc:'nequi',txType:'gasto'}]);
  const borrados = prepararSbFalso();
  await src.deleteEntry('x1');
  assert(borrados.join(','), 'x1');
});

// ─── El desglose del hero sigue cuadrando con transferencias dobles ──────────
console.log('\nEl desglose del hero sigue cuadrando:');

test('con las dos patas: Ingresos − Gastos − Apartado = Disponible', () => {
  base();
  set('entries', [
    {id:'s1',date:'2026-08-26',name:'Salario',amount:4500000,cat:'Ingreso · Salario',acc:'debito',txType:'ingreso'},
    ORIGEN, DESTINO,
    {id:'a1',date:'2026-09-05',name:'Arriendo',amount:1630000,cat:'Arriendo',acc:'debito',txType:'gasto'},
  ]);
  set('accounts', {nequi:0,debito:1870000,nu:0,lulo:1000000,arq:0,ontop:0,trm:3596,davtc:0,rappitc:0});
  const e = src.__eval('entries').filter(x => cicloDe(x.date) === '2026-09');
  const ing = e.filter(esIngresoReal).reduce((s,x)=>s+x.amount,0);
  const gas = e.filter(esGastoReal).reduce((s,x)=>s+x.amount,0);
  assert(ing - gas - apartadoAAhorro('2026-09'), calcularSaldoDisponible());
});

console.log(`\n${'─'.repeat(46)}`);
console.log(`  ${passed} passed  |  ${failed} failed`);
if(failed > 0) process.exit(1);
