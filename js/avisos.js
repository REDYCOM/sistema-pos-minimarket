import { db } from './storage.js';
import { tienePrecioFinal, productosConStockBajo } from './productos.js';

// Pestaña de Avisos/Notificaciones: revisa el estado del sistema y lista los
// problemas importantes (precios faltantes, stock, códigos de barra, descuadres
// de caja, conexión / guardado en la nube). El sidebar muestra un contador.

const el = id => document.getElementById(id);

let errorNube = false;

function calcularAvisos() {
  const avisos = [];
  const productos = db.productos.all();

  // --- Conexión / sistema ---
  if (!navigator.onLine) {
    avisos.push({ tipo: 'info', icono: '📴', titulo: 'Sin conexión', mensaje: 'Los cambios se guardan localmente y se sincronizarán al reconectar.' });
  }
  if (errorNube) {
    avisos.push({ tipo: 'error', icono: '☁️', titulo: 'Error al guardar en la nube', mensaje: 'Algunos datos podrían no haberse sincronizado. Revisa tu conexión.' });
  }

  // --- Precios ---
  const sinVenta = productos.filter(p => !tienePrecioFinal(p));
  if (sinVenta.length) {
    avisos.push({ tipo: 'warning', icono: '🏷️', titulo: 'Sin precio de venta', mensaje: `${sinVenta.length} producto(s) no se pueden vender hasta asignarlo: ${nombres(sinVenta)}`, tab: 'productos' });
  }
  const sinCompra = productos.filter(p => !(Number(p.precioCompra) > 0));
  if (sinCompra.length) {
    avisos.push({ tipo: 'warning', icono: '💲', titulo: 'Sin precio de compra', mensaje: `${sinCompra.length} producto(s): ${nombres(sinCompra)}`, tab: 'productos' });
  }
  const conPerdida = productos.filter(p => tienePrecioFinal(p) && Number(p.precioCompra) > 0 && Number(p.precioVentaFinal) < Number(p.precioCompra));
  if (conPerdida.length) {
    avisos.push({ tipo: 'error', icono: '📉', titulo: 'Precio de venta menor al de compra', mensaje: `${conPerdida.length} producto(s) se venden con pérdida: ${nombres(conPerdida)}`, tab: 'productos' });
  }

  // --- Stock ---
  // Productos vendidos sin stock: quedaron en negativo porque se vendieron más
  // unidades de las registradas (ej. unidades físicas del almacén no cargadas).
  const vendidosSinStock = productos.filter(p => Number(p.stock) < 0);
  if (vendidosSinStock.length) {
    avisos.push({ tipo: 'error', icono: '🛒', titulo: 'Vendidos sin stock registrado', mensaje: `${vendidosSinStock.length} producto(s) quedaron en stock negativo (se vendieron sin stock): ${nombres(vendidosSinStock)}. Registra las unidades encontradas para cuadrar el inventario.`, tab: 'productos' });
  }
  // "Stock bajo" excluye los negativos (esos ya salen en el aviso de arriba).
  const bajos = productosConStockBajo().filter(p => Number(p.stock) >= 0);
  if (bajos.length) {
    avisos.push({ tipo: 'warning', icono: '📦', titulo: 'Stock bajo', mensaje: `${bajos.length} producto(s) por debajo del mínimo: ${nombres(bajos)}`, tab: 'inventario' });
  }

  // --- Códigos de barra ---
  const sinCodigo = productos.filter(p => !p.codigo || !String(p.codigo).trim());
  if (sinCodigo.length) {
    avisos.push({ tipo: 'warning', icono: '🔢', titulo: 'Productos sin código de barras', mensaje: `${sinCodigo.length} producto(s): ${nombres(sinCodigo)}`, tab: 'productos' });
  }

  const sinCategoria = productos.filter(p => !p.categoria || !String(p.categoria).trim());
  if (sinCategoria.length) {
    avisos.push({ tipo: 'warning', icono: '🗂️', titulo: 'Productos sin categoría', mensaje: `${sinCategoria.length} producto(s): ${nombres(sinCategoria)}`, tab: 'productos' });
  }
  const duplicados = codigosDuplicados(productos);
  if (duplicados.length) {
    avisos.push({ tipo: 'error', icono: '🚫', titulo: 'Códigos de barra duplicados', mensaje: `Se repiten los códigos: ${duplicados.join(', ')}. Puede causar errores al escanear.`, tab: 'productos' });
  }

  // --- Pagos / caja ---
  const descuadres = db.cierres.all().filter(c => Number(c.diferencia) !== 0);
  if (descuadres.length) {
    avisos.push({ tipo: 'warning', icono: '⚖️', titulo: 'Cierres de caja con descuadre', mensaje: `${descuadres.length} cierre(s) con sobrante o faltante registrado.` });
  }

  return avisos;
}

function nombres(lista, max = 4) {
  const ns = lista.map(p => p.nombre);
  return ns.slice(0, max).join(', ') + (ns.length > max ? `, y ${ns.length - max} más` : '');
}

function codigosDuplicados(productos) {
  const cuenta = {};
  productos.forEach(p => { if (p.codigo) cuenta[p.codigo] = (cuenta[p.codigo] || 0) + 1; });
  return Object.keys(cuenta).filter(c => cuenta[c] > 1);
}

export function refrescarAvisos() {
  const lista = el('avisos-lista');
  const badge = el('avisos-badge');
  if (!lista) return;

  const avisos = calcularAvisos();

  // Contador en el sidebar
  if (badge) {
    if (avisos.length > 0) { badge.textContent = avisos.length; badge.classList.remove('hidden'); }
    else badge.classList.add('hidden');
  }

  if (avisos.length === 0) {
    lista.innerHTML = '<div class="avisos-ok">✅ Todo en orden. No hay avisos por ahora.</div>';
    return;
  }

  lista.innerHTML = avisos.map(a => `
    <div class="aviso aviso-${a.tipo}" ${a.tab ? `data-tab="${a.tab}"` : ''}>
      <span class="aviso-icono">${a.icono}</span>
      <div class="aviso-cuerpo">
        <div class="aviso-titulo">${a.titulo}</div>
        <div class="aviso-msg">${a.mensaje}</div>
      </div>
      ${a.tab ? '<span class="aviso-ir">Ir →</span>' : ''}
    </div>`).join('');
}

export function initAvisos() {
  window.addEventListener('pos:cloud-error', () => { errorNube = true; refrescarAvisos(); });
  window.addEventListener('online', () => { errorNube = false; refrescarAvisos(); });
  window.addEventListener('offline', refrescarAvisos);

  el('avisos-lista').addEventListener('click', e => {
    const aviso = e.target.closest('.aviso[data-tab]');
    if (aviso) document.querySelector(`.tab-btn[data-tab="${aviso.dataset.tab}"]`)?.click();
  });

  refrescarAvisos();
}
