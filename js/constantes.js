
const CAPS_DEFAULT={'Alimentación · Mercado':800000,'Alimentación · Comidas afuera · Entre semana':200000,'Alimentación · Comidas afuera · Fin de semana':300000,'Deportes · Ciclismo':150000,'Servicios':400000,'Salud':1000000,'Vehículo · Seguros':615500,'Vehículo · Gasolina':150000,'Vehículo · Taller':200000,'Vehículo · Lavada':50000,'Vehículo · Parqueadero':80000,'Entretenimiento':450000,'Suscripciones':150000,'Ropa':200000,'Tecnología':200000,'Hogar':200000,'Transporte':150000,'Regalos':100000,'Arriendo':1630000,'Inversiones':300000};
let CAPS=Object.assign({},CAPS_DEFAULT);
const COLORS={
  // Alimentación e Ingresos comparten familia esmeralda (dinero que entra / sustento) — 3 tonos
  'Alimentación · Mercado':'#34D399','Alimentación · Comidas afuera · Entre semana':'#10B981','Alimentación · Comidas afuera · Fin de semana':'#059669',
  'Ingreso · Salario':'#10B981','Ingreso · Freelance/Media':'#34D399','Ingreso · Donación':'#6EE7B7','Ingreso · Otro':'#A7F3D0',
  // Vehículo y Hogar: familia ámbar (combustible/mantenimiento) — 5 tonos progresivos
  'Vehículo · Gasolina':'#F59E0B','Vehículo · Taller':'#D97706','Vehículo · Lavada':'#FBBF24','Vehículo · Seguros':'#B45309','Vehículo · Parqueadero':'#92400E',
  'Regalos':'#FCD34D','Arriendo':'#C2410C','Inversiones':'#0EA5E9',
  // Salud y Deportes: familia cian (bienestar)
  'Deportes · Ciclismo':'#06B6D4','Salud':'#0891B2',
  // Transporte y Tecnología: familia azul/violeta
  'Transporte':'#3B82F6','Tecnología':'#8B5CF6','Cuidado personal':'#A78BFA',
  // Entretenimiento y Ropa: familia rosa
  'Entretenimiento':'#EC4899','Ropa':'#F472B6','Cuidado personal · Skin Care':'#F9A8D4',
  // Deuda y costos financieros: familia roja (única con connotación de alerta)
  'Intereses':'#DC2626','Pago Deuda':'#B91C1C','Comisión':'#EF4444',
  // Servicios/Suscripciones/Otro: familia neutra (gastos de fondo, sin urgencia visual)
  'Servicios':'#64748B','Suscripciones':'#94A3B8','Otro':'#475569',
  'Hogar':'#EAB308',
};

// Colores específicos para suscripciones por nombre
const SUBSCRIPTION_COLORS={
  'spotify':'#1DB954',
  'anthropic':'#3B82F6',
  'claude':'#3B82F6',
  'google one':'#EA4335',
  'capcut':'#000000',
  'adobe':'#FF0000',
  'netflix':'#E50914',
  'disney':'#113CCF',
  'hbo':'#542DBF',
};
// Obligaciones fijas y ahorro: tienen tope para poder seguirlas, pero no son gasto que
// puedas recortar este mes, así que no entran en "variable vs tope".
const CATEGORIAS_NO_CONTROLABLES=new Set(['Arriendo','Salud','Inversiones']);

/** Categorías con tope que sí dependen de tus decisiones del mes. */
function categoriasControlables(){
  return Object.keys(CAPS).filter(c=>!CATEGORIAS_NO_CONTROLABLES.has(c)&&!CATEGORIAS_IRREGULARES.has(c));
}

/**
 * Suma de los topes controlables — el denominador de "variable vs tope".
 *
 * Antes esto era BUDGET_TOTAL, una constante de $2.300.000 escrita a mano que cubría unas 6
 * categorías, mientras el numerador sumaba el gasto de las 20 que tienen tope. Comparar 20
 * contra 6 dejaba la métrica clavada en 100% casi siempre. Además, al ser constante, ignoraba
 * los topes que tú editaras. Ahora sale de CAPS, en el momento, y de la misma lista que el
 * numerador.
 */
function topeControlable(){
  return categoriasControlables().reduce((s,c)=>s+(CAPS[c]||0),0);
}
// Categorías irregulares: no ocurren cada mes (taller, seguros anuales) — se excluyen del "ritmo de gasto"
// para no distorsionar el semáforo cuando aparecen de forma puntual, pero siguen teniendo su propio tope visible.
const CATEGORIAS_IRREGULARES=new Set(['Vehículo · Taller','Vehículo · Seguros']);
const ACCOUNTS_META={
  nequi:{label:'Nequi',currency:'COP',type:'debito'},
  debito:{label:'Davivienda',currency:'COP',type:'debito'},
  nu:{label:'Nu cajitas',currency:'COP',type:'debito'},
  lulo:{label:'Lulo (Ahorro Vivienda)',currency:'COP',type:'debito'},
  arq:{label:'ARQ',currency:'USD',type:'debito'},
  ontop:{label:'Ontop',currency:'USD',type:'debito'},
  davtc:{label:'Davivienda TC',currency:'COP',type:'credito'},
  rappitc:{label:'Rappi Card',currency:'COP',type:'credito'},
};

const SEED_ENTRIES=[
  {id:1,date:'2026-06-03',name:'Otros mercado',amount:116130,cat:'Alimentación · Mercado',acc:'davtc',txType:'gasto'},
  {id:2,date:'2026-06-03',name:'Carnes',amount:101300,cat:'Alimentación · Mercado',acc:'davtc',txType:'gasto'},
  {id:3,date:'2026-06-03',name:'Verduras',amount:10950,cat:'Alimentación · Mercado',acc:'davtc',txType:'gasto'},
  {id:4,date:'2026-06-03',name:'Almuerzo',amount:15000,cat:'Alimentación · Comidas afuera · Entre semana',acc:'nequi',txType:'gasto'},
  {id:5,date:'2026-06-05',name:'Servicio luz',amount:69003,cat:'Servicios',acc:'debito',txType:'gasto'},
  {id:6,date:'2026-06-05',name:'Parqueadero moto',amount:37700,cat:'Vehículo · Parqueadero',acc:'debito',txType:'gasto'},
  {id:7,date:'2026-06-06',name:'CapCut',amount:29900,cat:'Suscripciones',acc:'rappitc',txType:'gasto'},
  {id:8,date:'2026-06-06',name:'Ciclismo',amount:29000,cat:'Deportes · Ciclismo',acc:'nequi',txType:'gasto'},
  {id:9,date:'2026-06-06',name:'Almuerzo',amount:13000,cat:'Alimentación · Comidas afuera · Fin de semana',acc:'nequi',txType:'gasto'},
  {id:10,date:'2026-06-06',name:'Restaurante almuerzo',amount:48000,cat:'Alimentación · Comidas afuera · Fin de semana',acc:'rappitc',txType:'gasto'},
  {id:11,date:'2026-06-07',name:'Almuerzo',amount:15000,cat:'Alimentación · Comidas afuera · Fin de semana',acc:'nequi',txType:'gasto'},
  {id:12,date:'2026-06-09',name:'Mercado',amount:40780,cat:'Alimentación · Mercado',acc:'davtc',txType:'gasto'},
  {id:13,date:'2026-06-09',name:'Mercado frutas',amount:7800,cat:'Alimentación · Mercado',acc:'debito',txType:'gasto'},
  {id:14,date:'2026-06-09',name:'Mercado huevos',amount:19000,cat:'Alimentación · Mercado',acc:'debito',txType:'gasto'},
  {id:16,date:'2026-06-12',name:'Almuerzo',amount:15000,cat:'Alimentación · Comidas afuera · Entre semana',acc:'nequi',txType:'gasto'},
  {id:17,date:'2026-06-12',name:'Vanti Gas',amount:41130,cat:'Servicios',acc:'debito',txType:'gasto'},
  {id:18,date:'2026-06-12',name:'Uber',amount:50362,cat:'Transporte',acc:'rappitc',txType:'gasto'},
  {id:19,date:'2026-06-12',name:'Adobe',amount:33264,cat:'Suscripciones',acc:'arq',txType:'gasto',currency:'COP'},
  {id:20,date:'2026-06-12',name:'Bus Girardot-Bogotá',amount:33415,cat:'Transporte',acc:'arq',txType:'gasto',currency:'COP'},
  {id:21,date:'2026-06-12',name:'Gasolina',amount:59103,cat:'Vehículo · Gasolina',acc:'arq',txType:'gasto',currency:'COP'},
  {id:22,date:'2026-06-12',name:'Donación',amount:50000,cat:'Otro',acc:'debito',txType:'gasto'},
  {id:23,date:'2026-06-20',name:'Parqueadero (ARQ)',amount:18500,cat:'Vehículo · Parqueadero',acc:'arq',txType:'gasto',currency:'COP'},
  {id:24,date:'2026-06-20',name:'Comida (ahorros)',amount:7000,cat:'Alimentación · Comidas afuera · Fin de semana',acc:'debito',txType:'gasto'},
  {id:25,date:'2026-06-20',name:'Parqueadero (ahorros)',amount:2000,cat:'Vehículo · Parqueadero',acc:'debito',txType:'gasto'},
  {id:26,date:'2026-06-21',name:'Cumpleaños KT',amount:55000,cat:'Alimentación · Comidas afuera · Fin de semana',acc:'debito',txType:'gasto'},
  {id:27,date:'2026-06-21',name:'Almuerzo',amount:15000,cat:'Alimentación · Comidas afuera · Fin de semana',acc:'debito',txType:'gasto'},
  {id:28,date:'2026-06-23',name:'Google One',amount:44900,cat:'Suscripciones',acc:'rappitc',txType:'gasto'},
  {id:29,date:'2026-06-23',name:'Almuerzo',amount:15000,cat:'Alimentación · Comidas afuera · Entre semana',acc:'debito',txType:'gasto'},
  {id:30,date:'2026-06-23',name:'Mercado',amount:99910,cat:'Alimentación · Mercado',acc:'davtc',txType:'gasto'},
  {id:31,date:'2026-06-23',name:'Acueducto',amount:60890,cat:'Servicios',acc:'rappitc',txType:'gasto'},
  {id:32,date:'2026-06-27',name:'Desayuno bicicleta',amount:18000,cat:'Deportes · Ciclismo',acc:'debito',txType:'gasto'},
  {id:33,date:'2026-06-27',name:'Gasto bicicleta',amount:6500,cat:'Deportes · Ciclismo',acc:'debito',txType:'gasto'},
  {id:34,date:'2026-06-27',name:'Corte de cabello',amount:85000,cat:'Cuidado personal',acc:'debito',txType:'gasto'},
  {id:35,date:'2026-06-27',name:'Donación adicional',amount:168401,cat:'Otro',acc:'arq',txType:'gasto',currency:'COP'},
  {id:36,date:'2026-06-27',name:'Spotify',amount:30500,cat:'Suscripciones',acc:'davtc',txType:'gasto'},
  {id:37,date:'2026-06-27',name:'Intereses TC Davivienda',amount:32023,cat:'Intereses',acc:'davtc',txType:'gasto'},
  {id:38,date:'2026-06-27',name:'Cuota seguro compra TC',amount:3990,cat:'Otro',acc:'davtc',txType:'gasto'},
  {id:40,date:'2026-07-01',name:'Uber',amount:2.33,cat:'Transporte',acc:'ontop',txType:'gasto'},
  {id:41,date:'2026-07-01',name:'Meta (pauta TAM)',amount:33.26,cat:'Otro',acc:'ontop',txType:'gasto'},
  {id:42,date:'2026-07-01',name:'Amazon (forro, libro, juego, afeitadora)',amount:156.96,cat:'Tecnología',acc:'ontop',txType:'gasto'},
  {id:43,date:'2026-07-01',name:'Gasolina moto',amount:13.20,cat:'Vehículo · Gasolina',acc:'arq',txType:'gasto'},
  {id:44,date:'2026-07-03',name:'Almuerzo',amount:13000,cat:'Alimentación · Comidas afuera · Entre semana',acc:'debito',txType:'gasto'},
  {id:45,date:'2026-07-03',name:'Taller moto (mantenimiento, 27.543km)',amount:405000,cat:'Vehículo · Taller',acc:'nu',txType:'gasto'},
  {id:46,date:'2026-07-03',name:'Mercado huevos',amount:19000,cat:'Alimentación · Mercado',acc:'nu',txType:'gasto'},
  {id:47,date:'2026-07-03',name:'Parqueadero moto',amount:3300,cat:'Vehículo · Parqueadero',acc:'debito',txType:'gasto'},
  {id:48,date:'2026-07-03',name:'Donación (15%)',amount:900000,cat:'Otro',acc:'debito',txType:'gasto'},
  {id:49,date:'2026-07-03',name:'Pago mínimo Davivienda TC',amount:785246,cat:'Pago Deuda',acc:'debito',txType:'gasto'},
  {id:50,date:'2026-07-03',name:'Pago Rappi Card',amount:1700000,cat:'Pago Deuda',acc:'debito',txType:'gasto'},
  {id:51,date:'2026-07-03',name:'Salud Andrés (EPS)',amount:615500,cat:'Salud',acc:'debito',txType:'gasto'},
  {id:53,date:'2026-07-03',name:'Arriendo',amount:1630000,cat:'Otro',acc:'debito',txType:'gasto'},
  {id:54,date:'2026-07-03',name:'Fondo de emergencia (aporte)',amount:300000,cat:'Otro',acc:'nu',txType:'ingreso'},
  {id:52,date:'2026-07-03',name:'Prepagada Sandra (última cuota)',amount:264000,cat:'Salud',acc:'debito',txType:'gasto'},
];
const SEED_ACCOUNTS={nequi:3000,debito:605254,nu:3039260,lulo:0,arq:231.28,ontop:73.75,trm:3596,davtc:1187348,rappitc:2184199};
const DEBT_ORIGINAL={davtc:5150000,rappitc:5150000};
const CREDIT_LIMITS={davtc:18019994,rappitc:10379999}; // cupo aprobado de cada tarjeta, para calcular % de utilización
// Categorías que cuentan como "necesidad básica" para la regla del 50% (definidas junto al usuario,
// no es una clasificación universal — ajusta esta lista si tu criterio cambia).
const NECESIDADES_BASICAS=['Arriendo','Servicios','Alimentación · Mercado','Salud','Vehículo · Gasolina','Transporte'];
let pendientes=[];
let currentMonth=null;

/**
 * ¿Este movimiento es plata que realmente saliste a gastar?
 *
 * Quedan fuera dos cosas que NO son gasto: las transferencias (mueven plata entre cuentas
 * tuyas, no la gastan) y los ajustes de saldo (correcciones contables cuando cuadras una
 * cuenta a mano). Antes cada métrica repetía este filtro por su cuenta y dos se quedaron sin
 * excluir los ajustes: un ajuste de $2.000.000 aparecía como un mes carísimo en la
 * comparativa y como una "categoría" propia en la tendencia.
 */
function esGastoReal(e){
  return e.txType!=='ingreso' && e.cat!=='Transferencia' && e.cat!=='[Ajuste de saldo]';
}

/** Ídem para ingresos: un ajuste de saldo hacia arriba no es plata que hayas recibido. */
function esIngresoReal(e){
  // Una transferencia recibida (pata destino) es txType='ingreso' pero no es plata nueva —
  // ya venía de otra cuenta tuya. Sin esta exclusión, cada transferencia inflaría "Ingresos".
  return e.txType==='ingreso' && e.cat!=='[Ajuste de saldo]' && e.cat!=='Transferencia';
}

// ─── Ciclo de pago ──────────────────────────────────────────────────────────
// El sueldo cae unos días ANTES de que empiece el mes, y esa plata es la que financia el mes
// siguiente. Con meses de calendario, el 1 de septiembre los ingresos del mes arrancaban en
// cero (el pago había entrado el 26 de agosto) mientras los gastos ya corrían: el "%
// comprometido" mostraba 0% con dos millones gastados, y la tasa de ahorro decía "sin
// ingresos". Por eso el mes de la app no es el del calendario, sino el ciclo entre pagos.
//
// Un ciclo se identifica con el mes que financia: el que va del 26 de agosto al 25 de
// septiembre se llama '2026-09'. Así "septiembre" contiene el sueldo con el que pagas
// septiembre, y los dos lados de cada métrica hablan del mismo período.
const DIA_CORTE_MES=26; // día en que te pagan. TODO: mover a fin_configuracion cuando se versione el esquema (ver sql/README.md)

/** Ciclo ('YYYY-MM') al que pertenece una fecha ISO. */
function cicloDe(fechaISO){
  const [y,m,d]=fechaISO.split('-').map(Number);
  if(d<DIA_CORTE_MES)return `${y}-${String(m).padStart(2,'0')}`;
  return m===12?`${y+1}-01`:`${y}-${String(m+1).padStart(2,'0')}`; // del 26 en adelante ya financia el mes que viene
}

/** El ciclo en el que estamos hoy. */
function cicloActual(){ return cicloDe(todayStr()); }

/** Primer y último día (ISO) de un ciclo, para mostrarlo y para contar cuánto lleva corrido. */
function rangoDelCiclo(ciclo){
  const [y,m]=ciclo.split('-').map(Number);
  const inicio=m===1?new Date(y-1,11,DIA_CORTE_MES):new Date(y,m-2,DIA_CORTE_MES);
  const fin=new Date(y,m-1,DIA_CORTE_MES-1);
  const iso=dt=>`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
  return {desde:iso(inicio),hasta:iso(fin)};
}

/**
 * Fecha real (ISO) del día `dia` dentro de un ciclo. Un ciclo cruza dos meses de calendario:
 * los días >= DIA_CORTE_MES caen en el primero y los < DIA_CORTE_MES en el segundo. Sin esto,
 * un recurrente del día 26 en el ciclo '2026-09' se guardaba como 2026-09-26, que ya pertenece
 * al ciclo siguiente — el sueldo se sembraba en el ciclo equivocado.
 */
function fechaEnCiclo(ciclo,dia){
  const [y,m]=ciclo.split('-').map(Number);
  const dd=String(dia).padStart(2,'0');
  if(dia>=DIA_CORTE_MES){ // primer mes del ciclo: el anterior al que le da nombre
    return m===1?`${y-1}-12-${dd}`:`${y}-${String(m-1).padStart(2,'0')}-${dd}`;
  }
  return `${y}-${String(m).padStart(2,'0')}-${dd}`;
}

/** Cuántos días dura un ciclo (varía: 28 a 31 según los meses que cruza). */
function diasDelCiclo(ciclo){
  const {desde,hasta}=rangoDelCiclo(ciclo);
  return Math.round((new Date(hasta+'T00:00:00')-new Date(desde+'T00:00:00'))/86400000)+1;
}

/** Cuántos días lleva corridos el ciclo. Si ya terminó, devuelve su duración completa. */
function diasCorridosDelCiclo(ciclo){
  const {desde}=rangoDelCiclo(ciclo);
  const total=diasDelCiclo(ciclo);
  if(ciclo!==cicloActual())return total;
  const corridos=Math.round((new Date(todayStr()+'T00:00:00')-new Date(desde+'T00:00:00'))/86400000)+1;
  return Math.max(1,Math.min(total,corridos));
}

/** Etiqueta corta del ciclo, ej. "Sep 2026 · 26 ago – 25 sep". */
function etiquetaCiclo(ciclo){
  const meses=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const [y,m]=ciclo.split('-').map(Number);
  const {desde,hasta}=rangoDelCiclo(ciclo);
  const dia=iso=>{ const [,mm,dd]=iso.split('-').map(Number); return `${dd} ${meses[mm-1].toLowerCase()}`; };
  return `${meses[m-1]} ${y} · ${dia(desde)} – ${dia(hasta)}`;
}

/** Color y mensaje de aliento según el % de avance de una meta o fondo de ahorro — mismo criterio en todos lados */
function colorYMensajeProgreso(pct){
  if(pct>=100)return{color:'#0E9F6E',mensaje:'🎉 ¡Meta cumplida!'};
  if(pct>=75)return{color:'#0E9F6E',mensaje:'🎯 Ya casi — no aflojes ahora'};
  if(pct>=50)return{color:'#0EA5E9',mensaje:'🔥 Más de la mitad, vas muy bien'};
  if(pct>=25)return{color:'#D97706',mensaje:'🚀 Buen avance, sigue aportando'};
  return{color:'#DC2626',mensaje:'💪 Cada aporte cuenta — vas arrancando'};
}

