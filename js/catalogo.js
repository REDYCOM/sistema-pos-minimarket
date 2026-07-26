import { db, getAjustes, setAjustes } from './storage.js';

// Catálogo compartido de categorías y proveedores + márgenes por rotación.
// Las listas combinan lo gestionado en Configuración (ajustes) con lo que ya
// existe en productos/compras, para no perder valores capturados antes.

function unicos(lista) {
  return [...new Set(lista.filter(Boolean).map(s => s.trim()))].sort((a, b) => a.localeCompare(b));
}

// ---- Categorías ----
export function listarCategorias() {
  const deProductos = db.productos.all().map(p => p.categoria);
  return unicos([...(getAjustes().categorias || []), ...deProductos]);
}

export function agregarCategoria(nombre) {
  const limpio = nombre.trim();
  if (!limpio) return false;
  const actuales = getAjustes().categorias || [];
  if (actuales.some(c => c.toLowerCase() === limpio.toLowerCase())) return false;
  setAjustes({ categorias: [...actuales, limpio] });
  return true;
}

export function eliminarCategoria(nombre) {
  const actuales = getAjustes().categorias || [];
  setAjustes({ categorias: actuales.filter(c => c !== nombre) });
}

// ---- Proveedores ----
export function listarProveedores() {
  const deProductos = db.productos.all().map(p => p.proveedor);
  const deCompras = db.compras.all().map(c => c.proveedor);
  return unicos([...(getAjustes().proveedores || []), ...deProductos, ...deCompras]);
}

export function agregarProveedor(nombre) {
  const limpio = nombre.trim();
  if (!limpio) return false;
  const actuales = getAjustes().proveedores || [];
  if (actuales.some(p => p.toLowerCase() === limpio.toLowerCase())) return false;
  setAjustes({ proveedores: [...actuales, limpio] });
  return true;
}

export function eliminarProveedor(nombre) {
  const actuales = getAjustes().proveedores || [];
  setAjustes({ proveedores: actuales.filter(p => p !== nombre) });
}

// ---- Márgenes por rotación ----
export function getMargenes() {
  return getAjustes().margenes || { A: 0.20, B: 0.30, C: 0.40 };
}

export function setMargenes(margenes) {
  setAjustes({ margenes });
}

// Rellena un <select> simple (ej. filtros), conservando el valor actual.
export function poblarSelect(selectEl, valores, { placeholder = '— Seleccionar —', valorSeleccionado = '' } = {}) {
  const valorPrevio = valorSeleccionado || selectEl.value;
  const lista = [...valores];
  if (valorPrevio && !lista.includes(valorPrevio)) lista.unshift(valorPrevio);
  selectEl.innerHTML = `<option value="">${placeholder}</option>` +
    lista.map(v => `<option value="${v}">${v}</option>`).join('');
  selectEl.value = valorPrevio || '';
}

// --- Selects de catálogo con opción "➕ Nuevo…" ---
export const OPCION_NUEVA = '__nueva__';

export function poblarSelectCatalogo(selectEl, valores, { labelNueva = '➕ Nuevo…', valorSeleccionado = '', placeholder = '— Seleccionar —' } = {}) {
  const valorPrevio = valorSeleccionado || selectEl.value;
  const lista = [...valores];
  if (valorPrevio && valorPrevio !== OPCION_NUEVA && !lista.includes(valorPrevio)) lista.unshift(valorPrevio);
  selectEl.innerHTML =
    `<option value="">${placeholder}</option>` +
    lista.map(v => `<option value="${v}">${v}</option>`).join('') +
    `<option value="${OPCION_NUEVA}">${labelNueva}</option>`;
  selectEl.value = (valorPrevio && lista.includes(valorPrevio)) ? valorPrevio : '';
}

// Muestra/oculta el input "nuevo" según se elija la opción especial.
export function vincularSelectNuevo(selectEl, inputNuevoEl) {
  const sync = () => {
    const esNuevo = selectEl.value === OPCION_NUEVA;
    inputNuevoEl.classList.toggle('hidden', !esNuevo);
    if (esNuevo) inputNuevoEl.focus();
  };
  selectEl.addEventListener('change', sync);
}

// Valor final: del input si se eligió "nuevo"; si no, del select.
export function resolverValorCatalogo(selectEl, inputNuevoEl) {
  if (selectEl.value === OPCION_NUEVA) return inputNuevoEl.value.trim();
  return selectEl.value;
}
