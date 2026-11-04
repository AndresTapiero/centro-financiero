// Tests: tabla "Comparar ciclos" del Presupuesto
// node tests/comparar-ciclos.test.js
import { cargarFuente } from './helpers/cargar-fuente.js';
const src = cargarFuente(['js/constantes.js','js/movimientos.js','js/cuentas-carga.js','js/balances-formato.js','js/filtros-busqueda.js','js/render-metricas.js']);
const set=(n,v)=>{src.__fijarTmp=v;src.__eval(`${n} = globalThis.__fijarTmp`)};
let p=0,f=0; const test=(n,fn)=>{try{fn();console.log('  ✓ '+n);p++}catch(e){console.log('  ✗ '+n+'\n    → '+e.message);f++}};
const eq=(a,b)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)}`)};
set('accounts',{nequi:0,debito:0,nu:0,lulo:0,arq:0,ontop:0,trm:3600,davtc:0,rappitc:0});
const g=(id,d,a,c)=>({id,date:d,name:'x',amount:a,cat:c,acc:'debito',txType:'gasto'});
set('entries',[
  g('1','2026-09-05',100000,'Alimentación · Mercado'), g('2','2026-10-05',150000,'Alimentación · Mercado'),
  g('3','2026-10-06',40000,'Alimentación · Comidas afuera · Entre semana'), g('4','2026-10-07',30000,'Ropa'),
  {id:'5',date:'2026-10-08',name:'Transferencia A → B',amount:999999,cat:'Transferencia',acc:'debito',txType:'gasto'},
  {id:'6',date:'2026-10-08',name:'Salario',amount:5000000,cat:'Ingreso · Salario',acc:'debito',txType:'ingreso'},
]);
const {filas,totales}=src.datosComparacion(['2026-09','2026-10']);
console.log('\ndatosComparacion:');
test('agrupa las subcategorías por familia', ()=>eq(filas.find(x=>x.grupo==='Alimentación').valores,[100000,190000]));
test('categorías sueltas quedan como su propio grupo', ()=>eq(filas.find(x=>x.grupo==='Ropa').valores,[0,30000]));
test('transferencias e ingresos no cuentan como gasto', ()=>eq(totales,[100000,220000]));
test('ordena de más a menos gasto', ()=>eq(filas.map(x=>x.grupo),['Alimentación','Ropa']));
console.log('\nfmtMillones:');
test('formatos cortos', ()=>eq([src.fmtMillones(1521200000),src.fmtMillones(2500000),src.fmtMillones(850000),src.fmtMillones(-6100000)],['1.521M','2,5M','850k','-6,1M']));
console.log(`\n  ${p} passed  |  ${f} failed`); if(f)process.exit(1);
