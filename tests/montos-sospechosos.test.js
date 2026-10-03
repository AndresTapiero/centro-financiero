// Tests: detectar pesos guardados como dólares (el gasto de ~$983M en un solo ciclo)
// node tests/montos-sospechosos.test.js
import { cargarFuente } from './helpers/cargar-fuente.js';
const src = cargarFuente(['js/constantes.js','js/movimientos.js','js/cuentas-carga.js','js/balances-formato.js']);
const set=(n,v)=>{src.__fijarTmp=v;src.__eval(`${n} = globalThis.__fijarTmp`)};
let p=0,f=0; const test=(n,fn)=>{try{fn();console.log('  ✓ '+n);p++}catch(e){console.log('  ✗ '+n+'\n    → '+e.message);f++}};
const eq=(a,b)=>{if(a!==b)throw new Error(`esperado ${b}, obtenido ${a}`)};
set('accounts',{nequi:0,debito:0,nu:0,lulo:0,arq:0,ontop:0,trm:3600,davtc:0,rappitc:0});
const { montoSospechoso, montoNativo, entryCOP } = src;
const mov=o=>({id:'x',date:'2026-10-01',name:'x',cat:'Otro',txType:'gasto',...o});

console.log('\nmontoSospechoso:');
test('270.000 en ARQ (dólares) es sospechoso: serían ~$972M', ()=>{
  const e=mov({acc:'arq',amount:270000});
  eq(montoSospechoso(e),true); eq(entryCOP(e),972000000);
});
test('un salario normal en dólares no lo es', ()=>eq(montoSospechoso(mov({acc:'ontop',amount:2675,txType:'ingreso'})),false));
test('el mismo 270.000 marcado como pesos ya no lo es', ()=>eq(montoSospechoso(mov({acc:'arq',amount:270000,currency:'COP'})),false));
test('un arriendo en pesos no lo es', ()=>eq(montoSospechoso(mov({acc:'debito',amount:1630000})),false));
test('80 millones en una cuenta en pesos sí lo es', ()=>eq(montoSospechoso(mov({acc:'debito',amount:80000000})),true));
test('los ajustes de saldo no se marcan', ()=>eq(montoSospechoso(mov({acc:'arq',amount:500000,cat:'[Ajuste de saldo]'})),false));

console.log('\nmontoNativo (lo que tocó el saldo):');
test('en dólares sin override: el monto tal cual', ()=>eq(montoNativo(mov({acc:'arq',amount:270000}),src.__eval('ACCOUNTS_META').arq),270000));
test('en pesos sobre cuenta USD: se divide por la TRM', ()=>eq(montoNativo(mov({acc:'arq',amount:360000,currency:'COP'}),src.__eval('ACCOUNTS_META').arq),100));
test('corregir 270.000 USD → pesos devuelve 269.925 USD al saldo', ()=>{
  const m=src.__eval('ACCOUNTS_META').arq;
  const antes=montoNativo(mov({acc:'arq',amount:270000}),m);
  const despues=montoNativo(mov({acc:'arq',amount:270000,currency:'COP'}),m);
  eq(antes-despues,269925);
});

console.log(`\n  ${p} passed  |  ${f} failed`); if(f)process.exit(1);
