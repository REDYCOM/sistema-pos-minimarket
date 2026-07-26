import { db } from './storage.js';
import { tienePrecioFinal, productosConStockBajo } from './productos.js';

// Barra de avisos importantes: precios faltantes, stock bajo, y problemas de
// conexión / guardado en la nube. Se recalcula cuando cambian los datos o el
// estado de red, y cada aviso puede descartarse por esta sesión.

const el = id => document.getElementById(id);

let errorNube = false;
const descartados = new Set();

function calcularAvisos() {
  const avisos = [];
  const productos = db.productos.all();

  if (!navigator.onLine) {
    avisos.push({ clave: 'offline', tipo: 'info', icono: '📴', mensaje: 'Sin conexión: los cambios se guardan localmente y se sincronizarán al reconectar.' });
  }
  if (errorNube) {
    avisos.push({ clave: 'nube', tipo: 'error', icono: '☁️', mensaje: 'Hubo un problema al guardar en la nube. Revisa tu conexión; algunos datos podrían no haberse sincronizado.' });
  }

  const sinVenta = productos.filter(p => !tienePrecioFinal(p));
  if (sinVenta.length) {
    avisos.push({ clave: 'sin-venta', tipo: 'warning', icono: '🏷️', mensaje: `${sinVenta.length} producto(s) sin precio de venta — no se pueden vender hasta asignarlo.`, tab: 'inventario' });
  }
  const sinCompra = productos.filter(p => !(Number(p.precioCompra) > 0));
  if (sinCompra.length) {
    avisos.push({ clave: 'sin-compra', tipo: 'warning', icono: '💲', mensaje: `${sinCompra.length} producto(s) sin precio de compra.`, tab: 'inventario' });
  }
  const bajos = productosConStockBajo();
  if (bajos.length) {
    avisos.push({ clave: 'stock-bajo', tipo: 'warning', icono: '📉', mensaje: `${bajos.length} producto(s) con stock bajo.`, tab: 'inventario' });
  }

  return avisos.filter(a => !descartados.has(a.clave));
}

export function refrescarAvisos() {
  const bar = el('avisos-bar');
  if (!bar) return;
  const avisos = calcularAvisos();
  if (avisos.length === 0) {
    bar.classList.add('hidden');
    bar.innerHTML = '';
    return;
  }
  bar.classList.remove('hidden');
  bar.innerHTML = avisos.map(a => `
    <div class="aviso aviso-${a.tipo}" ${a.tab ? `data-tab="${a.tab}"` : ''}>
      <span class="aviso-icono">${a.icono}</span>
      <span class="aviso-msg">${a.mensaje}</span>
      <button class="aviso-cerrar" data-clave="${a.clave}" title="Descartar">✕</button>
    </div>`).join('');
}

export function initAvisos() {
  window.addEventListener('pos:cloud-error', () => { errorNube = true; descartados.delete('nube'); refrescarAvisos(); });
  window.addEventListener('online', () => { errorNube = false; refrescarAvisos(); });
  window.addEventListener('offline', refrescarAvisos);

  el('avisos-bar').addEventListener('click', e => {
    const cerrar = e.target.closest('.aviso-cerrar');
    if (cerrar) {
      descartados.add(cerrar.dataset.clave);
      refrescarAvisos();
      return;
    }
    const aviso = e.target.closest('.aviso[data-tab]');
    if (aviso) document.querySelector(`.tab-btn[data-tab="${aviso.dataset.tab}"]`)?.click();
  });

  refrescarAvisos();
}
