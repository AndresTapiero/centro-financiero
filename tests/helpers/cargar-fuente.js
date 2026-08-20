// cargar-fuente.js
// Ejecuta archivos JS de producción tal cual, en un sandbox de Node, y devuelve sus globales.
//
// Antes los tests llevaban una copia pegada a mano de las funciones que probaban: si producción
// cambiaba, los tests seguían en verde probando la versión vieja. Ahora se lee el archivo real,
// así que no hay forma de que el test y el código se desincronicen.
//
// Los scripts del proyecto se cargan con <script> plano (no son módulos). En el navegador, varios
// scripts clásicos comparten un único ámbito léxico global, así que un `const` de un archivo es
// visible desde el siguiente. Para reproducir eso, aquí se concatenan todos los archivos y se
// ejecutan como un solo script — si se corrieran por separado, cada `const` quedaría encerrado en
// su propio ámbito y las referencias cruzadas fallarían.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '..', '..');

/** Stub mínimo del DOM: solo lo que los archivos tocan al cargarse (no dentro de funciones). */
function crearSandbox() {
  const noop = () => {};
  const elementoVacio = () => ({
    style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    appendChild: noop, addEventListener: noop, removeEventListener: noop,
    querySelector: () => null, querySelectorAll: () => [],
  });
  const sandbox = {
    console,
    document: {
      documentElement: elementoVacio(),
      body: elementoVacio(),
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: noop,
      createElement: elementoVacio,
    },
    window: {},
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    navigator: { onLine: true },
    indexedDB: undefined,
    setTimeout, clearTimeout, setInterval, clearInterval,
    Intl, Date, Math, JSON, Number, String, Object, Array, Map, Set, RegExp, Boolean, Promise, Error,
    isNaN, parseFloat, parseInt,
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  return vm.createContext(sandbox);
}

/**
 * @param {string[]} archivos - rutas relativas a la raíz del repo, en orden de carga
 * @param {string[]} [nombres] - identificadores declarados con const/let que se quieren exponer
 *                               (las `function` ya quedan en el global por sí solas)
 * @returns {object} el contexto con las funciones y variables globales definidas
 */
export function cargarFuente(archivos, nombres = []) {
  const ctx = crearSandbox();
  const partes = archivos.map(rel => {
    const codigo = fs.readFileSync(path.join(RAIZ, rel), 'utf8');
    return `/* ─── ${rel} ─── */\n${codigo}`;
  });

  // Los const/let/class de nivel superior no aparecen en globalThis (ni aquí ni en el navegador).
  // __eval es un eval DIRECTO dentro del ámbito del script, así que sí alcanza esas variables:
  // permite tanto leerlas (`__eval('MovimientoListRenderer')`) como reasignarlas
  // (`__eval('accounts = {...}')`) para montar el estado de cada test.
  const epilogo = [
    'globalThis.__eval = function(codigo){ return eval(codigo); };',
    ...nombres.map(n => `try{ globalThis[${JSON.stringify(n)}] = ${n}; }catch(e){}`),
  ].join('\n');

  try {
    vm.runInContext(partes.join('\n;\n') + '\n;\n' + epilogo, ctx, { filename: 'fuente-concatenada.js' });
  } catch (e) {
    throw new Error(`No se pudo cargar la fuente (${archivos.join(', ')}): ${e.message}`);
  }
  return ctx;
}
