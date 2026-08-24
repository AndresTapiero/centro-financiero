// Tests: reglaSugerida — la coincidencia de palabras clave del sugeridor de categoría
// node tests/categorias.test.js

import { cargarFuente } from './helpers/cargar-fuente.js';

const src = cargarFuente(
  ['js/constantes.js', 'js/movimientos.js', 'js/cuentas-carga.js', 'js/balances-formato.js'],
  ['KEYWORD_MAP'],
);
const { reglaSugerida, KEYWORD_MAP } = src;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch(e) { console.log(`  ✗ ${name}\n    → ${e.message}`); failed++; }
}
function assert(a, b, msg) {
  if(a!==b) throw new Error(`${msg||''}: esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)}`);
}

/** Normaliza igual que lo hacen las tres funciones de sugerencia antes de llamar a reglaSugerida */
const norm = t => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
const catDe = texto => {
  const r = reglaSugerida(norm(texto));
  return r ? (r.cat ?? ('special:' + r.special)) : null;
};

// ─── Regresión: palabras tapadas por una regla anterior ──────────────────────
// "gasolina" contiene "gas" (Servicios) y "combustible" contiene "bus" (Transporte).
// Con "gana la primera regla", escribir "Gasolina moto" se categorizaba como Servicios.
console.log('\nColisiones de palabras clave (gana la más específica, no la primera):');

test('"Gasolina moto" → Vehículo · Gasolina (no Servicios)', () =>
  assert(catDe('Gasolina moto'), 'Vehículo · Gasolina'));
test('"gasolina" → Vehículo · Gasolina', () =>
  assert(catDe('gasolina'), 'Vehículo · Gasolina'));
test('"Combustible" → Vehículo · Gasolina (no Transporte)', () =>
  assert(catDe('Combustible'), 'Vehículo · Gasolina'));

test('"gas" solo sigue siendo Servicios', () => assert(catDe('Recibo gas'), 'Servicios'));
test('"bus" solo sigue siendo Transporte', () => assert(catDe('Bus a Girardot'), 'Transporte'));

// ─── El resto del mapa no se rompió ──────────────────────────────────────────
console.log('\nCategorías que ya funcionaban:');

const CASOS = [
  ['Mercado del sábado',      'Alimentación · Mercado'],
  ['Uber al centro',          'Transporte'],
  ['Parqueadero moto',        'Vehículo · Parqueadero'],
  ['Taller moto',             'Vehículo · Taller'],
  ['Lavada del carro',        'Vehículo · Lavada'],
  ['Spotify',                 'Suscripciones'],
  ['Netflix',                 'Suscripciones'],
  ['Farmacia',                'Salud'],
  ['Corte de cabello',        'Cuidado personal'],
  ['Protector solar',         'Cuidado personal · Skin Care'],
  ['Bicicleta nueva',         'Deportes · Ciclismo'],
  ['Cine con Sandra',         'Entretenimiento'],
  ['Acueducto',               'Servicios'],
  ['Pago tarjeta',            'Pago Deuda'],
  ['Amazon',                  'Tecnología'],
];
for (const [texto, esperada] of CASOS) {
  test(`"${texto}" → ${esperada}`, () => assert(catDe(texto), esperada));
}

console.log('\nComidas (resuelven a entre semana / fin de semana según la fecha):');
test('"Almuerzo" marca la regla especial de comida', () =>
  assert(catDe('Almuerzo'), 'special:comida'));
test('"Restaurante" marca la regla especial de comida', () =>
  assert(catDe('Restaurante'), 'special:comida'));

console.log('\nSin coincidencia:');
test('texto desconocido no devuelve regla', () => assert(catDe('zzzz qwerty'), null));
test('texto vacío no devuelve regla', () => assert(catDe(''), null));

// ─── Garantía estructural: ninguna palabra debe quedar inalcanzable ──────────
console.log('\nNinguna palabra clave queda tapada:');
test('cada palabra clave resuelve a su propia regla', () => {
  const problemas = [];
  for (const rule of KEYWORD_MAP) {
    const esperada = rule.cat ?? ('special:' + rule.special);
    for (const k of rule.keywords) {
      const obtenida = catDe(k);
      if (obtenida !== esperada) problemas.push(`"${k}" → ${obtenida} (debería ser ${esperada})`);
    }
  }
  if (problemas.length) throw new Error('\n      ' + problemas.join('\n      '));
});

console.log(`\n${'─'.repeat(46)}`);
console.log(`  ${passed} passed  |  ${failed} failed`);
if(failed > 0) process.exit(1);
