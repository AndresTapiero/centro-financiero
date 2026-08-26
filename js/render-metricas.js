/**
 * Totales del mes seleccionado. Antes cada tarjeta de Métricas los leía de window._total,
 * window._bycat, etc., que solo existían si render() había corrido antes: la pestaña
 * dependía de que otra pantalla la hubiera preparado, y bastaba con que ese orden cambiara
 * para que las tarjetas mostraran $0. Ahora se calculan aquí, a partir de los movimientos.
 */
function calcularResumenMes(mes){
  const delMes=entries.filter(e=>e.date.slice(0,7)===mes);
  const gastos=delMes.filter(esGastoReal);
  const bycat={};
  gastos.forEach(e=>{ bycat[e.cat]=(bycat[e.cat]||0)+entryCOP(e); });
  const total=gastos.reduce((s,e)=>s+entryCOP(e),0);
  const today=gastos.filter(e=>e.date===todayStr()).reduce((s,e)=>s+entryCOP(e),0);
  // Numerador y denominador salen de la MISMA lista de categorías controlables.
  const controlables=new Set(categoriasControlables());
  const varSpent=gastos.reduce((s,e)=>controlables.has(e.cat)?s+entryCOP(e):s,0);
  const topeVar=topeControlable();
  const pct=topeVar>0?Math.min(Math.round(varSpent/topeVar*100),100):0;
  return {gastos,bycat,total,today,pct,conteo:gastos.length};
}

function render(){
  const monthEntries=entries.filter(e=>e.date.slice(0,7)===currentMonth);
  const {gastos,bycat}=calcularResumenMes(currentMonth); // misma fuente que la pestaña Métricas

  let monthEntriesFiltradas=filterAccount==='todas'?monthEntries:monthEntries.filter(e=>e.acc===filterAccount);
  if(filterType!=='todos')monthEntriesFiltradas=monthEntriesFiltradas.filter(e=>e.txType===filterType);
  if(filterCategory!=='todas')monthEntriesFiltradas=monthEntriesFiltradas.filter(e=>e.cat===filterCategory);
  poblarFiltroCategoria(monthEntries);
  updateEntriesSummary();
  // El orden por cuenta sale de ACCOUNTS_META, no de una lista fija de 7 slugs: con una lista
  // fija, cualquier cuenta creada por el usuario daba undefined, la resta daba NaN y el
  // comparador dejaba de ser consistente (el orden resultante quedaba al azar).
  const ordenCuentas=Object.keys(ACCOUNTS_META);
  const posicionCuenta=acc=>{
    const i=ordenCuentas.indexOf(acc);
    return i===-1?Number.MAX_SAFE_INTEGER:i; // cuentas eliminadas, al final
  };
  let sorted;
  if(sortMode==='cuenta'){
    sorted=[...monthEntriesFiltradas].sort((a,b)=>{
      const diff=posicionCuenta(a.acc)-posicionCuenta(b.acc);
      return diff!==0?diff:b.date.localeCompare(a.date);
    });
  }else{
    sorted=[...monthEntriesFiltradas].sort((a,b)=>b.date.localeCompare(a.date));
  }
  // Una sola plantilla de fila para los dos modos: antes el modo "cuenta" usaba una copia
  // inline con otro diseño (avatar de 28px, fecha y saldo), así que cambiar el orden
  // cambiaba también el aspecto de la lista.
  document.getElementById('entries-list').innerHTML=
    new MovimientoListRenderer(sorted, sortMode==='cuenta'?'cuenta':'fecha').render();


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
    const st=over?'⚠ +'+fmtCOP(spent-cap)+' sobre tope':spent===0?'Sin consumo este mes':fmtCOP(cap-spent)+' disponible';
    const comprasCat=gastos.filter(e=>e.cat===cat).sort((a,b)=>b.date.localeCompare(a.date));
    const detailId=`budget-detail-${idx}`;
    const comprasHTML=comprasCat.length?comprasCat.map(e=>{
      const meta=ACCOUNTS_META[e.acc]||{label:'Cuenta eliminada',currency:'COP',type:'debito'};
      const displayCurrency=e.currency||meta.currency;
      const amtStr=displayCurrency==='USD'?fmtUSD(e.amount):fmtCOP(e.amount);
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);font-size:11px">
        <span style="color:var(--text3);font-family:var(--mono);min-width:34px">${fmtDate(e.date)}</span>
        <span style="flex:1;padding:0 8px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.name)}</span>
        <span style="color:var(--text3);font-size:9px;font-family:var(--mono);margin-right:8px">${esc(meta.label)}</span>
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

  // Grupos/categorías sin ningún consumo este mes se sacan de la lista principal
  // y se listan aparte, colapsadas, para no ensuciar la vista con topes en 0%.
  const gruposActivos=[];
  const gruposSinConsumo=[];
  ordenGrupos.forEach(llave=>{
    const cats=grupos[llave];
    const spentTotal=cats.reduce((s,c)=>s+(bycat[c]||0),0);
    (spentTotal>0?gruposActivos:gruposSinConsumo).push(llave);
  });

  let idxGlobal=0;
  const listaActivaHTML=gruposActivos.map(llave=>{
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

  let sinConsumoHTML='';
  if(gruposSinConsumo.length){
    const nombresSinConsumo=gruposSinConsumo.map(llave=>{
      const cats=grupos[llave];
      return cats.length===1&&!cats[0].includes(' · ')?cats[0]:llave;
    });
    const detalleHTML=gruposSinConsumo.map(llave=>{
      const cats=grupos[llave];
      const capTotal=cats.reduce((s,c)=>s+CAPS[c],0);
      const nombre=cats.length===1&&!cats[0].includes(' · ')?cats[0]:llave;
      return `<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:11px;color:var(--text3)">
        <span>${nombre}</span><span style="font-family:var(--mono)">tope ${fmtCOP(capTotal)}</span>
      </div>`;
    }).join('');
    sinConsumoHTML=`<div class="budget-row" style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--border)">
      <div class="budget-top" style="cursor:pointer" onclick="toggleBudgetDetail('budget-sin-consumo')">
        <span class="budget-name" style="color:var(--text3);font-size:11px">😴 Sin consumo este mes: ${nombresSinConsumo.join(', ')} <span id="budget-sin-consumo-arrow" style="font-size:9px">▾</span></span>
      </div>
      <div id="budget-sin-consumo" style="display:none;margin-top:6px">${detalleHTML}</div>
    </div>`;
  }

  document.getElementById('budget-list').innerHTML=resumenHTML+listaActivaHTML+sinConsumoHTML;


  const monthNames=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  if(currentMonth){
    const [y,mo]=currentMonth.split('-');
    document.getElementById('budget-month-label').textContent='· '+monthNames[parseInt(mo)-1]+' '+y;
  }
  renderPendientes();
  updateNetWorth();
  if(window.reattachSwipeDelete)window.reattachSwipeDelete();
}

function renderMetrics(){
  const {bycat,total,today,pct,conteo}=calcularResumenMes(currentMonth);
  document.getElementById('m-total').textContent=fmtCOP(total);
  document.getElementById('m-total-sub').textContent=`en ${conteo} movimientos`;
  document.getElementById('m-today').textContent=fmtCOP(today);
  document.getElementById('m-pct').textContent=pct+'%';
  document.getElementById('m-pct').style.color=pct>85?'var(--danger)':pct>65?'var(--warn)':'var(--accent)';
  const debtTotal=calcularDeudaTotal();
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
  const centerTotalEl=document.getElementById('pie-center-total');
  if(centerTotalEl)centerTotalEl.textContent=fmtCOP(sum===1&&sorted.length===0?0:sum);
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
  renderPatrimonioHistorico();
  renderGastoHormiga();
  renderCategoryTrend();
  renderEmergencyGrowth();
  renderDebtProjection();
  renderGastoTarjetasCategoria();
  renderCreditoVsLiquidoPorCategoria();
  renderUtilizacionCupo();
  renderRegla503020();
}

/** Regla del 50%: % de tus ingresos que se va en NECESIDADES_BASICAS (constantes.js),
 *  con el período agrupado en ventanas de `periodo` meses (1=mensual, 3=trimestral, etc.),
 *  terminando siempre en el mes actual. La meta declarada por el usuario es no superar el 50%. */
function renderRegla503020(){
  const selEl=document.getElementById('regla-periodo');
  const pctEl=document.getElementById('regla-pct-actual');
  const msgEl=document.getElementById('regla-mensaje');
  const chart=document.getElementById('regla-chart');
  const legend=document.getElementById('regla-legend');
  const desgloseEl=document.getElementById('regla-desglose');
  if(!selEl||!chart)return;

  const periodo=parseInt(selEl.value)||1;
  const monthNames=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  // Hasta 6 ventanas de `periodo` meses cada una, terminando en el mes actual
  const totalMeses=Math.min(periodo*6,24);
  const meses=ultimosMeses(totalMeses);
  const ventanas=[];
  for(let i=0;i<meses.length;i+=periodo){
    ventanas.push(meses.slice(i,i+periodo));
  }

  function calcularVentana(mesesVentana){
    const ventEntries=entries.filter(e=>mesesVentana.includes(e.date.slice(0,7)));
    const ingresos=ventEntries.filter(esIngresoReal).reduce((s,e)=>s+entryCOP(e),0);
    const basicasEntries=ventEntries.filter(e=>esGastoReal(e)&&NECESIDADES_BASICAS.includes(e.cat));
    const basicas=basicasEntries.reduce((s,e)=>s+entryCOP(e),0);
    const pct=ingresos>0?Math.round(basicas/ingresos*100):null;
    return {ingresos,basicas,basicasEntries,pct};
  }

  const datos=ventanas.map(mesesVentana=>({mesesVentana,...calcularVentana(mesesVentana)}));
  const ultimaConDatos=[...datos].reverse().find(d=>d.pct!==null)||datos[datos.length-1];

  const colorRegla=pct=>pct===null?'var(--text3)':pct>60?'var(--danger)':pct>50?'var(--warn)':'var(--safe)';

  if(pctEl){
    pctEl.textContent=ultimaConDatos.pct===null?'—':ultimaConDatos.pct+'%';
    pctEl.style.color=colorRegla(ultimaConDatos.pct);
  }
  if(msgEl){
    msgEl.textContent=ultimaConDatos.pct===null
      ?'Sin ingresos registrados en este período para calcular el %.'
      :ultimaConDatos.pct<=50
      ?`✓ Dentro de la meta — te quedan ${fmtCOP((ultimaConDatos.ingresos*0.5)-ultimaConDatos.basicas)} de margen antes del 50%.`
      :`⚠ Superaste la meta por ${fmtCOP(ultimaConDatos.basicas-(ultimaConDatos.ingresos*0.5))} en este período.`;
    msgEl.style.color=colorRegla(ultimaConDatos.pct);
  }

  if(chart){
    chart.innerHTML=datos.map(d=>{
      const h=d.pct===null?4:Math.max(4,Math.min(100,d.pct));
      const color=colorRegla(d.pct);
      return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px;height:100%">
        <div style="font-size:8px;font-family:var(--mono);color:var(--text2)">${d.pct===null?'—':d.pct+'%'}</div>
        <div style="width:100%;max-width:36px;height:${h}px;background:${color};border-radius:4px 4px 0 0;transition:height .5s"></div>
      </div>`;
    }).join('');
  }
  if(legend){
    legend.innerHTML=datos.map(d=>{
      const primero=d.mesesVentana[0],ultimo=d.mesesVentana[d.mesesVentana.length-1];
      const [,moIni]=primero.split('-');
      const [,moFin]=ultimo.split('-');
      const etiqueta=periodo===1?monthNames[parseInt(moIni)-1]:`${monthNames[parseInt(moIni)-1]}-${monthNames[parseInt(moFin)-1]}`;
      return `<span>${etiqueta}</span>`;
    }).join('');
  }

  if(desgloseEl){
    if(ultimaConDatos.basicasEntries.length===0){
      desgloseEl.innerHTML='<div style="color:var(--text3);font-size:12px">Sin gastos en categorías básicas en este período.</div>';
    }else{
      const porCat={};
      ultimaConDatos.basicasEntries.forEach(e=>{ porCat[e.cat]=(porCat[e.cat]||0)+entryCOP(e); });
      desgloseEl.innerHTML=Object.entries(porCat).sort((a,b)=>b[1]-a[1]).map(([cat,val])=>{
        const c=col(cat);
        return `<div style="display:flex;justify-content:space-between;font-size:11px;padding:4px 0"><span style="color:${c}">${scat(cat)}</span><span style="font-family:var(--mono)">${fmtCOP(val)}</span></div>`;
      }).join('');
    }
  }
}

/** % del cupo aprobado usado en cada tarjeta, con semáforo: <30% sano, 30-70% vigilar,
 *  >70% afecta el historial crediticio (regla estándar de utilización de crédito). */
function renderUtilizacionCupo(){
  const tarjetas=[
    {acc:'davtc',pctId:'util-dav-pct',fillId:'util-dav-fill',currentId:'util-dav-current',limiteId:'util-dav-limite'},
    {acc:'rappitc',pctId:'util-rappi-pct',fillId:'util-rappi-fill',currentId:'util-rappi-current',limiteId:'util-rappi-limite'},
  ];
  if(!document.getElementById(tarjetas[0].pctId))return;

  const colorUtilizacion=pct=>pct>70?'var(--danger)':pct>30?'var(--warn)':'var(--safe)';
  let deudaTotal=0,cupoTotal=0;

  tarjetas.forEach(({acc,pctId,fillId,currentId,limiteId})=>{
    const deuda=accounts[acc]||0;
    const cupo=CREDIT_LIMITS[acc]||0;
    const pct=cupo>0?Math.min(100,Math.round(deuda/cupo*100)):0;
    const color=colorUtilizacion(pct);
    document.getElementById(pctId).textContent=pct+'%';
    document.getElementById(pctId).style.color=color;
    document.getElementById(fillId).style.width=pct+'%';
    document.getElementById(fillId).style.background=color;
    document.getElementById(currentId).textContent=fmtCOP(deuda);
    document.getElementById(limiteId).textContent='Cupo: '+fmtCOP(cupo);
    deudaTotal+=deuda;
    cupoTotal+=cupo;
  });

  const pctTotal=cupoTotal>0?Math.min(100,Math.round(deudaTotal/cupoTotal*100)):0;
  const totalEl=document.getElementById('util-total-pct');
  if(totalEl){
    totalEl.textContent=pctTotal+'%';
    totalEl.style.color=colorUtilizacion(pctTotal);
  }
}

/** Cargos nuevos (txType='gasto') a tarjetas de crédito este mes, agrupados por categoría.
 *  Ojo: solo new charges — los pagos de deuda son txType='ingreso' en la tarjeta, no entran acá. */
function renderGastoTarjetasCategoria(){
  const el=document.getElementById('credit-cat-list');
  const labelEl=document.getElementById('credit-cat-month-label');
  if(!el)return;

  const monthNames=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  if(labelEl&&currentMonth){
    const [y,mo]=currentMonth.split('-');
    labelEl.textContent='· '+monthNames[parseInt(mo)-1]+' '+y;
  }

  const monthEntries=entries.filter(e=>e.date.slice(0,7)===currentMonth);
  const cargos=monthEntries.filter(e=>e.txType==='gasto'&&['davtc','rappitc'].includes(e.acc)&&e.cat!=='Transferencia'&&e.cat!=='[Ajuste de saldo]'&&e.cat!=='Pago Deuda');

  if(cargos.length===0){
    el.innerHTML='<div class="empty" style="padding:1.5rem">Sin cargos nuevos a tarjetas de crédito este mes.</div>';
    return;
  }

  const bycat={};
  cargos.forEach(e=>{ bycat[e.cat]=(bycat[e.cat]||0)+entryCOP(e); });
  const total=Object.values(bycat).reduce((s,v)=>s+v,0)||1;
  const sorted=Object.entries(bycat).sort((a,b)=>b[1]-a[1]);

  el.innerHTML=sorted.map(([cat,val])=>{
    const c=col(cat);
    const pct=Math.round(val/total*100);
    return `<div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
        <span style="color:${c}">${scat(cat)}</span>
        <span style="font-family:var(--mono)">${fmtCOP(val)} · ${pct}%</span>
      </div>
      <div class="budget-track"><div class="budget-fill" style="width:${pct}%;background:${c}"></div></div>
    </div>`;
  }).join('')+`<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);display:flex;justify-content:space-between;font-size:12px;font-weight:700"><span>Total cargado este mes</span><span style="font-family:var(--mono)">${fmtCOP(total)}</span></div>`;
}

/** Para cada categoría con gasto este mes, qué porción se pagó con tarjeta de crédito
 *  vs efectivo/débito — para detectar dónde se está financiando con crédito lo que
 *  podría pagarse de contado. Solo muestra categorías con algo de crédito (evita llenar
 *  la lista de categorías en 0%). */
function renderCreditoVsLiquidoPorCategoria(){
  const el=document.getElementById('credit-vs-liquido-list');
  if(!el)return;

  const monthEntries=entries.filter(e=>e.date.slice(0,7)===currentMonth);
  const gastos=monthEntries.filter(esGastoReal);

  if(gastos.length===0){
    el.innerHTML='<div class="empty" style="padding:1.5rem">Sin gastos registrados este mes.</div>';
    return;
  }

  const porCategoria={};
  gastos.forEach(e=>{
    const esCredito=ACCOUNTS_META[e.acc]&&ACCOUNTS_META[e.acc].type==='credito';
    if(!porCategoria[e.cat])porCategoria[e.cat]={credito:0,liquido:0};
    porCategoria[e.cat][esCredito?'credito':'liquido']+=entryCOP(e);
  });

  const filas=Object.entries(porCategoria)
    .map(([cat,v])=>({cat,...v,total:v.credito+v.liquido}))
    .filter(f=>f.credito>0)
    .sort((a,b)=>b.total-a.total)
    .slice(0,10);

  if(filas.length===0){
    el.innerHTML='<div class="empty" style="padding:1.5rem">No usaste tarjeta de crédito en ninguna categoría este mes.</div>';
    return;
  }

  el.innerHTML=filas.map(f=>{
    const c=col(f.cat);
    const pctCredito=Math.round(f.credito/f.total*100);
    return `<div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
        <span style="color:${c}">${scat(f.cat)}</span>
        <span style="font-family:var(--mono);color:var(--text2)">${pctCredito}% en tarjeta</span>
      </div>
      <div style="display:flex;height:8px;border-radius:99px;overflow:hidden;background:var(--surface2)">
        <div style="width:${pctCredito}%;background:#FF8C42"></div>
        <div style="width:${100-pctCredito}%;background:var(--safe)"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text3);margin-top:3px;font-family:var(--mono)">
        <span>💳 ${fmtCOP(f.credito)}</span>
        <span>💵 ${fmtCOP(f.liquido)}</span>
      </div>
    </div>`;
  }).join('');
}

/** Últimos n meses en formato YYYY-MM, terminando en el mes actual (calendario, no depende de si hay datos) */
function ultimosMeses(n){
  const meses=[];
  const hoy=new Date();
  for(let i=n-1;i>=0;i--){
    const d=new Date(hoy.getFullYear(),hoy.getMonth()-i,1);
    meses.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  }
  return meses;
}

function renderPatrimonioHistorico(){
  const chart=document.getElementById('networth-history-chart');
  const legend=document.getElementById('networth-history-legend');
  const savingsList=document.getElementById('savings-rate-list');
  if(!chart||!legend||!savingsList)return;

  const monthNames=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const hoy=todayStr().slice(0,7);
  const liquidCOPActual=calcularLiquidezTotal();
  const debtCOPActual=calcularDeudaTotal();

  // Solo desde tu primer movimiento. Reconstruir un mes anterior a que empezaras a registrar
  // da siempre el mismo número (no hay nada que deshacer), y la gráfica salía con media
  // docena de barras idénticas y planas antes de que empezara el historial de verdad.
  const primerMes=entries.length?entries.reduce((min,e)=>e.date<min?e.date:min,entries[0].date).slice(0,7):hoy;

  const datos=ultimosMeses(12).filter(m=>m>=primerMes).map(m=>{
    if(m===hoy)return {mes:m,neto:liquidCOPActual-debtCOPActual};
    const p=calcularPatrimonioMes(m);
    return p?{mes:m,neto:p.neto}:null;
  }).filter(Boolean);

  if(datos.length<2){
    chart.innerHTML='<div style="color:var(--text3);font-size:12px;margin:auto">Necesitas al menos 2 meses de historial para ver la tendencia</div>';
    legend.innerHTML='';
    savingsList.innerHTML='';
    return;
  }

  const maxAbs=Math.max(...datos.map(d=>Math.abs(d.neto)),1);
  chart.innerHTML=datos.map(d=>{
    const h=Math.max(4,Math.round(Math.abs(d.neto)/maxAbs*100));
    const color=d.neto>=0?'var(--safe)':'var(--danger)';
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px;height:100%">
      <div style="font-size:8px;font-family:var(--mono);color:var(--text2);white-space:nowrap">${(d.neto/1000000).toFixed(1)}M</div>
      <div style="width:100%;max-width:32px;height:${h}px;background:${color};border-radius:4px 4px 0 0;transition:height .5s"></div>
    </div>`;
  }).join('');
  legend.innerHTML=datos.map(d=>{
    const [,mo]=d.mes.split('-');
    return `<span>${monthNames[parseInt(mo)-1]}</span>`;
  }).join('');

  // Tasa de ahorro: (ingresos − gastos) / ingresos, mismos filtros que usa el desglose del mes
  savingsList.innerHTML=datos.slice(-6).map(d=>{
    const [y,mo]=d.mes.split('-');
    const monthEntries=entries.filter(e=>e.date.slice(0,7)===d.mes);
    const ingresos=monthEntries.filter(esIngresoReal).reduce((s,e)=>s+entryCOP(e),0);
    const gastos=monthEntries.filter(esGastoReal).reduce((s,e)=>s+entryCOP(e),0);
    const tasa=ingresos>0?Math.round((ingresos-gastos)/ingresos*100):null;
    const color=tasa===null?'var(--text3)':tasa>=20?'var(--safe)':tasa>=0?'var(--warn)':'var(--danger)';
    const texto=tasa===null?'sin ingresos registrados':`${tasa>=0?'+':''}${tasa}%`;
    return `<div style="display:flex;justify-content:space-between"><span>${monthNames[parseInt(mo)-1]} ${y}</span><span style="color:${color};font-family:var(--mono);font-weight:600">${texto}</span></div>`;
  }).join('');
}

/**
 * Un gasto hormiga es una FUGA: pequeña, repetida y evitable — el almuerzo de todos los días,
 * la suscripción que nadie usa, el parqueadero. Lo que la define no es que se repita, sino que
 * cada compra sea tan pequeña que no duele, y que al año sume una cifra que sí duele.
 *
 * Antes esta métrica solo pedía "el mismo nombre en 2+ meses", así que listaba el arriendo, la
 * EPS, el aporte a inversión y los intereses de la tarjeta como si fueran fugas. Son justo lo
 * contrario: decisiones grandes y deliberadas, que además dominaban la lista por monto y
 * tapaban las fugas de verdad.
 *
 * Ahora se piden las tres cosas a la vez:
 *   1. cada compra por debajo de TOPE_HORMIGA_UNITARIO
 *   2. el mismo gasto en 2 o más meses distintos
 *   3. que no sea una obligación fija, una necesidad básica ni ahorro/inversión
 */
const TOPE_HORMIGA_UNITARIO=120000; // COP por compra — súbelo o bájalo según lo que consideres "pequeño"

// Obligaciones fijas, necesidades básicas y movimientos de ahorro/deuda: se repiten cada mes,
// pero recortarlos no es "dejar de gastar de más", así que no son fugas.
const CATS_EXCLUIDAS_HORMIGA=new Set([
  'Arriendo','Salud','Servicios',            // obligaciones y necesidades
  'Alimentación · Mercado',                  // comida de casa, no gasto discrecional
  'Pago Deuda','Intereses','Comisión',       // costo financiero
  'Inversiones',                             // es ahorro, no gasto
  'Vehículo · Seguros','Vehículo · Taller',  // irregulares y obligatorios
]);
// Nombres que tampoco son fuga aunque caigan en una categoría genérica como "Otro".
const NOMBRES_EXCLUIDOS_HORMIGA=/donaci|aporte|diezmo|ofrenda|ahorro|arriendo|inversi/i;
// Sinónimos que deben agruparse como el mismo gasto (ej. Rent = Arriendo).
const SINONIMOS_HORMIGA={rent:'arriendo'};

function renderGastoHormiga(){
  const el=document.getElementById('gasto-hormiga-list');
  if(!el)return;
  const gastos=entries.filter(e=>
    esGastoReal(e)
    &&!CATS_EXCLUIDAS_HORMIGA.has(e.cat)
    &&!NOMBRES_EXCLUIDOS_HORMIGA.test(e.name)
    &&entryCOP(e)<=TOPE_HORMIGA_UNITARIO // una compra grande nunca es hormiga, se repita o no
  );
  const grupos={};
  gastos.forEach(e=>{
    let clave=e.name.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ');
    if(!clave)return;
    if(SINONIMOS_HORMIGA[clave])clave=SINONIMOS_HORMIGA[clave];
    if(!grupos[clave])grupos[clave]={nombre:e.name,meses:new Set(),total:0,compras:0,cat:e.cat,ultimaFecha:e.date};
    grupos[clave].meses.add(e.date.slice(0,7));
    grupos[clave].total+=entryCOP(e);
    grupos[clave].compras++;
    if(e.date>grupos[clave].ultimaFecha){ grupos[clave].ultimaFecha=e.date; grupos[clave].nombre=e.name; }
  });
  const recurrentes=Object.values(grupos)
    .filter(g=>g.meses.size>=2)
    .map(g=>{
      const mesesCount=g.meses.size;
      const promedioMensual=g.total/mesesCount;
      return {...g,mesesCount,promedioMensual,anual:promedioMensual*12,
              promedioPorCompra:g.total/g.compras};
    })
    .sort((a,b)=>b.anual-a.anual)
    .slice(0,10);

  if(recurrentes.length===0){
    el.innerHTML=`<div style="color:var(--text3);font-size:12px;padding:8px 0">Sin fugas detectadas. Se cuentan compras de menos de ${fmtCOP(TOPE_HORMIGA_UNITARIO)} que repites en 2 o más meses — el arriendo, la EPS o los aportes no cuentan, porque no son gastos que se te escapen.</div>`;
    return;
  }

  el.innerHTML=recurrentes.map(g=>{
    const c=col(g.cat);
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
      <div style="min-width:0">
        <div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(g.nombre)}</div>
        <div style="font-size:9px;color:var(--text3)"><span style="color:${c}">${scat(g.cat)}</span> · ${g.compras} compras de ~${fmtCOP(g.promedioPorCompra)} · ${g.mesesCount} meses · ~${fmtCOP(g.promedioMensual)}/mes</div>
      </div>
      <div style="text-align:right;flex-shrink:0;padding-left:10px">
        <div style="font-family:var(--mono);font-weight:700;font-size:13px">${fmtCOP(g.anual)}</div>
        <div style="font-size:8px;color:var(--text3);text-transform:uppercase">al año</div>
      </div>
    </div>`;
  }).join('');
}

function renderDebtProjection(){
  const el=document.getElementById('debt-projection');
  if(!el)return;
  const pagosDeuda=entries.filter(e=>e.cat==='Pago Deuda'&&e.txType!=='ingreso');
  const totalDeuda=calcularDeudaTotal();

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
  entries.filter(esGastoReal).forEach(e=>{
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

  const gastosReales=entries.filter(esGastoReal);
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

