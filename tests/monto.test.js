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

// ─── Mock input ───────────────────────────────────────────────────────────────
function mockInput(id, value='', dataCurrency='COP') {
  const attrs = { 'data-currency': dataCurrency };
  return {
    id, value,
    getAttribute: (k) => attrs[k] ?? null,
    setAttribute: (k, v) => { attrs[k] = String(v); },
    _attrs: attrs,
  };
}

// ─── Funciones bajo test (copia exacta del JS producción) ────────────────────

function formatearInputMonto(el) {
  if (el.getAttribute('data-currency') === 'USD') return;
  const digitos = el.value.replace(/\D/g, '');
  el.value = digitos ? Number(digitos).toLocaleString('es-CO') : '';
}

function setAmountInputMode(inp, isUSD, placeholderCOP) {
  if (!inp) return;
  const prev = inp.getAttribute('data-currency');
  const next = isUSD ? 'USD' : 'COP';
  if (prev && prev !== next) inp.value = '';
  inp.setAttribute('data-currency', next);
  inp.placeholder = isUSD ? '0.00' : (placeholderCOP || 'Monto');
}

function parseMontoFormateado(str) {
  const s = String(str).trim();
  if (/\.\d{1,2}$/.test(s) && !/\.\d{3}/.test(s)) return parseFloat(s) || 0;
  return parseFloat(s.replace(/\./g, '')) || 0;
}

// ─── Tests: formatearInputMonto ───────────────────────────────────────────────
console.log('\nformatearInputMonto (COP — data-currency=COP):');

test('"50000" → "50.000"', () => {
  const el = mockInput('express-amount', '50000', 'COP');
  formatearInputMonto(el); assert(el.value, '50.000');
});
test('"1234567" → "1.234.567"', () => {
  const el = mockInput('inp-amount', '1234567', 'COP');
  formatearInputMonto(el); assert(el.value, '1.234.567');
});
test('strip punto: "12." → "12"', () => {
  const el = mockInput('express-amount', '12.', 'COP');
  formatearInputMonto(el); assert(el.value, '12');
});
test('vacío queda vacío', () => {
  const el = mockInput('express-amount', '', 'COP');
  formatearInputMonto(el); assert(el.value, '');
});

console.log('\nformatearInputMonto (USD — data-currency=USD, no altera):');

test('"10." no se altera', () => {
  const el = mockInput('express-amount', '10.', 'USD');
  formatearInputMonto(el); assert(el.value, '10.');
});
test('"10.4" no se altera', () => {
  const el = mockInput('express-amount', '10.4', 'USD');
  formatearInputMonto(el); assert(el.value, '10.4');
});
test('"10.40" no se altera', () => {
  const el = mockInput('express-amount', '10.40', 'USD');
  formatearInputMonto(el); assert(el.value, '10.40');
});
test('"0.99" no se altera', () => {
  const el = mockInput('express-amount', '0.99', 'USD');
  formatearInputMonto(el); assert(el.value, '0.99');
});
test('"10,40" (coma) no se altera', () => {
  const el = mockInput('express-amount', '10,40', 'USD');
  formatearInputMonto(el); assert(el.value, '10,40');
});

// ─── Tests: setAmountInputMode ────────────────────────────────────────────────
console.log('\nsetAmountInputMode:');

test('isUSD=true → data-currency=USD', () => {
  const el = mockInput('express-amount', '', 'COP');
  setAmountInputMode(el, true, '0');
  assert(el.getAttribute('data-currency'), 'USD');
});
test('isUSD=true → placeholder="0.00"', () => {
  const el = mockInput('express-amount', '', 'COP');
  setAmountInputMode(el, true, '0');
  assert(el.placeholder, '0.00');
});
test('isUSD=false → data-currency=COP', () => {
  const el = mockInput('express-amount', '', 'USD');
  setAmountInputMode(el, false, '0');
  assert(el.getAttribute('data-currency'), 'COP');
});
test('cambio USD→COP limpia el valor', () => {
  const el = mockInput('express-amount', '10.50', 'USD');
  setAmountInputMode(el, false, '0');
  assert(el.value, '');
});
test('cambio COP→USD limpia el valor', () => {
  const el = mockInput('inp-amount', '50.000', 'COP');
  setAmountInputMode(el, true, 'Monto');
  assert(el.value, '');
});
test('misma moneda no limpia el valor', () => {
  const el = mockInput('express-amount', '10.40', 'USD');
  setAmountInputMode(el, true, '0');
  assert(el.value, '10.40');
});

// ─── Flujo express: cambiar de COP a USD y escribir decimal ──────────────────
console.log('\nFlujo completo express (COP → USD → decimal):');

test('abrir con COP, cambiar a USD, escribir "10.40" → sin alterar', () => {
  const el = mockInput('express-amount', '', 'COP'); // valor inicial HTML
  // Simular cambio de cuenta a Ontop (USD)
  setAmountInputMode(el, true, '0');
  assert(el.getAttribute('data-currency'), 'USD');
  // Simular usuario escribe "10.40"
  el.value = '10.40';
  formatearInputMonto(el);       // oninput dispara
  assert(el.value, '10.40');     // sin cambios
});
test('formatear USD → parsear → 10.4', () => {
  const el = mockInput('express-amount', '10.40', 'USD');
  formatearInputMonto(el);
  assertClose(parseMontoFormateado(el.value), 10.4);
});

// ─── Tests: parseMontoFormateado ─────────────────────────────────────────────
console.log('\nparseMontoFormateado:');

test('"10.40" → 10.4',   () => assertClose(parseMontoFormateado('10.40'), 10.4));
test('"10.4"  → 10.4',   () => assertClose(parseMontoFormateado('10.4'),  10.4));
test('"0.99"  → 0.99',   () => assertClose(parseMontoFormateado('0.99'),  0.99));
test('"50.000" → 50000', () => assert(parseMontoFormateado('50.000'), 50000));
test('"1.234.567" → 1234567', () => assert(parseMontoFormateado('1.234.567'), 1234567));
test('"1.500" → 1500',   () => assert(parseMontoFormateado('1.500'), 1500));
test('"10"    → 10',     () => assert(parseMontoFormateado('10'), 10));
test('""      → 0',      () => assert(parseMontoFormateado(''), 0));

console.log(`\n${'─'.repeat(44)}`);
console.log(`  ${passed} passed  |  ${failed} failed`);
if(failed > 0) process.exit(1);
