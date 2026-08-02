let pendingAdjustment=null;

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
    `<strong>${meta.label}:</strong> detecté un cambio de <strong>${deltaAbsStr}</strong> (${etiqueta}).<br>Saldo anterior: ${meta.currency==='USD'?'$'+oldVal+' USD':fmtCOP(oldVal)} → nuevo: ${meta.currency==='USD'?'$'+newVal+' USD':fmtCOP(newVal)}.<br>¿Confirmas y registro el movimiento?`;
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
      categoria:'Otro',
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

  entries.unshift({id:nuevoId,date:todayStr(),name:nombre,amount:delta,cat:'Otro',acc:key,txType:tipoMovimiento});
  accounts[key]=newVal;

  document.getElementById('adjust-banner').style.display='none';
  pendingAdjustment=null;
  fillAccountInputs();
  populateMonthSelector();
  currentMonth=todayStr().slice(0,7);
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

function updateNetWorth(){
  const liquidCOP=accounts.nequi+accounts.debito+accounts.nu+accounts.lulo+(accounts.arq*accounts.trm)+(accounts.ontop*accounts.trm);
  const debtCOP=accounts.davtc+accounts.rappitc;
  document.getElementById('nw-liquid').textContent=fmtCOP(liquidCOP);
  document.getElementById('nw-debt').textContent=fmtCOP(debtCOP);
  const net=liquidCOP-debtCOP;
  const nwEl=document.getElementById('nw-net');
  nwEl.textContent=fmtCOP(net);
  nwEl.style.color=net>=0?'var(--accent)':'var(--danger)';

  // Libre Real: Nequi + Débito + (ARQ y Ontop convertidos a COP con la TRM actual) — Nu queda FUERA (no es gasto)
  const bruto=accounts.nequi+accounts.debito+(accounts.arq*accounts.trm)+(accounts.ontop*accounts.trm);
  const pendCOP=pendientes.filter(p=>!p.isIncome&&['nequi','debito','arq','ontop'].includes(p.acc))
    .reduce((s,p)=>{
      const meta=ACCOUNTS_META[p.acc];
      const monto=meta.currency==='USD'?p.amount*accounts.trm:p.amount;
      return s+monto;
    },0);
  const libre=bruto-pendCOP;
  document.getElementById('ats-bruto').textContent=fmtCOP(bruto);
  document.getElementById('ats-pendientes').textContent=fmtCOP(pendCOP);
  document.getElementById('ats-value').textContent=fmtCOP(libre);
  document.getElementById('ats-value').style.color=libre>500000?'var(--accent)':libre>0?'var(--warn)':'var(--danger)';

  // Fondo de emergencia — mini progreso en pestaña Cuentas
  const metaEmergencia=7000000;
  const pctEmergencia=Math.min(100,Math.round(accounts.nu/metaEmergencia*100));
  const miniFill=document.getElementById('emergency-mini-fill');
  const miniLabel=document.getElementById('emergency-mini-label');
  if(miniFill){ miniFill.style.width=pctEmergencia+'%'; }
  if(miniLabel){ miniLabel.textContent=`${pctEmergencia}% de la meta ($7,000,000)`; }

  renderEstadoMes();
  updateFilterBalanceBanner();
}

function renderEstadoMes(){
  const body=document.getElementById('estado-mes-body');
  const semaforoEl=document.getElementById('estado-mes-semaforo');
  if(!body)return;
  if(!currentMonth){ body.innerHTML='<div style="color:var(--text3);font-size:12px">Cargando…</div>'; if(semaforoEl)semaforoEl.textContent=''; return; }

  const monthEntries=entries.filter(e=>e.date.slice(0,7)===currentMonth);
  const ingresos=monthEntries.filter(e=>e.txType==='ingreso').reduce((s,e)=>s+entryCOP(e),0);
  const gastos=monthEntries.filter(e=>e.txType!=='ingreso'&&e.cat!=='Transferencia').reduce((s,e)=>s+entryCOP(e),0);
  const balanceNeto=ingresos-gastos;
  const pctComprometido=ingresos>0?Math.round(gastos/ingresos*100):0;

  // Ritmo de gasto: gasto/día actual vs gasto/día "ideal" según presupuesto variable
  const [y,m]=currentMonth.split('-').map(Number);
  const diasEnMes=new Date(y,m,0).getDate();
  const hoy=new Date();
  const esMesActual=currentMonth===todayStr().slice(0,7);
  const diaActual=esMesActual?hoy.getDate():diasEnMes;
  const gastoVariable=monthEntries.filter(e=>CAPS[e.cat]&&!CATEGORIAS_IRREGULARES.has(e.cat)&&e.txType!=='ingreso').reduce((s,e)=>s+entryCOP(e),0);
  const ritmoIdeal=(BUDGET_TOTAL/diasEnMes)*diaActual;
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
    <div class="networth-row"><span class="networth-label">Balance neto del mes</span><span class="networth-value" style="color:${balanceNeto>=0?'var(--accent)':'var(--danger)'}">${balanceNeto>=0?'+':''}${fmtCOP(balanceNeto)}</span></div>
    <div class="networth-row"><span class="networth-label">% del ingreso ya comprometido</span><span class="networth-value">${pctComprometido}%</span></div>
    <div class="networth-row"><span class="networth-label">Ritmo de gasto variable</span><span class="networth-value" style="color:${ritmoPct>130?'var(--danger)':ritmoPct>105?'var(--warn)':'var(--accent)'}">${ritmoPct}% del ritmo esperado</span></div>
    <div style="font-size:10px;color:var(--text3);margin-top:6px">Día ${diaActual} de ${diasEnMes} del mes · ${fmtCOP(gastoVariable)} gastado en categorías variables</div>
  `;
}

function todayStr(){
  const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'});
  return fmt.format(new Date()); // en-CA locale gives YYYY-MM-DD format
}
function fmtDate(s){const p=s.split('-');return p[2]+'/'+p[1]}
function fmtCOP(n){return '$'+Math.round(n).toLocaleString('es-CO')}
function redondear3(n){ return Math.round(n*100)/100; } // máximo 2 decimales en cualquier monto registrado (nombre de función sin cambiar para no romper referencias)
function fmtUSD(n){ return '$'+n.toFixed(2)+' USD'; } // 2 decimales al MOSTRAR (estándar de moneda), incluso si el dato guardado tiene más
function col(cat){return COLORS[cat]||'#607D8B'}
function scat(cat){return cat.includes('·')?cat.split('·').slice(1).join('·').trim():cat}

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
  {keywords:['pago tarjeta','pago tc','pago rappi card','pago davivienda'],cat:'Pago Deuda'},
];

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

  for(const rule of KEYWORD_MAP){
    if(rule.keywords.some(k=>text.includes(k))){
      let catFinal=rule.cat;
      if(rule.special==='comida'){
        const dow=new Date(document.getElementById('inp-date').value||todayStr()).getUTCDay();
        catFinal=(dow===0||dow===6)?'Alimentación · Comidas afuera · Fin de semana':'Alimentación · Comidas afuera · Entre semana';
      }
      catSelect.value=catFinal;
      catSelect.dispatchEvent(new Event('change'));
      badge.style.display='block';
      badge.textContent=`✨ Sugerido: ${scat(catFinal)} — cámbialo abajo si no aplica`;
      catSelect.style.borderColor='var(--accent)';
      catSelect.style.boxShadow='0 0 0 2px rgba(168,224,99,.15)';
      setTimeout(()=>{catSelect.style.borderColor='';catSelect.style.boxShadow='';},1200);
      return;
    }
  }
  // No hubo match con el texto actual — se asume "Otro" por defecto en vez de dejar la categoría anterior
  catSelect.value='Otro';
  badge.style.display='none';
}
document.getElementById('inp-name')?.addEventListener('input',suggestCategory);
document.getElementById('inp-name')?.addEventListener('keyup',suggestCategory);

function suggestCategoryPend(){
  const text=document.getElementById('pend-name').value.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const catSelect=document.getElementById('pend-cat');
  if(text.length<3)return;
  for(const rule of KEYWORD_MAP){
    if(rule.keywords.some(k=>text.includes(k))){
      const opts=[...catSelect.options].map(o=>o.value);
      const target=rule.special==='comida'?'Alimentación · Comidas afuera · Entre semana':rule.cat;
      if(opts.includes(target)){
        catSelect.value=target;
        catSelect.style.borderColor='var(--accent)';
        setTimeout(()=>{catSelect.style.borderColor='';},1200);
      }
      return;
    }
  }
}

let vehiculos=['Moto']; // lista dinámica de vehículos — empieza con Moto, crece cuando agregues otro

function onCategoryChange(){
  const cat=document.getElementById('inp-cat').value;
  const row=document.getElementById('vehiculo-tag-row');
  row.style.display=cat.startsWith('Vehículo')?'grid':'none';
  const tipoSel=document.getElementById('inp-type');
  if(cat.startsWith('Ingreso ·')){ tipoSel.value='ingreso'; }
  else if(tipoSel.value==='ingreso'){ tipoSel.value='gasto'; }
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
}

