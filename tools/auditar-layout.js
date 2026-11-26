// Auditoría de layout para celular. Pegar en la consola del navegador (o con javascript_tool) y llamar:
//   auditarLayout(1.3)   // 1.3 simula "Tamaño de fuente" grande del sistema (Samsung/Android)
// Devuelve textos que se salen de la pantalla o se cortan (overflow hidden / ellipsis) en la pestaña visible.
// Probar con el viewport en 360 y 412 px de ancho y escalas 1, 1.15 y 1.3.
window.auditarLayout = function(escala = 1) {
  document.querySelectorAll('[data-fs0]').forEach(e => { e.style.fontSize = e.dataset.fs0 + 'px'; });
  document.querySelectorAll('body *').forEach(e => {
    if (!e.dataset.fs0) e.dataset.fs0 = parseFloat(getComputedStyle(e).fontSize);
    e.style.fontSize = (e.dataset.fs0 * escala) + 'px';
  });
  const iw = document.documentElement.clientWidth, out = [];
  document.querySelectorAll('body *').forEach(e => {
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    if (!r.width || !r.height || cs.visibility === 'hidden' || e.closest('svg')) return;
    const texto = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!texto) return;
    const enScroll = e.closest('.main-nav,.comparar-scroll,.fchips');
    if ((r.right > iw + 1 || r.left < -1) && !enScroll) out.push(['fuera', e.tagName + '.' + e.className, e.textContent.trim().slice(0, 28)]);
    if ((cs.overflowX === 'hidden' || cs.textOverflow === 'ellipsis') && e.scrollWidth > e.clientWidth + 1) out.push(['recortado', e.tagName + '.' + e.className, e.textContent.trim().slice(0, 28)]);
  });
  return { paginaMasAncha: document.documentElement.scrollWidth > iw, problemas: out };
};
