let pendingAdjustment=null;
let darkModeEnabled=localStorage.getItem('darkMode')==='true';

function initDarkMode(){
  if(darkModeEnabled){
    document.documentElement.classList.add('dark');
  }
}

function toggleDarkMode(){
  darkModeEnabled=!darkModeEnabled;
  localStorage.setItem('darkMode',darkModeEnabled);
  document.documentElement.classList.toggle('dark');
  updateUserMenuButton();
}

// El botón muestra la inicial de tu correo (lo pone poblarMenuUsuario al iniciar sesión).
// Antes esta función le escribía encima un 🌙/👤 según el modo oscuro, así que el contenido
// dependía de cuál de las dos corriera de última. El estado del tema va solo en el title.
function updateUserMenuButton(){
  const btn=document.getElementById('user-menu-btn');
  if(!btn)return;
  btn.title=darkModeEnabled?'Menú de cuenta · modo oscuro activo':'Menú de cuenta';
}

// Inicializar dark mode al cargar
initDarkMode();
updateUserMenuButton();

async function handleAccountFieldBlur(key){
  const el=document.getElementById(FIELD_TO_ID[key]||('acc-'+key));
  const newVal=redondear3(parseNum(el.value));
  const oldVal=accounts[key];

  if(key==='trm'){
    // La TRM no es un saldo — se aplica de inmediato y recalcula todo lo que dependa de ella
    accounts.trm=newVal;
    fillAccountInputs();
    render();
    try{ await saveConfiguracion(); }catch(e){}
    const statusEl=document.getElementById('sync-status');
    statusEl.style.display='block';
    statusEl.textContent=`✓ TRM actualizada a $${newVal.toLocaleString('es-CO')} — saldos USD recalculados`;
    statusEl.className='sync-status ok';
    setTimeout(()=>{statusEl.style.display='none'},3000);
    return;
  }

  if(newVal===oldVal){ fillAccountInputs(); return; } // sin cambio real, solo reformatea

  const meta=ACCOUNTS_META[key];
  const delta=newVal-oldVal;
  const esCredito=meta.type==='credito';
  // Para cuentas líquidas: delta negativo = Faltante, positivo = Ingreso
  // Para tarjetas de crédito: delta positivo = más deuda (Gasto), negativo = menos deuda (Pago)
  const tipoMovimiento=esCredito?(delta>0?'gasto':'ingreso'):(delta>0?'ingreso':'gasto');
  const etiqueta=esCredito?(delta>0?'nuevo cargo detectado':'pago/reducción detectada'):(delta>0?'Ingreso':'Faltante');
  const deltaAbsStr=meta.currency==='USD'?'$'+Math.abs(delta).toFixed(2)+' USD':fmtCOP(Math.abs(delta));

  pendingAdjustment={key,oldVal,newVal,tipoMovimiento};
  document.getElementById('adjust-banner-text').innerHTML=
    `<strong>${esc(meta.label)}:</strong> detecté un cambio de <strong>${deltaAbsStr}</strong> (${etiqueta}).<br>Saldo anterior: ${meta.currency==='USD'?'$'+oldVal+' USD':fmtCOP(oldVal)} → nuevo: ${meta.currency==='USD'?'$'+newVal+' USD':fmtCOP(newVal)}.<br>¿Confirmas y registro el movimiento?`;
  document.getElementById('adjust-banner').style.display='block';
}

async function confirmAdjustment(){
  if(!pendingAdjustment)return;
  const {key,oldVal,newVal,tipoMovimiento}=pendingAdjustment;
  const meta=ACCOUNTS_META[key];
  const delta=Math.abs(newVal-oldVal);
  const nombre=meta.type==='credito'
    ?(tipoMovimiento==='gasto'?`Ajuste ${meta.label}: cargo no registrado`:`Ajuste ${meta.label}: pago no registrado`)
    :(tipoMovimiento==='ingreso'?`Ajuste ${meta.label}: Ingreso`:`Ajuste ${meta.label}: Faltante`);

  let nuevoId;
  try{
    const {data:fila,error}=await sb.from('fin_movimientos').insert({
      user_id:currentUserId,
      fecha:todayStr(),
      nombre,
      monto:delta,
      categoria:'[Ajuste de saldo]',
      account_id:accountIdBySlug[key],
      tx_type:tipoMovimiento,
    }).select().single();
    if(error)throw error;
    nuevoId=fila.id;
  }catch(e){
    registrarErrorDiagnostico('fin_movimientos (ajuste)',e);
    const statusEl=document.getElementById('sync-status');
    statusEl.style.display='block'; statusEl.style.opacity='1';
    statusEl.textContent='🛑 No se pudo guardar el ajuste — revisa 🔧 Diagnóstico';
    statusEl.className='sync-status error';
    return;
  }

  entries.unshift({id:nuevoId,date:todayStr(),name:nombre,amount:delta,cat:'[Ajuste de saldo]',acc:key,txType:tipoMovimiento});
  accounts[key]=newVal;

  document.getElementById('adjust-banner').style.display='none';
  pendingAdjustment=null;
  fillAccountInputs();
  populateMonthSelector();
  currentMonth=cicloActual();
  document.getElementById('month-select').value=currentMonth;
  render();
  try{
    await saveAccountsData();
  }catch(e){}
}

function cancelAdjustment(){
  pendingAdjustment=null;
  document.getElementById('adjust-banner').style.display='none';
  fillAccountInputs(); // revierte el input al valor guardado real
}

/**
 * Reconstruye el saldo de nequi/debito/arq/ontop al CIERRE del mes dado, deshaciendo
 * (en memoria, sin tocar nada real) todos los movimientos posteriores a ese mes.
 * Límites conocidos, comunicados en la interfaz:
 *  - Las transferencias solo tienen registro en la cuenta de ORIGEN (no en la que recibe),
 *    así que el saldo reconstruido de la cuenta receptora puede desviarse cerca de esas fechas.
 *  - ARQ/Ontop se convierten con la TRM de HOY, no la del mes reconstruido (no se guarda TRM histórica).
 */
function calcularSaldoHistorico(mesSeleccionado){
  const hoy=cicloActual();
  if(mesSeleccionado>=hoy||cargaConFallos){
    // Si el mes es el actual (o futuro), O si la carga de datos falló y "entries" podría ser
    // el seed de ejemplo (no tus movimientos reales), mostramos el saldo de hoy sin reconstruir —
    // reconstruir con datos que no son de fiar produciría un número sin sentido.
    return {nequi:accounts.nequi,debito:accounts.debito,arq:accounts.arq,ontop:accounts.ontop,esHistorico:false,fallo:cargaConFallos&&mesSeleccionado<hoy};
  }
  const cuentas=cuentasDeGastoDiario();
  const saldos={};
  cuentas.forEach(acc=>{ saldos[acc]=accounts[acc]; });
  entries.forEach(e=>{
    if(cicloDe(e.date)<=mesSeleccionado)return; // solo deshacemos lo que pasó DESPUÉS del mes seleccionado
    if(!cuentas.includes(e.acc))return;
    const sign=e.txType==='gasto'?1:-1;
    saldos[e.acc]+=sign*e.amount; // reversa exacta de la operación que hizo addEntry/deleteEntry en su momento
  });
  return {...saldos,esHistorico:true,fallo:false};
}

/**
 * Versión generalizada de calcularSaldoHistorico(): reconstruye el patrimonio neto
 * (líquido − deuda) al CIERRE del mes dado, deshaciendo en memoria los movimientos
 * posteriores. A diferencia de calcularSaldoHistorico (solo nequi/debito/arq/ontop,
 * pensada para el hero de Cuentas), esta también reconstruye nu, lulo y las tarjetas
 * de crédito, para poder graficar la serie completa de patrimonio en Métricas.
 * Limitaciones: no incluye cuentas dinámicas creadas por el usuario (metas de ahorro
 * personalizadas), y ARQ/Ontop se convierten con la TRM de HOY, no la histórica.
 */
function calcularPatrimonioMes(mesISO){
  const hoy=cicloActual();
  if(mesISO>=hoy||cargaConFallos)return null; // mes actual/futuro, o datos no confiables: no reconstruir
  const liquidAccs=['nequi','debito','nu','lulo'];
  const usdAccs=['arq','ontop'];
  const debtAccs=['davtc','rappitc'];
  const saldos={};
  [...liquidAccs,...usdAccs,...debtAccs].forEach(a=>{ saldos[a]=accounts[a]||0; });
  entries.forEach(e=>{
    if(cicloDe(e.date)<=mesISO)return; // solo deshacemos lo que pasó DESPUÉS del mes
    if(!(e.acc in saldos))return;
    if(debtAccs.includes(e.acc)){
      const sign=e.txType==='gasto'?-1:1; // gasto sube deuda, ingreso la baja — reversa es lo opuesto
      saldos[e.acc]+=sign*e.amount;
    }else{
      const sign=e.txType==='gasto'?1:-1;
      saldos[e.acc]+=sign*e.amount;
    }
  });
  const liquido=liquidAccs.reduce((s,a)=>s+saldos[a],0)+usdAccs.reduce((s,a)=>s+saldos[a]*accounts.trm,0);
  const deuda=debtAccs.reduce((s,a)=>s+saldos[a],0);
  return {liquido,deuda,neto:liquido-deuda};
}

// Cuentas de ahorro "de fábrica": el fondo de emergencia y el ahorro de vivienda.
const CUENTAS_AHORRO_BASE=['nu','lulo'];

/**
 * Cuentas donde guardas plata que NO es para gastar: las dos de arriba, las que creaste tú
 * (el botón las llama "bolsillo de ahorro") y cualquiera vinculada a una meta.
 *
 * Antes esto era una lista fija al revés — cuatro slugs marcados como "de gasto" — así que
 * una cuenta de ahorro nueva quedaba bien por casualidad, pero vincular una meta a una cuenta
 * existente no la sacaba del disponible.
 */
function cuentasDeAhorro(){
  const ahorro=new Set(CUENTAS_AHORRO_BASE);
  Object.keys(typeof dynamicAccounts!=='undefined'?dynamicAccounts:{}).forEach(k=>ahorro.add(k));
  (typeof goals!=='undefined'?goals:[]).forEach(g=>{ if(g.type==='cuenta'&&g.acc)ahorro.add(g.acc); });
  return ahorro;
}

/** Cuentas líquidas de las que sí puedes gastar: todo lo que no es crédito ni ahorro. */
function cuentasDeGastoDiario(){
  const ahorro=cuentasDeAhorro();
  return Object.keys(ACCOUNTS_META).filter(k=>ACCOUNTS_META[k].type!=='credito'&&!ahorro.has(k));
}

/** Suma en COP de un grupo de cuentas, convirtiendo las que están en dólares. */
function sumarEnCOP(slugs){
  return slugs.reduce((s,slug)=>{
    const meta=ACCOUNTS_META[slug];
    const saldo=accounts[slug]||0;
    if(!meta)return s;
    return s+(meta.currency==='USD'?saldo*accounts.trm:saldo);
  },0);
}

/** Plata disponible para gastar este mes (sin tocar los ahorros). Es lo que muestra el hero. */
function calcularSaldoDisponible(){
  return sumarEnCOP(cuentasDeGastoDiario());
}

/** Todo el dinero líquido, ahorros y cuentas creadas por ti incluidos. Es la base del patrimonio. */
function calcularLiquidezTotal(){
  const slugs=Object.keys(ACCOUNTS_META).filter(k=>ACCOUNTS_META[k].type!=='credito');
  return sumarEnCOP(slugs);
}

/**
 * Cuánta plata de este ciclo quedó apartada en ahorro: lo que moviste hacia cuentas de ahorro,
 * menos lo que sacaste de ellas, más los ingresos que entraron directo al ahorro.
 *
 * Sirve para que el desglose cuadre. El hero dice "Ingresos − Gastos = Saldo actual", pero si
 * moviste un millón a Lulo esa resta no daba: la plata ni se gastó ni sigue disponible, y el
 * millón simplemente desaparecía de la cuenta sin aparecer en ningún renglón.
 *
 * Limitación: una transferencia solo deja registro en la cuenta de ORIGEN, así que el destino
 * se deduce del nombre que la app misma genera ("Transferencia X → Y"). Si renombras una
 * cuenta, sus transferencias viejas dejan de reconocerse: el número se queda corto, nunca se
 * pasa de largo.
 */
function apartadoAAhorro(ciclo){
  const ahorro=cuentasDeAhorro();
  const slugPorEtiqueta={};
  Object.keys(ACCOUNTS_META).forEach(k=>{ slugPorEtiqueta[ACCOUNTS_META[k].label]=k; });

  return entries.filter(e=>cicloDe(e.date)===ciclo).reduce((suma,e)=>{
    if(e.cat==='Transferencia'){
      const destino=slugPorEtiqueta[(e.name.split('→')[1]||'').trim()];
      if(!destino)return suma; // destino no identificable: mejor no contarlo que contarlo mal
      const sale=ahorro.has(e.acc), entra=ahorro.has(destino);
      if(entra&&!sale)return suma+entryCOP(e);
      if(sale&&!entra)return suma-entryCOP(e); // sacaste ahorro para gastarlo
      return suma;                             // entre dos cuentas del mismo tipo no cambia nada
    }
    if(esIngresoReal(e)&&ahorro.has(e.acc))return suma+entryCOP(e); // ingreso que cayó directo al ahorro
    return suma;
  },0);
}

/** Pendientes por pagar que saldrán de las cuentas de gasto diario, en COP. */
function sumarPendientesDeGastoDiario(){
  return pendientes
    .filter(p=>!p.isIncome&&cuentasDeGastoDiario().includes(p.acc))
    .reduce((s,p)=>{
      const meta=ACCOUNTS_META[p.acc];
      if(!meta)return s; // cuenta eliminada
      return s+(meta.currency==='USD'?p.amount*accounts.trm:p.amount);
    },0);
}

/** Deuda total de tarjetas, en COP. */
function calcularDeudaTotal(){
  const slugs=Object.keys(ACCOUNTS_META).filter(k=>ACCOUNTS_META[k].type==='credito');
  return sumarEnCOP(slugs);
}

function updateNetWorth(){
  // Antes esto sumaba a mano una lista fija de slugs, así que una cuenta creada por ti no
  // aparecía ni en el patrimonio ni en ningún total: el dinero simplemente no existía.
  const liquidCOP=calcularLiquidezTotal();
  const debtCOP=calcularDeudaTotal();
  document.getElementById('nw-liquid').textContent=fmtCOP(liquidCOP);
  document.getElementById('nw-debt').textContent=fmtCOP(debtCOP);
  const net=liquidCOP-debtCOP;
  const nwEl=document.getElementById('nw-net');
  nwEl.textContent=fmtCOP(net);
  nwEl.style.color=net>=0?'var(--safe)':'var(--danger)';

  // Desglose del mes: ingresos - gastos, sobre las cuentas de gasto diario
  const monthEntries=entries.filter(e=>cicloDe(e.date)===currentMonth);
  const ingresosMes=monthEntries.filter(esIngresoReal).reduce((s,e)=>s+entryCOP(e),0);
  const gastosMes=monthEntries.filter(esGastoReal).reduce((s,e)=>s+entryCOP(e),0);
  const saldoFinal=calcularSaldoDisponible();

  const breakdownEl=document.getElementById('ats-breakdown');
  const simpleEl=document.getElementById('ats-simple');

  const esMesActual=currentMonth===cicloActual();
  const saldoHist=calcularSaldoHistorico(currentMonth);

  // Si es mes actual: mostrar desglose directo. Si es mes pasado: mostrar saldo reconstruido simple.
  if(esMesActual){
    breakdownEl.style.display='block';
    simpleEl.style.display='none';
    const pendCOP=sumarPendientesDeGastoDiario();
    const libreReal=saldoFinal-pendCOP;
    const ahorroApartado=apartadoAAhorro(currentMonth);

    const ingresosEl=document.getElementById('ats-ingresos');
    const gastosEl=document.getElementById('ats-gastos');
    const pendientesEl=document.getElementById('ats-pendientes-actual');
    const libreEl=document.getElementById('ats-libre-real');
    const finalEl=document.getElementById('ats-saldo-final');

    if(ingresosEl)ingresosEl.textContent=fmtCOP(ingresosMes);
    if(gastosEl)gastosEl.textContent=fmtCOP(gastosMes);
    if(finalEl){
      finalEl.textContent=fmtCOP(saldoFinal);
      finalEl.style.color=saldoFinal>=0?'var(--safe)':'var(--danger)';
    }
    if(pendientesEl)pendientesEl.textContent=fmtCOP(pendCOP);
    if(libreEl){
      libreEl.textContent=fmtCOP(libreReal);
      libreEl.style.color=libreReal>500000?'var(--safe)':libreReal>0?'var(--warn)':'var(--danger)';
    }

    // La fila de ahorro solo aparece si de verdad apartaste algo: si no, sería un renglón en
    // cero que estorba. Cuando aparece, el desglose sí cuadra — antes "Ingresos − Gastos"
    // no daba el saldo actual y la diferencia (lo que moviste a ahorro) no salía por ningún lado.
    const ahorroRow=document.getElementById('ats-ahorro-row');
    const ahorroEl=document.getElementById('ats-ahorro');
    if(ahorroRow&&ahorroEl){
      const hay=Math.abs(ahorroApartado)>=1;
      ahorroRow.style.display=hay?'block':'none';
      if(hay)ahorroEl.textContent=fmtCOP(ahorroApartado);
    }

    const subEl=document.getElementById('ats-sub');
    if(subEl)subEl.innerHTML=Math.abs(ahorroApartado)>=1
      ? 'Ingresos − Gastos − Apartado a ahorro = Saldo actual · Menos pendientes = Libre real para gastar'
      : 'Ingresos − Gastos = Saldo actual · Menos pendientes = Libre real para gastar';
  }else{
    breakdownEl.style.display='none';
    simpleEl.style.display='block';
    const bruto=saldoHist.nequi+saldoHist.debito+(saldoHist.arq*accounts.trm)+(saldoHist.ontop*accounts.trm);
    const pendCOP=saldoHist.esHistorico?0:sumarPendientesDeGastoDiario();
    const libre=bruto-pendCOP;
    document.getElementById('ats-bruto').textContent=fmtCOP(bruto);
    document.getElementById('ats-pendientes').textContent=fmtCOP(pendCOP);
    document.getElementById('ats-value').textContent=fmtCOP(libre);
    document.getElementById('ats-value').style.color=libre>500000?'var(--safe)':libre>0?'var(--warn)':'var(--danger)';
    const subEl=document.getElementById('ats-sub');
    if(subEl){
      subEl.innerHTML=saldoHist.fallo
        ?`⚠️ No se pudo reconstruir el saldo de ese mes — la carga de tus movimientos falló. Este es el saldo de <strong>hoy</strong>, no el de ese mes. Ve a 🔧 Diagnóstico → "Reintentar carga" y vuelve a intentarlo.`
        :saldoHist.esHistorico
        ?`📅 Saldo reconstruido al cierre de ese mes (no se restan pendientes, ya resueltos). ARQ/Ontop con TRM de hoy, y las transferencias recibidas ese mes pueden no reflejarse del todo.`
        :'Liquidez en pesos y dólares, menos compromisos pendientes del mes';
    }
  }

  // Fondo de emergencia — mini progreso en pestaña Cuentas
  const metaEmergencia=7000000;
  const pctEmergenciaReal=accounts.nu/metaEmergencia*100;
  const pctEmergencia=Math.min(100,Math.round(pctEmergenciaReal));
  const {color:colorEmergencia,mensaje:mensajeEmergencia}=colorYMensajeProgreso(pctEmergenciaReal);
  const miniFill=document.getElementById('emergency-mini-fill');
  const miniLabel=document.getElementById('emergency-mini-label');
  if(miniFill){ miniFill.style.width=pctEmergencia+'%'; miniFill.style.background=colorEmergencia; }
  if(miniLabel){ miniLabel.innerHTML=`<span style="color:${colorEmergencia};font-weight:600">${mensajeEmergencia}</span> · ${pctEmergencia}% de la meta ($7,000,000)`; }

  renderEstadoMes();
  updateFilterBalanceBanner();
}

function renderEstadoMes(){
  const body=document.getElementById('estado-mes-body');
  const semaforoEl=document.getElementById('estado-mes-semaforo');
  if(!body)return;
  if(!currentMonth){ body.innerHTML='<div style="color:var(--text3);font-size:12px">Cargando…</div>'; if(semaforoEl)semaforoEl.textContent=''; return; }

  const monthEntries=entries.filter(e=>cicloDe(e.date)===currentMonth);
  const ingresos=monthEntries.filter(esIngresoReal).reduce((s,e)=>s+entryCOP(e),0);
  const gastos=monthEntries.filter(esGastoReal).reduce((s,e)=>s+entryCOP(e),0);
  const balanceNeto=ingresos-gastos;
  // Sin ingresos en el ciclo no se puede calcular la proporción: mostrar 0% diría "no has
  // comprometido nada" justo cuando ya llevas gastos, que es lo contrario de la verdad.
  const pctComprometido=ingresos>0?Math.round(gastos/ingresos*100):null;

  // Ritmo de gasto: gasto/día actual vs gasto/día "ideal" según presupuesto variable.
  // Los días salen del ciclo de pago, no del mes de calendario: si el ciclo va del 26 al 25,
  // el día 3 de septiembre es el día 9 del ciclo, no el día 3.
  const diasEnMes=diasDelCiclo(currentMonth);
  const diaActual=diasCorridosDelCiclo(currentMonth);
  // Misma lista de categorías controlables que usa "variable vs tope" en Métricas.
  const controlables=new Set(categoriasControlables());
  const gastoVariable=monthEntries.filter(e=>controlables.has(e.cat)&&esGastoReal(e)).reduce((s,e)=>s+entryCOP(e),0);
  const ritmoIdeal=(topeControlable()/diasEnMes)*diaActual;
  const ritmoPct=ritmoIdeal>0?Math.round(gastoVariable/ritmoIdeal*100):0;

  // Semáforo único: combina ritmo de gasto variable vs avance del mes
  let semaforo='🟢',semaforoTexto='Vas bien';
  if(ritmoPct>130){semaforo='🔴';semaforoTexto='Gastando más rápido de lo normal';}
  else if(ritmoPct>105){semaforo='🟡';semaforoTexto='Cerca del límite de ritmo';}
  semaforoEl.textContent=semaforo+' '+semaforoTexto;

  body.innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
      <div class="metric-box" style="padding:12px">
        <div class="metric-label">Ingresos del mes</div>
        <div class="metric-value green" style="font-size:18px">${fmtCOP(ingresos)}</div>
      </div>
      <div class="metric-box" style="padding:12px">
        <div class="metric-label">Gastos del mes</div>
        <div class="metric-value red" style="font-size:18px">${fmtCOP(gastos)}</div>
      </div>
    </div>
    <div class="networth-row"><span class="networth-label">Balance neto del mes</span><span class="networth-value" style="color:${balanceNeto>=0?'var(--safe)':'var(--danger)'}">${balanceNeto>=0?'+':''}${fmtCOP(balanceNeto)}</span></div>
    <div class="networth-row"><span class="networth-label">% del ingreso ya comprometido</span><span class="networth-value"${pctComprometido===null?' style="color:var(--warn)"':''}>${pctComprometido===null?'— aún sin ingresos en este ciclo':pctComprometido+'%'}</span></div>
    <div class="networth-row"><span class="networth-label">Ritmo de gasto variable</span><span class="networth-value" style="color:${ritmoPct>130?'var(--danger)':ritmoPct>105?'var(--warn)':'var(--safe)'}">${ritmoPct}% del ritmo esperado</span></div>
    <div style="font-size:10px;color:var(--text3);margin-top:6px">Día ${diaActual} de ${diasEnMes} del ciclo (${etiquetaCiclo(currentMonth).split(' · ')[1]}) · ${fmtCOP(gastoVariable)} gastado en categorías variables</div>
  `;
}

function esc(str){ return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function toastError(msg) {
  const el = document.getElementById('save-toast');
  if (!el) return;
  clearTimeout(el._hideTimer);
  el.textContent = msg;
  el.style.cssText = 'display:block;opacity:1;background:rgba(220,38,38,.15);color:var(--danger);border:1px solid rgba(220,38,38,.4)';
  el._hideTimer = setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => { el.style.display = 'none'; }, 300);
  }, 2500);
}

function marcarInvalido(el) {
  if (!el) return;
  el.style.borderColor = 'var(--danger)';
  el.style.boxShadow = '0 0 0 2px rgba(220,38,38,.2)';
  const limpiar = () => {
    el.style.borderColor = '';
    el.style.boxShadow = '';
    el.removeEventListener('input', limpiar);
    el.removeEventListener('change', limpiar);
  };
  el.addEventListener('input', limpiar);
  el.addEventListener('change', limpiar);
  setTimeout(limpiar, 3000);
  el.focus();
}

function todayStr(){
  const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'});
  return fmt.format(new Date()); // en-CA locale gives YYYY-MM-DD format
}
function fmtDate(s){const p=s.split('-');return p[2]+'/'+p[1]}
function fmtCOP(n){return '$'+Math.round(n).toLocaleString('es-CO')}
function redondear3(n){ return Math.round(n*100)/100; } // máximo 2 decimales en cualquier monto registrado (nombre de función sin cambiar para no romper referencias)
function fmtUSD(n){ return '$'+n.toFixed(2)+' USD'; } // 2 decimales al MOSTRAR (estándar de moneda), incluso si el dato guardado tiene más
function col(cat, name=''){
  if(name && cat==='Suscripciones'){
    const lowerName=name.toLowerCase();
    for(const [key, color] of Object.entries(SUBSCRIPTION_COLORS||{})){
      if(lowerName.includes(key))return color;
    }
  }
  return COLORS[cat]||'#607D8B';
}
function scat(cat){return cat.includes('·')?cat.split('·').slice(1).join('·').trim():cat}

// Las palabras clave van en minúscula y SIN TILDES: el texto que escribes se normaliza
// (NFD + quitar diacríticos) antes de compararlo, así que una palabra con tilde aquí nunca
// llega a coincidir. 'tónico' estuvo así, sin poder activarse nunca.
const KEYWORD_MAP=[
  {keywords:['gas','luz','agua','acueducto','vanti','energia','electricidad','servicio publico'],cat:'Servicios'},
  {keywords:['mercado','super','supermercado','exito','carulla','olimpica','ara','d1','jumbo'],cat:'Alimentación · Mercado'},
  {keywords:['almuerzo','cena','desayuno','restaurante','comida','rappi food','ifood'],cat:null,special:'comida'},
  {keywords:['uber','taxi','bus','transmilenio','metro','cabify','didi'],cat:'Transporte'},
  {keywords:['gasolina','combustible','terpel','esso','biomax'],cat:'Vehículo · Gasolina'},
  {keywords:['parqueadero','parking'],cat:'Vehículo · Parqueadero'},
  {keywords:['taller','mecanico','mantenimiento moto','mantenimiento carro','aceite'],cat:'Vehículo · Taller'},
  {keywords:['lavada','lavado'],cat:'Vehículo · Lavada'},
  {keywords:['netflix','spotify','disney','hbo','suscripcion','capcut','adobe','google one','anthropic','claude'],cat:'Suscripciones'},
  {keywords:['doctor','eps','medicina','farmacia','droga','salud','medico','odontologo'],cat:'Salud'},
  {keywords:['ropa','zapatos','camisa','pantalon'],cat:'Ropa'},
  {keywords:['celular','laptop','computador','tecnologia','amazon'],cat:'Tecnología'},
  {keywords:['ciclismo','bicicleta','bici'],cat:'Deportes · Ciclismo'},
  {keywords:['cine','pelicula','concierto','fiesta','entretenimiento','salida'],cat:'Entretenimiento'},
  {keywords:['corte','peluqueria','barberia','manicure'],cat:'Cuidado personal'},
  {keywords:['skin','serum','protector solar','hidratante','facial','tonico','retinol','colageno','limpiador','fotoprotector','contorno de ojos'],cat:'Cuidado personal · Skin Care'},
  {keywords:['pago tarjeta','pago tc','pago rappi card','pago davivienda'],cat:'Pago Deuda'},
];

/**
 * Devuelve la regla de KEYWORD_MAP cuya palabra clave COINCIDENTE MÁS LARGA aparece en el texto.
 *
 * Antes ganaba la primera regla del arreglo, y eso dejaba palabras enteras inalcanzables:
 * "gasolina" contiene "gas" (Servicios) y "combustible" contiene "bus" (Transporte), así que
 * escribir "Gasolina moto" se categorizaba como Servicios. Con la más larga gana siempre la
 * más específica, sin depender del orden en que estén escritas las reglas.
 */
function reglaSugerida(text){
  let mejor=null;
  for(const rule of KEYWORD_MAP){
    for(const k of rule.keywords){
      if(!text.includes(k))continue;
      if(!mejor||k.length>mejor.palabra.length)mejor={rule,palabra:k};
    }
  }
  return mejor?mejor.rule:null;
}

function suggestCategory(){
  const raw=document.getElementById('inp-name').value;
  const text=raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const badge=document.getElementById('suggest-badge');
  const catSelect=document.getElementById('inp-cat');

  if(text.length===0){
    badge.style.display='none';
    return; // texto vacío: no tocar la categoría, el usuario puede elegirla manualmente
  }
  if(text.length<3){
    badge.style.display='none';
    return;
  }

  const rule=reglaSugerida(text);
  if(rule){
    let catFinal=rule.cat;
    if(rule.special==='comida'){
      const dow=new Date(document.getElementById('inp-date').value||todayStr()).getUTCDay();
      catFinal=(dow===0||dow===6)?'Alimentación · Comidas afuera · Fin de semana':'Alimentación · Comidas afuera · Entre semana';
    }
    catSelect.value=catFinal;
    catSelect.dispatchEvent(new Event('change'));
    badge.style.display='block';
    badge.textContent=`✨ Sugerido: ${scat(catFinal)} — cámbialo si no aplica`;
    if(typeof actualizarBtnCat==='function') actualizarBtnCat('inp-cat');
    return;
  }
  // Sin coincidencia: se respeta la categoría que haya, que normalmente es una que elegiste a mano.
  // Antes se forzaba 'Otro' aquí, así que corregir una letra de la descripción después de elegir
  // "Salud" la devolvía a "Otro" sin avisar.
  badge.style.display='none';
}
// El enganche vive en el atributo oninput de index.html. Antes había además un listener de 'input'
// y otro de 'keyup' en este archivo: la función corría tres veces por cada tecla.

function suggestCategoryPend(){
  const text=document.getElementById('pend-name').value.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const badgeEl=document.getElementById('pend-suggest');
  const catSelect=document.getElementById('pend-cat');
  if(text.length<3){ if(badgeEl) badgeEl.style.display='none'; return; }
  const rule=reglaSugerida(text);
  if(rule){
    const opts=[...catSelect.options].map(o=>o.value);
    const target=rule.special==='comida'?'Alimentación · Comidas afuera · Entre semana':rule.cat;
    if(opts.includes(target)){
      catSelect.value=target;
      if(typeof actualizarBtnCat==='function') actualizarBtnCat('pend-cat');
      if(badgeEl) badgeEl.style.display='block';
    }
    return;
  }
  if(badgeEl) badgeEl.style.display='none';
}

let vehiculos=['Moto']; // lista dinámica de vehículos — empieza con Moto, crece cuando agregues otro

function setTipoMovimiento(tipo){
  document.getElementById('inp-type').value=tipo;
  actualizarTabsTipo();
  onAccountChange();
}

function actualizarTabsTipo(){
  const tipo=document.getElementById('inp-type').value;
  const tabGasto=document.getElementById('tab-tipo-gasto');
  const tabIngreso=document.getElementById('tab-tipo-ingreso');
  if(tabGasto)tabGasto.classList.toggle('active',tipo==='gasto');
  if(tabIngreso)tabIngreso.classList.toggle('active',tipo==='ingreso');
}

function onCategoryChange(){
  if(typeof actualizarBtnCat==='function') actualizarBtnCat('inp-cat');
  const cat=document.getElementById('inp-cat').value;
  const row=document.getElementById('vehiculo-tag-row');
  row.style.display=cat.startsWith('Vehículo')?'grid':'none';
  const tipoSel=document.getElementById('inp-type');
  if(cat.startsWith('Ingreso ·')){ tipoSel.value='ingreso'; }
  else if(tipoSel.value==='ingreso'){ tipoSel.value='gasto'; }
  actualizarTabsTipo();
  onAccountChange();
}

function populateVehiculoSelect(){
  const sel=document.getElementById('inp-vehiculo');
  if(!sel)return;
  const actual=sel.value;
  sel.innerHTML=vehiculos.map(v=>`<option value="${v}">🚗 ${v}</option>`).join('')+'<option value="__nuevo__">➕ Agregar otro vehículo…</option>';
  if(vehiculos.includes(actual))sel.value=actual;
}

document.getElementById('inp-vehiculo')?.addEventListener('change',function(){
  document.getElementById('inp-vehiculo-nuevo').style.display=this.value==='__nuevo__'?'block':'none';
});

function onAccountChange(){
  const acc=document.getElementById('inp-account').value;
  const meta=ACCOUNTS_META[acc];
  const hint=document.getElementById('acc-hint');
  const type=document.getElementById('inp-type').value;
  if(meta.type==='credito'){
    hint.textContent=`💳 Esto ${type==='gasto'?'aumentará':'reducirá'} la deuda de ${meta.label}.`;
  }else{
    hint.textContent=`${type==='gasto'?'Se descontará de':'Se sumará a'} ${meta.label} (${meta.currency}).`;
  }
  const curRow=document.getElementById('currency-override-row');
  curRow.style.display=meta.currency==='USD'?'grid':'none';
  if(meta.currency==='USD')document.getElementById('inp-currency').value='USD';
  const amtInp=document.getElementById('inp-amount');
  setAmountInputMode(amtInp,meta.currency==='USD','Monto');
}

function onEntryCurrencyChange(){
  const chosen=document.getElementById('inp-currency').value;
  setAmountInputMode(document.getElementById('inp-amount'),chosen==='USD','Monto');
}

