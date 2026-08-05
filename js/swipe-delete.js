// swipe-delete.js
// Gesto de "deslizar hacia la izquierda para eliminar" en la lista de movimientos.
// Reemplaza el botón × que antes vivía dentro de cada fila: ahora eliminar es un
// gesto explícito (swipe) o se hace desde el modal de edición ("Eliminar movimiento"),
// que ya se abre por defecto al tocar la fila.
(function(){
  const THRESHOLD = 80; // px de arrastre para considerar "eliminar"
  const MAX_DRAG = 96;  // tope visual del deslizamiento

  let row = null, content = null, startX = 0, dx = 0, dragging = false;

  function onPointerDown(e){
    const target = e.target.closest('.entry-row');
    if(!target || e.target.closest('button')) return; // no interferir con botones internos (ej. "Era COP")
    row = target;
    content = row.querySelector('.entry-row-content');
    startX = e.clientX;
    dx = 0;
    dragging = false;
    content.style.transition = 'none';
  }

  function onPointerMove(e){
    if(!row) return;
    const delta = e.clientX - startX;
    const isPendiente = row.closest('#pendientes-list') !== null;
    // Movimientos: solo izquierda (eliminar)
    // Pendientes: izquierda (eliminar) o derecha (pagar/recibir)
    if(!isPendiente && delta > 0) { dx = 0; content.style.transform = 'translateX(0)'; return; }
    if(!dragging && Math.abs(delta) > 6) dragging = true;
    // Para pendientes: permitir +MAX_DRAG (derecha) o -MAX_DRAG (izquierda)
    dx = isPendiente ? Math.max(delta, -MAX_DRAG) : Math.max(delta, -MAX_DRAG);
    dx = Math.min(dx, isPendiente ? MAX_DRAG : 0);
    content.style.transform = `translateX(${dx}px)`;
  }

  async function onPointerUp(){
    if(!row) return;
    const activeRow = row, activeContent = content;
    const wasDragged = dragging;
    const finalDx = dx;
    row = null; content = null; dragging = false; dx = 0;

    activeContent.style.transition = 'transform .2s ease';

    const isPendiente = activeRow.closest('#pendientes-list') !== null;

    if(wasDragged && Math.abs(finalDx) >= THRESHOLD){
      activeRow.dataset.swiped = '1'; // evita que el click posterior abra el modal de edición
      const id = activeRow.dataset.id;

      if(finalDx < -THRESHOLD){ // Swipe izquierda: eliminar
        activeContent.style.transform = `translateX(-${MAX_DRAG}px)`;
        const eliminado = await (isPendiente ? deletePendiente(id) : deleteEntry(id));
        if(!eliminado){
          activeContent.style.transform = 'translateX(0)';
        }
      } else if(isPendiente && finalDx > THRESHOLD){ // Swipe derecha (solo en pendientes): pagar/recibir
        activeContent.style.transform = `translateX(${MAX_DRAG}px)`;
        await payPendiente(id);
        activeContent.style.transform = 'translateX(0)';
      }
    } else {
      activeContent.style.transform = 'translateX(0)';
      if(wasDragged) activeRow.dataset.swiped = '1'; // fue un intento de swipe corto: tampoco abrir el modal
    }
  }

  function attach(list){
    if(!list || list.dataset.swipeAttached) return;
    list.dataset.swipeAttached = '1';
    list.addEventListener('pointerdown', onPointerDown);
    list.addEventListener('pointermove', onPointerMove);
    list.addEventListener('pointerup', onPointerUp);
    list.addEventListener('pointercancel', onPointerUp);
    // Intercepta el click en fase de captura para que no llegue al onclick de apertura del modal
    // cuando el usuario acaba de arrastrar la fila.
    list.addEventListener('click', function(e){
      const target = e.target.closest('.entry-row');
      if(target && target.dataset.swiped === '1'){
        e.stopPropagation();
        target.dataset.swiped = '';
      }
    }, true);
  }

  // La lista se recrea en cada render(), así que reintenta enganchar el listener
  // cada vez que cambie de tab o se re-renderice (el listener es idempotente por elemento).
  document.addEventListener('DOMContentLoaded', function(){
    attach(document.getElementById('entries-list'));
    attach(document.getElementById('pendientes-list'));
  });
  window.reattachSwipeDelete = function(){
    attach(document.getElementById('entries-list'));
    attach(document.getElementById('pendientes-list'));
  };
})();
