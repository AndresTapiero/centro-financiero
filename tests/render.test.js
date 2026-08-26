// Tests: MovimientoListRenderer y PendienteListRenderer
// node tests/render.test.js
//
// Cubre los casos que antes rompían el render: nombres con HTML y cuentas eliminadas.

import { cargarFuente } from './helpers/cargar-fuente.js';

const src = cargarFuente([
  'js/constantes.js',
  'js/movimientos.js',
  'js/cuentas-carga.js',
  'js/balances-formato.js',
  'js/metas.js',
  'js/movimiento-list-renderer.js',
  'js/pendiente-list-renderer.js',
]);

// Las clases y los `let`/`const` de nivel superior no llegan a globalThis: se alcanzan con __eval.
const leer  = nombre => src.__eval(nombre);
const fijar = (nombre, valor) => { src.__fijarTmp = valor; src.__eval(`${nombre} = globalThis.__fijarTmp`); };

const MovimientoListRenderer = leer('MovimientoListRenderer');
const PendienteListRenderer  = leer('PendienteListRenderer');
const ACCOUNTS_META          = leer('ACCOUNTS_META');
const calcularSaldoDisponible = leer('calcularSaldoDisponible');
const calcularLiquidezTotal   = leer('calcularLiquidezTotal');
const calcularDeudaTotal      = leer('calcularDeudaTotal');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch(e) { console.log(`  ✗ ${name}\n    → ${e.message}`); failed++; }
}
function assert(cond, msg) { if(!cond) throw new Error(msg || 'falló'); }
function contiene(hay, needle) {
  if(!hay.includes(needle)) throw new Error(`falta ${JSON.stringify(needle)} en la salida`);
}
function noContiene(hay, needle) {
  if(hay.includes(needle)) throw new Error(`no debería aparecer ${JSON.stringify(needle)}`);
}

// Estado global que los renderers leen
fijar('accounts', { nequi: 100000, debito: 500000, arq: 50, trm: 4000, davtc: 200000 });
fijar('currentMonth', '2026-08');

const MOVS = [
  { id:'1', date:'2026-08-10', name:'Almuerzo',  amount:15000, cat:'Alimentación · Mercado', acc:'nequi',  txType:'gasto' },
  { id:'2', date:'2026-08-10', name:'Salario',   amount:900000, cat:'Ingreso · Salario',     acc:'debito', txType:'ingreso' },
  { id:'3', date:'2026-08-09', name:'Gasolina',  amount:60000, cat:'Vehículo · Gasolina',    acc:'davtc',  txType:'gasto' },
];

console.log('\nMovimientoListRenderer — agrupación por fecha:');

test('agrupa en dos días y pinta los tres movimientos', () => {
  const html = new MovimientoListRenderer(MOVS, 'fecha').render();
  contiene(html, '10 de agosto de 2026');
  contiene(html, '9 de agosto de 2026');
  for (const m of MOVS) contiene(html, `data-id="${m.id}"`);
});

test('lista vacía muestra el estado vacío', () => {
  contiene(new MovimientoListRenderer([], 'fecha').render(), 'Sin movimientos');
});

console.log('\nMovimientoListRenderer — agrupación por cuenta:');

test('los encabezados son nombres de cuenta, no fechas', () => {
  const html = new MovimientoListRenderer(MOVS, 'cuenta').render();
  contiene(html, 'Nequi');
  contiene(html, 'Davivienda');
  noContiene(html, '10 de agosto de 2026');
});

test('en modo cuenta cada fila muestra su fecha', () => {
  const html = new MovimientoListRenderer(MOVS, 'cuenta').render();
  contiene(html, '10/08');
  contiene(html, '09/08');
});

test('en modo fecha la fila NO repite la fecha', () => {
  noContiene(new MovimientoListRenderer(MOVS, 'fecha').render(), '10/08');
});

test('misma plantilla de fila en ambos modos (avatar de 44px)', () => {
  for (const modo of ['fecha', 'cuenta']) {
    contiene(new MovimientoListRenderer(MOVS, modo).render(), 'width:44px;height:44px');
  }
});

console.log('\nRobustez — nombres con HTML (antes rompían el render):');

const CON_HTML = [{ id:'x', date:'2026-08-10', name:'Pago <img src=x onerror=alert(1)> "TC"',
                    amount:1000, cat:'Otro', acc:'nequi', txType:'gasto' }];

test('el nombre se escapa, no se inyecta', () => {
  const html = new MovimientoListRenderer(CON_HTML, 'fecha').render();
  noContiene(html, '<img src=x');
  contiene(html, '&lt;img src=x');
});

test('las comillas del nombre también se escapan', () => {
  contiene(new MovimientoListRenderer(CON_HTML, 'fecha').render(), '&quot;TC&quot;');
});

console.log('\nRobustez — cuenta eliminada (antes lanzaba y abortaba la lista):');

const CUENTA_MUERTA = [
  { id:'a', date:'2026-08-10', name:'Compra vieja', amount:5000, cat:'Otro', acc:'cuenta_que_ya_no_existe', txType:'gasto' },
  { id:'b', date:'2026-08-10', name:'Almuerzo',     amount:15000, cat:'Otro', acc:'nequi', txType:'gasto' },
];

test('no lanza y sigue pintando el resto de la lista', () => {
  const html = new MovimientoListRenderer(CUENTA_MUERTA, 'fecha').render();
  contiene(html, 'data-id="a"');
  contiene(html, 'data-id="b"');
});

test('agrupando por cuenta, la eliminada se rotula', () => {
  contiene(new MovimientoListRenderer(CUENTA_MUERTA, 'cuenta').render(), 'Cuenta eliminada');
});

console.log('\nPendienteListRenderer:');

const HOY = '2026-08-20';
const PENDS = [
  { id:'p1', name:'Arriendo',  amount:1630000, date:'2026-08-25', acc:'debito', cat:'Otro',  isIncome:false },
  { id:'p2', name:'Vencido',   amount:50000,   date:'2026-08-01', acc:'nequi',  cat:'Otro',  isIncome:false },
  { id:'p3', name:'Sin fecha', amount:10000,   date:null,          acc:'nequi',  cat:'Otro',  isIncome:false },
];

test('marca los vencidos', () => {
  contiene(new PendienteListRenderer(PENDS, HOY).render(), 'VENCIDO');
});

test('los pendientes sin fecha van a su propio grupo', () => {
  contiene(new PendienteListRenderer(PENDS, HOY).render(), 'Sin fecha');
});

test('lista vacía muestra el estado vacío', () => {
  contiene(new PendienteListRenderer([], HOY).render(), 'Sin pendientes');
});

test('nombre con HTML se escapa', () => {
  const html = new PendienteListRenderer(
    [{ id:'p', name:'<b>Arriendo</b>', amount:1000, date:HOY, acc:'nequi', cat:'Otro', isIncome:false }], HOY).render();
  noContiene(html, '<b>Arriendo</b>');
  contiene(html, '&lt;b&gt;');
});

test('cuenta eliminada no lanza', () => {
  const html = new PendienteListRenderer(
    [{ id:'p', name:'Huérfano', amount:1000, date:HOY, acc:'no_existe', cat:'Otro', isIncome:false }], HOY).render();
  contiene(html, 'Huérfano');
});

console.log('\nLiquidez — las cuentas dinámicas cuentan:');

test('calcularSaldoDisponible excluye ahorros (Nu/Lulo)', () => {
  fijar('accounts', { nequi: 100000, debito: 500000, nu: 9000000, lulo: 1000000, arq: 0, ontop: 0, trm: 4000, davtc: 0, rappitc: 0 });
  assert(calcularSaldoDisponible() === 600000, `esperado 600000, obtenido ${calcularSaldoDisponible()}`);
});

test('calcularLiquidezTotal SÍ incluye ahorros', () => {
  assert(calcularLiquidezTotal() === 10600000, `esperado 10600000, obtenido ${calcularLiquidezTotal()}`);
});

test('calcularLiquidezTotal incluye una cuenta dinámica nueva', () => {
  ACCOUNTS_META['acc_viaje_x1'] = { label:'Viaje', currency:'COP', type:'debito' };
  src.__eval("accounts['acc_viaje_x1'] = 250000");
  assert(calcularLiquidezTotal() === 10850000, `esperado 10850000, obtenido ${calcularLiquidezTotal()}`);
  delete ACCOUNTS_META['acc_viaje_x1'];
  src.__eval("delete accounts['acc_viaje_x1']");
});

test('calcularLiquidezTotal convierte USD con la TRM', () => {
  src.__eval('accounts.arq = 100'); // 100 USD × 4000 = 400.000
  assert(calcularLiquidezTotal() === 11000000, `esperado 11000000, obtenido ${calcularLiquidezTotal()}`);
});

test('calcularDeudaTotal suma solo tarjetas', () => {
  src.__eval('accounts.davtc = 200000; accounts.rappitc = 300000');
  assert(calcularDeudaTotal() === 500000, `esperado 500000, obtenido ${calcularDeudaTotal()}`);
});

console.log(`\n${'─'.repeat(46)}`);
console.log(`  ${passed} passed  |  ${failed} failed`);
if(failed > 0) process.exit(1);
