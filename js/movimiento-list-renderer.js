// movimiento-list-renderer.js
// Primera pieza construida con Programación Orientada a Objetos en este proyecto.
// El resto del código sigue siendo funciones + estado global (así se construyó
// originalmente) — convertir TODO el proyecto a clases es una reescritura grande
// y arriesgada para una app en producción; esto es el punto de partida para
// hacerlo gradualmente, sesión por sesión, sin romper lo que ya funciona.

class MovimientoListRenderer {
  /**
   * @param {Array} entries - movimientos ya filtrados y ordenados (más reciente primero)
   */
  constructor(entries){
    this.entries = entries;
  }

  /** Agrupa los movimientos por fecha (YYYY-MM-DD), preservando el orden de entrada */
  agruparPorFecha(){
    const grupos = new Map();
    for(const e of this.entries){
      if(!grupos.has(e.date)) grupos.set(e.date, []);
      grupos.get(e.date).push(e);
    }
    return grupos;
  }

  /** Subtotal neto del día: gastos suman, ingresos restan, transferencias no cuentan */
  subtotalDelDia(itemsDelDia){
    return itemsDelDia.reduce((suma, e) => {
      if(e.cat === 'Transferencia') return suma;
      const cop = entryCOP(e);
      return suma + (e.txType === 'ingreso' ? -cop : cop);
    }, 0);
  }

  /** Fecha larga en español, ej: "28 de junio de 2026" */
  static fechaLarga(fechaISO){
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const [y, m, d] = fechaISO.split('-').map(Number);
    return `${d} de ${meses[m-1]} de ${y}`;
  }

  renderEncabezadoGrupo(fechaISO, itemsDelDia){
    const subtotal = this.subtotalDelDia(itemsDelDia);
    const colorSubtotal = subtotal > 0 ? 'var(--text2)' : subtotal < 0 ? 'var(--accent)' : 'var(--text3)';
    return `<div class="date-group-header">
      <span>${MovimientoListRenderer.fechaLarga(fechaISO)}</span>
      <span style="color:${colorSubtotal}">${subtotal===0?'—':fmtCOP(Math.abs(subtotal))}</span>
    </div>`;
  }

  renderFila(e){
    const c = col(e.cat);
    const meta = ACCOUNTS_META[e.acc];
    const displayCurrency = e.currency || meta.currency;
    const isIncome = e.txType === 'ingreso';
    const amtStr = (displayCurrency === 'USD' ? fmtUSD(e.amount) : fmtCOP(e.amount));
    const saldoActual = meta.currency === 'USD' ? '$' + accounts[e.acc] + ' USD' : fmtCOP(accounts[e.acc]);
    const cop = entryCOP(e);
    const esAnomalia = cop > 5000000;
    const cardColor = e.acc === 'davtc' ? '#EF4444' : e.acc === 'rappitc' ? '#FF8C42' : null;
    const borderStyle = esAnomalia
      ? 'background:rgba(255,107,107,.12);border-left:3px solid var(--danger)'
      : cardColor ? `border-left:3px solid ${cardColor}` : '';

    return `<div class="entry-row" style="${borderStyle};cursor:pointer" onclick="openEditEntryModal('${e.id}')">
      <div class="entry-row-top">
        <span class="avatar-square" style="background:${c};width:28px;height:28px;font-size:11px;border-radius:8px">${e.name.charAt(0).toUpperCase()}</span>
        <div class="entry-name">${esAnomalia ? '⚠️ ' : ''}${e.name}</div>
        <span class="entry-amount" style="color:${esAnomalia ? 'var(--danger)' : isIncome ? 'var(--accent)' : 'var(--text)'}">${isIncome ? '+' : '−'}${amtStr}</span>
      </div>
      <div class="entry-row-bottom">
        <span class="entry-cat" style="background:${c}22;color:${c}">${scat(e.cat)}</span>
        <span class="entry-acc">${meta.label} · ${saldoActual}${e.vehiculo ? ' · 🚗 ' + e.vehiculo : ''}${esAnomalia ? ' · <span style="color:var(--danger)">monto alto</span>' : ''}</span>
      </div>
      <div class="entry-actions">
        ${esAnomalia ? `<button class="entry-icon-btn" style="width:auto;padding:0 8px" onclick="event.stopPropagation();fixCurrency('${e.id}')">💱 Era COP</button>` : ''}
        <button class="entry-del-btn" onclick="event.stopPropagation();deleteEntry('${e.id}')" title="Eliminar">×</button>
      </div>
    </div>`;
  }

  /** Devuelve el HTML completo: un encabezado de fecha con subtotal, seguido de sus movimientos, por cada día */
  render(){
    if(this.entries.length === 0) return '<div class="empty">📋 Sin movimientos</div>';
    const grupos = this.agruparPorFecha();
    let html = '';
    for(const [fecha, items] of grupos){
      html += this.renderEncabezadoGrupo(fecha, items);
      html += items.map(e => this.renderFila(e)).join('');
    }
    return html;
  }
}
