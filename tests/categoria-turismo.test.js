// Tests: categoría "Turismo" y sus 5 subcategorías
// node tests/categoria-turismo.test.js

import { cargarFuente } from './helpers/cargar-fuente.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '..');

const src = cargarFuente([
  'js/constantes.js','js/movimientos.js','js/cuentas-carga.js','js/balances-formato.js',
  'js/filtros-busqueda.js','js/render-metricas.js',
], ['CAPS','COLORS','CATEGORIAS_IRREGULARES','KEYWORD_MAP']);

const { CAPS, COLORS, CATEGORIAS_IRREGULARES, KEYWORD_MAP,
        reglaSugerida, categoriasControlables, col } = src;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch(e) { console.log(`  ✗ ${name}\n    → ${e.message}`); failed++; }
}
function assert(a, b, msg) {
  if(a!==b) throw new Error(`${msg||''}: esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)}`);
}
function ok(c, m) { if(!c) throw new Error(m||'falló'); }

const SUBCATS = [
  'Turismo · Alojamiento','Turismo · Transporte','Turismo · Actividades',
  'Turismo · Alimentación','Turismo · Compras',
];

console.log('\nLas 5 subcategorías existen donde tienen que existir:');

for (const cat of SUBCATS) {
  test(`"${cat}" tiene tope en CAPS`, () => ok(CAPS[cat] > 0));
  test(`"${cat}" tiene color propio`, () => ok(COLORS[cat]));
  test(`"${cat}" es irregular (no distorsiona el ritmo diario)`, () => ok(CATEGORIAS_IRREGULARES.has(cat)));
  test(`"${cat}" queda fuera de "variable vs tope" por ser irregular`, () =>
    ok(!categoriasControlables().includes(cat)));
}

test('los 5 colores son distintos entre sí', () => {
  const colores = SUBCATS.map(c => COLORS[c]);
  assert(new Set(colores).size, 5, 'no deberían repetirse colores dentro del grupo');
});

test('col() resuelve cada subcategoría a su propio color', () => {
  for (const cat of SUBCATS) assert(col(cat), COLORS[cat]);
});

console.log('\nSouvenirs y compras para la casa van en "Turismo · Compras":');

test('"Compras (souvenirs)" es una de las 5 subcategorías', () =>
  ok(SUBCATS.includes('Turismo · Compras')));

console.log('\nSe autosugiere al escribir la descripción:');

const catDe = texto => {
  const norm = texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
  const r = reglaSugerida(norm);
  return r ? (r.cat ?? ('special:' + r.special)) : null;
};
test('"Hotel en Cartagena" → Alojamiento', () => assert(catDe('Hotel en Cartagena'), 'Turismo · Alojamiento'));
test('"Airbnb" → Alojamiento', () => assert(catDe('Airbnb'), 'Turismo · Alojamiento'));
test('"Tiquete aéreo" → Transporte', () => assert(catDe('Tiquete aereo'), 'Turismo · Transporte'));
test('"Tour por la ciudad" → Actividades', () => assert(catDe('Tour por la ciudad'), 'Turismo · Actividades'));
test('"Souvenir para mamá" → Compras', () => assert(catDe('Souvenir para mama'), 'Turismo · Compras'));

test('no choca con ninguna palabra clave existente (estructural)', () => {
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

console.log('\nDisponibles en los selectores del HTML:');

const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
test('las 5 aparecen en el select de Nuevo movimiento (inp-cat)', () => {
  const bloque = html.slice(html.indexOf('id="inp-cat"'), html.indexOf('</select>', html.indexOf('id="inp-cat"')));
  for (const cat of SUBCATS) ok(bloque.includes(`value="${cat}"`), `falta ${cat}`);
});
test('las 5 aparecen en el select de Pendientes (pend-cat)', () => {
  const bloque = html.slice(html.indexOf('id="pend-cat"'), html.indexOf('</select>', html.indexOf('id="pend-cat"')));
  for (const cat of SUBCATS) ok(bloque.includes(`value="${cat}"`), `falta ${cat}`);
});
test('el grupo se llama "Turismo" en ambos selectores', () => {
  ok(html.includes('optgroup label="🧳 Turismo"'));
  assert((html.match(/optgroup label="🧳 Turismo"/g) || []).length, 2);
});

console.log(`\n${'─'.repeat(46)}`);
console.log(`  ${passed} passed  |  ${failed} failed`);
if(failed > 0) process.exit(1);
