// Tests: formatearInputMonto, setAmountInputMode, parseMontoFormateado
// node tests/monto.test.js

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

// ─── Funciones bajo test (copia exacta del JS producción) ────────────────────

// Variable global de moneda
const _monedaInput = {'inp-amount':'COP','express-amount':'COP','pend-amount':'COP'};

function formatearInputMonto(el) {
  const moneda = _monedaInput[el.id] || el.getAttribute('data-currency') || 'COP';
  if (moneda === 'USD') return;
  const digitos = el.value.replace(/\D/g, '');
  el.value = digitos ? Number(digitos).toLocaleString('es-CO') : '';
}

function setAmountInputMode(inp, isUSD, placeholderCOP) {
  if (!inp) return;
  const next = isUSD ? 'USD' : 'COP';
  const prev = _monedaInput[inp.id] || inp.getAttribute('data-currency') || 'COP';
  if (prev !== next) inp.value = '';
  _monedaInput[inp.id] = next;
  inp.setAttribute('data-currency', next);
  inp.placeholder = isUSD ? '0.00' : (placeholderCOP || 'Monto');
}

function parseMontoFormateado(str) {
  const s = String(str).trim();
  if (/\.\d{1,2}$/.test(s) && !/\.\d{3}/.test(s)) return parseFloat(s) || 0;
  return parseFloat(s.replace(/\./g, '')) || 0;
}

// ─── Reset del estado global entre tests ─────────────────────────────────────
function resetMoneda() {
  _monedaInput['inp-amount']     = 'COP';
  _monedaInput['express-amount'] = 'COP';
  _monedaInput['pend-amount']    = 'COP';
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
  // Estado inicial: COP
  assert(_monedaInput['express-amount'], 'COP');
  // Simular cambio de cuenta a Ontop (USD)
  setAmountInputMode(el, true, '0');
  assert(_monedaInput['express-amount'], 'USD', 'variable global debe ser USD');
  // Simular usuario escribe "10.", luego "10.4", luego "10.40"
  el.value='10.'; formatearInputMonto(el); assert(el.value,'10.','10. debe pasar');
  el.value='10.4'; formatearInputMonto(el); assert(el.value,'10.4','10.4 debe pasar');
  el.value='10.40'; formatearInputMonto(el); assert(el.value,'10.40','10.40 debe pasar');
  // Verificar que parsea correctamente al guardar
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

console.log(`\n${'─'.repeat(46)}`);
console.log(`  ${passed} passed  |  ${failed} failed`);
if(failed > 0) process.exit(1);
