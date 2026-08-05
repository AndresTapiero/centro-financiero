let entries=[];
let pendingSaves=0; // contador de guardados en curso — evita que la sincronización pise cambios recién hechos
const BUILD_VERSION='2026-08-05.regla-50-y-utilizacion-cupo'; // súbelo cada vez que se publique una versión nueva — sirve para confirmar que celular y PC corren el mismo código

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
