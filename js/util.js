// Utilidades pequeñas y compartidas de interfaz.

// Selecciona todo el contenido de un input al enfocarlo (por clic o con Tab),
// para que al escribir se reemplace el valor en vez de tener que borrar el 0.
// El guard con mousedown/mouseup evita que el clic deshaga la selección: al
// enfocar con el mouse, el mouseup posterior movería el cursor y perdería la
// selección, así que en ese primer clic se cancela.
export function seleccionarAlEnfocar(input) {
  if (!input) return;
  let porMouse = false;
  input.addEventListener('mousedown', () => { porMouse = document.activeElement !== input; });
  input.addEventListener('mouseup', e => { if (porMouse) e.preventDefault(); porMouse = false; });
  input.addEventListener('focus', e => e.target.select());
}

// Navegación con flechas ↑/↓ + Enter en una CAJA DE SUGERENCIAS de búsqueda
// (dropdown con `.sugerencia-item[data-id]`). Resalta el ítem activo y, al Enter,
// lo "clickea" (reutiliza el handler de clic ya existente en cada pantalla).
// Si no hay ítem resaltado, deja pasar el Enter al handler propio de la pantalla,
// para no alterar su comportamiento actual (ej. escanear código y agregar).
// IMPORTANTE: llamar ANTES de registrar el keydown propio del input, para que
// este handler corra primero y pueda frenar el Enter cuando corresponde.
export function navegarSugerencias(input, caja) {
  if (!input || !caja) return;
  let activo = -1;
  const items = () => [...caja.querySelectorAll('.sugerencia-item[data-id]')];
  const pintar = lista => {
    lista.forEach((el, i) => el.classList.toggle('sugerencia-activa', i === activo));
    if (activo >= 0 && lista[activo]) lista[activo].scrollIntoView({ block: 'nearest' });
  };
  input.addEventListener('input', () => { activo = -1; });
  input.addEventListener('keydown', e => {
    if (caja.classList.contains('hidden')) return;
    const lista = items();
    if (!lista.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activo = (activo + 1) % lista.length;
      pintar(lista);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activo = (activo - 1 + lista.length) % lista.length;
      pintar(lista);
    } else if (e.key === 'Enter' && activo >= 0 && lista[activo]) {
      e.preventDefault();
      e.stopImmediatePropagation();
      lista[activo].click();
      activo = -1;
    } else if (e.key === 'Escape') {
      activo = -1;
      caja.classList.add('hidden');
    }
  });
}

// Navegación con flechas ↑/↓ + Enter sobre las FILAS de una TABLA que se filtra
// con un buscador (ej. lista de productos). Resalta la fila activa y, al Enter,
// llama a `onEnter(id)` con el id de la fila (leído de `data-id` de la fila o de
// algún elemento hijo). Si no hay fila resaltada, deja pasar el Enter.
export function navegarFilas(input, tbody, { onEnter } = {}) {
  if (!input || !tbody) return;
  let activo = -1;
  const filas = () => [...tbody.querySelectorAll('tr')].filter(tr => idDeFila(tr));
  const idDeFila = tr => tr.dataset.id || tr.querySelector('[data-id]')?.dataset.id || null;
  const pintar = lista => {
    lista.forEach((tr, i) => tr.classList.toggle('fila-activa', i === activo));
    if (activo >= 0 && lista[activo]) lista[activo].scrollIntoView({ block: 'nearest' });
  };
  input.addEventListener('input', () => { activo = -1; });
  input.addEventListener('keydown', e => {
    const lista = filas();
    if (!lista.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activo = (activo + 1) % lista.length;
      pintar(lista);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activo = (activo - 1 + lista.length) % lista.length;
      pintar(lista);
    } else if (e.key === 'Enter' && activo >= 0 && lista[activo]) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (onEnter) onEnter(idDeFila(lista[activo]));
      activo = -1;
    }
  });
}

// Permite subir/bajar con la rueda del mouse los inputs numéricos que tengan la
// clase 'rueda-numero' (basta con pasar el cursor por encima, sin hacer clic).
// Cambia de a `paso` (1 por defecto) y respeta min/max. Dispara 'input' para que
// la app recalcule subtotales/totales. Se registra una sola vez (delegado).
export function initRuedaNumeros(paso = 1) {
  document.addEventListener('wheel', e => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || t.type !== 'number') return;
    if (!t.classList.contains('rueda-numero')) return;
    e.preventDefault(); // evita que la página haga scroll mientras se ajusta
    const min = t.min !== '' ? Number(t.min) : -Infinity;
    const max = t.max !== '' ? Number(t.max) : Infinity;
    let v = (Number(t.value) || 0) + (e.deltaY < 0 ? paso : -paso);
    if (v < min) v = min;
    if (v > max) v = max;
    t.value = v;
    t.dispatchEvent(new Event('input', { bubbles: true }));
  }, { passive: false });
}
