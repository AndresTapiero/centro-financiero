let modoDemo = false;

// ─── Datos de prueba ────────────────────────────────────────────────────────

const DEMO_ACCOUNTS_DATA = {
  nequi: 380000, debito: 1540000, nu: 2800000, lulo: 920000,
  arq: 215.50, ontop: 88.00, trm: 4280,
  davtc: 1620000, rappitc: 740000,
};

// Cada movimiento dice hace cuántos días ocurrió (`atras`). Las fechas se calculan desde hoy y dentro del
// CICLO actual (26 → 25): antes se armaban con el mes de calendario, y del 26 al 31 el demo abría en un
// ciclo ya cerrado ("Saldo reconstruido…", sin desglose) en vez del ciclo en curso.
const _DEMO_ENTRIES_RAW = [
  {id:'dm-01',atras:20,name:'Salario',         amount:4500000,cat:'Ingreso · Salario',          acc:'debito',  txType:'ingreso'},
  {id:'dm-02',atras:19,name:'Arriendo',         amount:1650000,cat:'Arriendo',                   acc:'debito',  txType:'gasto'},
  {id:'dm-03',atras:18,name:'Mercado semanal',  amount:195000, cat:'Alimentación · Mercado',      acc:'davtc',   txType:'gasto'},
  {id:'dm-04',atras:16,name:'Gasolina moto',    amount:62000,  cat:'Vehículo · Gasolina',          acc:'debito',  txType:'gasto'},
  {id:'dm-05',atras:15,name:'Almuerzo',         amount:18000,  cat:'Alimentación · Comidas afuera · Entre semana',acc:'nequi',txType:'gasto'},
  {id:'dm-06',atras:14,name:'Spotify',          amount:18500,  cat:'Suscripciones',               acc:'rappitc', txType:'gasto'},
  {id:'dm-07',atras:13,name:'Netflix',          amount:19900,  cat:'Suscripciones',               acc:'rappitc', txType:'gasto'},
  {id:'dm-08',atras:12,name:'Cena restaurante', amount:88000,  cat:'Alimentación · Comidas afuera · Fin de semana',acc:'davtc',txType:'gasto'},
  {id:'dm-09',atras:10,name:'Uber',             amount:32000,  cat:'Transporte',                  acc:'rappitc', txType:'gasto'},
  {id:'dm-10',atras:9,name:'Ciclismo salida',  amount:28000,  cat:'Deportes · Ciclismo',          acc:'nequi',   txType:'gasto'},
  {id:'dm-11',atras:8,name:'Servicios públicos',amount:138000,cat:'Servicios',                   acc:'debito',  txType:'gasto'},
  {id:'dm-12',atras:7,name:'Mercado frutas',   amount:42000,  cat:'Alimentación · Mercado',      acc:'debito',  txType:'gasto'},
  {id:'dm-13',atras:6,name:'Corte de cabello', amount:55000,  cat:'Cuidado personal',            acc:'nequi',   txType:'gasto'},
  {id:'dm-14',atras:4,name:'Pago mínimo Davivienda TC',amount:820000, cat:'Pago Deuda',                  acc:'debito',  txType:'gasto'},
  {id:'dm-15',atras:3,name:'Almuerzo',         amount:16000,  cat:'Alimentación · Comidas afuera · Entre semana',acc:'nequi',txType:'gasto'},
  {id:'dm-16',atras:2,name:'Parqueadero',      amount:8000,   cat:'Vehículo · Parqueadero',      acc:'debito',  txType:'gasto'},
  {id:'dm-17',atras:1,name:'Freelance diseño', amount:750000, cat:'Ingreso · Freelance/Media',   acc:'nequi',   txType:'ingreso'},
  {id:'dm-18',atras:0,name:'Almuerzo',         amount:17000,  cat:'Alimentación · Comidas afuera · Entre semana',acc:'nequi',txType:'gasto'},
];

const DEMO_PENDIENTES_DATA = [
  {id:'dp-01',name:'EPS salud',          amount:165000,  venceEn:-2,acc:'debito',  cat:'Salud',                       isIncome:false},
  {id:'dp-02',name:'Internet + tv cable',amount:98000,   venceEn:3,acc:'debito',  cat:'Servicios',                   isIncome:false},
  {id:'dp-03',name:'Pago Rappi Card',    amount:740000,  venceEn:6,acc:'debito',  cat:'Pago Deuda',                  isIncome:false},
  {id:'dp-04',name:'Bono proyecto',      amount:400000,  venceEn:9,acc:'nequi',   cat:'Ingreso · Freelance/Media',   isIncome:true},
];

const DEMO_GOALS_DATA = [
  {id:'dg-01',name:'Fondo de viaje',   type:'cuenta',   acc:'lulo',        target:3000000, mesesLimite:8},
  {id:'dg-02',name:'Inversión cripto', type:'categoria',cat:'Inversiones', target:5000000, accumulated:980000},
];

// ─── Interceptor de fetch ────────────────────────────────────────────────────
// Bloquea silenciosamente todas las mutaciones a Supabase REST cuando modoDemo=true.
// Las lecturas (GET) siguen pasando para que la UI no se rompa.

/**
 * Respuesta falsa para una escritura a Supabase en modo demo, con la MISMA forma que daría la real:
 * - sin `Prefer: return=representation` (insert/update sin .select()): 204 sin cuerpo;
 * - con él: un arreglo de filas (el código hace .forEach / .length / [i].id), o un objeto solo si el
 *   cliente pidió una fila (.single() → Accept: application/vnd.pgrst.object+json).
 * Antes siempre devolvía `{id}`: los inserts con .select() (transferencias, pendientes) fallaban en demo.
 */
function respuestaEscrituraDemo(method, options) {
  if (method === 'DELETE') return { status: 204, body: null };
  const h = new Headers(options.headers || {});
  const prefer = h.get('Prefer') || '';
  if (!/return=representation/.test(prefer)) return { status: 204, body: null };
  let cuerpo = [];
  try { const j = JSON.parse(options.body); cuerpo = Array.isArray(j) ? j : [j]; } catch (e) {}
  if (cuerpo.length === 0) cuerpo = [{}];
  const filas = cuerpo.map(f => ({ ...f, id: f.id || 'demo-' + Math.random().toString(36).slice(2, 9) }));
  const uno = /pgrst\.object/.test(h.get('Accept') || '');
  return { status: method === 'POST' ? 201 : 200, body: JSON.stringify(uno ? filas[0] : filas) };
}

const _fetchOriginal = window.fetch;
window.fetch = function(url, options = {}) {
  if (!modoDemo) return _fetchOriginal(url, options);
  const method = (options.method || 'GET').toUpperCase();
  const u = typeof url === 'string' ? url : (url && url.url) || '';
  if (u.includes('/rest/v1/') && ['POST','PATCH','PUT','DELETE'].includes(method)) {
    const r = respuestaEscrituraDemo(method, options);
    return Promise.resolve(new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json' } }));
  }
  return _fetchOriginal(url, options);
};

// ─── Fechas dentro del ciclo actual ──────────────────────────────────────────

function _sumarDias(iso, dias) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + dias);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
/** Hace `dias` días, sin salirse del ciclo actual (si cae antes de su inicio, queda en el día 26). */
function fechaDemoAtras(dias) {
  const iso = _sumarDias(todayStr(), -dias);
  return cicloDe(iso) === cicloActual() ? iso : fechaEnCiclo(cicloActual(), DIA_CORTE_MES);
}
/** Dentro de `dias` días (negativo = ya vencido), sin pasar del último día del ciclo. */
function fechaDemoDentroDe(dias) {
  const iso = _sumarDias(todayStr(), dias);
  const fin = fechaEnCiclo(cicloActual(), DIA_CORTE_MES - 1);
  const ini = fechaEnCiclo(cicloActual(), DIA_CORTE_MES);
  return iso > fin ? fin : iso < ini ? ini : iso;
}

// ─── Activar / desactivar ────────────────────────────────────────────────────

function activarModoDemo() {
  modoDemo = true;
  const ciclo = cicloActual();

  entries   = _DEMO_ENTRIES_RAW.map(e => { const { atras, ...resto } = e; return { ...resto, date: fechaDemoAtras(atras) }; });
  accounts  = Object.assign({}, DEMO_ACCOUNTS_DATA);
  // Las cuentas que creaste tú (cajitas, bolsillos…) siguen registradas: sin saldo propio saldrían como $NaN
  Object.keys(ACCOUNTS_META).forEach(k => { if (accounts[k] === undefined) accounts[k] = 0; });
  pendientes= DEMO_PENDIENTES_DATA.map(p => { const { venceEn, ...resto } = p; return { ...resto, date: fechaDemoDentroDe(venceEn) }; });
  goals     = DEMO_GOALS_DATA.map(g => {
    const { mesesLimite, ...resto } = g;
    return mesesLimite ? { ...resto, deadline: _sumarDias(todayStr(), mesesLimite * 30) } : { ...resto };
  });
  currentMonth = ciclo;

  if(typeof limpiarFiltros==='function') limpiarFiltros();
  fillAccountInputs();
  populateMonthSelector();
  document.getElementById('month-select').value = ciclo;
  render();
  renderPendientes();
  if(typeof renderGoals==='function') renderGoals();

  document.getElementById('demo-banner').style.display = 'flex';
  document.getElementById('demo-toggle-btn').textContent = 'Desactivar modo demo';
  const fab = document.getElementById('fab-nuevo-movimiento');
  if (fab) fab.style.bottom = '68px';

  const statusEl = document.getElementById('sync-status');
  statusEl.textContent = 'Modo demo activo — datos ficticios';
  statusEl.className = 'sync-status';
  statusEl.style.opacity = '1';

  switchTab('cuentas', document.querySelector('.nav-item'));
}

function desactivarModoDemo() {
  modoDemo = false;
  document.getElementById('demo-banner').style.display = 'none';
  document.getElementById('demo-toggle-btn').textContent = 'Modo demo';
  const fab = document.getElementById('fab-nuevo-movimiento');
  if (fab) fab.style.bottom = '';
  document.getElementById('loading-gate').style.display = 'flex';
  loadData();
}
