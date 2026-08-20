// pendiente-list-renderer.js
// Segunda clase OOP del proyecto, hermana de MovimientoListRenderer — mismo patrón:
// agrupar por fecha con un subtotal por día. Aquí además cada fila indica si está
// vencida o próxima a vencer (dentro de 3 días), algo que Movimientos no necesita.

class PendienteListRenderer {
  /**
   * @param {Array} pendientes - lista completa de pendientes (no necesita venir ordenada)
   * @param {string} hoy - fecha de hoy en formato YYYY-MM-DD
   */
  constructor(pendientes, hoy){
    this.pendientes = [...pendientes].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    this.hoy = hoy;
  }

  /** Agrupa por fecha; los pendientes sin fecha quedan aparte, al final */
  agruparPorFecha(){
    const grupos = new Map();
    const sinFecha = [];
    for(const p of this.pendientes){
      if(!p.date){ sinFecha.push(p); continue; }
      if(!grupos.has(p.date)) grupos.set(p.date, []);
      grupos.get(p.date).push(p);
    }
    return { grupos, sinFecha };
  }

  /** Convierte el monto de un pendiente a COP, igual que entryCOP() para movimientos */
  montoCOP(p){
    const meta = ACCOUNTS_META[p.acc];
    if(!meta) return p.amount; // cuenta eliminada — se devuelve sin convertir, igual que entryCOP()
    return meta.currency === 'USD' ? p.amount * accounts.trm : p.amount;
  }

  subtotalDelDia(itemsDelDia){
    return itemsDelDia.reduce((suma, p) => suma + (p.isIncome ? -this.montoCOP(p) : this.montoCOP(p)), 0);
  }

  /** 'vencido' | 'proximo' (≤3 días) | 'normal' — los ingresos nunca se marcan como vencidos */
  estadoDe(p){
    if(p.isIncome || !p.date) return 'normal';
    if(p.date < this.hoy) return 'vencido';
    const diffDias = Math.round((new Date(p.date + 'T00:00:00') - new Date(this.hoy + 'T00:00:00')) / 86400000);
    return diffDias <= 3 ? 'proximo' : 'normal';
  }

  renderEncabezadoGrupo(fechaISO, itemsDelDia){
    const subtotal = this.subtotalDelDia(itemsDelDia);
    return `<div class="date-group-header">
      <span>${MovimientoListRenderer.fechaLarga(fechaISO)}</span>
      <span>${fmtCOP(subtotal)}</span>
    </div>`;
  }

  renderFila(p){
    // Respaldo por si la cuenta fue eliminada: sin esto, meta.currency lanzaba y abortaba
    // el render de toda la lista de pendientes.
    const meta = ACCOUNTS_META[p.acc] || { label: 'Cuenta eliminada', currency: 'COP', type: 'debito' };
    const c = p.isIncome ? '#22D3B0' : col(p.cat, p.name);
    const montoStr = meta.currency === 'USD' ? fmtUSD(p.amount) : fmtCOP(p.amount);

    const estado = this.estadoDe(p);
    const estiloFila = estado === 'vencido' ? 'background:rgba(255,107,107,.1);border-left:3px solid var(--danger)'
      : estado === 'proximo' ? 'background:rgba(255,179,71,.08);border-left:3px solid var(--warn)'
      : '';
    const prefijoNombre = estado === 'vencido' ? '🔴 VENCIDO — ' : estado === 'proximo' ? '⏰ PRONTO — ' : p.isIncome ? '💰 ' : '';
    const colorPunto = estado === 'vencido' ? 'var(--danger)' : estado === 'proximo' ? 'var(--warn)' : c;
    const colorMonto = p.isIncome ? 'var(--accent)' : estado === 'vencido' ? 'var(--danger)' : estado === 'proximo' ? 'var(--warn)' : 'var(--text)';

    return `<div class="entry-row" data-id="${p.id}" style="--swipe-left-bg:var(--danger);--swipe-right-bg:var(--accent)">
      <div class="entry-row-swipe-bg entry-row-swipe-bg-pendiente" aria-hidden="true">
        <span class="swipe-right-text" style="position:absolute;left:16px">${p.isIncome ? '💰 Recibir' : '✓ Pagar'}</span>
        <span class="swipe-left-text" style="position:absolute;right:16px">🗑 Eliminar</span>
      </div>
      <div class="entry-row-content" style="${estiloFila};cursor:pointer" onclick="editPendiente('${p.id}')">
        <div class="entry-row-top">
          <span class="avatar-square" style="background:${colorPunto};width:44px;height:44px;font-size:18px;border-radius:8px;flex-shrink:0;display:flex;align-items:center;justify-content:center">${esc(p.name.charAt(0).toUpperCase())}</span>
          <div style="flex:1;min-width:0">
            <div class="entry-name">${prefijoNombre}${esc(p.name)}</div>
            <span class="entry-cat" style="background:${c}22;color:${c}">${scat(p.cat)}</span>
          </div>
          <div class="entry-amount-group">
            <span class="entry-amount" style="color:${colorMonto}">${p.isIncome ? '+' : ''}${montoStr}</span>
          </div>
        </div>
      </div>
    </div>`;
  }

  render(){
    if(this.pendientes.length === 0) return '<div class="empty">✅ Sin pendientes — todo al día</div>';
    const { grupos, sinFecha } = this.agruparPorFecha();
    let html = '';
    for(const [fecha, items] of grupos){
      html += this.renderEncabezadoGrupo(fecha, items);
      html += items.map(p => this.renderFila(p)).join('');
    }
    if(sinFecha.length){
      html += `<div class="date-group-header"><span>Sin fecha</span><span>—</span></div>`;
      html += sinFecha.map(p => this.renderFila(p)).join('');
    }
    return html;
  }
}
