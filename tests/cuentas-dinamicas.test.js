// Tests: las cuentas creadas por el usuario aparecen en TODOS los selectores de cuenta
// node tests/cuentas-dinamicas.test.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
const metas = fs.readFileSync(path.join(RAIZ, 'js/metas.js'), 'utf8');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch(e) { console.log(`  ✗ ${name}\n    → ${e.message}`); failed++; }
}
function ok(c, m) { if(!c) throw new Error(m||'falló'); }

// Todo <select> del HTML que lista cuentas reales (contiene la opción de Davivienda).
const selectoresDeCuentas = [...html.matchAll(/<select[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)]
  .filter(m => m[2].includes('value="debito"') && m[2].includes('value="nequi"'))
  .map(m => m[1])
  // 'edit-entry-account' y 'pay-modal-account' se reconstruyen enteros al abrirse, con las dinámicas incluidas
  .filter(id => !['edit-entry-account','pay-modal-account'].includes(id));

console.log('\nSelectores de cuenta del HTML:');
test('se detectaron los selectores esperados', () => {
  for (const id of ['inp-account','express-account','pend-account','tr-origen','tr-destino'])
    ok(selectoresDeCuentas.includes(id), `no se detectó ${id}`);
});

console.log('\nrefreshAllAccountSelectors los cubre todos (regresión: express-account faltaba):');
const listaEnCodigo = (metas.match(/\[('inp-account'[^\]]*)\]\.forEach/) || [])[1] || '';
for (const id of selectoresDeCuentas) {
  test(`"${id}" está en la lista que se refresca`, () => ok(listaEnCodigo.includes(`'${id}'`), `falta '${id}' en refreshAllAccountSelectors`));
}

console.log(`\n${'─'.repeat(46)}`);
console.log(`  ${passed} passed  |  ${failed} failed`);
if(failed > 0) process.exit(1);
