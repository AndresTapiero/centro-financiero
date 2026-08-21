// ─── Modal Express ──────────────────────────────────────────────────────────

let _expressTipo = 'gasto';

function onExpressAccountChange(){
  const acc=document.getElementById('express-account').value;
  const meta=ACCOUNTS_META[acc]||(typeof dynamicAccounts!=='undefined'&&dynamicAccounts[acc]);
  if(!meta) return;
  const amtInp=document.getElementById('express-amount');
  const isUSD=meta.currency==='USD';
  setAmountInputMode(amtInp,isUSD,'0');
  const hint=document.getElementById('express-currency-hint');
  if(hint){
    hint.textContent=isUSD?'🌎 USD — escribe con decimales, ej: 10.40':'';
    hint.style.display=isUSD?'block':'none';
  }
}

function abrirModalExpress() {
  const ultimo = entries.find(e => e.txType === 'gasto') || entries[0];

  document.getElementById('express-amount').value = '';
  document.getElementById('express-name').value = '';
  document.getElementById('express-suggest').style.display = 'none';

  // Heredar opciones de categoría del modal completo (siempre actualizadas)
  document.getElementById('express-category').innerHTML =
    document.getElementById('inp-cat').innerHTML;

  if (ultimo) {
    const accOpt = document.querySelector(`#express-account option[value="${ultimo.acc}"]`);
    if (accOpt) document.getElementById('express-account').value = ultimo.acc;
    const catOpt = document.querySelector(`#express-category option[value="${ultimo.cat}"]`);
    if (catOpt) document.getElementById('express-category').value = ultimo.cat;
  }
  actualizarBtnCat('express-category');
  onExpressAccountChange();

  setTipoExpress('gasto');
  document.getElementById('express-modal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('express-amount').focus(), 80);
}

function cerrarModalExpress() {
  document.getElementById('express-modal').style.display = 'none';
  document.body.style.overflow = '';
}

function setTipoExpress(tipo) {
  _expressTipo = tipo;
  document.getElementById('express-tab-gasto').classList.toggle('active', tipo === 'gasto');
  document.getElementById('express-tab-ingreso').classList.toggle('active', tipo === 'ingreso');
}

function suggestCategoryExpress() {
  const text = document.getElementById('express-name').value
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  if (text.length < 3) { document.getElementById('express-suggest').style.display = 'none'; return; }
  const cat = document.getElementById('express-category');
  const rule = reglaSugerida(text); // misma lógica de coincidencia que el modal completo
  if (rule) {
    const catFinal = rule.special === 'comida'
      ? ([0, 6].includes(new Date().getDay())
        ? 'Alimentación · Comidas afuera · Fin de semana'
        : 'Alimentación · Comidas afuera · Entre semana')
      : rule.cat;
    const opts = [...cat.options].map(o => o.value);
    if (opts.includes(catFinal)) {
      cat.value = catFinal;
      // El <select> está oculto: lo que se ve es el botón con el punto de color y la
      // etiqueta. Sin esto el valor cambiaba pero el botón seguía mostrando la categoría
      // anterior — al abrir el picker aparecía la correcta marcada, pero la pantalla no.
      actualizarBtnCat('express-category');
      document.getElementById('express-suggest').style.display = 'block';
    }
    return;
  }
  document.getElementById('express-suggest').style.display = 'none';
}

function expandirAModalCompleto() {
  const amount = document.getElementById('express-amount').value;
  const name   = document.getElementById('express-name').value;
  const acc    = document.getElementById('express-account').value;
  const cat    = document.getElementById('express-category').value;
  const tipo   = _expressTipo;
  cerrarModalExpress();
  abrirModalNuevoMovimiento();
  document.getElementById('inp-name').value    = name;
  document.getElementById('inp-account').value = acc;
  document.getElementById('inp-cat').value     = cat;
  // abrirModalNuevoMovimiento() ya pintó el botón de categoría, pero con el valor anterior:
  // la categoría que traemos del express se asigna aquí, después. Sin este refresco el modal
  // se abría mostrando una categoría y guardaba otra.
  actualizarBtnCat('inp-cat');
  setTipoMovimiento(tipo);
  onAccountChange(); // configura el tipo de input (number vs text) según la cuenta
  document.getElementById('inp-amount').value  = amount; // después de configurar el modo
}

async function addEntryExpress() {
  const name   = document.getElementById('express-name').value.trim();
  const amount = redondear3(parseMontoFormateado(document.getElementById('express-amount').value));
  if (!name) { toastError('⚠ Escribe una descripción'); marcarInvalido(document.getElementById('express-name')); return; }
  if (isNaN(amount) || amount <= 0) { toastError('⚠ El monto debe ser mayor a 0'); marcarInvalido(document.getElementById('express-amount')); return; }
  // Popula el formulario principal en silencio y delega a addEntry()
  document.getElementById('inp-name').value    = name;
  document.getElementById('inp-account').value = document.getElementById('express-account').value;
  document.getElementById('inp-cat').value     = document.getElementById('express-category').value;
  document.getElementById('inp-date').value    = todayStr();
  document.getElementById('inp-type').value    = _expressTipo;
  setTipoMovimiento(_expressTipo);
  onAccountChange(); // configura tipo de input antes de asignar el monto
  document.getElementById('inp-amount').value  = document.getElementById('express-amount').value;
  cerrarModalExpress();
  await addEntry();
}

// ─── Category picker ────────────────────────────────────────────────────────

let _catPickerTargetId = null;

function abrirCatPicker(targetId) {
  _catPickerTargetId = targetId;
  const sel = document.getElementById(targetId);
  if (!sel) return;
  const currentVal = sel.value;

  let html = '';
  for (const group of sel.querySelectorAll('optgroup')) {
    html += `<div style="font-size:9px;text-transform:uppercase;letter-spacing:.8px;color:var(--text3);margin:14px 0 8px">${esc(group.label)}</div>`;
    html += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:2px">';
    for (const opt of group.querySelectorAll('option')) {
      const c = col(opt.value);
      const active = opt.value === currentVal;
      html += `<button data-val="${esc(opt.value)}" onclick="seleccionarCatPicker(this.dataset.val)"
        style="background:${c}${active?'30':'15'};color:${c};border:1.5px solid ${c}${active?'':' transparent'};border-radius:99px;padding:5px 13px;font-size:11px;font-weight:600;cursor:pointer;line-height:1.3;transition:border-color .1s,background .1s">
        ${active ? '✓ ' : ''}${esc(scat(opt.value))}</button>`;
    }
    html += '</div>';
  }
  document.getElementById('cat-picker-list').innerHTML = html;
  document.getElementById('cat-picker-modal').style.display = 'flex';
}

function seleccionarCatPicker(value) {
  const sel = document.getElementById(_catPickerTargetId);
  if (sel) { sel.value = value; sel.dispatchEvent(new Event('change')); }
  actualizarBtnCat(_catPickerTargetId);
  cerrarCatPicker();
}

function cerrarCatPicker() {
  document.getElementById('cat-picker-modal').style.display = 'none';
  _catPickerTargetId = null;
}

function actualizarBtnCat(selectId) {
  const btn  = document.getElementById('cat-btn-' + selectId);
  const dot  = document.getElementById('cat-dot-' + selectId);
  const lbl  = document.getElementById('cat-label-' + selectId);
  if (!btn) return;
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const c = col(sel.value);
  if (dot) { dot.style.background = c; }
  if (lbl) { lbl.textContent = scat(sel.value) || 'Categoría'; }
  btn.style.borderColor = c + '55';
}

// ─── Badge pendientes próximos ───────────────────────────────────────────────

function actualizarBadgePendientes() {
  const badge = document.getElementById('pendientes-badge');
  if (!badge) return;
  const limite = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const urgentes = pendientes.filter(p => {
    if (!p.date || p.isIncome) return false;
    return new Date(p.date + 'T00:00:00') <= limite;
  });
  badge.style.display = urgentes.length > 0 ? 'inline-block' : 'none';
}

// ─── Notificaciones ──────────────────────────────────────────────────────────

function actualizarBtnNotif() {
  const btn = document.getElementById('notif-btn');
  if (!btn || !('Notification' in window)) { if (btn) btn.style.display = 'none'; return; }
  if (Notification.permission === 'granted') {
    btn.textContent = '🔔 Notificaciones activas';
    btn.disabled = true; btn.style.opacity = '.45';
  } else if (Notification.permission === 'denied') {
    btn.textContent = '🔕 Notificaciones bloqueadas';
    btn.disabled = true; btn.style.opacity = '.45';
  }
}

async function pedirPermisoNotificaciones() {
  if (!('Notification' in window)) { alert('Tu navegador no soporta notificaciones.'); return; }
  const permiso = await Notification.requestPermission();
  actualizarBtnNotif();
  if (permiso === 'granted') mostrarNotificacionPendientes(true);
}

function mostrarNotificacionPendientes(forzar = false) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!forzar) {
    if (localStorage.getItem('cf_notif_fecha') === todayStr()) return;
  }
  const limite3 = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const urgentes = pendientes.filter(p => {
    if (!p.date || p.isIncome) return false;
    return new Date(p.date + 'T00:00:00') <= limite3;
  });
  if (urgentes.length === 0) return;
  localStorage.setItem('cf_notif_fecha', todayStr());
  const nombres = urgentes.slice(0, 2).map(p => p.name).join(', ');
  const body = urgentes.length === 1
    ? `"${nombres}" vence en los próximos 3 días`
    : `${urgentes.length} pendientes por vencer: ${nombres}${urgentes.length > 2 ? '…' : ''}`;
  new Notification('💰 Centro Financiero', { body });
}
