let _pendTipo='gasto';
function setTipoPend(tipo){
  _pendTipo=tipo;
  document.getElementById('pend-tab-gasto').classList.toggle('active',tipo==='gasto');
  document.getElementById('pend-tab-ingreso').classList.toggle('active',tipo==='ingreso');
}

function renderPendientes(){
  const list=document.getElementById('pendientes-list');
  if(!list)return;
  list.innerHTML=new PendienteListRenderer(pendientes, todayStr()).render();
  if(typeof actualizarBadgePendientes==='function') actualizarBadgePendientes();
}

async function addPendiente(){
  const name=document.getElementById('pend-name').value.trim();
  const amount=redondear3(parseMontoFormateado(document.getElementById('pend-amount').value));
  const date=document.getElementById('pend-date').value;
  const acc=document.getElementById('pend-account').value;
  const cat=document.getElementById('pend-cat').value;
  const isIncome=_pendTipo==='ingreso';
  if(!name){ toastError('⚠ Escribe una descripción'); marcarInvalido(document.getElementById('pend-name')); return; }
  if(isNaN(amount)||amount<=0){ toastError('⚠ El monto debe ser mayor a 0'); marcarInvalido(document.getElementById('pend-amount')); return; }
  const nuevo={name,amount,date,acc,cat,isIncome};
  try{
    const {data:fila,error}=await sb.from('fin_pendientes').insert({
      user_id:currentUserId,
      nombre:name,
      monto:amount,
      fecha:date||null,
      account_id:accountIdBySlug[acc],
      categoria:cat,
      is_income:isIncome,
    }).select().single();
    if(error)throw error;
    nuevo.id=fila.id;
  }catch(e){
    registrarErrorDiagnostico('fin_pendientes (crear)',e);
    return; // no lo agregamos localmente si no se pudo guardar en la nube
  }
  pendientes.push(nuevo);
  document.getElementById('pend-name').value='';
  document.getElementById('pend-amount').value='';
  const suggestEl=document.getElementById('pend-suggest');
  if(suggestEl) suggestEl.style.display='none';
  setTipoPend('gasto');
  renderPendientes();
  updateNetWorth();
}

async function deletePendiente(id){
  const p=pendientes.find(x=>x.id===id);
  if(!p)return false;
  const meta=ACCOUNTS_META[p.acc];
  const montoStr=meta.currency==='USD'?fmtUSD(p.amount):fmtCOP(p.amount);
  const confirmado=await customConfirm(`¿Eliminar este pendiente?\n\n"${p.name}"\n${montoStr} — ${meta.label}\n${p.date?fmtDate(p.date):'Sin fecha'}`);
  if(!confirmado)return false;

  pendientes=pendientes.filter(x=>x.id!==id);
  renderPendientes();
  updateNetWorth();
  try{
    const {error}=await sb.from('fin_pendientes').delete().eq('id',id);
    if(error)throw error;
  }catch(e){ registrarErrorDiagnostico('fin_pendientes (borrar)',e); }
  return true;
}

function onPendAccountChange(){
  const acc=document.getElementById('pend-account').value;
  const meta=ACCOUNTS_META[acc];
  const amountInp=document.getElementById('pend-amount');
  setAmountInputMode(amountInp,meta.currency==='USD','Monto');
  // Sugerencia de conveniencia: si eliges una tarjeta y el campo está vacío, sugerimos el saldo actual
  // — pero lo puedes cambiar antes de guardar (ej. para poner el pago mínimo en vez del total).
  if(meta&&meta.type==='credito'&&!amountInp.value){
    amountInp.value=Math.round(accounts[acc]).toLocaleString('es-CO');
    amountInp.placeholder='Saldo actual sugerido — edítalo si vas a pagar otro monto';
  }
}

let _editPendienteId=null;
function editPendiente(id){
  const p=pendientes.find(x=>x.id===id);
  if(!p)return;
  _editPendienteId=id;
  const meta=ACCOUNTS_META[p.acc];
  const editAmtInp=document.getElementById('edit-pendiente-amount');
  editAmtInp.dataset.currency=meta.currency;
  editAmtInp.value=meta.currency==='USD'
    ? String(p.amount)
    : Math.round(p.amount).toLocaleString('es-CO');
  const hintEl=document.getElementById('edit-pendiente-hint');
  const btnSaldo=document.getElementById('edit-pendiente-usar-saldo');
  if(meta.type==='credito'){
    const saldoStr=meta.currency==='USD'?fmtUSD(accounts[p.acc]):fmtCOP(accounts[p.acc]);
    hintEl.textContent=`"${p.name}" — saldo actual de ${meta.label}: ${saldoStr}. Puedes dejar un monto distinto (ej. pago mínimo).`;
    btnSaldo.style.display='block';
  }else{
    hintEl.textContent=`"${p.name}" — ${meta.label}`;
    btnSaldo.style.display='none';
  }
  document.getElementById('edit-pendiente-modal').style.display='flex';
}

function usarSaldoActualEnEdicion(){
  const p=pendientes.find(x=>x.id===_editPendienteId);
  if(!p)return;
  document.getElementById('edit-pendiente-amount').value=Math.round(accounts[p.acc]).toLocaleString('es-CO');
}

async function resolverEditPendienteModal(confirmado){
  document.getElementById('edit-pendiente-modal').style.display='none';
  const id=_editPendienteId;
  _editPendienteId=null;
  if(!confirmado||!id)return;
  const p=pendientes.find(x=>x.id===id);
  if(!p)return;
  const nuevoMonto=redondear3(parseMontoFormateado(document.getElementById('edit-pendiente-amount').value));
  if(isNaN(nuevoMonto)||nuevoMonto<=0){ toastError('⚠ El monto debe ser mayor a 0'); marcarInvalido(document.getElementById('edit-pendiente-amount')); return; }
  p.amount=nuevoMonto;
  renderPendientes();
  updateNetWorth();
  try{
    const {error}=await sb.from('fin_pendientes').update({monto:nuevoMonto}).eq('id',id);
    if(error)throw error;
  }catch(e){ registrarErrorDiagnostico('fin_pendientes (editar monto)',e); }
}

async function payPendiente(id){
  const p=pendientes.find(x=>x.id===id);
  if(!p)return;
  const metaOrigen=ACCOUNTS_META[p.acc];
  const montoVigente=p.amount; // el monto que tú definiste al crear/editar el pendiente — ya no se fuerza al saldo total de la tarjeta
  const accion=p.isIncome?'Recibir':'Pagar';
  const montoStr=metaOrigen.currency==='USD'?fmtUSD(montoVigente):fmtCOP(montoVigente);
  const accFinal=await customAccountPrompt(`${accion} "${p.name}" — ${montoStr}`,p.acc);
  if(accFinal===null)return; // cancelado
  const meta=ACCOUNTS_META[accFinal];
  const txType=p.isIncome?'ingreso':'gasto';
  const sign=p.isIncome?-1:1; // misma convención que addEntry: gasto=+resta, ingreso=+suma

  // Igual que addEntry(): primero guardamos el movimiento en la nube y solo si funciona tocamos
  // saldos y borramos el pendiente. Antes el saldo se movía y el pendiente se borraba pase lo que
  // pase, así que un insert fallido dejaba la cuenta descuadrada sin ningún movimiento que lo explique.
  let filaNueva;
  try{
    const {data:fila,error}=await sb.from('fin_movimientos').insert({
      user_id:currentUserId,
      fecha:todayStr(),
      nombre:p.name,
      monto:montoVigente,
      categoria:p.cat,
      account_id:accountIdBySlug[accFinal],
      tx_type:txType,
    }).select().single();
    if(error)throw error;
    filaNueva=fila;
  }catch(e){
    registrarErrorDiagnostico('fin_movimientos (pagar pendiente)',e);
    const statusEl=document.getElementById('sync-status');
    statusEl.style.display='block'; statusEl.style.opacity='1';
    statusEl.textContent='🛑 No se pudo registrar el pago — el pendiente sigue ahí, no se cambió ningún saldo. Revisa 🔧 Diagnóstico.';
    statusEl.className='sync-status error';
    return;
  }

  if(meta.type==='credito'){ accounts[accFinal]=redondear3(accounts[accFinal]+(sign*montoVigente)); }
  else{ accounts[accFinal]=redondear3(accounts[accFinal]-(sign*montoVigente)); }

  // "Pago Deuda" paga UNA tarjeta usando el dinero de OTRA cuenta (normalmente Davivienda) — son dos
  // cuentas distintas. Lo de arriba ya descontó de dónde sale el dinero; esto además baja la deuda
  // de la tarjeta específica, detectada por el nombre del pendiente (sin agregar un campo nuevo).
  if(p.cat==='Pago Deuda'&&!p.isIncome){
    let tarjeta=null;
    if(p.name.includes('Davivienda'))tarjeta='davtc';
    else if(p.name.includes('Rappi'))tarjeta='rappitc';
    if(tarjeta&&tarjeta!==accFinal){
      accounts[tarjeta]=redondear3(accounts[tarjeta]-montoVigente);
    }
  }

  entries.unshift({id:filaNueva.id,date:todayStr(),name:p.name,amount:montoVigente,cat:p.cat,acc:accFinal,txType});
  pendientes=pendientes.filter(x=>x.id!==id);
  fillAccountInputs();
  populateMonthSelector();
  document.getElementById('month-select').value=currentMonth;
  render();
  try{
    await saveAccountsData();
    const {error}=await sb.from('fin_pendientes').delete().eq('id',id);
    if(error)throw error;
  }catch(e){ registrarErrorDiagnostico('fin_pendientes (pagar/borrar)',e); }
}

function onTransferAccChange(){
  const origenSel=document.getElementById('tr-origen');
  const destinoSel=document.getElementById('tr-destino');
  const origen=origenSel.value;
  const destino=destinoSel.value;

  // Excluir mutuamente: la cuenta seleccionada en uno no puede aparecer en el otro
  [...destinoSel.options].forEach(opt=>{ opt.disabled=opt.value===origen; });
  [...origenSel.options].forEach(opt=>{ opt.disabled=opt.value===destino; });

  // Si quedaron iguales (ej. carga inicial), auto-seleccionar la primera disponible en destino
  if(origen===destino){
    const otro=[...destinoSel.options].find(o=>o.value!==origen&&!o.disabled);
    if(otro) destinoSel.value=otro.value;
  }

  const metaO=ACCOUNTS_META[origenSel.value];
  const metaD=ACCOUNTS_META[destinoSel.value];
  const mismaMoneda=metaO&&metaD&&metaO.currency===metaD.currency;
  const trmInp=document.getElementById('tr-trm');
  const hint=document.getElementById('tr-hint');
  if(mismaMoneda){
    trmInp.style.display='none';
    trmInp.value='';
    hint.textContent='Misma moneda — se transfiere el monto exacto, sin TRM.';
  }else{
    trmInp.style.display='block';
    hint.textContent='Si dejas "Monto recibido" vacío, se calcula automático con la TRM.';
  }
}

async function doTransfer(){
  const origen=document.getElementById('tr-origen').value;
  const destino=document.getElementById('tr-destino').value;
  const monto=redondear3(parseFloat(document.getElementById('tr-monto').value));
  const trm=parseFloat(document.getElementById('tr-trm').value)||accounts.trm;
  let recibido=redondear3(parseFloat(document.getElementById('tr-recibido').value));
  if(!monto||monto<=0){ toastError('⚠ El monto a transferir debe ser mayor a 0'); marcarInvalido(document.getElementById('tr-monto')); return; }
  if(origen===destino){ toastError('⚠ La cuenta de origen y destino deben ser distintas'); return; }

  const metaO=ACCOUNTS_META[origen], metaD=ACCOUNTS_META[destino];
  let recibidoTeorico;
  if(metaO.currency===metaD.currency){ recibidoTeorico=monto; }
  else if(metaO.currency==='USD'&&metaD.currency==='COP'){ recibidoTeorico=redondear3(monto*trm); }
  else if(metaO.currency==='COP'&&metaD.currency==='USD'){ recibidoTeorico=redondear3(monto/trm); }

  const huboMontoManual=!isNaN(recibido);
  if(!huboMontoManual)recibido=recibidoTeorico;

  accounts[origen]=redondear3(accounts[origen]-monto);
  accounts[destino]=redondear3(accounts[destino]+recibido);
  accounts.trm=trm;

  const filasNuevas=[{
    fecha:todayStr(),nombre:`Transferencia ${metaO.label} → ${metaD.label}`,
    monto,categoria:'Transferencia',acc:origen,txType:'gasto',
  }];

  // Comisión detectada: si lo recibido es menor a lo teórico, se registra como movimiento visible (sin volver a tocar saldos, solo para trazabilidad)
  const comision=recibidoTeorico-recibido;
  const huboComision=huboMontoManual&&comision>0.009;
  if(huboComision){
    filasNuevas.push({
      fecha:todayStr(),nombre:`Comisión transferencia ${metaO.label} → ${metaD.label}`,
      monto:comision,categoria:'Comisión',acc:destino,txType:'gasto',currency:metaD.currency,
    });
  }

  document.getElementById('tr-monto').value='';
  document.getElementById('tr-recibido').value='';
  fillAccountInputs();
  populateMonthSelector();
  document.getElementById('month-select').value=currentMonth;
  render();

  // Una transferencia mueve dinero entre DOS cuentas: si una escritura se guarda y la otra no,
  // queda un estado inconsistente en la nube (el movimiento existe pero el saldo no cuadra, o viceversa).
  // Por eso aquí escribimos ambas de inmediato y confirmamos las dos, en vez del guardado diferido normal.
  const statusEl=document.getElementById('sync-status');
  statusEl.style.display='block';
  statusEl.style.opacity='1';
  statusEl.textContent='💾 Guardando transferencia…';
  statusEl.className='sync-status';

  let okEntries=false;
  try{
    const {data:filasGuardadas,error}=await sb.from('fin_movimientos').insert(filasNuevas.map(f=>({
      user_id:currentUserId,
      fecha:f.fecha,
      nombre:f.nombre,
      monto:f.monto,
      moneda_override:f.currency||null,
      categoria:f.categoria,
      account_id:accountIdBySlug[f.acc],
      tx_type:f.txType,
    }))).select();
    if(error)throw error;
    entries.unshift({id:filasGuardadas[0].id,date:filasNuevas[0].fecha,name:filasNuevas[0].nombre,amount:filasNuevas[0].monto,cat:filasNuevas[0].categoria,acc:filasNuevas[0].acc,txType:filasNuevas[0].txType});
    if(huboComision){
      entries.unshift({id:filasGuardadas[1].id,date:filasNuevas[1].fecha,name:filasNuevas[1].nombre,amount:filasNuevas[1].monto,cat:filasNuevas[1].categoria,acc:filasNuevas[1].acc,txType:filasNuevas[1].txType,currency:filasNuevas[1].currency});
    }
    okEntries=true;
    render();
  }catch(e){ registrarErrorDiagnostico('fin_movimientos (transferencia)',e); }

  const okAccounts=await guardarCuentasSupabase();
  if(okEntries&&okAccounts){
    statusEl.textContent='✓ Transferencia guardada';
    statusEl.className='sync-status ok';
    setTimeout(()=>{statusEl.style.opacity='0.35'},1500);
  }else{
    const faltante=[!okEntries&&'el movimiento',!okAccounts&&'el saldo'].filter(Boolean).join(' y ');
    statusEl.textContent=`🛑 Los números en pantalla ya cambiaron, pero no se pudo guardar ${faltante} en la nube. Ve a 🔧 Diagnóstico y reintenta antes de cerrar la app.`;
    statusEl.className='sync-status error';
  }
}

