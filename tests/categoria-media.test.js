// Tests: categoría "Media" (equipo de cámara, luces, lentes, audio, accesorios)
// node tests/categoria-media.test.js
import { cargarFuente } from './helpers/cargar-fuente.js';
const src = cargarFuente(['js/constantes.js','js/movimientos.js','js/cuentas-carga.js','js/balances-formato.js','js/filtros-busqueda.js','js/render-metricas.js']);
let p=0,f=0; const test=(n,fn)=>{try{fn();console.log('  ✓ '+n);p++}catch(e){console.log('  ✗ '+n+'\n    → '+e.message);f++}};
const eq=(a,b)=>{if(a!==b)throw new Error(`esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)}`)};
const norm=t=>t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
const sug=t=>(src.reglaSugerida(norm(t))||{}).cat;

console.log('\nsugerencia por nombre:');
for (const [txt,cat] of [
  ['Small Rig Jaula camara','Accesorios'],['Ventilador Camara','Accesorios'],['Sony A7 IV','Cámaras'],
  ['Lente Sigma 18-50','Lentes'],['Filtro ND variable','Lentes'],['Luz LED Aputure','Iluminación'],
  ['Softbox Godox','Iluminación'],['Micrófono Rode','Audio'],['Trípode','Accesorios'],['Tarjeta SD 128GB','Accesorios'],
]) test(`"${txt}" → Media · ${cat}`, ()=>eq(sug(txt),'Media · '+cat));
test('"Servicio luz" sigue siendo Servicios', ()=>eq(sug('Servicio luz'),'Servicios'));

console.log('\nreglas:');
const subs=['Cámaras','Lentes','Iluminación','Audio','Accesorios'].map(s=>'Media · '+s);
test('tienen tope y color propio', ()=>subs.forEach(c=>{ if(!src.__eval('CAPS_DEFAULT')[c]||!src.__eval('COLORS')[c])throw new Error(c); }));
test('son irregulares (no distorsionan el ritmo de gasto)', ()=>subs.forEach(c=>eq(src.__eval('CATEGORIAS_IRREGULARES').has(c),true)));
test('no son gasto hormiga', ()=>subs.forEach(c=>eq(src.__eval('CATS_EXCLUIDAS_HORMIGA').has(c),true)));
test('el grupo tiene ícono', ()=>eq(src.__eval('EMOJI_GRUPO')['Media'],'🎬'));
console.log(`\n  ${p} passed  |  ${f} failed`); if(f)process.exit(1);
