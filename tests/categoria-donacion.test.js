// Tests: categoría "Donación"
// node tests/categoria-donacion.test.js

import { cargarFuente } from './helpers/cargar-fuente.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '..');

const src = cargarFuente([
  'js/constantes.js','js/movimientos.js','js/cuentas-carga.js','js/balances-formato.js',
  'js/filtros-busqueda.js','js/render-metricas.js',
], ['CAPS','COLORS','CATEGORIAS_NO_CONTROLABLES','CATS_EXCLUIDAS_HORMIGA','KEYWORD_MAP']);

const { CAPS, COLORS, CATEGORIAS_NO_CONTROLABLES, CATS_EXCLUIDAS_HORMIGA, KEYWORD_MAP,
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

console.log('\nLa categoría "Donación" existe donde tiene que existir:');

test('tiene un tope en CAPS', () => ok(CAPS['Donación'] > 0));
test('tiene un color propio, no el gris genérico de "Otro"', () => {
  ok(COLORS['Donación']);
  ok(COLORS['Donación'] !== COLORS['Otro']);
});
test('col() la resuelve a ese color', () => assert(col('Donación'), COLORS['Donación']));
test('no es una categoría "controlable" (es una decisión, no una fuga discrecional)', () => {
  ok(CATEGORIAS_NO_CONTROLABLES.has('Donación'));
  ok(!categoriasControlables().includes('Donación'));
});
test('está excluida del gasto hormiga', () => ok(CATS_EXCLUIDAS_HORMIGA.has('Donación')));

console.log('\nSe autosugiere al escribir la descripción:');

const catDe = texto => {
  const norm = texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
  const r = reglaSugerida(norm);
  return r ? (r.cat ?? ('special:' + r.special)) : null;
};
test('"Donación mensual" sugiere Donación', () => assert(catDe('Donación mensual'), 'Donación'));
test('"Diezmo" sugiere Donación', () => assert(catDe('Diezmo'), 'Donación'));
test('"Ofrenda especial" sugiere Donación', () => assert(catDe('Ofrenda especial'), 'Donación'));
test('no choca con ninguna palabra clave existente', () => {
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

console.log('\nDisponible en los selectores del HTML:');

const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
test('aparece en el select de Nuevo movimiento (inp-cat)', () => {
  const bloque = html.slice(html.indexOf('id="inp-cat"'), html.indexOf('</select>', html.indexOf('id="inp-cat"')));
  ok(bloque.includes('value="Donación"'));
});
test('aparece en el select de Pendientes (pend-cat)', () => {
  const bloque = html.slice(html.indexOf('id="pend-cat"'), html.indexOf('</select>', html.indexOf('id="pend-cat"')));
  ok(bloque.includes('value="Donación"'));
});

console.log(`\n${'─'.repeat(46)}`);
console.log(`  ${passed} passed  |  ${failed} failed`);
if(failed > 0) process.exit(1);
