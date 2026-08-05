// offline-sync.js - Sincronización offline-first con IndexedDB
let db = null;
let isOnline = navigator.onLine;

const DB_NAME = 'centro-financiero-db';
const DB_VERSION = 1;
const STORES = {
  pendingMovimientos: 'pendingMovimientos',
  pendingPendientes: 'pendingPendientes',
  syncLog: 'syncLog'
};

// Inicializar IndexedDB
async function initOfflineDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      console.log('✅ IndexedDB inicializado');
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      // Store para movimientos pendientes
      if (!database.objectStoreNames.contains(STORES.pendingMovimientos)) {
        const store = database.createObjectStore(STORES.pendingMovimientos, { keyPath: 'localId', autoIncrement: true });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('date', 'date', { unique: false });
      }

      // Store para pendientes
      if (!database.objectStoreNames.contains(STORES.pendingPendientes)) {
        const store = database.createObjectStore(STORES.pendingPendientes, { keyPath: 'localId', autoIncrement: true });
        store.createIndex('status', 'status', { unique: false });
      }

      // Store para log de sincronización
      if (!database.objectStoreNames.contains(STORES.syncLog)) {
        database.createObjectStore(STORES.syncLog, { keyPath: 'id', autoIncrement: true });
      }

      console.log('✅ Object stores creados');
    };
  });
}

// Guardar movimiento offline
async function saveMovimientoOffline(movimiento) {
  if (!db) return false;

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.pendingMovimientos], 'readwrite');
    const store = tx.objectStore(STORES.pendingMovimientos);
    const request = store.add({
      ...movimiento,
      status: 'pending',
      createdAt: new Date().toISOString(),
      cloudId: null
    });

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      console.log('✅ Movimiento guardado offline:', request.result);
      resolve(request.result);
    };
  });
}

// Guardar pendiente offline
async function savePendienteOffline(pendiente) {
  if (!db) return false;

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.pendingPendientes], 'readwrite');
    const store = tx.objectStore(STORES.pendingPendientes);
    const request = store.add({
      ...pendiente,
      status: 'pending',
      createdAt: new Date().toISOString(),
      cloudId: null
    });

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      console.log('✅ Pendiente guardado offline:', request.result);
      resolve(request.result);
    };
  });
}

// Obtener todos los movimientos pendientes
async function getPendingMovimientos() {
  if (!db) return [];

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.pendingMovimientos], 'readonly');
    const store = tx.objectStore(STORES.pendingMovimientos);
    const index = store.index('status');
    const request = index.getAll('pending');

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || []);
  });
}

// Obtener todos los pendientes pendientes
async function getPendingPendientes() {
  if (!db) return [];

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.pendingPendientes], 'readonly');
    const store = tx.objectStore(STORES.pendingPendientes);
    const index = store.index('status');
    const request = index.getAll('pending');

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || []);
  });
}

// Marcar movimiento como sincronizado
async function markMovimientoSynced(localId, cloudId) {
  if (!db) return;

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.pendingMovimientos], 'readwrite');
    const store = tx.objectStore(STORES.pendingMovimientos);
    const getRequest = store.get(localId);

    getRequest.onsuccess = () => {
      const item = getRequest.result;
      if (item) {
        item.status = 'synced';
        item.cloudId = cloudId;
        const updateRequest = store.put(item);
        updateRequest.onerror = () => reject(updateRequest.error);
        updateRequest.onsuccess = () => resolve();
      }
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

// Sincronizar movimientos pendientes
async function syncPendingMovimientos() {
  if (!isOnline) {
    console.log('⚠️ Sin conexión - sincronización pospuesta');
    return;
  }

  const pending = await getPendingMovimientos();
  if (pending.length === 0) return;

  console.log(`🔄 Sincronizando ${pending.length} movimientos pendientes...`);

  for (const mov of pending) {
    try {
      const { data, error } = await sb.from('fin_movimientos').insert({
        user_id: currentUserId,
        fecha: mov.fecha,
        nombre: mov.nombre,
        monto: mov.monto,
        moneda_override: mov.moneda_override || null,
        categoria: mov.categoria,
        account_id: mov.account_id,
        tx_type: mov.tx_type,
        vehiculo: mov.vehiculo || null
      }).select().single();

      if (error) throw error;

      // Agregar a entries localmente
      entries.unshift({
        id: data.id,
        date: mov.fecha,
        name: mov.nombre,
        amount: mov.monto,
        cat: mov.categoria,
        acc: Object.keys(accountIdBySlug).find(k => accountIdBySlug[k] === mov.account_id),
        txType: mov.tx_type,
        currency: mov.moneda_override,
        vehiculo: mov.vehiculo
      });

      // Marcar como sincronizado
      await markMovimientoSynced(mov.localId, data.id);
      console.log('✅ Movimiento sincronizado:', mov.nombre);
    } catch (e) {
      console.error('❌ Error sincronizando movimiento:', e);
    }
  }

  render();
  updateNetWorth();
}

// Sincronizar pendientes pendientes
async function syncPendingPendientes() {
  if (!isOnline) return;

  const pending = await getPendingPendientes();
  if (pending.length === 0) return;

  console.log(`🔄 Sincronizando ${pending.length} pendientes pendientes...`);

  for (const pend of pending) {
    try {
      const { data, error } = await sb.from('fin_pendientes').insert({
        user_id: currentUserId,
        nombre: pend.nombre,
        monto: pend.monto,
        fecha: pend.fecha,
        account_id: pend.account_id,
        categoria: pend.categoria,
        is_income: pend.is_income || false
      }).select().single();

      if (error) throw error;

      // Agregar a pendientes localmente
      pendientes.push({
        id: data.id,
        name: pend.nombre,
        amount: pend.monto,
        date: pend.fecha,
        acc: Object.keys(accountIdBySlug).find(k => accountIdBySlug[k] === pend.account_id),
        cat: pend.categoria,
        isIncome: pend.is_income || false
      });

      console.log('✅ Pendiente sincronizado:', pend.nombre);
    } catch (e) {
      console.error('❌ Error sincronizando pendiente:', e);
    }
  }

  renderPendientes();
  updateNetWorth();
}

// Sincronizar todo
async function syncAllOfflineData() {
  if (!isOnline) return;

  console.log('🔄 Iniciando sincronización general...');
  await syncPendingMovimientos();
  await syncPendingPendientes();
  console.log('✅ Sincronización completada');
}

// Detectar cambios de conectividad
window.addEventListener('online', () => {
  isOnline = true;
  console.log('📡 Conexión restaurada - sincronizando...');
  syncAllOfflineData();
  showSyncStatus('✅ Online - sincronizado', 'ok');
});

window.addEventListener('offline', () => {
  isOnline = false;
  console.log('📴 Sin conexión - modo offline activado');
  showSyncStatus('📴 Offline - los cambios se sincronizarán cuando haya conexión', 'warn');
});

function showSyncStatus(msg, type) {
  const statusEl = document.getElementById('sync-status');
  if (statusEl) {
    statusEl.style.display = 'block';
    statusEl.textContent = msg;
    statusEl.className = `sync-status ${type}`;
    setTimeout(() => {
      statusEl.style.opacity = '0.35';
    }, 2000);
  }
}

// Inicializar al cargar
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initOfflineDB);
} else {
  initOfflineDB();
}
