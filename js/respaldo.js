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
if(typeof actualizarBtnCat==='function') actualizarBtnCat('pend-cat');
if(typeof onPendAccountChange==='function') onPendAccountChange();
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

