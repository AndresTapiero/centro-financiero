// Tests: pendientes repetidos por mes y borrado de la serie
import { cargarFuente } from './helpers/cargar-fuente.js';
const src = cargarFuente(['js/constantes.js','js/modales.js','js/movimientos.js','js/cuentas-carga.js','js/metas.js','js/balances-formato.js','js/filtros-busqueda.js','js/movimiento-list-renderer.js','js/pendiente-list-renderer.js','js/render-metricas.js','js/pendientes-transferencias.js']);
const { sumarMesesFecha, fechasRepeticion, pendientesSiguientes } = src;
let passed=0, failed=0;
function test(n,f){ try{ f(); console.log('  ✓ '+n); passed++; }catch(e){ console.log('  ✗ '+n+'\n    → '+e.message); failed++; } }
function eq(a,b){ if(JSON.stringify(a)!==JSON.stringify(b)) throw new Error(`esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)}`); }

test('suma meses cruzando año', ()=>eq(sumarMesesFecha('2026-11-15',2),'2027-01-15'));
test('31 de enero + 1 mes cae en el último día de febrero', ()=>eq(sumarMesesFecha('2027-01-31',1),'2027-02-28'));
test('repetición cuenta siempre desde la original (31 ene → 31 mar)', ()=>eq(fechasRepeticion('2027-01-31',3),['2027-01-31','2027-02-28','2027-03-31']));
test('pendientesSiguientes solo trae la misma serie en otros ciclos', ()=>{
  const base={id:'a',name:'Netflix',amount:30000,date:'2026-12-05',acc:'debito',cat:'Suscripciones',isIncome:false};
  src.__fijarTmp=[base,
    {...base,id:'b',date:'2027-01-05'},
    {...base,id:'c',date:'2027-02-05'},
    {...base,id:'d',date:'2027-02-05',name:'Otro'},
    {...base,id:'e',date:'2026-12-20'}];
  src.__eval('pendientes = globalThis.__fijarTmp');
  eq(pendientesSiguientes(base).map(x=>x.id),['b','c']);
});
console.log(`\n  ${passed} passed | ${failed} failed`);
if(failed) process.exit(1);
