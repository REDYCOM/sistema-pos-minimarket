// Notificaciones toast: reemplazan alert() con algo animado y no bloqueante.
// Principios (estilo Sonner/Emil Kowalski): entrada/salida con easing tipo
// "ease-out-expo", apilado, auto-descarte con barra de progreso, salida por swipe.

const ICONOS = { success: '✅', error: '⛔', warning: '⚠️', info: 'ℹ️' };
const DURACION_MS = 3800;

let contenedor = null;

function getContenedor() {
  if (!contenedor) {
    contenedor = document.createElement('div');
    contenedor.className = 'toast-container';
    document.body.appendChild(contenedor);
  }
  return contenedor;
}

function cerrarToast(el) {
  if (el.dataset.cerrando) return;
  el.dataset.cerrando = 'true';
  el.classList.add('toast-saliendo');
  // "animationend" no siempre llega (ej. pestaña en segundo plano throttleando
  // animaciones), así que un timeout de respaldo garantiza que igual se quite.
  const quitar = () => el.remove();
  el.addEventListener('animationend', quitar, { once: true });
  setTimeout(quitar, 400);
}

export function toast(mensaje, tipo = 'info') {
  const cont = getContenedor();
  const el = document.createElement('div');
  el.className = `toast toast-${tipo}`;
  el.innerHTML = `
    <span class="toast-icono">${ICONOS[tipo] || ICONOS.info}</span>
    <span class="toast-mensaje"></span>
    <button class="toast-cerrar" aria-label="Cerrar">✕</button>
    <div class="toast-barra"></div>
  `;
  el.querySelector('.toast-mensaje').textContent = mensaje;
  el.querySelector('.toast-cerrar').addEventListener('click', () => cerrarToast(el));

  let startX = null;
  el.addEventListener('pointerdown', e => { startX = e.clientX; el.style.transition = 'none'; });
  el.addEventListener('pointermove', e => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 4) el.style.transform = `translateX(${dx}px)`;
  });
  el.addEventListener('pointerup', e => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    el.style.transition = '';
    el.style.transform = '';
    startX = null;
    if (Math.abs(dx) > 80) cerrarToast(el);
  });

  cont.appendChild(el);
  const timer = setTimeout(() => cerrarToast(el), DURACION_MS);
  el.addEventListener('mouseenter', () => clearTimeout(timer));

  return el;
}

toast.success = m => toast(m, 'success');
toast.error = m => toast(m, 'error');
toast.warning = m => toast(m, 'warning');
toast.info = m => toast(m, 'info');
