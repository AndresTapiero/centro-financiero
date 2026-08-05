let lastSyncAttempt=0;
const SYNC_COOLDOWN_MS=8000; // evita disparar de más y agotar el límite de solicitudes por minuto de la API

async function syncNow(){
  const statusEl=document.getElementById('sync-status');
  const ahoraMs=Date.now();
  if(ahoraMs-lastSyncAttempt<SYNC_COOLDOWN_MS){
    statusEl.style.display='block';
    statusEl.style.opacity='1';
    statusEl.className='sync-status';
    statusEl.textContent='Ya sincronizado hace un momento — espera unos segundos';
    setTimeout(()=>{statusEl.style.opacity='0.35'},1500);
    return;
  }
  lastSyncAttempt=ahoraMs;
  if(pendingSaves>0){
    // Hay un guardado local en curso — esperamos un poco para no pisarlo con datos viejos
    statusEl.style.display='block';
    statusEl.textContent='Terminando de guardar tus cambios…';
    let intentos=0;
    while(pendingSaves>0&&intentos<35){ await new Promise(r=>setTimeout(r,150)); intentos++; }
  }
  const activeTabBtn=document.querySelector('.nav-item.active');
  const activeTab=activeTabBtn?activeTabBtn.getAttribute('onclick').match(/'(\w+)'/)[1]:'cuentas';
  statusEl.textContent='Sincronizando…';
  statusEl.style.opacity='1';
  statusEl.className='sync-status';
  try{
    let resA=null;
    try{
      const {data,error}=await sb.from('fin_accounts').select('*').eq('archived',false);
      if(error)throw error;
      resA=data;
      accounts={};
      resA.forEach(row=>{
        accounts[row.slug]=Number(row.balance);
        accountIdBySlug[row.slug]=row.id;
        if(row.is_dynamic){
          ACCOUNTS_META[row.slug]={label:row.label,currency:row.currency,type:row.account_type};
          dynamicAccounts[row.slug]={label:row.label,currency:row.currency};
        }
      });
      const {data:cfg}=await sb.from('fin_configuracion').select('trm,vehiculos').maybeSingle();
      if(cfg){
        accounts.trm=Number(cfg.trm);
        if(cfg.vehiculos&&cfg.vehiculos.length)vehiculos=cfg.vehiculos;
      }
    }catch(e){ resA=null; registrarErrorDiagnostico('fin_accounts (sync)',e); }

    let resE=null;
    try{
      const {data:movs,error:errMovs}=await sb.from('fin_movimientos').select('*').order('fecha',{ascending:false});
      if(errMovs)throw errMovs;
      resE=movs;
      entries=(movs||[]).map(m=>({
        id:m.id,
        date:m.fecha,
        name:m.nombre,
        amount:Number(m.monto),
        cat:m.categoria,
        acc:Object.keys(accountIdBySlug).find(slug=>accountIdBySlug[slug]===m.account_id),
        txType:m.tx_type,
        ...(m.moneda_override?{currency:m.moneda_override}:{}),
        ...(m.vehiculo?{vehiculo:m.vehiculo}:{}),
      }));
    }catch(e){ resE=null; registrarErrorDiagnostico('fin_movimientos (sync)',e); }

    try{
      const {data:topes,error:errTopes}=await sb.from('fin_presupuesto_topes').select('*');
      if(errTopes)throw errTopes;
      (topes||[]).forEach(t=>{ CAPS[t.categoria]=Number(t.tope); });
    }catch(e){ registrarErrorDiagnostico('fin_presupuesto_topes (sync)',e); }

    let resP=null;
    try{
      const {data:pends,error:errPends}=await sb.from('fin_pendientes').select('*');
      if(errPends)throw errPends;
      resP=pends;
      pendientes=(pends||[]).map(p=>({
        id:p.id,
        name:p.nombre,
        amount:Number(p.monto),
        date:p.fecha,
        acc:Object.keys(accountIdBySlug).find(slug=>accountIdBySlug[slug]===p.account_id),
        cat:p.categoria,
        isIncome:p.is_income,
      }));
    }catch(e){ resP=null; registrarErrorDiagnostico('fin_pendientes (sync)',e); }

    // Si las 3 lecturas críticas funcionaron, ya tenemos los datos reales en memoria: se desbloquea el guardado
    if(resE!==null&&resA!==null&&resP!==null)cargaConFallos=false;
    const lecturasFallidas=[];
    if(resE===null)lecturasFallidas.push('movimientos');
    if(resA===null)lecturasFallidas.push('cuentas');
    if(resP===null)lecturasFallidas.push('pendientes');

    try{
      const {data:metas,error:errMetas}=await sb.from('fin_metas').select('*');
      if(errMetas)throw errMetas;
      goals=(metas||[]).map(m=>({
        id:m.id,
        name:m.nombre,
        type:m.tipo,
        acc:m.tipo==='cuenta'?Object.keys(accountIdBySlug).find(slug=>accountIdBySlug[slug]===m.account_id):undefined,
        cat:m.tipo==='categoria'?m.categoria:undefined,
        target:Number(m.monto_objetivo),
        accumulated:m.tipo==='categoria'?Number(m.acumulado):undefined,
        color:m.color||undefined,
      }));
      goals.filter(g=>g.type==='categoria').forEach(g=>{ if(g.color)COLORS[g.cat]=g.color; });
    }catch(e){ registrarErrorDiagnostico('fin_metas (sync)',e); }

    fillAccountInputs();
    populateMonthSelector();
    document.getElementById('month-select').value=currentMonth;
    Object.keys(dynamicAccounts).forEach(key=>renderDynamicAccountCard(key));
    refreshAllAccountSelectors();
    refreshGoalCategoryOptions();
    populateVehiculoSelect();
    render();
    if(activeTab==='metricas')renderMetrics();
    const ahora=new Intl.DateTimeFormat('es-CO',{timeZone:'America/Bogota',hour:'2-digit',minute:'2-digit'}).format(new Date());
    if(lecturasFallidas.length>0){
      statusEl.textContent=`🛑 No se pudo sincronizar ${lecturasFallidas.join(', ')}. Lo que ves en pantalla podría no ser lo más reciente.`;
      statusEl.className='sync-status error';
    }else{
      statusEl.textContent=`✓ Sincronizado ${ahora}`;
      statusEl.className='sync-status ok';
      setTimeout(()=>{statusEl.style.opacity='0.35'},2000);
    }
  }catch(err){
    registrarErrorDiagnostico('syncNow (error general)',err);
    statusEl.textContent='⚠ Ocurrió un error al sincronizar. Ve a 🔧 Diagnóstico para más detalles.';
    statusEl.className='sync-status error';
  }
}

// ============================================================
// FASE 4 — Autenticación y conexión a Supabase (solo para CUENTAS por ahora;
// movimientos/pendientes/metas/presupuesto siguen usando window.storage sin tocarse)
// ============================================================
