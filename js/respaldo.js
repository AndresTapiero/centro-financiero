async function sendSummary(){
  const bycat=window._bycat||{};
  const total=window._total||0;
  const lines=Object.entries(bycat).sort((a,b)=>b[1]-a[1]).map(([c,v])=>`${c}: ${fmtCOP(v)}`).join(' | ');
  const debtTotal=accounts.davtc+accounts.rappitc;
  const resumen=`Analiza mis movimientos del mes. Total gastado: ${fmtCOP(total)} en ${entries.length} registros. Por categoría: ${lines}. Cuentas — Nequi: ${fmtCOP(accounts.nequi)}, Débito: ${fmtCOP(accounts.debito)}, Nu: ${fmtCOP(accounts.nu)}, ARQ: ${fmtUSD(accounts.arq)}, Ontop: ${fmtUSD(accounts.ontop)}. Deuda total: ${fmtCOP(debtTotal)} (Davivienda ${fmtCOP(accounts.davtc)}, Rappi ${fmtCOP(accounts.rappitc)}). Dame tu análisis como estratega financiero.`;
  const btn=document.querySelector('.btn-analyze');
  const textoOriginal=btn?btn.textContent:'';
  try{
    await navigator.clipboard.writeText(resumen);
    if(btn){ btn.textContent='✓ Copiado — pégalo en el chat con Ctrl+V'; setTimeout(()=>{btn.textContent=textoOriginal;},3000); }
  }catch(e){
    // Si el navegador bloquea el portapapeles, mostramos el texto para copiarlo a mano
    await customConfirm('No se pudo copiar automáticamente. Copia este texto manualmente:\n\n'+resumen);
  }
}

const months=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
document.getElementById('nav-month').textContent=months[new Date().getMonth()]+' '+new Date().getFullYear();
document.getElementById('inp-date').value=todayStr();
document.getElementById('pend-date').value=todayStr();
document.getElementById('inp-type').addEventListener('change',onAccountChange);
onTransferAccChange();
onGoalTypeChange();
document.getElementById('sort-fecha')?.classList.add('active');
onAccountChange();
function abrirImportModal(){
  document.getElementById('import-paste-text').value='';
  document.getElementById('import-modal').style.display='flex';
}

async function procesarImportPegado(){
  const texto=document.getElementById('import-paste-text').value.trim();
  if(!texto)return;
  document.getElementById('import-modal').style.display='none';
  await aplicarRespaldo(texto);
}

async function aplicarRespaldo(texto){
  let datos;
  try{ datos=JSON.parse(texto); }
  catch(e){
    await customConfirm('⚠ Ese texto no es un respaldo válido de este tracker. Verifica que sea el contenido completo del JSON exportado.',{soloOk:true,textoSi:'Entendido'});
    return;
  }

  const fechaExport=datos.fecha_exportacion?new Date(datos.fecha_exportacion).toLocaleString('es-CO'):'desconocida';
  const confirmado=await customConfirm(`¿Reemplazar TODOS los datos actuales con el respaldo del ${fechaExport}?\n\nEsto sobrescribirá movimientos, cuentas, pendientes, metas y topes en ESTE dispositivo con lo que traiga el respaldo.\n\nEsta acción no se puede deshacer.`,{textoSi:'Sí, reemplazar todo'});
  if(!confirmado)return;

  if(datos.entries)entries=datos.entries;
  if(datos.accounts)accounts=datos.accounts;
  if(datos.pendientes)pendientes=datos.pendientes;
  if(datos.goals)goals=datos.goals;
  if(datos.dynamicAccounts){
    dynamicAccounts=datos.dynamicAccounts;
    Object.keys(dynamicAccounts).forEach(key=>{
      ACCOUNTS_META[key]=Object.assign({type:'debito'},dynamicAccounts[key]);
    });
  }
  if(datos.caps_overrides)Object.keys(datos.caps_overrides).forEach(cat=>{ CAPS[cat]=datos.caps_overrides[cat]; });
  if(datos.vehiculos)vehiculos=datos.vehiculos;

  await saveEntries();
  await saveAccountsData();
  await savePendientesData();
  await saveConfig();

  fillAccountInputs();
  populateMonthSelector();
  document.getElementById('month-select').value=currentMonth;
  Object.keys(dynamicAccounts).forEach(key=>renderDynamicAccountCard(key));
  refreshAllAccountSelectors();
  refreshGoalCategoryOptions();
  render();

  await customConfirm('✅ Respaldo importado y guardado en este dispositivo correctamente.',{soloOk:true,textoSi:'Perfecto'});
}

async function exportarRespaldo(){
  const respaldo={
    fecha_exportacion:new Date().toISOString(),
    entries,accounts,pendientes,goals,dynamicAccounts,vehiculos,
    caps_overrides:Object.fromEntries(Object.keys(CAPS).filter(c=>CAPS[c]!==CAPS_DEFAULT[c]).map(c=>[c,CAPS[c]]))
  };
  const jsonTexto=JSON.stringify(respaldo,null,2);

  try{
    const blob=new Blob([jsonTexto],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=`respaldo_tracker_${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }catch(e){}

  // Respaldo del respaldo: si la descarga automática no funcionó en tu navegador,
  // aquí tienes el texto completo para copiar y guardar manualmente.
  document.getElementById('export-fallback-text').value=jsonTexto;
  document.getElementById('export-fallback-modal').style.display='flex';
}

function cerrarExportFallback(){
  document.getElementById('export-fallback-modal').style.display='none';
}

async function guardarConVerificacion(){
  const statusEl=document.getElementById('sync-status');
  statusEl.style.display='block';
  statusEl.style.opacity='1';
  if(cargaConFallos){
    statusEl.textContent='🛑 Guardado bloqueado: tus datos reales no cargaron y guardar ahora los pisaría. Usa "🔁 Reintentar carga" en 🔧 Diagnóstico primero';
    statusEl.className='sync-status error';
    return;
  }
  statusEl.className='sync-status';
  statusEl.textContent='💾 Guardando…';

  pendingSaves++;
  const resultados={};
  try{
    cancelScheduledSave('config_v1');
    resultados.accounts=await guardarCuentasSupabase();
    resultados.configuracion=await (async()=>{
      try{
        const {error}=await sb.from('fin_configuracion').upsert({user_id:currentUserId,trm:accounts.trm,vehiculos:vehiculos&&vehiculos.length?vehiculos:['Moto']},{onConflict:'user_id'});
        if(error)throw error;
        return true;
      }catch(e){ registrarErrorDiagnostico('fin_configuracion (verificación)',e); return false; }
    })();
    resultados.topes=await (async()=>{
      try{
        const filas=Object.keys(CAPS).map(categoria=>({user_id:currentUserId,categoria,tope:CAPS[categoria]}));
        const {error}=await sb.from('fin_presupuesto_topes').upsert(filas,{onConflict:'user_id,categoria'});
        if(error)throw error;
        return true;
      }catch(e){ registrarErrorDiagnostico('fin_presupuesto_topes (verificación)',e); return false; }
    })();
    const configConsolidado={goals,vehiculos};
    resultados.config=await setConReintentos('config_v1',JSON.stringify(configConsolidado));

    const todoOk=Object.values(resultados).every(v=>v===true);
    if(todoOk){
      statusEl.textContent='✓ Verificado — todo tu tracker está guardado correctamente';
      statusEl.className='sync-status ok';
    }else{
      const fallidos=Object.keys(resultados).filter(k=>!resultados[k]);
      statusEl.textContent=`⚠ No se pudo confirmar: ${fallidos.join(', ')} — revisa la pestaña 🔧 Diagnóstico para ver el error real`;
      statusEl.className='sync-status error';
    }
  }catch(err){
    statusEl.textContent='⚠ Error inesperado — reintenta';
    statusEl.className='sync-status error';
  }finally{
    pendingSaves--;
    setTimeout(()=>{statusEl.style.opacity='0.35'},4000);
  }
}

