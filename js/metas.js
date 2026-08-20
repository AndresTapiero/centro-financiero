let goals=[]; // metas dinámicas: [{id,name,type,target,acc?,cat?,accumulated?}]

function onGoalTypeChange(){
  const tipo=document.getElementById('goal-type').value;
  document.getElementById('goal-cuenta-row').style.display=tipo==='cuenta'?'grid':'none';
  document.getElementById('goal-categoria-row').style.display=tipo==='categoria'?'grid':'none';
  if(tipo==='cuenta')populateGoalAccountOptions();
}

function onGoalAccountChange(){
  const val=document.getElementById('goal-account').value;
  document.getElementById('goal-newaccount-row').style.display=val==='__nueva__'?'grid':'none';
}

function populateGoalAccountOptions(){
  const copGroup=document.getElementById('goal-acc-cop');
  const usdGroup=document.getElementById('goal-acc-usd');
  if(!copGroup||!usdGroup)return;
  copGroup.innerHTML='';
  usdGroup.innerHTML='';
  Object.keys(ACCOUNTS_META).forEach(key=>{
    const meta=ACCOUNTS_META[key];
    if(meta.type==='credito')return; // las metas de ahorro no aplican a tarjetas de crédito
    const opt=document.createElement('option');
    opt.value=key;
    opt.textContent=meta.label;
    (meta.currency==='USD'?usdGroup:copGroup).appendChild(opt);
  });
}

let dynamicAccounts={}; // registro de cuentas creadas por el usuario: {key:{label,currency}}

function slugify(text){
  return 'acc_'+text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
}

function abrirNuevaCuentaModal(){
  document.getElementById('nueva-cuenta-nombre').value='';
  document.getElementById('nueva-cuenta-moneda').value='COP';
  document.getElementById('nueva-cuenta-modal').style.display='flex';
}

async function resolverNuevaCuentaModal(confirmado){
  document.getElementById('nueva-cuenta-modal').style.display='none';
  if(!confirmado)return;
  const nombre=document.getElementById('nueva-cuenta-nombre').value.trim();
  if(!nombre)return;
  const moneda=document.getElementById('nueva-cuenta-moneda').value;
  await createDynamicAccount(nombre,moneda);
}

async function createDynamicAccount(name,currency){
  const key=slugify(name)+'_'+Date.now().toString(36).slice(-4);
  ACCOUNTS_META[key]={label:name,currency,type:'debito'};
  accounts[key]=0;
  dynamicAccounts[key]={label:name,currency};
  refreshAllAccountSelectors();
  renderDynamicAccountCard(key);
  await saveAccountsData(); // ya escribe esta cuenta nueva (y todas las demás) en Supabase, incluida esta
  return key;
}

function refreshAllAccountSelectors(){
  populateGoalAccountOptions();
  poblarFiltroCuentaBusqueda();
  // Movimientos, transferencias y pendientes: agregar cuentas dinámicas si no están
  ['inp-account','tr-origen','tr-destino','pend-account'].forEach(id=>{
    const sel=document.getElementById(id);
    if(!sel)return;
    Object.keys(dynamicAccounts).forEach(key=>{
      if(sel.querySelector(`option[value="${key}"]`))return;
      const meta=dynamicAccounts[key];
      let group=sel.querySelector(meta.currency==='USD'?'optgroup[label*="Dólares"]':'optgroup[label*="líquidas"]');
      const opt=document.createElement('option');
      opt.value=key;
      opt.textContent=meta.label;
      if(group)group.appendChild(opt); else sel.appendChild(opt);
    });
  });
}

function renderDynamicAccountCard(key){
  const grid=document.getElementById('metas-accounts-grid');
  if(!grid||grid.querySelector('#card-'+key))return;
  const meta=ACCOUNTS_META[key];
  const card=document.createElement('div');
  card.className='acc-card';
  card.id='card-'+key;
  const inicial=meta.label.charAt(0).toUpperCase();
  const monedaTexto=meta.currency==='USD'?'Dólares':'Pesos';
  // meta.label lo escribes tú al crear la cuenta, así que va escapado antes de entrar a innerHTML.
  card.innerHTML=`<div class="acc-label"><span class="avatar-square" style="background:#2563EB">${esc(inicial)}</span><span>${esc(meta.label)}</span><span class="currency-badge">${monedaTexto}</span></div><input class="acc-value" id="acc-${key}" onblur="handleAccountFieldBlur('${key}')">`;
  grid.appendChild(card);
  document.getElementById('acc-'+key).value=meta.currency==='USD'?'$'+accounts[key]+' USD':fmtCOP(accounts[key]);
}


function showSaveToast(state){
  const el=document.getElementById('save-toast');
  if(!el)return;
  clearTimeout(el._hideTimer);
  if(state==='saving'){
    el.textContent='⏳ Guardando…';
    el.style.background='var(--surface2)';
    el.style.color='var(--text2)';
    el.style.border='1px solid var(--border2)';
    el.style.display='block';
    el.style.opacity='1';
  }else if(state==='saved'){
    el.textContent='✓ Guardado';
    el.style.background='rgba(168,224,99,.15)';
    el.style.color='var(--accent)';
    el.style.border='1px solid rgba(168,224,99,.4)';
    el.style.display='block';
    el.style.opacity='1';
    el._hideTimer=setTimeout(()=>{ el.style.opacity='0'; setTimeout(()=>el.style.display='none',300); },1200);
  }else if(state==='error'){
    el.textContent='⚠ No se pudo guardar — ver 🔧 Diagnóstico';
    el.style.background='rgba(255,107,107,.15)';
    el.style.color='var(--danger)';
    el.style.border='1px solid rgba(255,107,107,.4)';
    el.style.display='block';
    el.style.opacity='1';
    // A propósito NO se autooculta: un fallo de guardado real (ej. en una transferencia)
    // no debe desaparecer solo en 3 segundos si cambiaste de pestaña justo después.
    // Se queda visible hasta el próximo guardado exitoso.
  }
}

let currentUserId=null; // se fija al iniciar sesión — necesario para escribir en Supabase

async function guardarCuentasSupabase(){
  if(!currentUserId)return false;
  // Si la carga falló, 'accounts' puede ser SEED_ACCOUNTS (datos de ejemplo) en vez de tus saldos
  // reales: guardar ahora los escribiría encima de las filas buenas. guardarConVerificacion() ya
  // respetaba esta guardia, pero addEntry/doTransfer/confirmAdjustment/payPendiente llegan por acá.
  if(cargaConFallos){
    registrarErrorDiagnostico('fin_accounts (guardado bloqueado)','La carga de datos falló; no se guarda para no pisar tus saldos reales.');
    return false;
  }
  try{
    const filas=Object.keys(ACCOUNTS_META).map(slug=>({
      user_id:currentUserId,
      slug,
      label:ACCOUNTS_META[slug].label,
      currency:ACCOUNTS_META[slug].currency,
      account_type:ACCOUNTS_META[slug].type,
      balance:accounts[slug]||0,
      is_dynamic:!!dynamicAccounts[slug],
    }));
    const {data:filasGuardadas,error}=await sb.from('fin_accounts').upsert(filas,{onConflict:'user_id,slug'}).select('id,slug');
    if(error)throw error;
    (filasGuardadas||[]).forEach(f=>{ accountIdBySlug[f.slug]=f.id; });
    return true;
  }catch(e){
    registrarErrorDiagnostico('fin_accounts (guardado)',e);
    return false;
  }
}

async function saveAccountsData(){
  pendingSaves++;
  showSaveToast('saving');
  const ok=await guardarCuentasSupabase();
  showSaveToast(ok?'saved':'error');
  pendingSaves--;
}

async function saveConfiguracion(){
  if(!currentUserId)return;
  pendingSaves++;
  showSaveToast('saving');
  try{
    const {error}=await sb.from('fin_configuracion').upsert(
      {user_id:currentUserId,trm:accounts.trm,vehiculos:vehiculos&&vehiculos.length?vehiculos:['Moto']},
      {onConflict:'user_id'}
    );
    if(error)throw error;
    showSaveToast('saved');
  }catch(e){
    registrarErrorDiagnostico('fin_configuracion',e);
    showSaveToast('error');
  }finally{
    pendingSaves--;
  }
}

async function actualizarAcumuladoMeta(goal){
  if(!goal||!currentUserId)return;
  try{
    const {error}=await sb.from('fin_metas').update({acumulado:goal.accumulated}).eq('id',goal.id);
    if(error)throw error;
  }catch(e){ registrarErrorDiagnostico('fin_metas (acumulado)',e); }
}

let addingGoal=false;

async function addGoal(){
  if(addingGoal)return;
  addingGoal=true;
  const btn=document.getElementById('goal-add-btn');
  if(btn){
    btn.disabled=true;
    btn.style.opacity='0.5';
  }

  const name=document.getElementById('goal-name').value.trim();
  const type=document.getElementById('goal-type').value;
  const target=parseFloat(document.getElementById('goal-target').value)||0;
  if(!name){
    toastError('⚠ Escribe un nombre para la meta');
    marcarInvalido(document.getElementById('goal-name'));
    addingGoal=false;
    if(btn){ btn.disabled=false; btn.style.opacity='1'; }
    return;
  }

  const goal={name,type,target};
  if(type==='cuenta'){
    let accSeleccionada=document.getElementById('goal-account').value;
    if(accSeleccionada==='__nueva__'){
      const nuevoNombre=document.getElementById('goal-newacc-name').value.trim();
      const nuevaMoneda=document.getElementById('goal-newacc-currency').value;
      if(!nuevoNombre){
        toastError('⚠ Escribe un nombre para la cuenta nueva');
        marcarInvalido(document.getElementById('goal-newacc-name'));
        addingGoal=false;
        if(btn){ btn.disabled=false; btn.style.opacity='1'; }
        return;
      }
      accSeleccionada=await createDynamicAccount(nuevoNombre,nuevaMoneda);
      document.getElementById('goal-newacc-name').value='';
    }
    goal.acc=accSeleccionada;
  }else{
    const catname=document.getElementById('goal-catname').value.trim();
    if(!catname){
      toastError('⚠ Escribe un nombre de categoría para la meta');
      marcarInvalido(document.getElementById('goal-catname'));
      addingGoal=false;
      if(btn){ btn.disabled=false; btn.style.opacity='1'; }
      return;
    }
    goal.cat=catname;
    goal.accumulated=0;
    const paleta=['#00D68F','#FFD54F','#5B8DEF','#F06292','#FFB347','#9B7FEA','#5EEAC8'];
    goal.color=paleta[goals.filter(g=>g.type==='categoria').length%paleta.length];
    COLORS[catname]=goal.color;
  }

  try{
    const {data:nuevaFila,error}=await sb.from('fin_metas').insert({
      user_id:currentUserId,
      nombre:goal.name,
      tipo:goal.type,
      account_id:goal.type==='cuenta'?accountIdBySlug[goal.acc]:null,
      categoria:goal.type==='categoria'?goal.cat:null,
      monto_objetivo:goal.target,
      acumulado:goal.accumulated||0,
      color:goal.color||null,
    }).select().single();
    if(error)throw error;
    goal.id=nuevaFila.id;
  }catch(e){
    registrarErrorDiagnostico('fin_metas (crear)',e);
    addingGoal=false;
    if(btn){
      btn.disabled=false;
      btn.style.opacity='1';
    }
    return;
  }

  goals.push(goal);
  document.getElementById('goal-name').value='';
  document.getElementById('goal-target').value='';
  document.getElementById('goal-catname').value='';
  refreshGoalCategoryOptions();
  renderGoals();

  addingGoal=false;
  if(btn){
    btn.disabled=false;
    btn.style.opacity='1';
  }
}

async function deleteGoal(id){
  // Antes bastaba un toque en la × para borrarla de memoria y de la nube, sin vuelta atrás
  // — deleteEntry y deletePendiente sí preguntaban.
  const g=goals.find(x=>x.id===id);
  if(!g)return;
  const confirmado=await customConfirm(`¿Eliminar la meta "${g.name}"?\n\nNo se borra ningún movimiento ni saldo: solo dejas de hacerle seguimiento.`);
  if(!confirmado)return;
  goals=goals.filter(g=>g.id!==id);
  refreshGoalCategoryOptions();
  renderGoals();
  try{
    const {error}=await sb.from('fin_metas').delete().eq('id',id);
    if(error)throw error;
  }catch(e){ registrarErrorDiagnostico('fin_metas (borrar)',e); }
}

function refreshGoalCategoryOptions(){
  const catGoals=goals.filter(g=>g.type==='categoria');
  ['inp-cat','pend-cat'].forEach(selectId=>{
    const sel=document.getElementById(selectId);
    if(!sel)return;
    let optgroup=sel.querySelector('#goal-cats-optgroup-'+selectId);
    if(optgroup)optgroup.remove();
    if(catGoals.length===0)return;
    optgroup=document.createElement('optgroup');
    optgroup.id='goal-cats-optgroup-'+selectId;
    optgroup.label='🏆 Metas';
    catGoals.forEach(g=>{
      const opt=document.createElement('option');
      opt.value=g.cat;
      opt.textContent=g.name;
      optgroup.appendChild(opt);
    });
    sel.appendChild(optgroup);
  });
}

/** Ritmo real de ahorro hacia una meta: promedio de los últimos 3 meses calendario
 *  con movimientos relevantes (no 3 meses fijos si hay huecos, sino los 3 más recientes con datos).
 *  - Metas por categoría: mismo criterio que actualiza "accumulated" (gasto suma, ingreso resta).
 *  - Metas por cuenta: mismo criterio que el saldo de la cuenta (ingreso suma, gasto resta). */
function calcularRitmoMeta(goal){
  const relevantes=goal.type==='categoria'
    ?entries.filter(e=>e.cat===goal.cat)
    :entries.filter(e=>e.acc===goal.acc);
  if(relevantes.length===0)return null;
  const porMes={};
  relevantes.forEach(e=>{
    const m=e.date.slice(0,7);
    const monto=entryCOP(e);
    const delta=goal.type==='categoria'
      ?(e.txType==='gasto'?monto:-monto)
      :(e.txType==='ingreso'?monto:-monto);
    porMes[m]=(porMes[m]||0)+delta;
  });
  const meses=Object.keys(porMes).sort().slice(-3);
  if(meses.length===0)return null;
  const promedioMensual=meses.reduce((s,m)=>s+porMes[m],0)/meses.length;
  return {promedioMensual,mesesConsiderados:meses.length};
}

function renderGoals(){
  const list=document.getElementById('goals-list');
  if(!list)return;
  if(goals.length===0){
    list.innerHTML='<div class="card"><div class="empty">🏆 Aún no tienes metas — crea la primera arriba (ej: Ahorro Vivienda vinculada a Lulo, o Inversión Cripto acumulada por categoría)</div></div>';
    return;
  }
  list.innerHTML=goals.map(g=>{
    let actual,moneda='COP';
    if(g.type==='cuenta'){
      // La cuenta vinculada pudo eliminarse: sin respaldo, meta.currency lanzaba y se caía
      // el render de todas las metas.
      const meta=ACCOUNTS_META[g.acc]||{label:'Cuenta eliminada',currency:'COP'};
      actual=accounts[g.acc]||0;
      moneda=meta.currency;
    }else{
      actual=g.accumulated||0;
    }
    const actualCOP=moneda==='USD'?actual*accounts.trm:actual;
    const targetCOP=g.target||0;
    const pct=targetCOP>0?Math.min(100,Math.round(actualCOP/targetCOP*100)):null;
    const actualStr=moneda==='USD'?'$'+actual.toFixed(2)+' USD':fmtCOP(actual);
    const {color:colorMeta,mensaje:mensajeMeta}=pct!==null?colorYMensajeProgreso(pct):{color:null,mensaje:null};

    let proyeccionHTML='';
    if(g.target){
      const faltanteCOP=targetCOP-actualCOP;
      if(faltanteCOP<=0){
        proyeccionHTML=`<div style="font-size:10px;color:var(--safe);margin-top:8px;font-weight:600">🎉 Meta alcanzada.</div>`;
      }else{
        const ritmo=calcularRitmoMeta(g);
        if(!ritmo||ritmo.promedioMensual<=0){
          proyeccionHTML=`<div style="font-size:10px;color:var(--text3);margin-top:8px">Sin ritmo de ahorro positivo en tus últimos movimientos — todavía no se puede proyectar cuándo la alcanzas.</div>`;
        }else{
          const mesesRestantes=Math.ceil(faltanteCOP/ritmo.promedioMensual);
          const fechaProyectada=new Date();
          fechaProyectada.setMonth(fechaProyectada.getMonth()+mesesRestantes);
          const monthNamesLower=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
          const fechaTexto=`${monthNamesLower[fechaProyectada.getMonth()]} ${fechaProyectada.getFullYear()}`;
          proyeccionHTML=`<div style="font-size:10px;color:var(--text2);margin-top:8px">📅 A tu ritmo de los últimos ${ritmo.mesesConsiderados} mes(es) (~${fmtCOP(ritmo.promedioMensual)}/mes), llegarías en <strong style="color:var(--text)">~${mesesRestantes} mes(es) (${fechaTexto})</strong>.</div>`;
        }
      }
    }

    return `<div class="card">
      <div class="card-title">${g.type==='cuenta'?'💧':'🏷️'} ${esc(g.name)} <button class="btn-del" onclick="deleteGoal('${g.id}')" style="float:right">×</button></div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
        <span style="font-family:var(--mono);font-size:20px;font-weight:700;color:var(--accent)">${actualStr}</span>
        ${g.target?`<span style="font-size:11px;color:var(--text3)">meta: ${fmtCOP(g.target)}</span>`:'<span style="font-size:11px;color:var(--text3)">sin meta fija — solo trazabilidad</span>'}
      </div>
      ${pct!==null?`<div class="debt-track"><div class="debt-fill" style="width:${pct}%;background:${colorMeta}"></div></div><div style="font-size:10px;margin-top:4px;display:flex;justify-content:space-between"><span style="color:${colorMeta};font-weight:600">${mensajeMeta}</span><span style="color:var(--text3)">${pct}%</span></div>`:''}
      <div style="font-size:10px;color:var(--text3);margin-top:8px">${g.type==='cuenta'?'Vinculada a: '+esc((ACCOUNTS_META[g.acc]||{}).label||'Cuenta eliminada'):'Acumula movimientos categorizados como "'+esc(g.name)+'"'}</div>
      ${proyeccionHTML}
    </div>`;
  }).join('');
}

