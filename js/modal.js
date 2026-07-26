// Manejo de modales: apertura/cierre con animación, botón X inyectado,
// cierre con tecla ESC y un diálogo de confirmación propio (reemplaza al
// confirm() nativo, que es feo y en algunos navegadores se ignora).

export function abrirModal(modalEl) {
  modalEl.classList.remove('hidden', 'modal-saliendo');
}

export function cerrarModal(modalEl) {
  if (modalEl.classList.contains('hidden')) return;
  modalEl.classList.add('modal-saliendo');
  modalEl.addEventListener('animationend', () => {
    modalEl.classList.add('hidden');
    modalEl.classList.remove('modal-saliendo');
  }, { once: true });
}

function modalesVisibles() {
  return [...document.querySelectorAll('.modal:not(.hidden):not(.modal-saliendo)')];
}

// Cierra el modal "de encima" (mayor z-index, o el último del DOM si empatan).
function cerrarModalSuperior() {
  const visibles = modalesVisibles();
  if (visibles.length === 0) return;
  const top = visibles.sort((a, b) => {
    const za = Number(getComputedStyle(a).zIndex) || 0;
    const zb = Number(getComputedStyle(b).zIndex) || 0;
    return za - zb;
  }).pop();
  cerrarModal(top);
}

// Inyecta una X de cerrar en cada modal y activa el cierre con ESC.
export function initModales() {
  document.querySelectorAll('.modal .modal-content').forEach(contenido => {
    if (contenido.querySelector('.modal-x')) return;
    const x = document.createElement('button');
    x.className = 'modal-x';
    x.type = 'button';
    x.setAttribute('aria-label', 'Cerrar');
    x.textContent = '✕';
    x.addEventListener('click', () => cerrarModal(contenido.closest('.modal')));
    contenido.prepend(x);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') cerrarModalSuperior();
  });
}

// Confirmación propia. Devuelve una promesa que resuelve true/false.
export function confirmar(mensaje, { aceptar = 'Sí, continuar', cancelar = 'Cancelar', peligro = false } = {}) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal';
    overlay.style.zIndex = '2500';
    overlay.innerHTML = `
      <div class="modal-content card-narrow confirm-box">
        <p class="confirm-mensaje">${mensaje}</p>
        <div class="modal-botones">
          <button type="button" class="btn confirm-no">${cancelar}</button>
          <button type="button" class="btn ${peligro ? 'btn-danger-solido' : 'btn-primary'} confirm-si">${aceptar}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const cerrar = valor => {
      overlay.classList.add('modal-saliendo');
      overlay.addEventListener('animationend', () => overlay.remove(), { once: true });
      document.removeEventListener('keydown', onKey);
      resolve(valor);
    };
    const onKey = e => {
      if (e.key === 'Escape') cerrar(false);
      if (e.key === 'Enter') cerrar(true);
    };
    overlay.querySelector('.confirm-si').addEventListener('click', () => cerrar(true));
    overlay.querySelector('.confirm-no').addEventListener('click', () => cerrar(false));
    overlay.addEventListener('click', e => { if (e.target === overlay) cerrar(false); });
    document.addEventListener('keydown', onKey);
    overlay.querySelector('.confirm-si').focus();
  });
}
