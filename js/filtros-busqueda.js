async function archiveOldMonths(){
  // Desactivado desde la migración a Supabase: esta función existía para esquivar el límite de 5MB
  // por valor de window.storage, guardando meses viejos aparte y sacándolos de memoria. Postgres no
  // tiene ese límite — con cientos o miles de movimientos no hay ningún problema en tenerlos todos
  // cargados. Se deja la función vacía (en vez de borrarla) por si el proyecto de inversiones u otro
  // caso futuro sí necesita paginar/archivar por volumen real de datos.
  return;
}

let sortMode='fecha'; // 'fecha' o 'cuenta'
let filterAccount='todas';
let filterType='todos'; // 'todos' | 'gasto' | 'ingreso'
let filterCategory='todas';
function setSortMode(mode){
  sortMode=mode;
  document.getElementById('sort-fecha').classList.toggle('active',mode==='fecha');
  document.getElementById('sort-cuenta').classList.toggle('active',mode==='cuenta');
  render();
}
function poblarFiltroCuentaBusqueda(){
  const sel=document.getElementById('search-cuenta');
  if(!sel)return;
  const valorActual=sel.value;
  sel.innerHTML='<option value="todas">Toda cuenta</option>'+
    Object.keys(ACCOUNTS_META).map(slug=>`<option value="${slug}">${ACCOUNTS_META[slug].label}</option>`).join('');
  if([...sel.options].some(o=>o.value===valorActual))sel.value=valorActual;
}

let buscadorHistoricoAbierto=false;

function toggleBuscadorHistorico(){
  buscadorHistoricoAbierto=!buscadorHistoricoAbierto;
  document.getElementById('search-historico').style.display=buscadorHistoricoAbierto?'block':'none';
}

let _timerBuscador=null;
function actualizarBuscador(){
  const q=document.getElementById('quick-search').value.trim().toLowerCase();
  const btn=document.getElementById('search-historico-btn');

  // Si escriben algo, mostrar el botón de búsqueda histórica (esto sí es inmediato)
  btn.style.display=q.length>=2?'block':'none';

  // buscarEnMes puede acabar llamando a render(), que reconstruye lista, presupuesto,
  // pendientes y patrimonio: hacerlo en cada tecla se siente lento en móvil.
  clearTimeout(_timerBuscador);
  _timerBuscador=setTimeout(()=>{
    if(!buscadorHistoricoAbierto)buscarEnMes(q);
  },250);
}

function buscarEnMes(q){
  const monthEntries=entries.filter(e=>cicloDe(e.date)===currentMonth);
  let matches=monthEntries;
  if(q.length>=2)matches=matches.filter(e=>e.name.toLowerCase().includes(q));

  // Aplicar filtros existentes
  if(filterAccount!=='todas')matches=matches.filter(e=>e.acc===filterAccount);
  if(filterType!=='todos')matches=matches.filter(e=>e.txType===filterType);
  if(filterCategory!=='todas')matches=matches.filter(e=>e.cat===filterCategory);

  renderQuickSearchResults(matches,q);
}

function renderQuickSearchResults(matches,q){
  // Si el buscador está vacío, render normal (render())
  if(q.length<2){
    render();
    return;
  }

  // Sino, mostrar solo los matches
  const list=document.getElementById('entries-list');
  if(matches.length===0){
    // Antes esto le pasaba 'YYYY-MM' a fechaLarga(), que espera 'YYYY-MM-DD', y salía
    // "undefined de septiembre de 2026" antes de recortarlo a mano.
    list.innerHTML=`<div class="empty">Sin resultados para "${esc(q)}" en ${etiquetaCiclo(currentMonth)}</div>`;
    document.getElementById('entries-summary').style.display='none';
  }else{
    const sorted=[...matches].sort((a,b)=>b.date.localeCompare(a.date));
    list.innerHTML=new MovimientoListRenderer(sorted).render();
    updateEntriesSummary();
  }
}

function limpiarBusqueda(){
  document.getElementById('search-text').value='';
  document.getElementById('quick-search').value='';
  document.getElementById('search-desde').value='';
  document.getElementById('search-hasta').value='';
  document.getElementById('search-tipo').value='todos';
  document.getElementById('search-cuenta').value='todas';
  buscadorHistoricoAbierto=false;
  document.getElementById('search-historico').style.display='none';
  buscarEnHistorial();
  render();
}

function buscarEnHistorial(){
  const q=document.getElementById('search-text').value.trim().toLowerCase();
  const desde=document.getElementById('search-desde').value;
  const hasta=document.getElementById('search-hasta').value;
  const tipo=document.getElementById('search-tipo').value;
  const cuenta=document.getElementById('search-cuenta').value;
  const resultsEl=document.getElementById('search-results');
  const limpiarBtn=document.getElementById('search-limpiar-btn');

  const hayFiltros=q.length>=2||desde||hasta||tipo!=='todos'||cuenta!=='todas';
  limpiarBtn.style.display=hayFiltros?'block':'none';
  if(!hayFiltros){ resultsEl.innerHTML=''; return; }

  let matches=entries;
  if(q.length>=2)matches=matches.filter(e=>e.name.toLowerCase().includes(q));
  if(desde)matches=matches.filter(e=>e.date>=desde);
  if(hasta)matches=matches.filter(e=>e.date<=hasta);
  if(tipo!=='todos')matches=matches.filter(e=>e.txType===tipo);
  if(cuenta!=='todas')matches=matches.filter(e=>e.acc===cuenta);

  renderSearchResults(matches,q);
}

function renderSearchResults(matches,q){
  const resultsEl=document.getElementById('search-results');
  if(matches.length===0){
    resultsEl.innerHTML=`<div class="empty">Sin resultados${q?` para "${q}"`:''} con estos filtros</div>`;
    return;
  }
  const sorted=[...matches].sort((a,b)=>b.date.localeCompare(a.date));
  resultsEl.innerHTML=`<div style="font-size:10px;color:var(--text3);margin-bottom:6px">${sorted.length} resultado(s) en todo tu historial</div>`+
    sorted.map(e=>{
      const meta=ACCOUNTS_META[e.acc]||{label:'Cuenta eliminada',currency:'COP'};
      const c=col(e.cat);
      const montoStr=(e.currency||meta.currency)==='USD'?fmtUSD(e.amount):fmtCOP(e.amount);
      const mes=cicloDe(e.date);
      return `<div class="entry-row" style="cursor:pointer" onclick="irAMes('${mes}')">
        <div class="entry-row-top">
          <span class="entry-date">${fmtDate(e.date)}</span>
          <span class="avatar-square" style="background:${c};width:28px;height:28px;font-size:11px;border-radius:8px">${esc(e.name.charAt(0).toUpperCase())}</span>
          <div class="entry-name">${esc(e.name)}</div>
          <span class="entry-amount">${montoStr}</span>
        </div>
        <div class="entry-row-bottom">
          <span class="entry-cat" style="background:${c}22;color:${c}">${scat(e.cat)}</span>
          <span class="entry-acc">${esc(meta.label)} · ${mes}</span>
        </div>
      </div>`;
    }).join('');
}

function irAMes(mes){
  currentMonth=mes;
  document.getElementById('month-select').value=mes;
  document.getElementById('search-text').value='';
  document.getElementById('search-results').innerHTML='';
  render();
}

function toggleBudgetDetail(detailId){
  const el=document.getElementById(detailId);
  const arrow=document.getElementById(detailId+'-arrow');
  if(!el)return;
  const abierto=el.style.display==='block';
  el.style.display=abierto?'none':'block';
  if(arrow)arrow.textContent=abierto?'▾':'▴';
}

async function updateCap(el){
  const cat=el.dataset.cat;
  const nuevoValor=Math.round(parseNum(el.value)); // los topes son pesos enteros: evita que "800,5" derive a 8005 en el siguiente blur
  if(!nuevoValor||nuevoValor<=0){ el.value=CAPS[cat].toLocaleString('es-CO'); return; }
  CAPS[cat]=nuevoValor;
  el.value=nuevoValor.toLocaleString('es-CO');
  if(currentUserId){
    try{
      const {error}=await sb.from('fin_presupuesto_topes').upsert(
        {user_id:currentUserId,categoria:cat,tope:nuevoValor},
        {onConflict:'user_id,categoria'}
      );
      if(error)throw error;
    }catch(e){ registrarErrorDiagnostico('fin_presupuesto_topes (guardado)',e); }
  }
  render();
}

function setFilterAccount(){
  filterAccount=document.getElementById('filter-account').value;
  updateFilterBalanceBanner();
  actualizarBotonLimpiarFiltros();
  render();
}

function setFilterType(){
  filterType=document.getElementById('filter-type').value;
  actualizarBotonLimpiarFiltros();
  render();
}

function setFilterCategory(){
  filterCategory=document.getElementById('filter-category').value;
  actualizarBotonLimpiarFiltros();
  render();
}

function limpiarFiltros(){
  filterAccount='todas'; filterType='todos'; filterCategory='todas';
  document.getElementById('filter-account').value='todas';
  document.getElementById('filter-type').value='todos';
  document.getElementById('filter-category').value='todas';
  updateFilterBalanceBanner();
  actualizarBotonLimpiarFiltros();
  render();
}

function actualizarBotonLimpiarFiltros(){
  const btn=document.getElementById('clear-filters-btn');
  if(!btn)return;
  const hayFiltros=filterAccount!=='todas'||filterType!=='todos'||filterCategory!=='todas';
  btn.style.display=hayFiltros?'block':'none';
}

function poblarFiltroCategoria(monthEntries){
  const sel=document.getElementById('filter-category');
  if(!sel)return;
  const categoriasPresentes=[...new Set(monthEntries.map(e=>e.cat))].sort();
  const valorActual=sel.value||filterCategory;
  const opciones='<option value="todas">Toda categoría</option>'+categoriasPresentes.map(cat=>`<option value="${cat.replace(/"/g,'&quot;')}">${scat(cat)}</option>`).join('');
  if(sel.innerHTML!==opciones)sel.innerHTML=opciones;
  if(categoriasPresentes.includes(valorActual)||valorActual==='todas'){ sel.value=valorActual; }
  else{ sel.value='todas'; filterCategory='todas'; }
}

function updateFilterBalanceBanner(){
  const banner=document.getElementById('filter-balance-banner');
  if(!banner)return;
  if(filterAccount==='todas'){
    banner.style.display='none';
    return;
  }
  const meta=ACCOUNTS_META[filterAccount];
  const saldo=accounts[filterAccount]||0;
  const saldoStr=meta.currency==='USD'?fmtUSD(saldo):fmtCOP(saldo);
  const esDeuda=meta.type==='credito';
  banner.style.display='flex';
  document.getElementById('filter-balance-label').textContent=`💰 Saldo actual de ${meta.label}`;
  const valEl=document.getElementById('filter-balance-value');
  valEl.textContent=saldoStr;
  valEl.style.color=esDeuda?'var(--danger)':'var(--accent)';
}

function updateEntriesSummary(){
  const summaryEl=document.getElementById('entries-summary');
  if(!summaryEl)return;

  const monthEntries=entries.filter(e=>cicloDe(e.date)===currentMonth&&e.cat!=='[Ajuste de saldo]');
  let filtroCuentas=filterAccount==='todas'?monthEntries:monthEntries.filter(e=>e.acc===filterAccount);
  let filtrado=filterType==='todos'?filtroCuentas:filtroCuentas.filter(e=>e.txType===filterType);
  if(filterCategory!=='todas')filtrado=filtrado.filter(e=>e.cat===filterCategory);

  const totalMovimientos=filtrado.length;
  const ingresos=filtrado.filter(e=>e.txType==='ingreso').reduce((s,e)=>s+entryCOP(e),0);
  const gastos=filtrado.filter(e=>e.txType!=='ingreso'&&e.cat!=='Transferencia').reduce((s,e)=>s+entryCOP(e),0);
  const balance=ingresos-gastos;

  // Solo mostrar si hay movimientos
  summaryEl.style.display=totalMovimientos>0?'block':'none';

  document.getElementById('summary-count').textContent=totalMovimientos.toLocaleString('es-CO');
  document.getElementById('summary-ingresos').textContent=fmtCOP(ingresos);
  document.getElementById('summary-gastos').textContent=fmtCOP(gastos);

  // Balance: ya se muestra en Ingresos y Gastos arriba, oculto por ahora
  // const balanceEl=document.getElementById('summary-balance');
  // balanceEl.textContent=fmtCOP(balance);
  // balanceEl.style.color=balance>=0?'var(--accent)':'var(--danger)';
}
const RECURRENTES=[
  {name:'Salario',amount:2675,acc:'ontop',cat:'Ingreso · Salario',day:26,isIncome:true},
  {name:'Arriendo',amount:1630000,acc:'debito',cat:'Otro',day:3},
  {name:'Salud Andrés (EPS)',amount:615500,acc:'debito',cat:'Salud',day:3},
  {name:'Pago mínimo Davivienda TC',amount:785246,acc:'debito',cat:'Pago Deuda',day:10},
  {name:'Pago Rappi Card',amount:1477710,acc:'debito',cat:'Pago Deuda',day:10},
  {name:'CapCut (suscripción)',amount:29900,acc:'rappitc',cat:'Suscripciones',day:6},
  {name:'Google One (suscripción)',amount:44900,acc:'rappitc',cat:'Suscripciones',day:23},
  {name:'Spotify (suscripción)',amount:30500,acc:'davtc',cat:'Suscripciones',day:29},
  {name:'Anthropic (Claude API)',amount:20,acc:'ontop',cat:'Suscripciones',day:29},
  {name:'Fondo de emergencia (aporte)',amount:300000,acc:'debito',cat:'Otro',day:5},
];

