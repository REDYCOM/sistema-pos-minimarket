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
