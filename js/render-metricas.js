function render(){
  const monthEntries=entries.filter(e=>e.date.slice(0,7)===currentMonth);
  const gastos=monthEntries.filter(e=>e.txType!=='ingreso'&&e.cat!=='Transferencia');
  const total=gastos.reduce((s,e)=>s+entryCOP(e),0);
  const today=gastos.filter(e=>e.date===todayStr()).reduce((s,e)=>s+entryCOP(e),0);

  const ACCOUNT_ORDER={nequi:1,debito:2,nu:3,arq:4,ontop:5,davtc:6,rappitc:7};
  let monthEntriesFiltradas=filterAccount==='todas'?monthEntries:monthEntries.filter(e=>e.acc===filterAccount);
  if(filterType!=='todos')monthEntriesFiltradas=monthEntriesFiltradas.filter(e=>e.txType===filterType);
  if(filterCategory!=='todas')monthEntriesFiltradas=monthEntriesFiltradas.filter(e=>e.cat===filterCategory);
  poblarFiltroCategoria(monthEntries);
  let sorted;
  if(sortMode==='cuenta'){
    sorted=[...monthEntriesFiltradas].sort((a,b)=>{
      const diff=ACCOUNT_ORDER[a.acc]-ACCOUNT_ORDER[b.acc];
      return diff!==0?diff:b.date.localeCompare(a.date);
    });
  }else{
    sorted=[...monthEntriesFiltradas].sort((a,b)=>b.date.localeCompare(a.date));
  }
  const list=document.getElementById('entries-list');
  list.innerHTML=sorted.length?sorted.map(e=>{
    const c=col(e.cat);
    const meta=ACCOUNTS_META[e.acc];
    const displayCurrency=e.currency||meta.currency;
    const isIncome=e.txType==='ingreso';
    const amtStr=(displayCurrency==='USD'?fmtUSD(e.amount):fmtCOP(e.amount));
    const saldoActual=meta.currency==='USD'?'$'+accounts[e.acc]+' USD':fmtCOP(accounts[e.acc]);
    const cop=entryCOP(e);
    const esAnomalia=cop>5000000;
    const cardColor=e.acc==='davtc'?'#EF4444':e.acc==='rappitc'?'#FF8C42':null;
    const borderStyle=esAnomalia?'background:rgba(255,107,107,.12);border-left:3px solid var(--danger)':cardColor?`border-left:3px solid ${cardColor}`:'';
    return`<div class="entry-row" style="${borderStyle}">
      <div class="entry-row-top">
        <span class="entry-date">${fmtDate(e.date)}</span>
        <div class="entry-dot" style="background:${c}"></div>
        <div class="entry-name">${esAnomalia?'⚠️ ':''}${e.name}</div>
        <span class="entry-amount" style="color:${esAnomalia?'var(--danger)':isIncome?'var(--accent)':'var(--text)'}">${isIncome?'+':'−'}${amtStr}</span>
      </div>
      <div class="entry-row-bottom">
        <span class="entry-cat" style="background:${c}22;color:${c}">${scat(e.cat)}</span>
        <span class="entry-acc">${meta.label} · ${saldoActual}${e.vehiculo?' · 🚗 '+e.vehiculo:''}${esAnomalia?' · <span style="color:var(--danger)">monto alto</span>':''}</span>
      </div>
      <div class="entry-actions">
        ${esAnomalia?`<button class="entry-icon-btn" style="width:auto;padding:0 8px" onclick="fixCurrency('${e.id}')">💱 Era COP</button>`:''}
        <button class="entry-icon-btn" onclick="openEditEntryModal('${e.id}')" title="Editar movimiento">✏️</button>
        <button class="entry-del-btn" onclick="deleteEntry('${e.id}')" title="Eliminar">×</button>
      </div>
    </div>`;
  }).join(''):'<div class="empty">📋 Sin movimientos</div>';

  const bycat={};
  gastos.forEach(e=>bycat[e.cat]=(bycat[e.cat]||0)+entryCOP(e));
  const varSpent=gastos.reduce((s,e)=>CAPS[e.cat]?s+entryCOP(e):s,0);
  const pct=Math.min(Math.round(varSpent/BUDGET_TOTAL*100),100);

  const CAPS_TOTAL=Object.values(CAPS).reduce((s,v)=>s+v,0);
  const totalConsumidoCaps=Object.keys(CAPS).reduce((s,cat)=>s+(bycat[cat]||0),0);
  const pctTotal=Math.min(100,Math.round(totalConsumidoCaps/CAPS_TOTAL*100));
  const overTotal=totalConsumidoCaps>CAPS_TOTAL;
  const nearTotal=pctTotal>=75&&!overTotal;
  const colorTotal=overTotal?'var(--danger)':nearTotal?'var(--warn)':'var(--accent)';
  const resumenHTML=`<div class="budget-row" style="border-bottom:2px solid var(--border2);margin-bottom:10px;padding-bottom:14px">
    <div class="budget-top"><span class="budget-name" style="font-weight:700;font-size:14px">📊 Total de todos los topes</span><span class="budget-nums" style="font-size:13px;font-weight:700">${fmtCOP(totalConsumidoCaps)} / ${fmtCOP(CAPS_TOTAL)}</span></div>
    <div class="budget-track" style="height:8px"><div class="budget-fill" style="width:${pctTotal}%;background:${colorTotal};height:8px"></div></div>
    <div class="budget-status" style="color:${colorTotal};font-weight:600">${pctTotal}% consumido ${overTotal?'— ⚠ sobre el total combinado':nearTotal?'— cerca del límite':'— vas bien'}</div>
  </div>`;

  // Agrupar categorías por familia (ej. "Vehículo · Gasolina" → padre "Vehículo", hijo "Gasolina").
  // Las categorías sin " · " se muestran solas, sin encabezado de grupo.
  const grupos={}; // { 'Vehículo': ['Vehículo · Gasolina', ...], null: ['Servicios', ...] }
  const ordenGrupos=[];
  Object.keys(CAPS).forEach(cat=>{
    const partes=cat.split(' · ');
    const padre=partes.length>1?partes[0]:null;
    const llave=padre||cat;
    if(!grupos[llave]){ grupos[llave]=[]; ordenGrupos.push(llave); }
    grupos[llave].push(cat);
  });

  function renderFilaCategoria(cat,idx,indentado){
    const spent=bycat[cat]||0;const cap=CAPS[cat];
    const p=Math.min(Math.round(spent/cap*100),100);
    const over=spent>cap;const near=p>=75&&!over;
    const bc=over?'#FF6B6B':near?'#FFB347':col(cat);
    const sc=over?'over':near?'warn':'ok';
    const st=over?'⚠ +'+fmtCOP(spent-cap)+' sobre tope':spent===0?'Sin gastos':fmtCOP(cap-spent)+' disponible';
    const comprasCat=gastos.filter(e=>e.cat===cat).sort((a,b)=>b.date.localeCompare(a.date));
    const detailId=`budget-detail-${idx}`;
    const comprasHTML=comprasCat.length?comprasCat.map(e=>{
      const meta=ACCOUNTS_META[e.acc];
      const displayCurrency=e.currency||meta.currency;
      const amtStr=displayCurrency==='USD'?fmtUSD(e.amount):fmtCOP(e.amount);
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);font-size:11px">
        <span style="color:var(--text3);font-family:var(--mono);min-width:34px">${fmtDate(e.date)}</span>
        <span style="flex:1;padding:0 8px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.name}</span>
        <span style="color:var(--text3);font-size:9px;font-family:var(--mono);margin-right:8px">${meta.label}</span>
        <span style="font-family:var(--mono);font-weight:600">${amtStr}</span>
      </div>`;
    }).join(''):'<div style="font-size:11px;color:var(--text3);padding:8px 0">Sin compras registradas en esta categoría este mes.</div>';
    const nombreVisible=indentado?cat.split(' · ').slice(1).join(' · '):cat;
    return`<div class="budget-row" style="${indentado?'padding-left:16px;border-left:2px solid var(--border2);margin-left:4px':''}">
      <div class="budget-top" style="cursor:pointer" onclick="toggleBudgetDetail('${detailId}')"><span class="budget-name" style="${indentado?'font-size:11px;color:var(--text2)':''}">${indentado?'└ ':''}${nombreVisible} <span id="${detailId}-arrow" style="font-size:9px;color:var(--text3)">▾</span></span><span class="budget-nums">${fmtCOP(spent)} / <input type="text" class="cap-edit-input" data-cat="${cat.replace(/"/g,'&quot;')}" value="${cap.toLocaleString('es-CO')}" onblur="updateCap(this)" onclick="event.stopPropagation()" style="width:70px;background:none;border:none;border-bottom:1px dashed var(--text3);color:inherit;font-family:var(--mono);font-size:11px;text-align:right"></span></div>
      <div class="budget-track" style="${indentado?'height:4px':''}"><div class="budget-fill" style="width:${p}%;background:${bc}"></div></div>
      <div class="budget-status ${sc}">${st}</div>
      <div id="${detailId}" style="display:none;margin-top:8px;padding:8px 10px;background:var(--surface2);border-radius:8px">${comprasHTML}</div>
    </div>`;
  }

  let idxGlobal=0;
  document.getElementById('budget-list').innerHTML=resumenHTML+ordenGrupos.map(llave=>{
    const cats=grupos[llave];
    if(cats.length===1&&!cats[0].includes(' · ')){
      // Categoría suelta, sin familia — se muestra igual que antes
      return renderFilaCategoria(cats[0],idxGlobal++,false);
    }
    // Grupo con padre: encabezado con progreso combinado + hijos indentados
    const capTotal=cats.reduce((s,c)=>s+CAPS[c],0);
    const spentTotal=cats.reduce((s,c)=>s+(bycat[c]||0),0);
    const p=Math.min(Math.round(spentTotal/capTotal*100),100);
    const over=spentTotal>capTotal;const near=p>=75&&!over;
    const bc=over?'#FF6B6B':near?'#FFB347':col(cats[0]);
    const groupId=`budget-group-${llave.replace(/\s+/g,'')}`;
    const encabezado=`<div class="budget-row" style="padding-bottom:6px">
      <div class="budget-top" style="cursor:pointer" onclick="toggleBudgetDetail('${groupId}')"><span class="budget-name" style="font-weight:700">📁 ${llave} <span id="${groupId}-arrow" style="font-size:9px;color:var(--text3)">▾</span></span><span class="budget-nums" style="font-weight:700">${fmtCOP(spentTotal)} / ${fmtCOP(capTotal)}</span></div>
      <div class="budget-track"><div class="budget-fill" style="width:${p}%;background:${bc}"></div></div>
    </div>`;
    const hijosHTML=`<div id="${groupId}" style="display:none">${cats.map(c=>renderFilaCategoria(c,idxGlobal++,true)).join('')}</div>`;
    return encabezado+hijosHTML;
  }).join('');


  window._bycat=bycat; window._total=total; window._today=today; window._pct=pct;
  const monthNames=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  if(currentMonth){
    const [y,mo]=currentMonth.split('-');
    document.getElementById('budget-month-label').textContent='· '+monthNames[parseInt(mo)-1]+' '+y;
  }
  renderPendientes();
  updateNetWorth();
}

function renderMetrics(){
  const bycat=window._bycat||{};
  const total=window._total||0;
  document.getElementById('m-total').textContent=fmtCOP(total);
  document.getElementById('m-total-sub').textContent=`en ${entries.filter(e=>e.txType!=='ingreso').length} movimientos`;
  document.getElementById('m-today').textContent=fmtCOP(window._today||0);
  document.getElementById('m-pct').textContent=(window._pct||0)+'%';
  document.getElementById('m-pct').style.color=(window._pct||0)>85?'var(--danger)':(window._pct||0)>65?'var(--warn)':'var(--accent)';
  const debtTotal=accounts.davtc+accounts.rappitc;
  document.getElementById('m-debt').textContent=fmtCOP(debtTotal);

  const sorted=Object.entries(bycat).sort((a,b)=>b[1]-a[1]).filter(([c,v])=>v>0);
  const sum=sorted.reduce((s,[c,v])=>s+v,0)||1;
  let acc=0;
  const stops=sorted.map(([cat,val])=>{
    const start=acc/sum*360;
    acc+=val;
    const end=acc/sum*360;
    return `${col(cat)} ${start}deg ${end}deg`;
  }).join(',');
  document.getElementById('pie-chart').style.background=sorted.length?`conic-gradient(${stops})`:'var(--surface2)';
  document.getElementById('pie-legend').innerHTML=sorted.slice(0,8).map(([cat,val])=>{
    const pct=Math.round(val/sum*100);
    return `<div class="legend-row"><div class="legend-dot" style="background:${col(cat)}"></div><span class="legend-name">${scat(cat)}</span><span class="legend-val">${pct}% · ${fmtCOP(val)}</span></div>`;
  }).join('')||'<div style="color:var(--text3);font-size:12px">Sin datos aún</div>';

  const davPct=Math.max(0,Math.min(100,Math.round((1-accounts.davtc/DEBT_ORIGINAL.davtc)*100)));
  const rappiPct=Math.max(0,Math.min(100,Math.round((1-accounts.rappitc/DEBT_ORIGINAL.rappitc)*100)));
  document.getElementById('dp-dav-pct').textContent=davPct+'% pagado';
  document.getElementById('dp-dav-fill').style.width=davPct+'%';
  document.getElementById('dp-dav-current').textContent='Actual: '+fmtCOP(accounts.davtc);
  document.getElementById('dp-dav-original').textContent='Pico: '+fmtCOP(DEBT_ORIGINAL.davtc);
  document.getElementById('dp-rappi-pct').textContent=rappiPct+'% pagado';
  document.getElementById('dp-rappi-fill').style.width=rappiPct+'%';
  document.getElementById('dp-rappi-current').textContent='Actual: '+fmtCOP(accounts.rappitc);
  document.getElementById('dp-rappi-original').textContent='Pico: '+fmtCOP(DEBT_ORIGINAL.rappitc);

  renderMonthComparison();
  renderCategoryTrend();
  renderEmergencyGrowth();
  renderDebtProjection();
}

function renderDebtProjection(){
  const el=document.getElementById('debt-projection');
  if(!el)return;
  const pagosDeuda=entries.filter(e=>e.cat==='Pago Deuda'&&e.txType!=='ingreso');
  const totalDeuda=accounts.davtc+accounts.rappitc;

  if(pagosDeuda.length===0||totalDeuda<=0){
    el.innerHTML=totalDeuda<=0
      ?'🎉 <strong style="color:var(--accent)">¡Deuda en cero!</strong> No hay pagos pendientes que proyectar.'
      :'Registra al menos un pago de deuda para calcular la proyección.';
    return;
  }
  const mesesConPago=new Set(pagosDeuda.map(e=>e.date.slice(0,7))).size||1;
  const totalPagado=pagosDeuda.reduce((s,e)=>s+entryCOP(e),0);
  const promedioMensual=totalPagado/mesesConPago;
  const mesesRestantes=Math.ceil(totalDeuda/promedioMensual);
  const fechaProyectada=new Date();
  fechaProyectada.setMonth(fechaProyectada.getMonth()+mesesRestantes);
  const monthNames=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const fechaTexto=`${monthNames[fechaProyectada.getMonth()]} ${fechaProyectada.getFullYear()}`;

  el.innerHTML=`📅 <strong>Proyección de pago:</strong> a tu ritmo promedio de ${fmtCOP(promedioMensual)}/mes, terminarías de pagar en <strong style="color:var(--accent)">~${mesesRestantes} mes(es) (${fechaTexto})</strong>.<br><span style="font-size:10px;color:var(--text3)">Basado en ${mesesConPago} mes(es) con pagos registrados. Si aumentas el pago mensual, esta fecha se acorta.</span>`;
}

function renderMonthComparison(){
  const monthNames=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const byMonth={};
  // Ya no hay meses "archivados" — entries contiene todo el historial completo
  entries.filter(e=>e.txType!=='ingreso'&&e.cat!=='Transferencia').forEach(e=>{
    const m=e.date.slice(0,7);
    byMonth[m]=(byMonth[m]||0)+entryCOP(e);
  });
  const meses=Object.keys(byMonth).sort().slice(-6);
  const maxVal=Math.max(...meses.map(m=>byMonth[m]),1);
  const chart=document.getElementById('month-compare-chart');
  const legend=document.getElementById('month-compare-legend');
  if(meses.length===0){
    chart.innerHTML='<div style="color:var(--text3);font-size:12px;margin:auto">Sin datos suficientes aún</div>';
    legend.innerHTML='';
    return;
  }
  chart.innerHTML=meses.map((m,i)=>{
    const val=byMonth[m];
    const h=Math.max(6,Math.round(val/maxVal*120));
    const esMesActual=m===currentMonth;
    const color=esMesActual?'var(--accent)':'#5B8DEF';
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
      <div style="font-size:9px;font-family:var(--mono);color:var(--text2)">${(val/1000000).toFixed(1)}M</div>
      <div style="width:100%;max-width:40px;height:${h}px;background:${color};border-radius:4px 4px 0 0;transition:height .5s"></div>
    </div>`;
  }).join('');
  legend.innerHTML=meses.map(m=>{
    const [y,mo]=m.split('-');
    return `<span>${monthNames[parseInt(mo)-1]}</span>`;
  }).join('');
}

function renderCategoryTrend(){
  const monthNames=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const el=document.getElementById('category-trend-chart');
  if(!el)return;

  const gastosReales=entries.filter(e=>e.txType!=='ingreso'&&e.cat!=='Transferencia');
  const todosLosMeses=[...new Set(gastosReales.map(e=>e.date.slice(0,7)))].sort();
  const meses=todosLosMeses.slice(-6);
  if(meses.length===0){
    el.innerHTML='<div style="color:var(--text3);font-size:12px">Sin datos suficientes aún</div>';
    return;
  }

  // Total gastado por categoría dentro de esos 6 meses, para elegir cuáles mostrar
  const totalPorCategoria={};
  const porCategoriaYMes={};
  gastosReales.filter(e=>meses.includes(e.date.slice(0,7))).forEach(e=>{
    const monto=entryCOP(e);
    totalPorCategoria[e.cat]=(totalPorCategoria[e.cat]||0)+monto;
    if(!porCategoriaYMes[e.cat])porCategoriaYMes[e.cat]={};
    const m=e.date.slice(0,7);
    porCategoriaYMes[e.cat][m]=(porCategoriaYMes[e.cat][m]||0)+monto;
  });

  const topCategorias=Object.keys(totalPorCategoria).sort((a,b)=>totalPorCategoria[b]-totalPorCategoria[a]).slice(0,8);

  el.innerHTML=topCategorias.map(cat=>{
    const c=col(cat);
    const datosMes=porCategoriaYMes[cat];
    const maxDelPeriodo=Math.max(...meses.map(m=>datosMes[m]||0),1); // normalizado a su propio máximo, para ver el patrón aunque sea una categoría chica
    const barras=meses.map(m=>{
      const val=datosMes[m]||0;
      const h=Math.max(3,Math.round(val/maxDelPeriodo*36));
      const [y,mo]=m.split('-');
      return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px" title="${monthNames[parseInt(mo)-1]}: ${fmtCOP(val)}">
        <div style="width:100%;max-width:14px;height:${h}px;background:${c};border-radius:2px 2px 0 0;opacity:${val===0?'0.15':'1'}"></div>
      </div>`;
    }).join('');
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
      <div style="width:110px;min-width:0;flex-shrink:0">
        <div style="font-size:11px;color:${c};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${scat(cat)}</div>
        <div style="font-size:9px;color:var(--text3);font-family:var(--mono)">${fmtCOP(totalPorCategoria[cat])}</div>
      </div>
      <div style="flex:1;display:flex;align-items:flex-end;gap:3px;height:40px">${barras}</div>
    </div>`;
  }).join('');
}

function renderEmergencyGrowth(){
  const monthNames=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const nuByMonth={};
  entries.filter(e=>e.acc==='nu').forEach(e=>{
    const m=e.date.slice(0,7);
    const signo=e.txType==='ingreso'?1:-1;
    nuByMonth[m]=(nuByMonth[m]||0)+(signo*e.amount);
  });
  const meses=Object.keys(nuByMonth).sort();
  const container=document.getElementById('emergency-growth');
  if(meses.length===0){
    container.innerHTML=`<div style="color:var(--text3);font-size:12px">Aún no hay movimientos registrados en Nu cajitas este período.</div>
      <div style="margin-top:10px"><strong>Saldo actual:</strong> ${fmtCOP(accounts.nu)}</div>`;
    return;
  }
  const meta=7000000;
  const pct=Math.min(100,Math.round(accounts.nu/meta*100));
  let html=meses.map(m=>{
    const [y,mo]=m.split('-');
    const val=nuByMonth[m];
    const signo=val>=0?'+':'';
    const color=val>=0?'var(--accent)':'var(--danger)';
    return `<div style="display:flex;justify-content:space-between"><span>${monthNames[parseInt(mo)-1]} ${y}</span><span style="color:${color};font-family:var(--mono)">${signo}${fmtCOP(val)}</span></div>`;
  }).join('');
  html+=`<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
    <div style="display:flex;justify-content:space-between;margin-bottom:6px"><strong>Saldo actual</strong><span style="font-family:var(--mono)">${fmtCOP(accounts.nu)}</span></div>
    <div class="debt-track"><div class="debt-fill" style="width:${pct}%"></div></div>
    <div style="font-size:10px;color:var(--text3);margin-top:4px;text-align:right">${pct}% de la meta ($7,000,000)</div>
  </div>`;
  container.innerHTML=html;
}

