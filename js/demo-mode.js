let modoDemo = false;

// ─── Datos de prueba ────────────────────────────────────────────────────────

const DEMO_ACCOUNTS_DATA = {
  nequi: 380000, debito: 1540000, nu: 2800000, lulo: 920000,
  arq: 215.50, ontop: 88.00, trm: 4280,
  davtc: 1620000, rappitc: 740000,
};

// Las fechas usan '____-MM-DD'; en activación se reemplaza '____' con el mes actual
const _DEMO_ENTRIES_RAW = [
  {id:'dm-01',date:'____-01',name:'Salario',         amount:4500000,cat:'Ingreso · Salario',          acc:'debito',  txType:'ingreso'},
  {id:'dm-02',date:'____-01',name:'Arriendo',         amount:1650000,cat:'Arriendo',                   acc:'debito',  txType:'gasto'},
  {id:'dm-03',date:'____-02',name:'Mercado semanal',  amount:195000, cat:'Alimentación · Mercado',      acc:'davtc',   txType:'gasto'},
  {id:'dm-04',date:'____-03',name:'Gasolina moto',    amount:62000,  cat:'Vehículo · Gasolina',          acc:'debito',  txType:'gasto'},
  {id:'dm-05',date:'____-04',name:'Almuerzo',         amount:18000,  cat:'Alimentación · Comidas afuera · Entre semana',acc:'nequi',txType:'gasto'},
  {id:'dm-06',date:'____-05',name:'Spotify',          amount:18500,  cat:'Suscripciones',               acc:'rappitc', txType:'gasto'},
  {id:'dm-07',date:'____-05',name:'Netflix',          amount:19900,  cat:'Suscripciones',               acc:'rappitc', txType:'gasto'},
  {id:'dm-08',date:'____-06',name:'Cena restaurante', amount:88000,  cat:'Alimentación · Comidas afuera · Fin de semana',acc:'davtc',txType:'gasto'},
  {id:'dm-09',date:'____-07',name:'Uber',             amount:32000,  cat:'Transporte',                  acc:'rappitc', txType:'gasto'},
  {id:'dm-10',date:'____-07',name:'Ciclismo salida',  amount:28000,  cat:'Deportes · Ciclismo',          acc:'nequi',   txType:'gasto'},
  {id:'dm-11',date:'____-08',name:'Servicios públicos',amount:138000,cat:'Servicios',                   acc:'debito',  txType:'gasto'},
  {id:'dm-12',date:'____-09',name:'Mercado frutas',   amount:42000,  cat:'Alimentación · Mercado',      acc:'debito',  txType:'gasto'},
  {id:'dm-13',date:'____-10',name:'Corte de cabello', amount:55000,  cat:'Cuidado personal',            acc:'nequi',   txType:'gasto'},
  {id:'dm-14',date:'____-10',name:'Pago mínimo TC',   amount:820000, cat:'Pago Deuda',                  acc:'debito',  txType:'gasto'},
  {id:'dm-15',date:'____-10',name:'Almuerzo',         amount:16000,  cat:'Alimentación · Comidas afuera · Entre semana',acc:'nequi',txType:'gasto'},
  {id:'dm-16',date:'____-11',name:'Parqueadero',      amount:8000,   cat:'Vehículo · Parqueadero',      acc:'debito',  txType:'gasto'},
  {id:'dm-17',date:'____-11',name:'Freelance diseño', amount:750000, cat:'Ingreso · Freelance/Media',   acc:'nequi',   txType:'ingreso'},
  {id:'dm-18',date:'____-12',name:'Almuerzo',         amount:17000,  cat:'Alimentación · Comidas afuera · Entre semana',acc:'nequi',txType:'gasto'},
];

const DEMO_PENDIENTES_DATA = [
  {id:'dp-01',name:'EPS salud',          amount:165000,  date:'',acc:'debito',  cat:'Salud',                       isIncome:false},
  {id:'dp-02',name:'Internet + tv cable',amount:98000,   date:'',acc:'debito',  cat:'Servicios',                   isIncome:false},
  {id:'dp-03',name:'Pago Rappi Card',    amount:740000,  date:'',acc:'debito',  cat:'Pago Deuda',                  isIncome:false},
  {id:'dp-04',name:'Bono proyecto',      amount:400000,  date:'',acc:'nequi',   cat:'Ingreso · Freelance/Media',   isIncome:true},
];

const DEMO_GOALS_DATA = [
  {id:'dg-01',name:'Fondo de viaje',   type:'cuenta',   acc:'lulo',        target:3000000},
  {id:'dg-02',name:'Inversión cripto', type:'categoria',cat:'Inversiones', target:5000000, accumulated:980000},
];

// ─── Interceptor de fetch ────────────────────────────────────────────────────
// Bloquea silenciosamente todas las mutaciones a Supabase REST cuando modoDemo=true.
// Las lecturas (GET) siguen pasando para que la UI no se rompa.

const _fetchOriginal = window.fetch;
window.fetch = function(url, options = {}) {
  if (!modoDemo) return _fetchOriginal(url, options);
  const method = (options.method || 'GET').toUpperCase();
  if (typeof url === 'string' && url.includes('/rest/v1/') &&
      ['POST','PATCH','PUT','DELETE'].includes(method)) {
    if (method === 'DELETE') {
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    const fakeId = 'demo-' + Math.random().toString(36).slice(2, 9);
    return Promise.resolve(new Response(
      JSON.stringify({ id: fakeId }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    ));
  }
  return _fetchOriginal(url, options);
};

// ─── Activar / desactivar ────────────────────────────────────────────────────

function activarModoDemo() {
  modoDemo = true;
  const mes = todayStr().slice(0, 7);

  entries   = _DEMO_ENTRIES_RAW.map(e => ({ ...e, date: mes + '-' + e.date.slice(5) }));
  accounts  = Object.assign({}, DEMO_ACCOUNTS_DATA);
  pendientes= DEMO_PENDIENTES_DATA.map(p => ({ ...p, date: mes + '-25' }));
  goals     = DEMO_GOALS_DATA.map(g => ({ ...g }));
  currentMonth = mes;

  fillAccountInputs();
  populateMonthSelector();
  document.getElementById('month-select').value = mes;
  render();
  renderPendientes();

  document.getElementById('demo-banner').style.display = 'flex';
  document.getElementById('demo-toggle-btn').textContent = '🎭 Desactivar modo demo';
  const fab = document.getElementById('fab-nuevo-movimiento');
  if (fab) fab.style.bottom = '68px';

  const statusEl = document.getElementById('sync-status');
  statusEl.textContent = '🎭 Modo demo activo — datos ficticios';
  statusEl.className = 'sync-status';
  statusEl.style.opacity = '1';

  switchTab('cuentas', document.querySelector('.nav-item'));
}

function desactivarModoDemo() {
  modoDemo = false;
  document.getElementById('demo-banner').style.display = 'none';
  document.getElementById('demo-toggle-btn').textContent = '🎭 Modo demo';
  const fab = document.getElementById('fab-nuevo-movimiento');
  if (fab) fab.style.bottom = '';
  document.getElementById('loading-gate').style.display = 'flex';
  loadData();
}
