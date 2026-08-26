// Tests de la pestaña Métricas
// node tests/metricas.test.js

import { cargarFuente } from './helpers/cargar-fuente.js';

const src = cargarFuente([
  'js/constantes.js','js/movimientos.js','js/cuentas-carga.js','js/balances-formato.js',
  'js/movimiento-list-renderer.js','js/pendiente-list-renderer.js','js/filtros-busqueda.js',
  'js/render-metricas.js',
], ['CAPS','TOPE_HORMIGA_UNITARIO','CATS_EXCLUIDAS_HORMIGA']);

const ev = c => src.__eval(c);
const set = (n, v) => { src.__fijarTmp = v; ev(`${n} = globalThis.__fijarTmp`); };
const {
  esGastoReal, esIngresoReal, calcularResumenMes,
  categoriasControlables, topeControlable, renderGastoHormiga,
} = src;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch(e) { console.log(`  ✗ ${name}\n    → ${e.message}`); failed++; }
}
function assert(a, b, msg) {
  if(a!==b) throw new Error(`${msg||''}: esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)}`);
}
function ok(cond, msg) { if(!cond) throw new Error(msg || 'falló'); }

set('accounts', {nequi:3000,debito:605254,nu:3039260,lulo:0,arq:231.28,ontop:73.75,trm:3596,davtc:1187348,rappitc:2184199});
set('currentMonth','2026-08');
set('pendientes',[]); set('goals',[]);

// ─── Movimientos de 3 meses: fijos grandes + fugas pequeñas ──────────────────
const MESES = ['2026-06','2026-07','2026-08'];
const movs = [];
let n = 0;
const add = (mes,dia,name,amount,cat,acc,txType='gasto') =>
  movs.push({id:'e'+(++n), date:`${mes}-${dia}`, name, amount, cat, acc, txType});

for (const m of MESES) {
  add(m,'26','Salario',4500000,'Ingreso · Salario','debito','ingreso');
  add(m,'03','Arriendo',1630000,'Arriendo','debito');
  add(m,'03','Salud Andrés (EPS)',615500,'Salud','debito');
  add(m,'03','Donación (15%)',900000,'Otro','debito');
  add(m,'05','Inversión mensual',300000,'Inversiones','debito');
  add(m,'10','Pago mínimo Davivienda TC',785246,'Pago Deuda','debito');
  add(m,'27','Intereses TC',32023,'Intereses','davtc');
  add(m,'05','Servicio luz',69003,'Servicios','debito');
  add(m,'09','Mercado',99910,'Alimentación · Mercado','davtc');
  add(m,'04','Almuerzo',15000,'Alimentación · Comidas afuera · Entre semana','nequi');
  add(m,'12','Almuerzo',15000,'Alimentación · Comidas afuera · Entre semana','nequi');
  add(m,'06','Spotify',30500,'Suscripciones','davtc');
  add(m,'05','Parqueadero moto',37700,'Vehículo · Parqueadero','debito');
}
add('2026-08','15','Ajuste Nequi: Faltante',2000000,'[Ajuste de saldo]','nequi');
add('2026-08','16','Transferencia ARQ → Davivienda',100,'Transferencia','arq');
set('entries', movs);

// ─── esGastoReal / esIngresoReal ─────────────────────────────────────────────
console.log('\nQué cuenta como gasto real:');

test('un gasto normal cuenta', () =>
  ok(esGastoReal({txType:'gasto',cat:'Suscripciones'})));
test('una transferencia NO cuenta (mueve plata, no la gasta)', () =>
  ok(!esGastoReal({txType:'gasto',cat:'Transferencia'})));
test('un ajuste de saldo NO cuenta (es corrección contable)', () =>
  ok(!esGastoReal({txType:'gasto',cat:'[Ajuste de saldo]'})));
test('un ingreso NO cuenta como gasto', () =>
  ok(!esGastoReal({txType:'ingreso',cat:'Ingreso · Salario'})));
test('un ingreso normal sí cuenta como ingreso', () =>
  ok(esIngresoReal({txType:'ingreso',cat:'Ingreso · Salario'})));
test('un ajuste hacia arriba NO cuenta como ingreso', () =>
  ok(!esIngresoReal({txType:'ingreso',cat:'[Ajuste de saldo]'})));

// ─── calcularResumenMes ──────────────────────────────────────────────────────
console.log('\nResumen del mes:');

const resumen = calcularResumenMes('2026-08');

test('el ajuste de $2.000.000 no infla el total del mes', () => {
  const conAjuste = movs.filter(e=>e.date.slice(0,7)==='2026-08'&&e.txType!=='ingreso')
                        .reduce((s,e)=>s+e.amount,0);
  ok(resumen.total < conAjuste - 2000000 + 1, `total ${resumen.total} no debería incluir el ajuste`);
});
test('el ajuste tampoco aparece como categoría', () =>
  ok(!('[Ajuste de saldo]' in resumen.bycat)));
test('la transferencia tampoco aparece como categoría', () =>
  ok(!('Transferencia' in resumen.bycat)));
test('el conteo coincide con las categorías sumadas', () =>
  assert(resumen.conteo, movs.filter(e=>e.date.slice(0,7)==='2026-08'&&esGastoReal(e)).length));
test('un mes sin movimientos da total 0, no NaN', () => {
  const vacio = calcularResumenMes('2020-01');
  assert(vacio.total, 0); assert(vacio.conteo, 0); assert(vacio.pct, 0);
});

// ─── Variable vs tope ────────────────────────────────────────────────────────
console.log('\nVariable vs tope (numerador y denominador de la misma lista):');

test('las obligaciones fijas quedan fuera de lo controlable', () => {
  const c = categoriasControlables();
  for (const fija of ['Arriendo','Salud','Inversiones','Vehículo · Seguros','Vehículo · Taller'])
    ok(!c.includes(fija), `${fija} no debería ser controlable`);
});
test('el gasto discrecional sí es controlable', () => {
  const c = categoriasControlables();
  for (const v of ['Suscripciones','Entretenimiento','Transporte','Vehículo · Gasolina'])
    ok(c.includes(v), `${v} debería ser controlable`);
});
test('el tope sale de CAPS, no de una constante fija', () => {
  const antes = topeControlable();
  ev("CAPS['Suscripciones'] = CAPS['Suscripciones'] + 100000");
  assert(topeControlable(), antes + 100000, 'editar un tope debe mover el denominador');
  ev("CAPS['Suscripciones'] = CAPS['Suscripciones'] - 100000");
});
test('el porcentaje ya no se clava en 100%', () => {
  const p = calcularResumenMes('2026-08').pct;
  ok(p > 0 && p < 100, `esperado un valor intermedio, obtenido ${p}%`);
});

// ─── Gasto hormiga ───────────────────────────────────────────────────────────
console.log('\nGasto hormiga (lo que reportaste: no deben salir arriendo, donación ni inversión):');

const nodos = {};
ev(`document.getElementById = function(id){
  if(!globalThis.__nodos[id]) globalThis.__nodos[id] = { id, style:{}, _html:'',
    get innerHTML(){return this._html}, set innerHTML(v){this._html=v} };
  return globalThis.__nodos[id];
}`);
src.__nodos = nodos;
renderGastoHormiga();
const hormiga = nodos['gasto-hormiga-list']._html;

for (const fuera of ['Arriendo','Donación','Inversión','Salud Andrés','Pago mínimo','Intereses TC','Mercado','Servicio luz']) {
  test(`NO aparece "${fuera}"`, () => ok(!hormiga.includes(fuera), `apareció "${fuera}"`));
}
for (const dentro of ['Almuerzo','Spotify','Parqueadero moto']) {
  test(`sí aparece "${dentro}"`, () => ok(hormiga.includes(dentro), `falta "${dentro}"`));
}
test('muestra cuántas compras y de qué tamaño', () =>
  ok(/\d+ compras de ~\$/.test(hormiga), 'debería explicar por qué es hormiga'));

test('una compra grande no entra aunque se repita cada mes', () => {
  const grande = movs.concat(MESES.map((m,i)=>({
    id:'g'+i, date:`${m}-14`, name:'Computador cuota', amount:900000,
    cat:'Tecnología', acc:'debito', txType:'gasto'})));
  set('entries', grande);
  renderGastoHormiga();
  ok(!nodos['gasto-hormiga-list']._html.includes('Computador cuota'));
  set('entries', movs);
});

test('un gasto pequeño de un solo mes tampoco entra (no es recurrente)', () => {
  const unico = movs.concat([{id:'u1',date:'2026-08-14',name:'Helado',amount:9000,
    cat:'Entretenimiento',acc:'nequi',txType:'gasto'}]);
  set('entries', unico);
  renderGastoHormiga();
  ok(!nodos['gasto-hormiga-list']._html.includes('Helado'));
  set('entries', movs);
});

// ─── Sinónimos: el mismo gasto con nombres distintos ─────────────────────────
console.log('\nSinónimos (lo reportado: "Gasolina" y "Fuel" salían como dos fugas distintas):');

const claveHormiga = src.claveHormiga;

test('"Fuel" y "Gasolina" dan la misma clave', () =>
  assert(claveHormiga('Fuel'), claveHormiga('Gasolina')));
test('funciona con palabras extra: "Fuel moto" = "Gasolina moto"', () =>
  assert(claveHormiga('Fuel moto'), claveHormiga('Gasolina moto')));
test('no le afectan mayúsculas ni tildes', () =>
  assert(claveHormiga('GASOLÍNA'), claveHormiga('gasolina')));
test('"Lunch" y "Almuerzo" también se agrupan', () =>
  assert(claveHormiga('Lunch'), claveHormiga('Almuerzo')));
test('gastos sin relación NO se agrupan', () =>
  ok(claveHormiga('Spotify') !== claveHormiga('Google One')));

// Reproduce el caso reportado: 3 compras como "Gasolina" y 2 como "Fuel"
const GASOLINA_Y_FUEL = [
  {id:'g1',date:'2026-06-08',name:'Gasolina',amount:47346,cat:'Vehículo · Gasolina',acc:'debito',txType:'gasto'},
  {id:'g2',date:'2026-07-08',name:'Gasolina',amount:47346,cat:'Vehículo · Gasolina',acc:'debito',txType:'gasto'},
  {id:'g3',date:'2026-07-18',name:'Gasolina',amount:47346,cat:'Vehículo · Gasolina',acc:'debito',txType:'gasto'},
  {id:'f1',date:'2026-06-20',name:'Fuel',    amount:41988,cat:'Vehículo · Gasolina',acc:'debito',txType:'gasto'},
  {id:'f2',date:'2026-08-20',name:'Fuel',    amount:41988,cat:'Vehículo · Gasolina',acc:'debito',txType:'gasto'},
];
const soloGasolina = () => {
  set('entries', GASOLINA_Y_FUEL);
  renderGastoHormiga();
  return nodos['gasto-hormiga-list']._html;
};

test('las dos filas se convierten en una sola', () => {
  const filas = (soloGasolina().match(/al año/g) || []).length;
  assert(filas, 1, 'debería quedar una sola fila');
  set('entries', movs);
});

test('esa fila suma las 5 compras de los dos nombres', () => {
  ok(soloGasolina().includes('5 compras'), 'las 5 compras deben quedar juntas');
  set('entries', movs);
});

test('cuenta los 3 meses distintos, sin duplicar', () => {
  ok(soloGasolina().includes('3 meses'));
  set('entries', movs);
});

test('se rotula con el nombre que más usaste, no con el último', () => {
  // "Fuel" es el más reciente, pero "Gasolina" aparece 3 veces contra 2
  const html = soloGasolina();
  ok(html.includes('>Gasolina<'), 'debería rotularse "Gasolina"');
  set('entries', movs);
});

console.log(`\n${'─'.repeat(46)}`);
console.log(`  ${passed} passed  |  ${failed} failed`);
if(failed > 0) process.exit(1);
