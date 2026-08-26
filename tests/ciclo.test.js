// Tests del ciclo de pago (el "mes" de la app va de pago a pago, no del 1 al 30)
// node tests/ciclo.test.js

import { cargarFuente } from './helpers/cargar-fuente.js';

const src = cargarFuente([
  'js/constantes.js','js/movimientos.js','js/cuentas-carga.js','js/balances-formato.js',
  'js/movimiento-list-renderer.js','js/pendiente-list-renderer.js','js/filtros-busqueda.js',
  'js/render-metricas.js',
], ['DIA_CORTE_MES']);

const ev = c => src.__eval(c);
const set = (n, v) => { src.__fijarTmp = v; ev(`${n} = globalThis.__fijarTmp`); };
const { cicloDe, rangoDelCiclo, diasDelCiclo, fechaEnCiclo, etiquetaCiclo,
        esGastoReal, esIngresoReal, DIA_CORTE_MES } = src;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch(e) { console.log(`  ✗ ${name}\n    → ${e.message}`); failed++; }
}
function assert(a, b, msg) {
  if(a!==b) throw new Error(`${msg||''}: esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)}`);
}
function ok(c, m) { if(!c) throw new Error(m||'falló'); }

console.log(`\nA qué ciclo pertenece cada fecha (te pagan el ${DIA_CORTE_MES}):`);

test('el día antes del pago aún es el ciclo que termina', () => assert(cicloDe('2026-08-25'), '2026-08'));
test('el día del pago ya abre el ciclo siguiente',        () => assert(cicloDe('2026-08-26'), '2026-09'));
test('fin de mes pertenece al ciclo que financia',        () => assert(cicloDe('2026-08-31'), '2026-09'));
test('el 1 sigue en el mismo ciclo que el 26 anterior',   () => assert(cicloDe('2026-09-01'), '2026-09'));
test('el 25 cierra el ciclo',                             () => assert(cicloDe('2026-09-25'), '2026-09'));
test('el 26 abre el siguiente',                           () => assert(cicloDe('2026-09-26'), '2026-10'));

console.log('\nCruce de año:');
test('26 de diciembre → ciclo de enero del año siguiente', () => assert(cicloDe('2026-12-26'), '2027-01'));
test('25 de enero → todavía el ciclo de enero',            () => assert(cicloDe('2027-01-25'), '2027-01'));
test('31 de diciembre → ciclo de enero',                   () => assert(cicloDe('2026-12-31'), '2027-01'));

console.log('\nRango y duración:');
test('el ciclo de septiembre va del 26 ago al 25 sep', () => {
  const r = rangoDelCiclo('2026-09');
  assert(r.desde, '2026-08-26'); assert(r.hasta, '2026-09-25');
});
test('el de enero arranca en diciembre del año anterior', () => {
  const r = rangoDelCiclo('2027-01');
  assert(r.desde, '2026-12-26'); assert(r.hasta, '2027-01-25');
});
test('el ciclo que cruza febrero dura menos días', () =>
  ok(diasDelCiclo('2026-03') < diasDelCiclo('2026-09'),
     `feb ${diasDelCiclo('2026-03')} debería ser menor que sep ${diasDelCiclo('2026-09')}`));
test('todo día del rango cae dentro del ciclo', () => {
  for (const ciclo of ['2026-09','2027-01','2026-03']) {
    const {desde,hasta} = rangoDelCiclo(ciclo);
    for (const f of [desde, hasta]) assert(cicloDe(f), ciclo, `${f} en ${ciclo}`);
  }
});
test('los ciclos no dejan huecos ni se solapan', () => {
  // Recorre un año día a día: cada fecha cae en exactamente un ciclo, y los ciclos son contiguos
  const vistos = new Map();
  for (let d = new Date(2026,0,1); d < new Date(2027,0,1); d.setDate(d.getDate()+1)) {
    const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const c = cicloDe(iso);
    vistos.set(c, (vistos.get(c)||0)+1);
  }
  for (const [c, dias] of vistos) {
    if (dias === diasDelCiclo(c)) continue;           // ciclo completo dentro del año
    ok(dias < diasDelCiclo(c), `${c}: ${dias} días contados vs ${diasDelCiclo(c)} de duración`);
  }
});

console.log('\nFecha de un recurrente dentro del ciclo:');
test('el sueldo del día 26 cae en el mes anterior', () => assert(fechaEnCiclo('2026-09',26), '2026-08-26'));
test('el arriendo del día 3 cae en el mes del nombre', () => assert(fechaEnCiclo('2026-09',3), '2026-09-03'));
test('en enero, el día 26 retrocede a diciembre', () => assert(fechaEnCiclo('2027-01',26), '2026-12-26'));
test('todo recurrente aterriza en el ciclo pedido', () => {
  for (const ciclo of ['2026-09','2027-01','2026-03']) {
    for (const dia of [1,3,10,23,25,26,28]) {
      assert(cicloDe(fechaEnCiclo(ciclo,dia)), ciclo, `día ${dia} de ${ciclo}`);
    }
  }
});

console.log('\nEtiqueta:');
test('muestra el mes y el rango', () => assert(etiquetaCiclo('2026-09'), 'Sep 2026 · 26 ago – 25 sep'));

// ─── El caso que motivó el cambio ────────────────────────────────────────────
console.log('\nEl problema reportado: el sueldo entra antes de que empiece el mes');

const movs = [];
let n = 0;
const add = (d,name,amount,cat,acc,t='gasto') =>
  movs.push({id:'x'+(++n), date:d, name, amount, cat, acc, txType:t});
for (const m of ['2026-06','2026-07','2026-08']) add(m+'-26','Salario',4500000,'Ingreso · Salario','debito','ingreso');
add('2026-09-03','Arriendo',1630000,'Arriendo','debito');
add('2026-09-03','Salud EPS',615500,'Salud','debito');
add('2026-09-12','Almuerzo',15000,'Alimentación · Comidas afuera · Entre semana','nequi');
set('entries', movs);
set('accounts', {nequi:3000,debito:605254,nu:0,lulo:0,arq:0,ontop:0,trm:3596,davtc:0,rappitc:0});
set('pendientes',[]); set('goals',[]);

const delCiclo = c => movs.filter(e => cicloDe(e.date) === c);
const ingresosDe = c => delCiclo(c).filter(esIngresoReal).reduce((s,e)=>s+e.amount,0);
const gastosDe   = c => delCiclo(c).filter(esGastoReal).reduce((s,e)=>s+e.amount,0);

test('el sueldo del 26 de agosto cuenta como ingreso del ciclo de septiembre', () =>
  assert(ingresosDe('2026-09'), 4500000));
test('los gastos de septiembre están en ese mismo ciclo', () =>
  assert(gastosDe('2026-09'), 2260500));
test('la proporción gasto/ingreso ya se puede calcular', () => {
  const pct = Math.round(gastosDe('2026-09')/ingresosDe('2026-09')*100);
  ok(pct > 0 && pct < 100, `esperado un valor real, obtenido ${pct}%`);
});
test('ningún ciclo con gastos se queda sin ingreso', () => {
  const ciclos = [...new Set(movs.map(e=>cicloDe(e.date)))];
  for (const c of ciclos) {
    if (gastosDe(c) > 0) ok(ingresosDe(c) > 0, `el ciclo ${c} tiene gastos pero ningún ingreso`);
  }
});

console.log('\nLas series de las gráficas terminan en el ciclo en curso:');
test('ultimosMeses incluye el ciclo actual, no el mes de calendario', () => {
  const serie = src.ultimosMeses(6);
  ok(serie.includes(src.cicloActual()),
     `la serie ${serie.join(', ')} debería terminar en ${src.cicloActual()}`);
  assert(serie[serie.length-1], src.cicloActual());
});
test('la serie es contigua y sin repetidos', () => {
  const serie = src.ultimosMeses(6);
  assert(new Set(serie).size, serie.length, 'hay ciclos repetidos');
  for (let i = 1; i < serie.length; i++) ok(serie[i] > serie[i-1], 'la serie debe ir en orden');
});

console.log(`\n${'─'.repeat(46)}`);
console.log(`  ${passed} passed  |  ${failed} failed`);
if(failed > 0) process.exit(1);
