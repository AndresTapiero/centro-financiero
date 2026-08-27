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
  const id=_editPendienteId;
  const cerrar=()=>{ document.getElementById('edit-pendiente-modal').style.display='none'; _editPendienteId=null; };
  // Igual que en el modal de movimientos: validar antes de cerrar, para que un monto inválido
  // no descarte la edición con el modal ya fuera de pantalla.
  if(!confirmado||!id){ cerrar(); return; }
  const p=pendientes.find(x=>x.id===id);
  if(!p){ cerrar(); return; }
  const amtInp=document.getElementById('edit-pendiente-amount');
  const nuevoMonto=redondear3(parseMontoFormateado(amtInp.value));
  if(isNaN(nuevoMonto)||nuevoMonto<=0){ toastError('⚠ El monto debe ser mayor a 0'); marcarInvalido(amtInp); return; }
  cerrar();
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

/**
 * Toda la aritmética de una transferencia, sin tocar cuentas ni DOM — para poder mostrar la
 * confirmación con los números ya calculados, y para probarla sin simular la pantalla.
 * Devuelve {error} si algo no es válido, o el desglose completo si es válida.
 */
function calcularTransferencia({origen,destino,monto,trm,recibidoManual}){
  if(!monto||monto<=0)return{error:'monto'};
  if(origen===destino)return{error:'mismaCuenta'};
  const metaO=ACCOUNTS_META[origen],metaD=ACCOUNTS_META[destino];
  const mismaMoneda=metaO.currency===metaD.currency;
  // Entre monedas distintas se divide o multiplica por la TRM: sin este control, una TRM de 0
  // convertiría el saldo destino en Infinity.
  if(!mismaMoneda&&(!trm||trm<=0||isNaN(trm)))return{error:'trm'};

  let recibidoTeorico;
  if(mismaMoneda){ recibidoTeorico=monto; }
  else if(metaO.currency==='USD'){ recibidoTeorico=redondear3(monto*trm); }
  else{ recibidoTeorico=redondear3(monto/trm); }

  const huboMontoManual=!isNaN(recibidoManual);
  const recibido=huboMontoManual?recibidoManual:recibidoTeorico;
  const comision=redondear3(recibidoTeorico-recibido);
  const huboComision=huboMontoManual&&comision>0.009;

  return{error:null,origen,destino,metaO,metaD,mismaMoneda,monto,trm,recibidoTeorico,recibido,comision,huboComision};
}

/** El texto de confirmación antes de ejecutar — con la conversión ya hecha, no solo la TRM. */
function mensajeConfirmacionTransferencia(c){
  const fmt=(monto,moneda)=>moneda==='USD'?fmtUSD(monto):fmtCOP(monto);
  if(c.mismaMoneda){
    return`¿Transferir ${fmt(c.monto,c.metaO.currency)} de ${c.metaO.label} a ${c.metaD.label}?`;
  }
  const direccion=c.metaO.currency==='USD'?'Dólares → Pesos':'Pesos → Dólares';
  let msg=`💱 ${direccion}\n\nEnvías ${fmt(c.monto,c.metaO.currency)} desde ${c.metaO.label}\n`+
    `Llegan ${fmt(c.recibidoTeorico,c.metaD.currency)} a ${c.metaD.label}\n\nTRM usada: $${c.trm.toLocaleString('es-CO')}`;
  if(c.huboComision){
    msg+=`\n\n⚠ Con el monto recibido que escribiste, en realidad llegan ${fmt(c.recibido,c.metaD.currency)} — `+
      `${fmt(c.comision,c.metaD.currency)} menos por comisión.`;
  }
  return msg;
}

async function doTransfer(){
  const origen=document.getElementById('tr-origen').value;
  const destino=document.getElementById('tr-destino').value;
  const monto=redondear3(parseFloat(document.getElementById('tr-monto').value));
  const trm=parseFloat(document.getElementById('tr-trm').value)||accounts.trm;
  const recibidoManual=redondear3(parseFloat(document.getElementById('tr-recibido').value));

  const calc=calcularTransferencia({origen,destino,monto,trm,recibidoManual});
  if(calc.error==='monto'){ toastError('⚠ El monto a transferir debe ser mayor a 0'); marcarInvalido(document.getElementById('tr-monto')); return; }
  if(calc.error==='mismaCuenta'){ toastError('⚠ La cuenta de origen y destino deben ser distintas'); return; }
  if(calc.error==='trm'){
    toastError('⚠ Necesitas una TRM mayor a 0 para transferir entre monedas distintas');
    marcarInvalido(document.getElementById('tr-trm'));
    return;
  }

  // Antes de mover nada: mostrar exactamente cuánto sale, cuánto llega y con qué TRM, sobre
  // todo cuando hay conversión de moneda — para que no sea una sorpresa después de guardado.
  const confirmado=await customConfirm(mensajeConfirmacionTransferencia(calc),{textoSi:'Sí, transferir'});
  if(!confirmado)return;

  const{metaO,metaD,recibidoTeorico,huboComision,comision}=calc;
  let recibido=calc.recibido;

  accounts[origen]=redondear3(accounts[origen]-monto);
  accounts[destino]=redondear3(accounts[destino]+recibido);
  accounts.trm=trm;

  // Las dos patas comparten el mismo nombre: es lo que permite encontrarlas como pareja después
  // (por ejemplo al borrar una, para revertir también la otra). El monto de cada pata es el que
  // realmente se movió en SU cuenta — origen pierde `monto`, destino recibe `recibido`, que
  // puede ser distinto por la TRM o una comisión.
  const nombreTransferencia=`Transferencia ${metaO.label} → ${metaD.label}`;
  const filasNuevas=[
    {fecha:todayStr(),nombre:nombreTransferencia,monto,categoria:'Transferencia',acc:origen,txType:'gasto'},
    {fecha:todayStr(),nombre:nombreTransferencia,monto:recibido,categoria:'Transferencia',acc:destino,txType:'ingreso'},
  ];

  // Comisión detectada: si lo recibido es menor a lo teórico, se registra como movimiento visible (sin volver a tocar saldos, solo para trazabilidad)
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
    // Genérico en vez de índices fijos [0]/[1]: filasNuevas ya no tiene un tamaño constante
    // (origen + destino siempre, comisión solo a veces).
    filasNuevas.forEach((f,i)=>{
      entries.unshift({id:filasGuardadas[i].id,date:f.fecha,name:f.nombre,amount:f.monto,cat:f.categoria,acc:f.acc,txType:f.txType,...(f.currency?{currency:f.currency}:{})});
    });
    okEntries=true;
    render();
  }catch(e){ registrarErrorDiagnostico('fin_movimientos (transferencia)',e); }

  const okAccounts=await guardarCuentasSupabase();
  // La TRM vive en fin_configuracion, no en fin_accounts: guardarCuentasSupabase() solo recorre
  // ACCOUNTS_META, así que sin esto la TRM que escribiste aquí se perdía al recargar y los saldos
  // en dólares volvían a calcularse con el valor viejo.
  let okTrm=true;
  try{
    const {error}=await sb.from('fin_configuracion').upsert(
      {user_id:currentUserId,trm:accounts.trm,vehiculos:vehiculos&&vehiculos.length?vehiculos:['Moto']},
      {onConflict:'user_id'}
    );
    if(error)throw error;
  }catch(e){ okTrm=false; registrarErrorDiagnostico('fin_configuracion (TRM de transferencia)',e); }

  if(okEntries&&okAccounts&&okTrm){
    statusEl.textContent='✓ Transferencia guardada';
    statusEl.className='sync-status ok';
    setTimeout(()=>{statusEl.style.opacity='0.35'},1500);
  }else{
    const faltante=[!okEntries&&'el movimiento',!okAccounts&&'el saldo',!okTrm&&'la TRM'].filter(Boolean).join(' y ');
    statusEl.textContent=`🛑 Los números en pantalla ya cambiaron, pero no se pudo guardar ${faltante} en la nube. Ve a 🔧 Diagnóstico y reintenta antes de cerrar la app.`;
    statusEl.className='sync-status error';
  }
}

