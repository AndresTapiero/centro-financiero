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

