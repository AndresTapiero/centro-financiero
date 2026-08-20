let _confirmResolver=null;
function customConfirm(mensaje,opciones={}){
  return new Promise(resolve=>{
    _confirmResolver=resolve;
    document.getElementById('confirm-modal-text').textContent=mensaje;
    const btnYes=document.getElementById('confirm-btn-yes');
    const btnNo=document.getElementById('confirm-btn-no');
    btnYes.textContent=opciones.textoSi||'Sí, eliminar';
    if(opciones.soloOk){
      btnYes.textContent=opciones.textoSi||'Entendido';
      btnNo.style.display='none';
    }else{
      btnNo.style.display='block';
    }
    document.getElementById('confirm-modal').style.display='flex';
  });
}
function resolverConfirm(valor){
  document.getElementById('confirm-modal').style.display='none';
  if(_confirmResolver){ _confirmResolver(valor); _confirmResolver=null; }
}

let _payResolver=null;
function customAccountPrompt(mensaje,accSugerida){
  return new Promise(resolve=>{
    _payResolver=resolve;
    document.getElementById('pay-modal-text').textContent=mensaje;
    const sel=document.getElementById('pay-modal-account');
    sel.innerHTML=Object.keys(ACCOUNTS_META).map(k=>`<option value="${k}">${ACCOUNTS_META[k].label}</option>`).join('');
    sel.value=accSugerida;
    document.getElementById('pay-modal').style.display='flex';
  });
}
function resolverPayModal(confirmado){
  document.getElementById('pay-modal').style.display='none';
  if(_payResolver){
    _payResolver(confirmado?document.getElementById('pay-modal-account').value:null);
    _payResolver=null;
  }
}


// ─── Accesibilidad compartida de los modales ────────────────────────────────
// Los 9 modales solo se cerraban con el ratón o la ×, y tabular con uno abierto
// se escapaba al contenido de atrás. Esto lo resuelve una sola vez para todos.

const MODALES = {
  'confirm-modal':          ()=>resolverConfirm(false),
  'pay-modal':              ()=>resolverPayModal(false),
  'nueva-cuenta-modal':     ()=>resolverNuevaCuentaModal(false),
  'cat-picker-modal':       ()=>cerrarCatPicker(),
  'express-modal':          ()=>cerrarModalExpress(),
  'nuevo-movimiento-modal': ()=>cerrarModalNuevoMovimiento(),
  'edit-entry-modal':       ()=>resolverEditEntryModal(false),
  'edit-pendiente-modal':   ()=>resolverEditPendienteModal(false),
  'export-fallback-modal':  ()=>cerrarExportFallback(),
};

const FOCUSABLES='a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** El modal visible que está más arriba (mayor z-index); null si no hay ninguno abierto. */
function modalAbierto(){
  let arriba=null,zArriba=-1;
  for(const id of Object.keys(MODALES)){
    const el=document.getElementById(id);
    if(!el||el.style.display==='none'||el.style.display==='')continue;
    const z=parseInt(getComputedStyle(el).zIndex,10)||0;
    if(z>=zArriba){ zArriba=z; arriba=el; }
  }
  return arriba;
}

document.addEventListener('keydown',e=>{
  const modal=modalAbierto();
  if(!modal)return;

  if(e.key==='Escape'){
    e.preventDefault();
    const cerrar=MODALES[modal.id];
    if(cerrar)cerrar();
    return;
  }

  // Focus trap: con un modal abierto, Tab no debe salirse al fondo.
  if(e.key==='Tab'){
    const focusables=[...modal.querySelectorAll(FOCUSABLES)].filter(el=>el.offsetParent!==null);
    if(focusables.length===0)return;
    const primero=focusables[0], ultimo=focusables[focusables.length-1];
    if(e.shiftKey&&document.activeElement===primero){ e.preventDefault(); ultimo.focus(); }
    else if(!e.shiftKey&&document.activeElement===ultimo){ e.preventDefault(); primero.focus(); }
    else if(!modal.contains(document.activeElement)){ e.preventDefault(); primero.focus(); }
  }
});
