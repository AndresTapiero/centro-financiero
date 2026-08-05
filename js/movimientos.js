function abrirModalNuevoMovimiento(){
  document.getElementById('nuevo-movimiento-modal').style.display='flex';
  document.body.style.overflow='hidden'; // evita que el fondo se desplace/asome detrás del modal en móvil
  document.getElementById('inp-date').value=todayStr();
  document.getElementById('inp-name').focus();
}

function cerrarModalNuevoMovimiento(){
  document.getElementById('nuevo-movimiento-modal').style.display='none';
  document.body.style.overflow='';
}

async function addEntry(seguirAgregando){
  const name=document.getElementById('inp-name').value.trim();
  const amount=redondear3(parseFloat(document.getElementById('inp-amount').value));
  const cat=document.getElementById('inp-cat').value;
  const date=document.getElementById('inp-date').value||todayStr();
  const acc=document.getElementById('inp-account').value;
  const type=document.getElementById('inp-type').value;
  if(!name||isNaN(amount)||amount<=0)return;

  const meta=ACCOUNTS_META[acc];
  const sign=type==='gasto'?1:-1;
  const curOverride=meta.currency==='USD'?document.getElementById('inp-currency').value:null;
  const entryCurrency=curOverride&&curOverride!==meta.currency?curOverride:undefined;

  let nativeAmount=amount;
  if(meta.currency==='USD'&&entryCurrency==='COP'){
    nativeAmount=amount/accounts.trm; // el monto se escribió en COP pero la cuenta guarda USD
  }

  let vehiculoTag=null;
  if(cat.startsWith('Vehículo')){
    const selVeh=document.getElementById('inp-vehiculo').value;
    if(selVeh==='__nuevo__'){
      const nuevoVeh=document.getElementById('inp-vehiculo-nuevo').value.trim();
      if(nuevoVeh){
        vehiculoTag=nuevoVeh;
        if(!vehiculos.includes(nuevoVeh)){
          vehiculos.push(nuevoVeh);
          populateVehiculoSelect();
          await saveConfiguracion();
        }
        document.getElementById('inp-vehiculo-nuevo').value='';
      }
    }else{
      vehiculoTag=selVeh;
    }
  }

  // Guardamos primero el movimiento en Supabase; solo si funciona tocamos el saldo local —
  // así nunca queda un saldo cambiado sin su movimiento correspondiente (o viceversa).
  let nuevoId;
  try{
    const {data:fila,error}=await sb.from('fin_movimientos').insert({
      user_id:currentUserId,
      fecha:date,
      nombre:name,
      monto:amount,
      moneda_override:entryCurrency||null,
      categoria:cat,
      account_id:accountIdBySlug[acc],
      tx_type:type,
      vehiculo:vehiculoTag||null,
    }).select().single();
    if(error)throw error;
    nuevoId=fila.id;
  }catch(e){
    registrarErrorDiagnostico('fin_movimientos (crear)',e);
    const statusEl=document.getElementById('sync-status');
    statusEl.style.display='block'; statusEl.style.opacity='1';
    statusEl.textContent='🛑 No se pudo guardar el movimiento — revisa 🔧 Diagnóstico';
    statusEl.className='sync-status error';
    return;
  }

  if(meta.type==='credito'){
    accounts[acc]=redondear3(accounts[acc]+(sign*nativeAmount));
  }else{
    accounts[acc]=redondear3(accounts[acc]-(sign*nativeAmount));
  }

  entries.unshift({id:nuevoId,date,name,amount,cat,acc,txType:type,...(entryCurrency?{currency:entryCurrency}:{}),...(vehiculoTag?{vehiculo:vehiculoTag}:{})});

  const metaGoal=goals.find(g=>g.type==='categoria'&&g.cat===cat);
  if(metaGoal){
    const montoCOP=entryCurrency==='COP'?amount:(meta.currency==='USD'?amount*accounts.trm:amount);
    metaGoal.accumulated=(metaGoal.accumulated||0)+(type==='gasto'?montoCOP:-montoCOP);
    await actualizarAcumuladoMeta(metaGoal);
  }

  document.getElementById('inp-name').value='';
  document.getElementById('inp-amount').value='';
  populateMonthSelector();
  currentMonth=date.slice(0,7);
  document.getElementById('month-select').value=currentMonth;
  fillAccountInputs();
  render();
  try{
    await saveAccountsData();
  }catch(e){}
  if(seguirAgregando){
    // Deja cuenta/categoría/fecha tal como están (lo normal es seguir registrando cosas parecidas) y solo enfoca el nombre
    document.getElementById('inp-name').focus();
    const statusEl=document.getElementById('sync-status');
    statusEl.style.display='block'; statusEl.style.opacity='1';
    statusEl.textContent='✓ Guardado — listo para el siguiente';
    statusEl.className='sync-status ok';
    setTimeout(()=>{statusEl.style.opacity='0.35'},1200);
  }else{
    cerrarModalNuevoMovimiento();
  }
}

async function fixCurrency(id){
  const e=entries.find(x=>x.id===id);
  if(!e)return;
  const meta=ACCOUNTS_META[e.acc];
  const actual=e.currency||meta.currency;
  e.currency=actual==='USD'?'COP':'USD';
  render();
  try{
    const {error}=await sb.from('fin_movimientos').update({moneda_override:e.currency}).eq('id',id);
    if(error)throw error;
  }catch(err){ registrarErrorDiagnostico('fin_movimientos (corregir moneda)',err); }
}

let _editEntryId=null;
function openEditEntryModal(id){
  const e=entries.find(x=>x.id===id);
  if(!e)return;
  _editEntryId=id;
  const meta=ACCOUNTS_META[e.acc];
  const curDisplay=e.currency||meta.currency;
  const amtStr=curDisplay==='USD'?fmtUSD(e.amount):fmtCOP(e.amount);
  const esIngreso=e.txType==='ingreso';
  document.getElementById('edit-entry-modal-text').textContent=`${e.name} — actualmente ${amtStr} en ${meta.label} · ${scat(e.cat)}`;
  const badge=document.getElementById('edit-entry-tipo-badge');
  badge.textContent=esIngreso?'➕ Ingreso':'➖ Gasto';
  badge.className='tipo-tab '+(esIngreso?'tipo-tab-ingreso active':'tipo-tab-gasto active');
  badge.style.padding='5px 12px';
  badge.style.cursor='default';

  const accSel=document.getElementById('edit-entry-account');
  const liquidas=Object.keys(ACCOUNTS_META).filter(k=>ACCOUNTS_META[k].type!=='credito'&&ACCOUNTS_META[k].currency==='COP'&&!dynamicAccounts[k]);
  const tarjetas=Object.keys(ACCOUNTS_META).filter(k=>ACCOUNTS_META[k].type==='credito');
  const dolares=Object.keys(ACCOUNTS_META).filter(k=>ACCOUNTS_META[k].currency==='USD'&&!dynamicAccounts[k]);
  const dinamicas=Object.keys(dynamicAccounts);
  const opt=k=>`<option value="${k}">${ACCOUNTS_META[k].label}</option>`;
  accSel.innerHTML=
    (liquidas.length?`<optgroup label="🏦 Cuentas líquidas (COP)">${liquidas.map(opt).join('')}</optgroup>`:'')+
    (tarjetas.length?`<optgroup label="💳 Tarjetas de crédito">${tarjetas.map(opt).join('')}</optgroup>`:'')+
    (dolares.length?`<optgroup label="🌎 Dólares (USD)">${dolares.map(opt).join('')}</optgroup>`:'')+
    (dinamicas.length?`<optgroup label="✨ Otras cuentas">${dinamicas.map(opt).join('')}</optgroup>`:'');
  accSel.value=e.acc;

  const catSel=document.getElementById('edit-entry-category');
  catSel.innerHTML=document.getElementById('inp-cat').innerHTML; // mismas opciones/optgroups, incluye metas por categoría
  catSel.value=e.cat;

  document.getElementById('edit-entry-amount').value=e.amount;
  document.getElementById('edit-entry-amount-label').textContent=`Monto (${curDisplay})`;

  onEditEntryAccountChange();
  document.getElementById('edit-entry-modal').style.display='flex';
}

function onEditEntryAccountChange(){
  const acc=document.getElementById('edit-entry-account').value;
  const meta=ACCOUNTS_META[acc];
  const row=document.getElementById('edit-entry-currency-row');
  row.style.display=meta.currency==='USD'?'block':'none';
  if(meta.currency==='USD')document.getElementById('edit-entry-currency').value='USD';
  const label=document.getElementById('edit-entry-amount-label');
  const currencyChoice=meta.currency==='USD'?document.getElementById('edit-entry-currency').value:meta.currency;
  label.textContent=`Monto (${currencyChoice})`;
}
document.getElementById('edit-entry-currency')?.addEventListener('change',onEditEntryAccountChange);

async function resolverEditEntryModal(confirmado){
  document.getElementById('edit-entry-modal').style.display='none';
  const id=_editEntryId;
  _editEntryId=null;
  if(!confirmado||!id)return;
  const e=entries.find(x=>x.id===id);
  if(!e)return;

  const newAcc=document.getElementById('edit-entry-account').value;
  const newMeta=ACCOUNTS_META[newAcc];
  const newCurrencyChoice=newMeta.currency==='USD'?document.getElementById('edit-entry-currency').value:newMeta.currency;
  const newCat=document.getElementById('edit-entry-category').value;
  const montoEscrito=redondear3(parseFloat(document.getElementById('edit-entry-amount').value));
  if(isNaN(montoEscrito)||montoEscrito<=0)return;

  const oldAcc=e.acc;
  const oldMeta=ACCOUNTS_META[oldAcc];
  const oldCurrency=e.currency||oldMeta.currency; // moneda REAL en la que ocurrió el gasto originalmente
  const oldAmount=e.amount;
  const oldCat=e.cat;
  const sign=e.txType==='gasto'?1:-1;

  // 1. Revertir el impacto en la cuenta anterior con el monto viejo (antes de cualquier cambio)
  if(oldMeta.type==='credito'){ accounts[oldAcc]=redondear3(accounts[oldAcc]-(sign*oldAmount)); }
  else{ accounts[oldAcc]=redondear3(accounts[oldAcc]+(sign*oldAmount)); }

  // 2. El monto escrito en el formulario ya está en la moneda mostrada (newCurrencyChoice) — es el monto nativo final
  const nuevoAmountNativo=montoEscrito;

  // 3. Aplicar el impacto en la cuenta nueva con el monto nuevo
  if(newMeta.type==='credito'){ accounts[newAcc]=redondear3(accounts[newAcc]+(sign*nuevoAmountNativo)); }
  else{ accounts[newAcc]=redondear3(accounts[newAcc]-(sign*nuevoAmountNativo)); }

  // 4. Ajustar metas acumuladas por categoría (considerando que categoría y/o monto pudieron cambiar)
  const montoViejoCOP=oldCurrency==='USD'?oldAmount*accounts.trm:oldAmount;
  const montoNuevoCOP=newCurrencyChoice==='USD'?nuevoAmountNativo*accounts.trm:nuevoAmountNativo;
  const oldGoal=goals.find(g=>g.type==='categoria'&&g.cat===oldCat);
  const newGoal=goals.find(g=>g.type==='categoria'&&g.cat===newCat);
  let goalsChanged=false;
  if(oldGoal){
    oldGoal.accumulated=(oldGoal.accumulated||0)-(e.txType==='gasto'?montoViejoCOP:-montoViejoCOP);
    goalsChanged=true;
  }
  if(newGoal){
    newGoal.accumulated=(newGoal.accumulated||0)+(e.txType==='gasto'?montoNuevoCOP:-montoNuevoCOP);
    goalsChanged=true;
  }

  // 5. Actualizar la entrada
  e.acc=newAcc;
  e.cat=newCat;
  e.amount=nuevoAmountNativo;
  if(newMeta.currency==='USD'&&newCurrencyChoice==='COP'){ e.currency='COP'; }
  else{ delete e.currency; }
  if(!newCat.startsWith('Vehículo')&&e.vehiculo)delete e.vehiculo;

  fillAccountInputs();
  render();
  try{
    const {error}=await sb.from('fin_movimientos').update({
      categoria:e.cat,
      account_id:accountIdBySlug[e.acc],
      monto:e.amount,
      moneda_override:e.currency||null,
      vehiculo:e.vehiculo||null,
    }).eq('id',id);
    if(error)throw error;
    await saveAccountsData();
    if(goalsChanged){
      if(oldGoal)await actualizarAcumuladoMeta(oldGoal);
      if(newGoal&&newGoal!==oldGoal)await actualizarAcumuladoMeta(newGoal);
    }
  }catch(err){ registrarErrorDiagnostico('fin_movimientos (editar)',err); }
}


async function eliminarDesdeModalEdicion(){
  const id=_editEntryId;
  if(!id)return;
  document.getElementById('edit-entry-modal').style.display='none';
  await deleteEntry(id);
}

async function deleteEntry(id){
  const e=entries.find(x=>x.id===id);
  if(!e)return false;
  const meta=ACCOUNTS_META[e.acc];
  const montoStr=(e.currency||meta.currency)==='USD'?fmtUSD(e.amount):fmtCOP(e.amount);
  const confirmado=await customConfirm(`¿Eliminar este movimiento?\n\n"${e.name}"\n${montoStr} — ${meta.label}\n${fmtDate(e.date)}\n\nEsto también revertirá el saldo de la cuenta afectada.`);
  if(!confirmado)return false;

  {
    const sign=e.txType==='gasto'?1:-1;
    if(meta.type==='credito'){ accounts[e.acc]=redondear3(accounts[e.acc]-(sign*e.amount)); }
    else{ accounts[e.acc]=redondear3(accounts[e.acc]+(sign*e.amount)); }

    const metaGoal=goals.find(g=>g.type==='categoria'&&g.cat===e.cat);
    if(metaGoal){
      const montoCOP=e.currency==='COP'?e.amount:(meta.currency==='USD'?e.amount*accounts.trm:e.amount);
      metaGoal.accumulated=(metaGoal.accumulated||0)-(e.txType==='gasto'?montoCOP:-montoCOP);
      await actualizarAcumuladoMeta(metaGoal);
    }
  }
  entries=entries.filter(x=>x.id!==id);
  fillAccountInputs();
  render();
  try{
    const {error}=await sb.from('fin_movimientos').delete().eq('id',id);
    if(error)throw error;
    await saveAccountsData();
  }catch(e){ registrarErrorDiagnostico('fin_movimientos (borrar)',e); }
  return true;
}

function switchTab(tab,btn){
  document.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(t=>t.classList.remove('active'));
  document.getElementById('tab-'+tab).classList.add('active');
  if(btn)btn.classList.add('active'); // Diagnóstico ya no tiene botón visible en la barra principal — se abre desde el menú de usuario, sin marcar ningún ítem de nav como activo
  if(tab==='metricas')renderMetrics();
  if(tab==='metas')renderGoals();
  if(tab==='diagnostico')renderDiagnostico();
}

function entryCOP(e){
  const meta=ACCOUNTS_META[e.acc];
  const currency=e.currency||meta.currency;
  return currency==='USD'?e.amount*accounts.trm:e.amount;
}

