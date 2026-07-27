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
