// Tests: opción "Todos los meses" en Movimientos
import { cargarFuente } from './helpers/cargar-fuente.js';
const src = cargarFuente(['js/constantes.js','js/movimientos.js','js/cuentas-carga.js','js/balances-formato.js','js/filtros-busqueda.js','js/render-metricas.js']);
const set=(n,v)=>{src.__fijarTmp=v;src.__eval(`${n} = globalThis.__fijarTmp`)};
let p=0,f=0; const test=(n,fn)=>{try{fn();console.log('  ✓ '+n);p++}catch(e){console.log('  ✗ '+n+'\n    → '+e.message);f++}};
const eq=(a,b)=>{if(a!==b)throw new Error(`esperado ${b}, obtenido ${a}`)};
const mov=(id,d,acc)=>({id,date:d,name:'x',amount:1000,cat:'Otro',acc,txType:'gasto'});
set('entries',[mov('1','2026-07-10','rappitc'),mov('2','2026-08-10','rappitc'),mov('3','2026-09-10','rappitc'),mov('4','2026-09-11','nequi')]);
set('currentMonth','2026-09');
console.log('\nmovimientosVisibles:');
test('por defecto solo el ciclo seleccionado', ()=>{set('filterAllMonths',false); eq(src.movimientosVisibles().length,2)});
test('con "Todos los meses" trae todo el historial', ()=>{set('filterAllMonths',true); eq(src.movimientosVisibles().length,4)});
test('cambiar de ciclo no altera el modo "todos"', ()=>{set('currentMonth','2026-08'); eq(src.movimientosVisibles().length,4)});
set('filterAllMonths',false);
console.log(`\n  ${p} passed  |  ${f} failed`); if(f)process.exit(1);
