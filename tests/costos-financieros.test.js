// Tests: categoría "Costos financieros" (intereses, cuota de manejo, comisiones, 4x1000)
// node tests/costos-financieros.test.js
import { cargarFuente } from './helpers/cargar-fuente.js';
const src = cargarFuente(['js/constantes.js','js/movimientos.js','js/cuentas-carga.js','js/balances-formato.js','js/filtros-busqueda.js','js/render-metricas.js']);
const set=(n,v)=>{src.__fijarTmp=v;src.__eval(`${n} = globalThis.__fijarTmp`)};
let p=0,f=0; const test=(n,fn)=>{try{fn();console.log('  ✓ '+n);p++}catch(e){console.log('  ✗ '+n+'\n    → '+e.message);f++}};
const eq=(a,b)=>{if(a!==b)throw new Error(`esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)}`)};
const norm=t=>t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
set('accounts',{nequi:0,debito:0,nu:0,lulo:0,arq:0,ontop:0,trm:3600,davtc:0,rappitc:0});

console.log('\ncategorías viejas:');
test('"Intereses" pasa a Costos financieros · Intereses', ()=>eq(src.categoriaVigente('Intereses'),'Costos financieros · Intereses'));
test('"Comisión" pasa a Costos financieros · Comisiones', ()=>eq(src.categoriaVigente('Comisión'),'Costos financieros · Comisiones'));
test('las demás no cambian', ()=>eq(src.categoriaVigente('Ropa'),'Ropa'));

console.log('\nsugerencia por nombre:');
for (const [txt,cat] of [['Cuota de manejo Davivienda','Cuota de manejo'],['Intereses TC','Intereses'],['GMF octubre','4x1000'],['4x1000','4x1000'],['Comisión retiro','Comisiones']])
  test(`"${txt}" → ${cat}`, ()=>eq(src.reglaSugerida(norm(txt)).cat,'Costos financieros · '+cat));

console.log('\ntotales del ciclo:');
test('suma solo los costos financieros del ciclo', ()=>{
  const g=(id,d,a,c)=>({id,date:d,name:'x',amount:a,cat:c,acc:'debito',txType:'gasto'});
  set('entries',[g('1','2026-10-28',32023,'Costos financieros · Intereses'),g('2','2026-10-29',28900,'Costos financieros · Cuota de manejo'),
    g('3','2026-10-30',150000,'Alimentación · Mercado'),g('4','2026-10-02',45000,'Costos financieros · Intereses')]);
  const r=src.costosFinancierosDe('2026-11');
  eq(r.total,60923); eq(src.costosFinancierosDe('2026-10').total,45000);
});
test('no son gasto hormiga ni gasto controlable', ()=>{
  for(const c of ['Intereses','Cuota de manejo','Comisiones','4x1000']){
    eq(src.__eval('CATS_EXCLUIDAS_HORMIGA').has('Costos financieros · '+c),true);
    eq(src.__eval('CATEGORIAS_NO_CONTROLABLES').has('Costos financieros · '+c),true);
  }
});
console.log(`\n  ${p} passed  |  ${f} failed`); if(f)process.exit(1);
