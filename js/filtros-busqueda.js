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

function limpiarBusqueda(){
  document.getElementById('search-text').value='';
  document.getElementById('search-desde').value='';
  document.getElementById('search-hasta').value='';
  document.getElementById('search-tipo').value='todos';
  document.getElementById('search-cuenta').value='todas';
  buscarEnHistorial();
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
      const meta=ACCOUNTS_META[e.acc];
      const c=col(e.cat);
      const montoStr=(e.currency||meta.currency)==='USD'?fmtUSD(e.amount):fmtCOP(e.amount);
      const mes=e.date.slice(0,7);
      return `<div class="entry-row" style="cursor:pointer" onclick="irAMes('${mes}')">
        <div class="entry-row-top">
          <span class="entry-date">${fmtDate(e.date)}</span>
          <div class="entry-dot" style="background:${c}"></div>
          <div class="entry-name">${e.name}</div>
          <span class="entry-amount">${montoStr}</span>
        </div>
        <div class="entry-row-bottom">
          <span class="entry-cat" style="background:${c}22;color:${c}">${scat(e.cat)}</span>
          <span class="entry-acc">${meta.label} · ${mes}</span>
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

async function saveConfig(){
  scheduleSave('config_v1',()=>JSON.stringify({goals}));
}
// Alias de compatibilidad — goals es lo único que sigue viviendo en config_v1 por ahora (siguiente en la fila de migración)
const saveGoals=saveConfig;

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
  const nuevoValor=parseNum(el.value);
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
const RECURRENTES=[
  {name:'Salario (ingreso)',amount:2675,acc:'ontop',cat:'Otro',day:26,isIncome:true},
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

