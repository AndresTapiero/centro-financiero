let accounts={};
let accountIdBySlug={}; // slug ('nequi','davtc',...) -> UUID real de fin_accounts, necesario para referenciar cuentas desde metas/pendientes/movimientos

let cargaConFallos=false; // true si alguna lectura falló durante loadData — bloquea cualquier siembra automática para no arriesgarse a sobrescribir datos reales con listas "vacías" por error

async function loadData(){
  const statusEl=document.getElementById('sync-status');
  try{
    let resA=null,resAFallo=false;
    try{
      const {data,error}=await sb.from('fin_accounts').select('*').eq('archived',false);
      if(error)throw error;
      resA=data;
    }catch(e){ resAFallo=true; cargaConFallos=true; registrarErrorDiagnostico('fin_accounts (Supabase)',e); }
    if(resA){
      accounts={};
      resA.forEach(row=>{
        accounts[row.slug]=Number(row.balance);
        accountIdBySlug[row.slug]=row.id;
        if(row.is_dynamic){
          ACCOUNTS_META[row.slug]={label:row.label,currency:row.currency,type:row.account_type};
          dynamicAccounts[row.slug]={label:row.label,currency:row.currency};
        }
      });
      if(accounts.trm===undefined)accounts.trm=4000; // valor de respaldo si la lectura de abajo también falla
      try{
        const {data:cfg,error:errCfg}=await sb.from('fin_configuracion').select('trm,vehiculos').maybeSingle();
        if(!errCfg&&cfg){
          accounts.trm=Number(cfg.trm);
          if(cfg.vehiculos&&cfg.vehiculos.length)vehiculos=cfg.vehiculos;
        }
      }catch(e){ registrarErrorDiagnostico('fin_configuracion (lectura TRM/vehículos)',e); }
    }else{
      accounts=Object.assign({},SEED_ACCOUNTS);
    }

    let resFallo=false;
    try{
      const {data:movs,error:errMovs}=await sb.from('fin_movimientos').select('*').order('fecha',{ascending:false});
      if(errMovs)throw errMovs;
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
    }catch(e){ resFallo=true; cargaConFallos=true; entries=SEED_ENTRIES.slice(); registrarErrorDiagnostico('fin_movimientos (lectura)',e); }

    try{
      const {data:topes,error:errTopes}=await sb.from('fin_presupuesto_topes').select('*');
      if(errTopes)throw errTopes;
      (topes||[]).forEach(t=>{ CAPS[t.categoria]=Number(t.tope); });
    }catch(e){ registrarErrorDiagnostico('fin_presupuesto_topes (lectura)',e); }

    try{
      const {data:pends,error:errPends}=await sb.from('fin_pendientes').select('*');
      if(errPends)throw errPends;
      pendientes=(pends||[]).map(p=>({
        id:p.id,
        name:p.nombre,
        amount:Number(p.monto),
        date:p.fecha,
        acc:Object.keys(accountIdBySlug).find(slug=>accountIdBySlug[slug]===p.account_id),
        cat:p.categoria,
        isIncome:p.is_income,
      }));
    }catch(e){ cargaConFallos=true; registrarErrorDiagnostico('fin_pendientes (lectura)',e); }

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
    }catch(e){ registrarErrorDiagnostico('fin_metas (lectura)',e); }

    if(cargaConFallos){
      statusEl.innerHTML='⚠ No pudimos cargar tus datos reales — estás viendo un ejemplo. <a href="#" onclick="event.preventDefault();reintentarCarga()" style="color:inherit;text-decoration:underline">Toca para reintentar</a>';
      statusEl.className='sync-status error';
    }else{
      statusEl.textContent='✓ Sincronizado';
      statusEl.className='sync-status ok';
      setTimeout(()=>{statusEl.style.opacity='0.35'},1200);
    }

    await archiveOldMonths(); // mueve meses viejos fuera del archivo "caliente"
  }catch(err){
    cargaConFallos=true; // datos de ejemplo en pantalla — el guardado queda bloqueado hasta una carga/sincronización exitosa
    entries=SEED_ENTRIES.slice();
    accounts=Object.assign({},SEED_ACCOUNTS);
    pendientes=[];
    statusEl.innerHTML='⚠ No se pudieron cargar tus datos. Para tu seguridad, no se guardará nada hasta que la carga funcione. <a href="#" onclick="event.preventDefault();reintentarCarga()" style="color:inherit;text-decoration:underline">Toca para reintentar</a>';
    statusEl.className='sync-status error';
  }
  fillAccountInputs();
  populateMonthSelector();
  await autoSeedRecurrentes();
  refreshGoalCategoryOptions();
  populateVehiculoSelect();
  Object.keys(dynamicAccounts).forEach(key=>renderDynamicAccountCard(key));
  refreshAllAccountSelectors();
  render();
  renderPendientes();
  if(typeof actualizarBadgePendientes==='function') actualizarBadgePendientes();
  if(typeof mostrarNotificacionPendientes==='function') mostrarNotificacionPendientes();
  if(typeof actualizarBtnNotif==='function') actualizarBtnNotif();
  document.getElementById('loading-gate').style.display='none';
}

async function autoSeedRecurrentes(){
  if(cargaConFallos){
    // No confiamos en que 'pendientes' o 'entries' representen la realidad — no sembramos ni guardamos nada este ciclo.
    const statusEl=document.getElementById('sync-status');
    if(statusEl){
      statusEl.style.display='block';
      statusEl.textContent='⚠ La carga quedó incompleta, así que no se agregaron pendientes automáticos este mes.';
      statusEl.className='sync-status error';
      setTimeout(()=>{statusEl.style.opacity='0.35'},4000);
    }
    return;
  }
  const mesActual=todayStr().slice(0,7);
  let seeded=[];
  try{
    const {data,error}=await sb.from('fin_configuracion').select('seeded_months').maybeSingle();
    if(error)throw error;
    if(data&&data.seeded_months)seeded=data.seeded_months;
  }catch(e){ registrarErrorDiagnostico('fin_configuracion (lectura seeded_months)',e); }
  if(seeded.includes(mesActual))return;

  const yaExisten=new Set(pendientes.filter(p=>p.date&&p.date.slice(0,7)===mesActual).map(p=>p.name));
  const yaGastados=new Set(entries.filter(e=>e.date.slice(0,7)===mesActual).map(e=>e.name));
  const nuevos=[];
  RECURRENTES.forEach(r=>{
    if(yaExisten.has(r.name)||yaGastados.has(r.name))return;
    const dd=String(r.day).padStart(2,'0');
    nuevos.push({name:r.name,amount:r.amount,date:`${mesActual}-${dd}`,acc:r.acc,cat:r.cat,isIncome:r.isIncome||false});
  });
  seeded.push(mesActual);
  let agregados=0;
  if(nuevos.length>0){
    try{
      const {data:filas,error}=await sb.from('fin_pendientes').insert(nuevos.map(n=>({
        user_id:currentUserId,
        nombre:n.name,
        monto:n.amount,
        fecha:n.date,
        account_id:accountIdBySlug[n.acc],
        categoria:n.cat,
        is_income:n.isIncome,
      }))).select();
      if(error)throw error;
      filas.forEach((fila,i)=>{ pendientes.push(Object.assign({},nuevos[i],{id:fila.id})); });
      agregados=filas.length;
    }catch(e){ registrarErrorDiagnostico('fin_pendientes (siembra automática)',e); }
  }
  try{
    const {error}=await sb.from('fin_configuracion').upsert(
      {user_id:currentUserId,trm:accounts.trm,vehiculos:vehiculos&&vehiculos.length?vehiculos:['Moto'],seeded_months:seeded},
      {onConflict:'user_id'}
    );
    if(error)throw error;
  }catch(e){ registrarErrorDiagnostico('fin_configuracion (guardar seeded_months)',e); }
  if(agregados>0){
    const statusEl=document.getElementById('sync-status');
    statusEl.textContent=`✓ ${agregados} pendientes recurrentes cargados para este mes`;
    statusEl.style.opacity='1';
  }
}

function populateMonthSelector(){
  const months=new Set(entries.map(e=>e.date.slice(0,7)));
  months.add(todayStr().slice(0,7));
  const sortedMonths=[...months].sort().reverse();
  const sel=document.getElementById('month-select');
  const monthNames=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  sel.innerHTML=sortedMonths.map(m=>{
    const [y,mo]=m.split('-');
    return `<option value="${m}">${monthNames[parseInt(mo)-1]} ${y}</option>`;
  }).join('');
  if(!currentMonth||!sortedMonths.includes(currentMonth)){
    currentMonth=todayStr().slice(0,7);
  }
  sel.value=currentMonth;
}
function onMonthChange(){
  currentMonth=document.getElementById('month-select').value;
  render();
}

function fillAccountInputs(){
  if(accounts.lulo===undefined)accounts.lulo=0; // migración para sesiones que no tenían esta cuenta
  document.getElementById('acc-nequi').value=fmtCOP(accounts.nequi);
  document.getElementById('acc-debito').value=fmtCOP(accounts.debito);
  document.getElementById('acc-nu').value=fmtCOP(accounts.nu);
  document.getElementById('acc-lulo').value=fmtCOP(accounts.lulo);
  document.getElementById('acc-arq').value=fmtUSD(accounts.arq);
  document.getElementById('acc-ontop').value=fmtUSD(accounts.ontop);
  document.getElementById('acc-trm').value='$'+accounts.trm;
  document.getElementById('acc-davtc').value=fmtCOP(accounts.davtc);
  document.getElementById('acc-rappitc').value=fmtCOP(accounts.rappitc);
  const trInp=document.getElementById('tr-trm');
  if(trInp)trInp.value=accounts.trm;
  Object.keys(dynamicAccounts).forEach(key=>{
    const inp=document.getElementById('acc-'+key);
    if(inp){
      const meta=ACCOUNTS_META[key];
      inp.value=meta.currency==='USD'?fmtUSD(accounts[key]):fmtCOP(accounts[key]);
    }
  });
  updateNetWorth();
  checkLowBalances();
  updateDueDates();
  updateDeudaTotalTarjetas();
}

function updateDeudaTotalTarjetas(){
  const el=document.getElementById('deuda-total-tarjetas');
  if(!el)return;
  const totalCOP=Object.keys(ACCOUNTS_META).filter(k=>ACCOUNTS_META[k].type==='credito').reduce((sum,k)=>{
    const meta=ACCOUNTS_META[k];
    const saldo=accounts[k]||0;
    return sum+(meta.currency==='USD'?saldo*accounts.trm:saldo);
  },0);
  el.textContent=fmtCOP(totalCOP);
}

function updateDueDates(){
  const hoy=new Date();
  const diaHoy=hoy.getDate();
  const diaVencimiento=10; // Davivienda TC y Rappi Card vencen el día 10 de cada mes

  // Detectar si ya se pagó este mes
  const mesActual=todayStr().slice(0,7);
  const pagosDavtcEste={davtc:0,rappitc:0};
  entries.filter(e=>e.date.slice(0,7)===mesActual&&e.cat==='Pago Deuda').forEach(e=>{
    if(e.acc==='davtc'||e.acc==='rappitc') pagosDavtcEste[e.acc]+=entryCOP(e);
  });

  let diasFaltantes=diaVencimiento-diaHoy;
  if(diasFaltantes<0){
    const diasEnMes=new Date(hoy.getFullYear(),hoy.getMonth()+1,0).getDate();
    diasFaltantes=diasEnMes-diaHoy+diaVencimiento;
  }

  const tarjetas={davtc:{id:'due-davtc',nombre:'Davivienda TC'},rappitc:{id:'due-rappitc',nombre:'Rappi Card'}};
  Object.entries(tarjetas).forEach(([acc,info])=>{
    const el=document.getElementById(info.id);
    if(!el)return;

    const pagado=pagosDavtcEste[acc]>0;
    if(pagado){
      // Ya se pagó este mes, esperar al siguiente
      el.textContent='✓ Pago registrado — próximo vencimiento mes que viene';
      el.style.color='var(--accent)';
    }else{
      // Aún no se ha pagado
      const texto=diasFaltantes===0?'⚠ Vence HOY (día 10)':diasFaltantes<=3?`⚠ Vence en ${diasFaltantes} día(s) — día 10`:`Vence día 10 · faltan ${diasFaltantes} días`;
      const color=diasFaltantes<=3?'var(--danger)':'var(--text3)';
      el.textContent=texto;
      el.style.color=color;
    }
  });
}

const LOW_BALANCE_THRESHOLD={nequi:50000,debito:150000,nu:500000,arq:20,ontop:20};
function checkLowBalances(){
  Object.keys(LOW_BALANCE_THRESHOLD).forEach(key=>{
    const card=document.getElementById('card-'+key);
    if(!card)return;
    const umbral=LOW_BALANCE_THRESHOLD[key];
    const bajo=umbral>0&&accounts[key]<umbral&&accounts[key]>=0;
    const existente=card.querySelector('.low-balance-badge');
    card.classList.toggle('low-balance',bajo);
    if(bajo&&!existente){
      const badge=document.createElement('span');
      badge.className='low-balance-badge';
      badge.textContent='⚠ Bajo';
      card.appendChild(badge);
    }else if(!bajo&&existente){
      existente.remove();
    }
  });
}

// Lee un monto escrito o formateado por la app ("$3.039.260", "$231.28 USD", "800.000").
// Antes hacía parseFloat() directo sobre el texto con los puntos de miles todavía puestos,
// así que "$3.039.260" se leía como 3.039: bastaba con entrar y salir de un campo de saldo
// para que la app creyera que la cuenta había bajado a $3. Ahora limpia el símbolo de moneda
// y delega en parseMontoFormateado(), que ya distingue separador de miles de decimal.
function parseNum(str){
  const limpio=String(str).replace(/[^\d.,-]/g,'').replace(/,/g,'');
  return parseMontoFormateado(limpio);
}

const FIELD_TO_ID={nequi:'acc-nequi',debito:'acc-debito',nu:'acc-nu',lulo:'acc-lulo',arq:'acc-arq',ontop:'acc-ontop',trm:'acc-trm',davtc:'acc-davtc',rappitc:'acc-rappitc'};
