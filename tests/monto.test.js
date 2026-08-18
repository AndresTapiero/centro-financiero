// Tests para formatearInputMonto, parseMontoFormateado, _esCuentaUSD
// Ejecutar con: node tests/monto.test.js

let passed = 0, failed = 0;

function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.log(`  ✗ ${name}\n    → ${e.message}`); failed++; }
}
function assert(actual, expected, msg) {
  if (actual !== expected)
    throw new Error(`${msg||''}: esperado ${JSON.stringify(expected)}, obtenido ${JSON.stringify(actual)}`);
}
function assertClose(actual, expected, msg) {
  if (Math.abs(actual - expected) > 0.0001)
    throw new Error(`${msg||''}: esperado ~${expected}, obtenido ${actual}`);
}

// ─── Mock DOM ────────────────────────────────────────────────────────────────
const _domElements = {};
function mockInput(id, initialValue = '', currency = null) {
  const el = { id, value: initialValue, type: 'text', placeholder: '', oninput: null, dataset: {} };
  _domElements[id] = el;
  return el;
}
function mockSelect(id, value) {
  const el = { id, value };
  _domElements[id] = el;
  return el;
}

// Simular document.getElementById
global.document = {
  getElementById: (id) => _domElements[id] || null,
};

// Simular ACCOUNTS_META y dynamicAccounts
global.ACCOUNTS_META = {
  debito:   { label: 'Davivienda', currency: 'COP', type: 'debito' },
  nequi:    { label: 'Nequi',      currency: 'COP', type: 'debito' },
  davtc:    { label: 'Davivienda TC', currency: 'COP', type: 'credito' },
  arq:      { label: 'ARQ',        currency: 'USD', type: 'debito' },
  ontop:    { label: 'Ontop',      currency: 'USD', type: 'debito' },
};
global.dynamicAccounts = {};

// ─── Pegar funciones bajo test (exactas del JS) ──────────────────────────────

const _ACC_FOR_AMOUNT = {
  'inp-amount':     'inp-account',
  'express-amount': 'express-account',
  'pend-amount':    'pend-account',
};

function _esCuentaUSD(el) {
  const accSelId = _ACC_FOR_AMOUNT[el.id];
  if (!accSelId) return false;
  const accEl = document.getElementById(accSelId);
  if (!accEl) return false;
  const acc = accEl.value;
  const meta = (typeof ACCOUNTS_META !== 'undefined' && ACCOUNTS_META[acc])
             || (typeof dynamicAccounts !== 'undefined' && dynamicAccounts[acc]);
  if (!meta) return false;
  if (el.id === 'inp-amount') {
    const ov = document.getElementById('inp-currency');
    if (meta.currency === 'USD' && ov) return ov.value === 'USD';
  }
  return meta.currency === 'USD';
}

function formatearInputMonto(el) {
  if (_esCuentaUSD(el)) return;
  const digitos = el.value.replace(/\D/g, '');
  el.value = digitos ? Number(digitos).toLocaleString('es-CO') : '';
}

function parseMontoFormateado(str) {
  const s = String(str).trim();
  if (/\.\d{1,2}$/.test(s) && !/\.\d{3}/.test(s)) return parseFloat(s) || 0;
  return parseFloat(s.replace(/\./g, '')) || 0;
}

// ─── Tests: _esCuentaUSD ─────────────────────────────────────────────────────
console.log('\n_esCuentaUSD:');

test('express-amount con Ontop → true', () => {
  mockSelect('express-account', 'ontop');
  const inp = mockInput('express-amount');
  assert(_esCuentaUSD(inp), true);
});

test('express-amount con ARQ → true', () => {
  mockSelect('express-account', 'arq');
  const inp = mockInput('express-amount');
  assert(_esCuentaUSD(inp), true);
});

test('express-amount con Nequi → false', () => {
  mockSelect('express-account', 'nequi');
  const inp = mockInput('express-amount');
  assert(_esCuentaUSD(inp), false);
});

test('express-amount con Davivienda TC (COP crédito) → false', () => {
  mockSelect('express-account', 'davtc');
  const inp = mockInput('express-amount');
  assert(_esCuentaUSD(inp), false);
});

test('inp-amount con ARQ y override USD → true', () => {
  mockSelect('inp-account', 'arq');
  mockSelect('inp-currency', 'USD');
  const inp = mockInput('inp-amount');
  assert(_esCuentaUSD(inp), true);
});

test('inp-amount con ARQ pero override COP → false', () => {
  mockSelect('inp-account', 'arq');
  mockSelect('inp-currency', 'COP');
  const inp = mockInput('inp-amount');
  assert(_esCuentaUSD(inp), false);
});

test('pend-amount con Ontop → true', () => {
  mockSelect('pend-account', 'ontop');
  const inp = mockInput('pend-amount');
  assert(_esCuentaUSD(inp), true);
});

test('pend-amount con Debito → false', () => {
  mockSelect('pend-account', 'debito');
  const inp = mockInput('pend-amount');
  assert(_esCuentaUSD(inp), false);
});

// ─── Tests: formatearInputMonto (COP) ────────────────────────────────────────
console.log('\nformatearInputMonto (COP):');

test('50000 → "50.000"', () => {
  mockSelect('express-account', 'nequi');
  const inp = mockInput('express-amount', '50000');
  formatearInputMonto(inp);
  assert(inp.value, '50.000');
});

test('1234567 → "1.234.567"', () => {
  mockSelect('express-account', 'debito');
  const inp = mockInput('express-amount', '1234567');
  formatearInputMonto(inp);
  assert(inp.value, '1.234.567');
});

test('valor vacío queda vacío', () => {
  mockSelect('express-account', 'nequi');
  const inp = mockInput('express-amount', '');
  formatearInputMonto(inp);
  assert(inp.value, '');
});

// ─── Tests: formatearInputMonto (USD — NO debe alterar el valor) ─────────────
console.log('\nformatearInputMonto (USD — no altera):');

test('Ontop: "10." no se altera → "10."', () => {
  mockSelect('express-account', 'ontop');
  const inp = mockInput('express-amount', '10.');
  formatearInputMonto(inp);
  assert(inp.value, '10.'); // no tocado
});

test('Ontop: "10.4" no se altera → "10.4"', () => {
  mockSelect('express-account', 'ontop');
  const inp = mockInput('express-amount', '10.4');
  formatearInputMonto(inp);
  assert(inp.value, '10.4');
});

test('Ontop: "10.40" no se altera → "10.40"', () => {
  mockSelect('express-account', 'ontop');
  const inp = mockInput('express-amount', '10.40');
  formatearInputMonto(inp);
  assert(inp.value, '10.40');
});

test('ARQ: "0.99" no se altera', () => {
  mockSelect('express-account', 'arq');
  const inp = mockInput('express-amount', '0.99');
  formatearInputMonto(inp);
  assert(inp.value, '0.99');
});

test('inp-amount USD override: "5.75" no se altera', () => {
  mockSelect('inp-account', 'arq');
  mockSelect('inp-currency', 'USD');
  const inp = mockInput('inp-amount', '5.75');
  formatearInputMonto(inp);
  assert(inp.value, '5.75');
});

test('inp-amount COP override: "5.75" se formatea (dot se strip)', () => {
  mockSelect('inp-account', 'arq');
  mockSelect('inp-currency', 'COP');
  const inp = mockInput('inp-amount', '5.75');
  formatearInputMonto(inp);
  assert(inp.value, '575'); // strip non-digits → 575 → "575"
});

// ─── Tests: parseMontoFormateado ─────────────────────────────────────────────
console.log('\nparseMontoFormateado:');

test('"10.40" → 10.4', () => assertClose(parseMontoFormateado('10.40'), 10.4));
test('"10.4" → 10.4',  () => assertClose(parseMontoFormateado('10.4'),  10.4));
test('"0.99" → 0.99',  () => assertClose(parseMontoFormateado('0.99'),  0.99));
test('"50.000" → 50000 (COP miles)', () => assert(parseMontoFormateado('50.000'), 50000));
test('"1.234.567" → 1234567',        () => assert(parseMontoFormateado('1.234.567'), 1234567));
test('"1.500" → 1500 (no confunde con decimal)', () => assert(parseMontoFormateado('1.500'), 1500));
test('"10" → 10',  () => assert(parseMontoFormateado('10'), 10));
test('"" → 0',     () => assert(parseMontoFormateado(''), 0));

// ─── Resumen ──────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(44)}`);
console.log(`  ${passed} passed  |  ${failed} failed`);
if (failed > 0) process.exit(1);
