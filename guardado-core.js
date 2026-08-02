let entries=[];
let pendingSaves=0; // contador de guardados en curso — evita que la sincronización pise cambios recién hechos
const BUILD_VERSION='2026-08-01.movimientos-rediseñado'; // súbelo cada vez que se publique una versión nueva — sirve para confirmar que celular y PC corren el mismo código

let ultimoErrorGuardado=null;

function registrarErrorDiagnostico(key,err,dataStr){
  ultimoErrorGuardado={
    key,
    mensaje:err?(err.message||String(err)):'Error desconocido',
    hora:new Intl.DateTimeFormat('es-CO',{timeZone:'America/Bogota',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date()),
    tamKB:dataStr!==undefined?(new Blob([dataStr]).size/1024).toFixed(1):'—'
  };
  console.error(`Error real en ${key}:`,err);
}

// Reintenta el guardado ante fallas transitorias del servicio (ej: "Unexpected response type")
// antes de darse por vencido. Usado por todos los guardados normales, no solo por "Guardar y verificar".
async function setConReintentos(key,dataStr,maxIntentos=5){
  let ultimoError=null;
  for(let i=0;i<maxIntentos;i++){
    try{
      await window.storage.set(key,dataStr);
      return true;
    }catch(e){
      ultimoError=e;
    }
    if(i<maxIntentos-1)await new Promise(r=>setTimeout(r,600*(i+1)));
  }
  registrarErrorDiagnostico(key,ultimoError,dataStr);
  return false;
}

async function getConReintentos(key,maxIntentos=3){
  let ultimoError=null;
  for(let i=0;i<maxIntentos;i++){
    try{
      return await window.storage.get(key);
    }catch(e){
      ultimoError=e;
    }
    if(i<maxIntentos-1)await new Promise(r=>setTimeout(r,500*(i+1)));
  }
  registrarErrorDiagnostico(key+' (lectura)',ultimoError);
  return null;
}

// Guardado escalonado: agrupa cambios rápidos en una sola escritura por clave y separa
// en el tiempo las distintas claves (entries/accounts/pendientes/config) para no dispararlas
// todas de golpe — eso era lo que agotaba el límite de solicitudes justo al abrir la app.
const _saveTimers={};
const _pendingSaveData={};
const SAVE_DELAY_MS={entries_v3:300,accounts_v3:900,pendientes_v3:1500,config_v1:2100};

function scheduleSave(key,dataStrFn){
  if(cargaConFallos&&['entries_v3','accounts_v3','pendientes_v3','config_v1'].includes(key)){
    // La carga falló: lo que hay en memoria puede ser el seed de ejemplo, no tus datos reales.
    // Guardar ahora PISARÍA tus datos reales en la nube. Bloqueamos y avisamos.
    const statusEl=document.getElementById('sync-status');
    if(statusEl){
      statusEl.style.display='block';
      statusEl.style.opacity='1';
      statusEl.textContent='🛑 Guardado bloqueado: tus datos no cargaron. Usa "Reintentar carga" en 🔧 Diagnóstico';
      statusEl.className='sync-status error';
    }
    return;
  }
  if(!_pendingSaveData[key])pendingSaves++; // solo cuenta como "pendiente" la primera vez, no en cada llamada repetida
  _pendingSaveData[key]=dataStrFn;
  showSaveToast('saving');
  clearTimeout(_saveTimers[key]);
  _saveTimers[key]=setTimeout(()=>flushSaveKey(key),SAVE_DELAY_MS[key]||1200);
}

async function flushSaveKey(key){
  const dataStrFn=_pendingSaveData[key];
  if(!dataStrFn)return;
  delete _pendingSaveData[key];
  clearTimeout(_saveTimers[key]);
  delete _saveTimers[key];
  const dataStr=dataStrFn();
  const ok=await setConReintentos(key,dataStr);
  showSaveToast(ok?'saved':'error');
  pendingSaves--;
}

function flushAllPendingSaves(){
  Object.keys(_pendingSaveData).forEach(key=>flushSaveKey(key));
}
function cancelScheduledSave(key){
  if(_pendingSaveData[key]){
    delete _pendingSaveData[key];
    clearTimeout(_saveTimers[key]);
    delete _saveTimers[key];
    pendingSaves--;
  }
}
// Si el usuario minimiza/cierra la pestaña, forzamos que lo pendiente se escriba ya, sin esperar el retraso
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden')flushAllPendingSaves();
});
window.addEventListener('beforeunload',flushAllPendingSaves);


async function reintentarCarga(){
  cargaConFallos=false; // se re-evalúa durante la carga: si vuelve a fallar, se reactiva solo
  await loadData();
  if(!cargaConFallos){
    await customConfirm('✓ Datos cargados correctamente. El guardado está desbloqueado.');
  }else{
    await customConfirm('⚠ El servidor sigue fallando — tus datos NO se pudieron traer todavía. El guardado sigue bloqueado por seguridad. Espera unos minutos y reintenta.');
  }
}

async function cerrarSesion(){
  const confirmado=await customConfirm('¿Cerrar sesión?\n\nTendrás que volver a iniciar sesión con tu correo y contraseña la próxima vez.');
  if(!confirmado)return;
  await sb.auth.signOut();
  location.reload();
}

async function renderDiagnostico(){
  const emailEl=document.getElementById('diagnostico-email');
  if(emailEl){
    const {data}=await sb.auth.getUser();
    emailEl.textContent=data?.user?.email||'—';
  }

  const conteosEl=document.getElementById('diagnostico-conteos');
  if(conteosEl){
    conteosEl.innerHTML='Calculando…';
    const tablas=[
      {tabla:'fin_accounts',etiqueta:'Cuentas',local:Object.keys(ACCOUNTS_META).length},
      {tabla:'fin_movimientos',etiqueta:'Movimientos',local:entries.length},
      {tabla:'fin_pendientes',etiqueta:'Pendientes',local:pendientes.length},
      {tabla:'fin_metas',etiqueta:'Metas',local:goals.length},
      {tabla:'fin_presupuesto_topes',etiqueta:'Topes de presupuesto',local:Object.keys(CAPS).length},
    ];
    const filas=await Promise.all(tablas.map(async t=>{
      try{
        const {count,error}=await sb.from(t.tabla).select('*',{count:'exact',head:true});
        if(error)throw error;
        const coincide=count===t.local;
        return `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
          <span>${t.etiqueta}</span>
          <span style="color:${coincide?'var(--accent)':'var(--warn)'}">${count} en la nube${coincide?'':` (ves ${t.local})`}</span>
        </div>`;
      }catch(e){
        registrarErrorDiagnostico(t.tabla+' (conteo)',e);
        return `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)"><span>${t.etiqueta}</span><span style="color:var(--danger)">error al consultar</span></div>`;
      }
    }));
    conteosEl.innerHTML=filas.join('');
  }

  const errEl=document.getElementById('diagnostico-ultimo-error');
  if(errEl){
    errEl.textContent=ultimoErrorGuardado
      ? `Clave: ${ultimoErrorGuardado.key}\nMensaje: ${ultimoErrorGuardado.mensaje}\nHora: ${ultimoErrorGuardado.hora}`
      : 'Sin errores registrados en esta sesión todavía.';
  }
}

document.getElementById('build-version').textContent='build '+BUILD_VERSION;
