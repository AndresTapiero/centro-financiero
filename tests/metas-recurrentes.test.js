// Tests: ajustar el objetivo de una meta, y montos recurrentes que aplican a los próximos meses
// node tests/metas-recurrentes.test.js

import { cargarFuente } from './helpers/cargar-fuente.js';

const src = cargarFuente([
  'js/constantes.js','js/modales.js','js/movimientos.js','js/cuentas-carga.js','js/metas.js',
  'js/balances-formato.js','js/filtros-busqueda.js',
  'js/movimiento-list-renderer.js','js/pendiente-list-renderer.js',
  'js/render-metricas.js','js/pendientes-transferencias.js',
]);
const ev = c => src.__eval(c);
const set = (n, v) => { src.__fijarTmp = v; ev(`${n} = globalThis.__fijarTmp`); };

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch(e) { console.log(`  ✗ ${name}\n    → ${e.message}`); failed++; }
}
function assert(a, b, msg) { if(a!==b) throw new Error(`${msg||''}: esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)}`); }

console.log('\nmontoRecurrente:');
const rappi = { name:'Pago Rappi Card', amount:1477710 };
await test('sin ajuste usa el monto de fábrica', () => { set('recurrentesMontos', {}); assert(src.montoRecurrente(rappi), 1477710); });
await test('con ajuste manda el ajustado', () => { set('recurrentesMontos', {'Pago Rappi Card':1650000}); assert(src.montoRecurrente(rappi), 1650000); });
await test('un ajuste inválido (0, texto) se ignora', () => {
  set('recurrentesMontos', {'Pago Rappi Card':0}); assert(src.montoRecurrente(rappi), 1477710);
  set('recurrentesMontos', {'Pago Rappi Card':'abc'}); assert(src.montoRecurrente(rappi), 1477710);
});
await test('el ajuste de una tarjeta no afecta a otra', () => {
  set('recurrentesMontos', {'Pago Rappi Card':1650000});
  assert(src.montoRecurrente({name:'Pago mínimo Davivienda TC',amount:785246}), 785246);
});

console.log('\najustar meta:');
function entorno(inputValor, respuesta) {
  const inp = { style:{}, dataset:{}, value:inputValor, focus(){} };
  const nom = { style:{}, dataset:{}, value:'Vivienda', disabled:false };
  src.__fijarTmp = { inp, nom, resp: respuesta };
  ev(`
    globalThis.document = { getElementById: id => id==='edit-meta-target' ? globalThis.__fijarTmp.inp : id==='edit-meta-nombre' ? globalThis.__fijarTmp.nom : { style:{}, dataset:{}, value:'', textContent:'', innerHTML:'' } };
    globalThis.renderGoals = function(){};
    globalThis.registrarErrorDiagnostico = function(){};
    globalThis.toastError = function(m){ globalThis.__ultimoError = m; };
    globalThis.__ultimoError = null;
    globalThis.sb = { from(){ return { update(){ return { eq(){ return { select(){ return Promise.resolve(globalThis.__fijarTmp.resp); } }; } }; } }; } };
  `);
}
await test('guarda el nuevo objetivo', async () => {
  set('goals', [{ id:'g1', name:'Vivienda', type:'cuenta', acc:'lulo', target:10000000 }]);
  set('_ajusteMetaId', 'g1'); entorno('12.000.000', { data:[{id:'g1'}], error:null });
  await src.resolverAjusteMeta(true);
  assert(ev('goals[0].target'), 12000000);
});
await test('vacío deja la meta sin objetivo fijo', async () => {
  set('goals', [{ id:'g1', name:'Vivienda', type:'cuenta', acc:'lulo', target:10000000 }]);
  set('_ajusteMetaId', 'g1'); entorno('', { data:[{id:'g1'}], error:null });
  await src.resolverAjusteMeta(true);
  assert(ev('goals[0].target'), 0);
});
await test('si la base no actualiza ninguna fila (RLS), revierte y avisa', async () => {
  set('goals', [{ id:'g1', name:'Vivienda', type:'cuenta', acc:'lulo', target:10000000 }]);
  set('_ajusteMetaId', 'g1'); entorno('15.000.000', { data:[], error:null });
  await src.resolverAjusteMeta(true);
  assert(ev('goals[0].target'), 10000000);
  assert(ev('globalThis.__ultimoError')!==null, true, 'debía avisar el error');
});
await test('cancelar no cambia nada', async () => {
  set('goals', [{ id:'g1', name:'Vivienda', type:'cuenta', acc:'lulo', target:10000000 }]);
  set('_ajusteMetaId', 'g1'); entorno('99.000.000', { data:[{id:'g1'}], error:null });
  await src.resolverAjusteMeta(false);
  assert(ev('goals[0].target'), 10000000);
});

console.log('\nrenombrar cuenta:');
function entornoRenombrar(nombreNuevo, resp) {
  const inp = { style:{}, dataset:{}, value:nombreNuevo, focus(){}, select(){} };
  src.__fijarTmp = { inp, resp, llamadas: [] };
  ev(`
    globalThis.document = {
      getElementById: id => id==='renombrar-cuenta-nombre' ? globalThis.__fijarTmp.inp : { style:{}, dataset:{}, value:'', textContent:'', innerHTML:'', querySelectorAll(){return []}, querySelector(){return null} },
      querySelectorAll: () => [],
    };
    globalThis.render = function(){}; globalThis.renderGoals = function(){}; globalThis.poblarFiltroCuentaBusqueda = function(){};
    globalThis.registrarErrorDiagnostico = function(){};
    globalThis.avisarGuardado = function(){};
    globalThis.toastError = function(m){ globalThis.__ultimoError = m; }; globalThis.__ultimoError = null;
    globalThis.currentUserId = 'u1';
    const encadenable = () => { const o = { eq(){ return o; }, select(){ return Promise.resolve(globalThis.__fijarTmp.resp); }, then(res){ return Promise.resolve({error:null}).then(res); } }; return o; };
    globalThis.sb = { from(t){ globalThis.__fijarTmp.llamadas.push(t); return { update(){ return encadenable(); } }; } };
  `);
}
const { errorNombreCuenta } = src;
await test('rechaza nombre vacío, muy largo o repetido', () => {
  assert(errorNombreCuenta('lulo', '')!==null, true);
  assert(errorNombreCuenta('lulo', 'x'.repeat(41))!==null, true);
  assert(errorNombreCuenta('lulo', 'nequi')!==null, true, 'repetido sin importar mayúsculas');
  assert(errorNombreCuenta('lulo', 'Lulo vivienda'), null);
  assert(errorNombreCuenta('lulo', 'Lulo (Ahorro Vivienda)'), null, 'conservar su propio nombre no es repetido');
});
await test('renombra la cuenta y la meta que se llamaba igual', async () => {
  set('goals', [{ id:'g1', name:'Bolsillo Viaje', type:'cuenta', acc:'lulo', target:0 }]);
  ev(`ACCOUNTS_META.lulo.label = 'Bolsillo Viaje'`);
  set('_renombrarSlug', 'lulo'); entornoRenombrar('Bolsillo Japón', { data:[{id:1}], error:null });
  await src.resolverRenombrarCuenta(true);
  assert(ev('ACCOUNTS_META.lulo.label'), 'Bolsillo Japón');
  assert(ev('goals[0].name'), 'Bolsillo Japón');
});
await test('si la base no guarda (0 filas), vuelve al nombre anterior', async () => {
  set('goals', []);
  ev(`ACCOUNTS_META.lulo.label = 'Lulo (Ahorro Vivienda)'`);
  set('_renombrarSlug', 'lulo'); entornoRenombrar('Otro nombre', { data:[], error:null });
  await src.resolverRenombrarCuenta(true);
  assert(ev('ACCOUNTS_META.lulo.label'), 'Lulo (Ahorro Vivienda)');
  assert(ev('globalThis.__ultimoError')!==null, true);
});
await test('no permite renombrar una tarjeta de crédito', () => {
  entornoRenombrar('x', {});
  src.abrirRenombrarCuenta('davtc');
  assert(ev('_renombrarSlug'), null);
});

console.log(`\n${passed} pasaron, ${failed} fallaron`);
process.exit(failed ? 1 : 0);
