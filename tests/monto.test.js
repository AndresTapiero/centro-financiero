// Tests: formatearInputMonto, setAmountInputMode, parseMontoFormateado, parseNum
// node tests/monto.test.js
//
// Las funciones NO se copian aquí: se cargan desde js/ con el helper cargar-fuente,
// así que estos tests siempre corren contra el código que está en producción.

import { cargarFuente } from './helpers/cargar-fuente.js';

const src = cargarFuente(
  ['js/constantes.js', 'js/movimientos.js', 'js/cuentas-carga.js', 'js/balances-formato.js'],
  ['_monedaInput'],
);
const { formatearInputMonto, setAmountInputMode, parseMontoFormateado, parseNum, _monedaInput } = src;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch(e) { console.log(`  ✗ ${name}\n    → ${e.message}`); failed++; }
}
function assert(a, b, msg) {
  if(a!==b) throw new Error(`${msg||''}: esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)}`);
}
function assertClose(a, b, msg) {
  if(Math.abs(a-b)>0.0001) throw new Error(`${msg||''}: esperado ~${b}, obtenido ${a}`);
}

// ─── Mock input (simula elemento DOM) ────────────────────────────────────────
function mockInput(id, value='', dataCurrency='COP') {
  const attrs = {'data-currency': dataCurrency};
  return {
    id, value, placeholder:'',
    getAttribute: k => attrs[k] ?? null,
    setAttribute: (k,v) => { attrs[k]=String(v); },
  };
}

// ─── Reset del estado global entre tests ─────────────────────────────────────
function resetMoneda() {
  _monedaInput['inp-amount']     = 'COP';
  _monedaInput['express-amount'] = 'COP';
  _monedaInput['pend-amount']    = 'COP';
}

// 'accounts' es un `let` de nivel superior: asignar src.accounts=... no lo actualiza (el
// binding real vive en el entorno léxico del script, no como propiedad del objeto global).
// Hay que reasignarlo con __eval, igual que con pendingSaves en otros archivos de test.
function fijarAccounts(obj) {
  src.__fijarTmp = obj;
  src.__eval('accounts = globalThis.__fijarTmp');
}

// ─── Tests: formatearInputMonto (COP) ─────────────────────────────────────────
console.log('\nformatearInputMonto (COP, variable global):');

test('"50000" → "50.000"', () => {
  resetMoneda();
  const el = mockInput('express-amount', '50000');
  formatearInputMonto(el); assert(el.value, '50.000');
});
test('"1234567" → "1.234.567"', () => {
  resetMoneda();
  const el = mockInput('inp-amount', '1234567');
  formatearInputMonto(el); assert(el.value, '1.234.567');
});
test('"12." → "12" (strip punto en COP)', () => {
  resetMoneda();
  const el = mockInput('express-amount', '12.');
  formatearInputMonto(el); assert(el.value, '12');
});
test('vacío → vacío', () => {
  resetMoneda();
  const el = mockInput('express-amount', '');
  formatearInputMonto(el); assert(el.value, '');
});

// ─── Tests: setAmountInputMode cambia la variable global ──────────────────────
console.log('\nsetAmountInputMode (actualiza _monedaInput):');

test('isUSD=true → _monedaInput[express-amount]="USD"', () => {
  resetMoneda();
  const el = mockInput('express-amount', '');
  setAmountInputMode(el, true, '0');
  assert(_monedaInput['express-amount'], 'USD');
});
test('isUSD=false → _monedaInput[express-amount]="COP"', () => {
  _monedaInput['express-amount'] = 'USD';
  const el = mockInput('express-amount', '');
  setAmountInputMode(el, false, '0');
  assert(_monedaInput['express-amount'], 'COP');
});
test('también actualiza data-currency en el DOM', () => {
  resetMoneda();
  const el = mockInput('express-amount', '');
  setAmountInputMode(el, true, '0');
  assert(el.getAttribute('data-currency'), 'USD');
});
test('cambio COP→USD limpia valor', () => {
  resetMoneda();
  const el = mockInput('express-amount', '50.000');
  setAmountInputMode(el, true, '0');
  assert(el.value, '');
});
test('misma moneda NO limpia valor', () => {
  _monedaInput['express-amount'] = 'USD';
  const el = mockInput('express-amount', '10.40');
  el.setAttribute('data-currency', 'USD');
  setAmountInputMode(el, true, '0');
  assert(el.value, '10.40');
});

// ─── Tests: formatearInputMonto (USD via variable global) ────────────────────
console.log('\nformatearInputMonto (USD — después de setAmountInputMode):');

test('Ontop: "10." no se altera', () => {
  resetMoneda();
  const el = mockInput('express-amount', '');
  setAmountInputMode(el, true, '0');   // simula cambio a Ontop
  el.value = '10.';
  formatearInputMonto(el);
  assert(el.value, '10.');
});
test('Ontop: "10.4" no se altera', () => {
  resetMoneda();
  const el = mockInput('express-amount', '');
  setAmountInputMode(el, true, '0');
  el.value = '10.4';
  formatearInputMonto(el);
  assert(el.value, '10.4');
});
test('Ontop: "10.40" no se altera', () => {
  resetMoneda();
  const el = mockInput('express-amount', '');
  setAmountInputMode(el, true, '0');
  el.value = '10.40';
  formatearInputMonto(el);
  assert(el.value, '10.40');
});
test('ARQ: "0.99" no se altera', () => {
  resetMoneda();
  const el = mockInput('express-amount', '');
  setAmountInputMode(el, true, '0');
  el.value = '0.99';
  formatearInputMonto(el);
  assert(el.value, '0.99');
});

// ─── Flujo completo: abrir express con COP, cambiar a USD, escribir decimal ──
console.log('\nFlujo express completo (COP → USD → "10.40"):');

test('Flujo completo sin alterar el decimal', () => {
  resetMoneda();
  const el = mockInput('express-amount', '', 'COP');
  assert(_monedaInput['express-amount'], 'COP');
  setAmountInputMode(el, true, '0');
  assert(_monedaInput['express-amount'], 'USD', 'variable global debe ser USD');
  el.value='10.'; formatearInputMonto(el); assert(el.value,'10.','10. debe pasar');
  el.value='10.4'; formatearInputMonto(el); assert(el.value,'10.4','10.4 debe pasar');
  el.value='10.40'; formatearInputMonto(el); assert(el.value,'10.40','10.40 debe pasar');
  assertClose(parseMontoFormateado(el.value), 10.4);
});

test('Volver a COP → decimal se strip', () => {
  resetMoneda();
  const el = mockInput('express-amount', '');
  setAmountInputMode(el, true, '0');   // USD
  setAmountInputMode(el, false, '0');  // vuelve a COP
  assert(_monedaInput['express-amount'], 'COP');
  el.value = '10.';
  formatearInputMonto(el);
  assert(el.value, '10'); // punto eliminado en COP
});

// ─── Tests: parseMontoFormateado ──────────────────────────────────────────────
console.log('\nparseMontoFormateado:');

test('"10.40" → 10.4',   () => assertClose(parseMontoFormateado('10.40'), 10.4));
test('"10.4"  → 10.4',   () => assertClose(parseMontoFormateado('10.4'),  10.4));
test('"0.99"  → 0.99',   () => assertClose(parseMontoFormateado('0.99'),  0.99));
test('"50.000" → 50000', () => assert(parseMontoFormateado('50.000'), 50000));
test('"1.234.567" → 1234567', () => assert(parseMontoFormateado('1.234.567'), 1234567));
test('"1.500" → 1500',   () => assert(parseMontoFormateado('1.500'), 1500));
test('"10"    → 10',     () => assert(parseMontoFormateado('10'), 10));
test('""      → 0',      () => assert(parseMontoFormateado(''), 0));

// ─── Tests: parseNum — regresión del bug que destruía saldos ──────────────────
// parseNum lee lo que fillAccountInputs()/updateCap() escribieron ya formateado.
// Antes hacía parseFloat() con los puntos de miles puestos: "$3.039.260" → 3.039.
// Bastaba entrar y salir de un campo de saldo, sin escribir, para que la app
// ofreciera registrar un "faltante" de tres millones y dejara la cuenta en $3.
console.log('\nparseNum (saldos y topes ya formateados):');

test('"$3.039.260" → 3039260 (no 3.039)', () => assert(parseNum('$3.039.260'), 3039260));
test('"$605.254"   → 605254',             () => assert(parseNum('$605.254'), 605254));
test('"$3.000"     → 3000 (no 3)',        () => assert(parseNum('$3.000'), 3000));
test('"$1.187.348" → 1187348',            () => assert(parseNum('$1.187.348'), 1187348));
test('"$999"       → 999',                () => assert(parseNum('$999'), 999));
test('"$3596"      → 3596 (TRM)',         () => assert(parseNum('$3596'), 3596));
test('"800.000"    → 800000 (tope)',      () => assert(parseNum('800.000'), 800000));
test('"1.630.000"  → 1630000 (tope)',     () => assert(parseNum('1.630.000'), 1630000));
test('"$231.28 USD" → 231.28',            () => assertClose(parseNum('$231.28 USD'), 231.28));
test('"$73.75 USD"  → 73.75',             () => assertClose(parseNum('$73.75 USD'), 73.75));
test('"$0.99 USD"   → 0.99',              () => assertClose(parseNum('$0.99 USD'), 0.99));
test('"$-50.000"   → -50000 (negativo)',  () => assert(parseNum('$-50.000'), -50000));
test('""           → 0',                  () => assert(parseNum(''), 0));

// Ida y vuelta: lo que la app pinta debe volver a leerse igual, sin deriva.
console.log('\nparseNum — ida y vuelta con fmtCOP/fmtUSD:');
const { fmtCOP, fmtUSD } = src;
for (const v of [3039260, 605254, 3000, 1187348, 999, 0]) {
  test(`fmtCOP(${v}) → parseNum → ${v}`, () => assert(parseNum(fmtCOP(v)), v));
}
for (const v of [231.28, 73.75, 0.99]) {
  test(`fmtUSD(${v}) → parseNum → ${v}`, () => assertClose(parseNum(fmtUSD(v)), v));
}

// ─── setAmountInputMode — conversión al cambiar de moneda ────────────────────
// Reportado: escribir un monto y luego cambiar de cuenta (COP a USD o viceversa) lo dejaba en
// cero. La idea es que el monto siga siendo "el mismo dinero", convertido con la TRM, en vez
// de forzar a escribirlo de nuevo.
console.log('\nsetAmountInputMode — convierte con la TRM en vez de borrar:');

test('COP → USD: convierte con la TRM en vez de vaciar', () => {
  resetMoneda();
  fijarAccounts({ trm: 4000 });
  const el = mockInput('inp-amount', '400.000', 'COP');
  setAmountInputMode(el, true, '0');
  assert(el.value, '100'); // 400.000 / 4000
});

test('USD → COP: convierte con la TRM en vez de vaciar', () => {
  resetMoneda();
  fijarAccounts({ trm: 4000 });
  const el = mockInput('inp-amount', '', 'COP');
  setAmountInputMode(el, true, '0'); // primero a USD, sin monto
  el.value = '10.5';
  setAmountInputMode(el, false, 'Monto'); // vuelve a COP
  assert(el.value, '42.000'); // 10.5 * 4000, formateado con puntos de miles
});

test('sin TRM disponible, sigue limpiando como antes (no puede convertir)', () => {
  resetMoneda();
  fijarAccounts({}); // sin trm
  const el = mockInput('inp-amount', '400.000', 'COP');
  setAmountInputMode(el, true, '0');
  assert(el.value, '');
});

test('campo vacío al cambiar de moneda: sigue vacío, no aparece un $0', () => {
  resetMoneda();
  fijarAccounts({ trm: 4000 });
  const el = mockInput('inp-amount', '', 'COP');
  setAmountInputMode(el, true, '0');
  assert(el.value, '');
});

test('misma moneda no convierte ni toca el valor (regresión)', () => {
  resetMoneda();
  fijarAccounts({ trm: 4000 });
  const el = mockInput('inp-amount', '15.000', 'COP');
  setAmountInputMode(el, false, 'Monto');
  assert(el.value, '15.000');
});

console.log(`\n${'─'.repeat(46)}`);
console.log(`  ${passed} passed  |  ${failed} failed`);
if(failed > 0) process.exit(1);
