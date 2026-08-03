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
  card.style.borderLeftColor='#5B8DEF';
  card.style.background='linear-gradient(135deg,rgba(91,141,239,.10),var(--surface2) 60%)';
  card.id='card-'+key;
  card.innerHTML=`<div class="acc-label"><span>${meta.label}</span><span>💰</span></div><input class="acc-value" id="acc-${key}" onblur="handleAccountFieldBlur('${key}')">`;
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

async function addGoal(){
  const name=document.getElementById('goal-name').value.trim();
  const type=document.getElementById('goal-type').value;
  const target=parseFloat(document.getElementById('goal-target').value)||0;
  if(!name)return;
  const goal={name,type,target};
  if(type==='cuenta'){
    let accSeleccionada=document.getElementById('goal-account').value;
    if(accSeleccionada==='__nueva__'){
      const nuevoNombre=document.getElementById('goal-newacc-name').value.trim();
      const nuevaMoneda=document.getElementById('goal-newacc-currency').value;
      if(!nuevoNombre)return;
      accSeleccionada=await createDynamicAccount(nuevoNombre,nuevaMoneda);
      document.getElementById('goal-newacc-name').value='';
    }
    goal.acc=accSeleccionada;
  }else{
    const catname=document.getElementById('goal-catname').value.trim();
    if(!catname)return;
    goal.cat=catname;
    goal.accumulated=0;
    // asigna un color de una paleta rotativa para que se vea bien en gráficos
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
    return; // no la agregamos localmente si no se pudo guardar, para no mostrar algo que no existe en la nube
  }

  goals.push(goal);
  document.getElementById('goal-name').value='';
  document.getElementById('goal-target').value='';
  document.getElementById('goal-catname').value='';
  refreshGoalCategoryOptions();
  renderGoals();
}

async function deleteGoal(id){
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
      const meta=ACCOUNTS_META[g.acc];
      actual=accounts[g.acc]||0;
      moneda=meta.currency;
    }else{
      actual=g.accumulated||0;
    }
    const actualCOP=moneda==='USD'?actual*accounts.trm:actual;
    const targetCOP=g.target||0;
    const pct=targetCOP>0?Math.min(100,Math.round(actualCOP/targetCOP*100)):null;
    const actualStr=moneda==='USD'?'$'+actual.toFixed(2)+' USD':fmtCOP(actual);
    return `<div class="card">
      <div class="card-title">${g.type==='cuenta'?'💧':'🏷️'} ${g.name} <button class="btn-del" onclick="deleteGoal('${g.id}')" style="float:right">×</button></div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
        <span style="font-family:var(--mono);font-size:20px;font-weight:700;color:var(--accent)">${actualStr}</span>
        ${g.target?`<span style="font-size:11px;color:var(--text3)">meta: ${fmtCOP(g.target)}</span>`:'<span style="font-size:11px;color:var(--text3)">sin meta fija — solo trazabilidad</span>'}
      </div>
      ${pct!==null?`<div class="debt-track"><div class="debt-fill" style="width:${pct}%"></div></div><div style="font-size:10px;color:var(--text3);margin-top:4px;text-align:right">${pct}% completado</div>`:''}
      <div style="font-size:10px;color:var(--text3);margin-top:8px">${g.type==='cuenta'?'Vinculada a: '+ACCOUNTS_META[g.acc].label:'Acumula movimientos categorizados como "'+g.name+'"'}</div>
    </div>`;
  }).join('');
}

