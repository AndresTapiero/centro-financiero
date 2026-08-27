// Tests: confirmación con la conversión antes de ejecutar una transferencia
// node tests/confirmar-transferencia.test.js

import { cargarFuente } from './helpers/cargar-fuente.js';

const src = cargarFuente([
  'js/constantes.js','js/modales.js','js/movimientos.js','js/cuentas-carga.js','js/metas.js',
  'js/balances-formato.js','js/filtros-busqueda.js',
  'js/movimiento-list-renderer.js','js/pendiente-list-renderer.js',
  'js/render-metricas.js','js/pendientes-transferencias.js',
]);

const ev = c => src.__eval(c);
const set = (n, v) => { src.__fijarTmp = v; ev(`${n} = globalThis.__fijarTmp`); };
const { calcularTransferencia, mensajeConfirmacionTransferencia } = src;

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch(e) { console.log(`  ✗ ${name}\n    → ${e.message}`); failed++; }
}
function assert(a, b, msg) {
  if(a!==b) throw new Error(`${msg||''}: esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)}`);
}
function ok(c, m) { if(!c) throw new Error(m||'falló'); }
function contiene(hay, needle) { if(!hay.includes(needle)) throw new Error(`falta ${JSON.stringify(needle)} en:\n${hay}`); }

// ─── El cálculo, sin tocar cuentas ni DOM ────────────────────────────────────
console.log('\ncalcularTransferencia:');

test('monto en 0 o vacío da error', () => {
  assert(calcularTransferencia({origen:'debito',destino:'nequi',monto:0,trm:3596}).error, 'monto');
  assert(calcularTransferencia({origen:'debito',destino:'nequi',monto:NaN,trm:3596}).error, 'monto');
});
test('origen igual a destino da error', () =>
  assert(calcularTransferencia({origen:'debito',destino:'debito',monto:1000,trm:3596}).error, 'mismaCuenta'));
test('monedas distintas sin TRM da error', () =>
  assert(calcularTransferencia({origen:'arq',destino:'debito',monto:100,trm:0}).error, 'trm'));
test('misma moneda no necesita TRM', () => {
  const c = calcularTransferencia({origen:'debito',destino:'nequi',monto:100000,trm:0});
  assert(c.error, null);
  assert(c.recibido, 100000);
});

test('USD → COP multiplica por la TRM', () => {
  const c = calcularTransferencia({origen:'arq',destino:'debito',monto:100,trm:3596});
  assert(c.error, null);
  assert(c.recibidoTeorico, 359600);
  assert(c.recibido, 359600);
  assert(c.mismaMoneda, false);
});
test('COP → USD divide por la TRM', () => {
  const c = calcularTransferencia({origen:'debito',destino:'arq',monto:500000,trm:3596});
  assert(c.recibidoTeorico, redondear(500000/3596));
});
function redondear(n){ return Math.round(n*100)/100; }

test('un monto recibido manual detecta la comisión', () => {
  const c = calcularTransferencia({origen:'arq',destino:'debito',monto:100,trm:3596,recibidoManual:355000});
  assert(c.recibidoTeorico, 359600);
  assert(c.recibido, 355000);
  assert(c.comision, 4600);
  ok(c.huboComision);
});
test('sin monto manual, no hay comisión aunque el campo esté vacío (NaN)', () => {
  const c = calcularTransferencia({origen:'arq',destino:'debito',monto:100,trm:3596,recibidoManual:NaN});
  ok(!c.huboComision);
  assert(c.comision, 0);
});
test('un monto manual casi igual al teórico no cuenta como comisión (redondeo)', () => {
  const c = calcularTransferencia({origen:'arq',destino:'debito',monto:100,trm:3596,recibidoManual:359600});
  ok(!c.huboComision, 'diferencia de $0 no debería marcarse como comisión');
});

// ─── El mensaje muestra la conversión, no solo la TRM ────────────────────────
console.log('\nmensajeConfirmacionTransferencia — lo pedido: que diga USD→COP o COP→USD y cuánto:');

test('misma moneda: mensaje simple con las dos cuentas', () => {
  const c = calcularTransferencia({origen:'debito',destino:'nequi',monto:200000,trm:0});
  const msg = mensajeConfirmacionTransferencia(c);
  contiene(msg, 'Davivienda'); contiene(msg, 'Nequi'); contiene(msg, '$200.000');
});

test('USD → COP: dice la dirección y el monto convertido', () => {
  const c = calcularTransferencia({origen:'arq',destino:'debito',monto:100,trm:3596});
  const msg = mensajeConfirmacionTransferencia(c);
  contiene(msg, 'Dólares → Pesos');
  contiene(msg, '$100.00 USD');       // lo que sale
  contiene(msg, '$359.600');          // lo que llega, YA convertido — no solo la TRM
  contiene(msg, '3.596');             // la TRM usada, para que se pueda verificar la cuenta
});

test('COP → USD: dice la dirección opuesta', () => {
  const c = calcularTransferencia({origen:'debito',destino:'arq',monto:500000,trm:3596});
  const msg = mensajeConfirmacionTransferencia(c);
  contiene(msg, 'Pesos → Dólares');
  contiene(msg, '$500.000');
  contiene(msg, 'USD'); // el monto que llega, en dólares
});

test('con comisión: el mensaje avisa que llega menos de lo teórico', () => {
  const c = calcularTransferencia({origen:'arq',destino:'debito',monto:100,trm:3596,recibidoManual:355000});
  const msg = mensajeConfirmacionTransferencia(c);
  contiene(msg, 'comisión');
  contiene(msg, '$355.000'); // lo que de verdad llega
});

test('sin comisión, el mensaje no la menciona', () => {
  const c = calcularTransferencia({origen:'arq',destino:'debito',monto:100,trm:3596});
  ok(!mensajeConfirmacionTransferencia(c).includes('comisión'));
});

// ─── Cancelar la confirmación no debe mover ni un peso ───────────────────────
console.log('\nCancelar en el modal: doTransfer no debe tocar cuentas ni guardar nada:');

function prepararEntorno(){
  ev(`
    globalThis.__el = function(){
      const el = { style:{}, dataset:{}, value:'', textContent:'', innerHTML:'', className:'',
        classList:{add(){},remove(){},toggle(){},contains(){return false}},
        appendChild(){}, addEventListener(){}, removeEventListener(){}, focus(){},
        querySelector(){return null}, querySelectorAll(){return []}, options:[] };
      return el;
    };
    globalThis.pendingSaves = 0;
    globalThis.registrarErrorDiagnostico = function(){};
  `);
}

await test('cancelar deja los saldos exactamente iguales', async () => {
  prepararEntorno();
  set('accounts', {nequi:500000,debito:2000000,nu:0,lulo:0,arq:100,ontop:0,trm:3596,davtc:0,rappitc:0});
  set('entries', []);
  set('currentUserId', 'u1');

  const campos = { 'tr-origen':'arq', 'tr-destino':'debito', 'tr-monto':'100', 'tr-trm':'', 'tr-recibido':'' };
  ev(`document.getElementById = function(id){
    const el = globalThis.__el();
    el.value = (${JSON.stringify(campos)})[id] ?? '';
    return el;
  }`);
  ev(`globalThis.customConfirm = function(){ return Promise.resolve(false); };`); // el usuario cancela
  let sbLlamado = false;
  ev(`globalThis.sb = { from(){ globalThis.__sbLlamado = true; return {}; } };`);

  const saldosAntes = { arq: src.__eval('accounts.arq'), debito: src.__eval('accounts.debito') };
  await src.doTransfer();

  assert(src.__eval('accounts.arq'), saldosAntes.arq, 'arq no debería cambiar');
  assert(src.__eval('accounts.debito'), saldosAntes.debito, 'debito no debería cambiar');
  assert(src.__eval('entries').length, 0, 'no debería crearse ningún movimiento');
  ok(!src.__eval('globalThis.__sbLlamado'), 'no debería llamarse a Supabase en absoluto');
});

console.log(`\n${'─'.repeat(46)}`);
console.log(`  ${passed} passed  |  ${failed} failed`);
if(failed > 0) process.exit(1);
