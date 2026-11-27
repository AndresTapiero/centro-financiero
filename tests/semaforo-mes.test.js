// Tests: semáforo del estado del mes
import { cargarFuente } from './helpers/cargar-fuente.js';
const src = cargarFuente(['js/constantes.js','js/modales.js','js/movimientos.js','js/cuentas-carga.js','js/metas.js','js/balances-formato.js']);
const ev = o => src.evaluarSemaforoMes(o);
let p=0,f=0;
function test(n,fn){ try{ fn(); console.log('  ✓ '+n); p++; }catch(e){ console.log('  ✗ '+n+'\n    → '+e.message); f++; } }
function eq(a,b){ if(a!==b) throw new Error(`esperado ${b}, obtenido ${a}`); }
const base={ingresos:4000000,gastos:1000000,gastoVariable:500000,topeVariable:2000000,dia:15,dias:30,cerrado:false};

test('el caso de la captura: día 1, gasto de 240 mil, ingresos de 4 millones → neutro, no rojo', ()=>
  eq(ev({...base,gastos:245000,gastoVariable:240000,dia:1}).estado,'neutro'));
test('gastar más de lo ingresado siempre es rojo', ()=>eq(ev({...base,ingresos:1000000,gastos:1200000}).estado,'mal'));
test('ciclo cerrado con más ingreso que gasto nunca dice que gastaste más', ()=>{
  const r=ev({...base,cerrado:true,dia:30,gastoVariable:2500000,gastos:3000000});
  eq(r.estado,'ojo'); if(r.texto.includes('más de lo que ingresó')) throw new Error(r.texto);
});
test('ciclo cerrado dentro del presupuesto es verde', ()=>eq(ev({...base,cerrado:true,dia:30,gastoVariable:1500000}).estado,'ok'));
test('ritmo alto pero con superávit y sin pasar el presupuesto baja a amarillo', ()=>eq(ev({...base,dia:10,gastoVariable:1000000}).estado,'ojo'));
test('ritmo alto sin superávit relevante y presupuesto pasado es rojo', ()=>eq(ev({...base,dia:10,gastoVariable:2100000,gastos:3900000}).estado,'mal'));
test('sin ingresos aún: neutro', ()=>eq(ev({...base,ingresos:0,gastos:0,gastoVariable:0}).estado,'neutro'));
test('ritmo normal: verde', ()=>eq(ev(base).estado,'ok'));
test('cerca del límite: amarillo', ()=>eq(ev({...base,gastoVariable:1100000}).estado,'ojo'));
console.log(`\n  ${p} passed | ${f} failed`); if(f) process.exit(1);
