const SUPABASE_URL = 'https://mfixkkqtjyjcigeqhlvz.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_l9nDbU6-a3lB6RKWEXA8UQ_ndrUICBx';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

function poblarMenuUsuario(email){
  const btn=document.getElementById('user-menu-btn');
  const emailEl=document.getElementById('user-menu-email');
  if(btn)btn.textContent=(email||'?').charAt(0).toUpperCase();
  if(emailEl)emailEl.textContent=email||'';
}

function toggleUserMenu(){
  const menu=document.getElementById('user-menu');
  const abierto=menu.style.display==='block';
  menu.style.display=abierto?'none':'block';
  document.getElementById('user-menu-btn')?.setAttribute('aria-expanded',(!abierto).toString());
}
document.addEventListener('click',e=>{
  const menu=document.getElementById('user-menu');
  const btn=document.getElementById('user-menu-btn');
  if(menu&&menu.style.display==='block'&&!menu.contains(e.target)&&e.target!==btn){
    menu.style.display='none';
  }
});

// Traduce los mensajes de error crudos de Supabase Auth a español entendible.
// Si no reconocemos el error, mostramos un mensaje genérico en vez del texto técnico.
function traducirErrorLogin(error){
  const msg=(error?.message||'').toLowerCase();
  if(msg.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if(msg.includes('email not confirmed')) return 'Confirma tu correo antes de iniciar sesión — revisa tu bandeja de entrada.';
  if(msg.includes('network')||msg.includes('fetch')) return 'No hay conexión a internet. Verifica tu red e intenta de nuevo.';
  if(msg.includes('rate limit')) return 'Demasiados intentos seguidos. Espera un minuto y vuelve a intentar.';
  return 'No se pudo iniciar sesión. Intenta de nuevo en unos segundos.';
}

async function intentarLogin(){
  const btn=document.getElementById('login-btn');
  const errEl=document.getElementById('login-error');
  const email=document.getElementById('login-email').value.trim();
  const password=document.getElementById('login-password').value;
  errEl.style.display='none';
  if(!email||!password){
    errEl.textContent='Ingresa tu correo y contraseña para continuar.';
    errEl.style.display='block';
    return;
  }
  btn.disabled=true;
  btn.textContent='Conectando…';
  const {data,error}=await sb.auth.signInWithPassword({email,password});
  btn.disabled=false;
  btn.textContent='Entrar';
  if(error){
    errEl.textContent=traducirErrorLogin(error);
    errEl.style.display='block';
    return;
  }
  currentUserId=data.user.id;
  poblarMenuUsuario(data.user.email);
  document.getElementById('login-gate').style.display='none';
  document.getElementById('loading-gate').style.display='flex';
  loadData();
}

// Si ya había una sesión guardada en este navegador, entra directo sin pedir login de nuevo
sb.auth.getSession().then(({data})=>{
  if(data.session){
    currentUserId=data.session.user.id;
    poblarMenuUsuario(data.session.user.email);
    document.getElementById('login-gate').style.display='none';
    document.getElementById('loading-gate').style.display='flex';
    loadData();
  }
});
document.getElementById('login-password')?.addEventListener('keydown',e=>{ if(e.key==='Enter')intentarLogin(); });

// Sincronización automática — un solo disparador (visibilitychange) para no duplicar llamadas
// con el evento 'focus', que en móvil suele activarse junto con visibilitychange y agotaba
// el límite de solicitudes por minuto de la API de almacenamiento.
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'&&pendingSaves===0)syncNow();
});
