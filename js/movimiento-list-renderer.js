// movimiento-list-renderer.js
// Primera pieza construida con Programación Orientada a Objetos en este proyecto.
// El resto del código sigue siendo funciones + estado global (así se construyó
// originalmente) — convertir TODO el proyecto a clases es una reescritura grande
// y arriesgada para una app en producción; esto es el punto de partida para
// hacerlo gradualmente, sesión por sesión, sin romper lo que ya funciona.

class MovimientoListRenderer {
  /**
   * @param {Array} entries - movimientos ya filtrados y ordenados
   * @param {'fecha'|'cuenta'} agruparPor - de qué va el encabezado de cada grupo
   */
  constructor(entries, agruparPor = 'fecha'){
    this.entries = entries;
    this.agruparPor = agruparPor;
  }

  /** Agrupa por fecha o por cuenta, preservando el orden de entrada */
  agrupar(){
    const grupos = new Map();
    for(const e of this.entries){
      const clave = this.agruparPor === 'cuenta' ? e.acc : e.date;
      if(!grupos.has(clave)) grupos.set(clave, []);
      grupos.get(clave).push(e);
    }
    return grupos;
  }

  /** Subtotal neto del grupo: gastos suman, ingresos restan, transferencias no cuentan */
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

  renderEncabezadoGrupo(clave, itemsDelGrupo){
    const subtotal = this.subtotalDelDia(itemsDelGrupo);
    const colorSubtotal = subtotal > 0 ? 'var(--text2)' : subtotal < 0 ? 'var(--accent)' : 'var(--text3)';
    const titulo = this.agruparPor === 'cuenta'
      ? esc((ACCOUNTS_META[clave] || {}).label || 'Cuenta eliminada')
      : MovimientoListRenderer.fechaLarga(clave);
    return `<div class="date-group-header">
      <span>${titulo}</span>
      <span style="color:${colorSubtotal}">${subtotal===0?'—':fmtCOP(Math.abs(subtotal))}</span>
    </div>`;
  }

  renderFila(e){
    const c = col(e.cat);
    // Una cuenta borrada deja movimientos apuntando a un slug que ya no existe: sin este
    // respaldo, meta.currency lanzaba y abortaba el render de la lista completa.
    const meta = ACCOUNTS_META[e.acc] || { label: 'Cuenta eliminada', currency: 'COP', type: 'debito' };
    const displayCurrency = e.currency || meta.currency;
    const isIncome = e.txType === 'ingreso';
    const amtStr = (displayCurrency === 'USD' ? fmtUSD(e.amount) : fmtCOP(e.amount));
    const cop = entryCOP(e);
    const esAnomalia = cop > 5000000;
    const cardColor = e.acc === 'davtc' ? '#EF4444' : e.acc === 'rappitc' ? '#FF8C42' : null;
    const borderStyle = esAnomalia
      ? 'border-left:3px solid var(--danger)'
      : cardColor ? `border-left:3px solid ${cardColor}` : '';

    return `<div class="entry-row" data-id="${e.id}">
      <div class="entry-row-swipe-bg" aria-hidden="true">🗑 Eliminar</div>
      <div class="entry-row-content" style="${borderStyle};cursor:pointer" onclick="openEditEntryModal('${e.id}')">
        <div class="entry-row-top">
          <span class="avatar-square" style="background:${c};width:44px;height:44px;font-size:18px;border-radius:8px;flex-shrink:0;display:flex;align-items:center;justify-content:center">${esc(e.name.charAt(0).toUpperCase())}</span>
          <div style="flex:1;min-width:0">
            <div class="entry-name">${esAnomalia ? '⚠️ ' : ''}${esc(e.name)}</div>
            ${this.agruparPor === 'cuenta' ? `<span class="entry-date">${fmtDate(e.date)}</span> ` : ''}
            <span class="entry-cat" style="background:${c}22;color:${c}">${scat(e.cat)}</span>
          </div>
          <div class="entry-amount-group">
            <span class="entry-amount" style="color:${esAnomalia ? 'var(--danger)' : isIncome ? 'var(--accent)' : 'var(--text)'}">${isIncome ? '+' : ''}${amtStr}</span>
          </div>
        </div>
      </div>
    </div>`;
  }

  /** HTML completo: un encabezado con subtotal seguido de sus movimientos, por cada grupo */
  render(){
    if(this.entries.length === 0) return '<div class="empty">📋 Sin movimientos</div>';
    let html = '';
    for(const [clave, items] of this.agrupar()){
      html += this.renderEncabezadoGrupo(clave, items);
      html += items.map(e => this.renderFila(e)).join('');
    }
    return html;
  }
}
