import { db } from './storage.js';
import { buscarProductos, tienePrecioFinal, productosConStockBajo } from './productos.js';
import { calcularSubtotal, calcularDescuento, registrarVenta } from './ventas.js';
import { turnoActivo, calcularEfectivoEsperado, cerrarCaja } from './caja.js';
import { clearSession, getSession } from './storage.js';
import { toast } from './toast.js';
import { abrirModal, cerrarModal, confirmar } from './modal.js';
import { refrescarAvisos } from './avisos.js';

let carrito = [];

const el = id => document.getElementById(id);

function money(n) {
  return `Bs ${Number(n).toFixed(2)}`;
}

function renderCarrito() {
  const body = el('carrito-body');
  body.innerHTML = '';
  carrito.forEach((item, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.nombre}</td>
      <td><input type="number" min="1" value="${item.cantidad}" data-idx="${idx}" class="cantidad-input bloque-cant"></td>
      <td><span class="bloque bloque-precio">${money(item.precioUnit)}</span></td>
      <td><span class="bloque bloque-total">${money(item.precioUnit * item.cantidad)}</span></td>
      <td><button class="icono-btn quitar-item" data-idx="${idx}" title="Quitar">✕</button></td>
    `;
    body.appendChild(tr);
  });
  renderResumen();
}

function renderResumen() {
  const subtotal = calcularSubtotal(carrito);
  const montoDescuento = Number(el('descuento-monto').value) || 0;
  const tipoDescuento = el('descuento-tipo').value;
  const descuento = calcularDescuento(subtotal, montoDescuento, tipoDescuento);
  const total = Math.max(0, subtotal - descuento);
  el('resumen-subtotal').textContent = money(subtotal);
  el('resumen-total').textContent = money(total);
  return { subtotal, descuento, total };
}

function agregarAlCarrito(producto) {
  if (!tienePrecioFinal(producto)) {
    toast.warning(`"${producto.nombre}" no tiene precio de venta asignado. Asígnalo en Inventario/Productos.`);
    return;
  }
  if (producto.stock <= 0) {
    toast.error(`"${producto.nombre}" no tiene stock disponible.`);
    return;
  }
  const existente = carrito.find(i => i.id === producto.id);
  if (existente) {
    if (existente.cantidad + 1 > producto.stock) {
      toast.error('No hay suficiente stock.');
      return;
    }
    existente.cantidad += 1;
  } else {
    carrito.push({ id: producto.id, nombre: producto.nombre, precioUnit: producto.precioVentaFinal, cantidad: 1 });
  }
  renderCarrito();
  el('busqueda-producto').value = '';
  el('sugerencias').classList.add('hidden');
  el('busqueda-producto').focus();
}

function renderSugerencias(query) {
  const caja = el('sugerencias');
  if (!query.trim()) {
    caja.classList.add('hidden');
    caja.innerHTML = '';
    return;
  }
  const resultados = buscarProductos(query).slice(0, 8);
  if (resultados.length === 0) {
    caja.innerHTML = '<div class="sugerencia-item">Sin resultados</div>';
    caja.classList.remove('hidden');
    return;
  }
  caja.innerHTML = resultados.map(p => `
    <div class="sugerencia-item" data-id="${p.id}">
      <strong>${p.nombre}</strong> — ${p.codigo} — stock: ${p.stock}
      ${tienePrecioFinal(p) ? `<span> — 💲${money(p.precioVentaFinal)}</span>` : '<div class="sin-precio">⚠️ Producto sin precio de venta</div>'}
    </div>
  `).join('');
  caja.classList.remove('hidden');
}

function actualizarAlertaStockBajo() {
  const bajos = productosConStockBajo();
  const badge = el('stock-bajo-alerta');
  if (bajos.length > 0) {
    badge.textContent = `⚠ ${bajos.length} producto(s) con stock bajo`;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function resetVenta() {
  carrito = [];
  el('descuento-monto').value = 0;
  el('descuento-tipo').value = 'monto';
  renderCarrito();
}

function abrirModalCierre() {
  const turno = turnoActivo();
  const resumen = calcularEfectivoEsperado(turno.turnoId);
  el('cierre-resumen').innerHTML = `
    <p>Apertura: ${money(resumen.montoApertura)}</p>
    <p>Ventas en efectivo: ${money(resumen.ventasEfectivo)}</p>
    <p>Entradas de dinero: ${money(resumen.entradas)}</p>
    <p>Salidas de dinero: ${money(resumen.salidas)}</p>
    <p><strong>Efectivo esperado: ${money(resumen.esperado)}</strong></p>
  `;
  el('cierre-conteo').value = '';
  el('cierre-resultado').classList.add('hidden');
  abrirModal(el('modal-cierre'));
}

// --- Acciones de cobro (reutilizadas por botones y por atajos de teclado) ---
function finalizarVenta() {
  resetVenta();
  actualizarAlertaStockBajo();
  refrescarAvisos();
  el('busqueda-producto').focus();
}

function cobrarQR() {
  if (carrito.length === 0) return toast.warning('Agrega productos al carrito primero.');
  const { descuento } = renderResumen();
  registrarVenta({ carrito, descuentoAplicado: descuento, metodoPago: 'qr' });
  toast.success('📱 Venta registrada con QR.');
  finalizarVenta();
}

function abrirCobroEfectivo() {
  if (carrito.length === 0) return toast.warning('Agrega productos al carrito primero.');
  const { total } = renderResumen();
  el('efectivo-total').textContent = money(total);
  el('efectivo-recibido').value = '';
  el('efectivo-cambio').textContent = money(0);
  el('efectivo-error').classList.add('hidden');
  abrirModal(el('modal-efectivo'));
  el('efectivo-recibido').focus();
}

// Pago exacto: el cliente paga justo, sin cambio.
function pagarEfectivoExacto() {
  const { total, descuento } = renderResumen();
  registrarVenta({ carrito, descuentoAplicado: descuento, metodoPago: 'efectivo', montoRecibido: total });
  cerrarModal(el('modal-efectivo'));
  toast.success('⚡ Pago exacto registrado.');
  finalizarVenta();
}

function confirmarEfectivo() {
  const { total, descuento } = renderResumen();
  const recibido = Number(el('efectivo-recibido').value) || 0;
  if (recibido < total) {
    el('efectivo-error').textContent = 'El monto recibido es menor al total.';
    el('efectivo-error').classList.remove('hidden');
    return;
  }
  registrarVenta({ carrito, descuentoAplicado: descuento, metodoPago: 'efectivo', montoRecibido: recibido });
  cerrarModal(el('modal-efectivo'));
  toast.success('💵 Venta cobrada en efectivo.');
  finalizarVenta();
}

async function cancelarVenta() {
  if (carrito.length === 0) return;
  if (await confirmar('¿Cancelar la venta actual?', { aceptar: 'Sí, cancelar', peligro: true })) {
    resetVenta();
    el('busqueda-producto').focus();
  }
}

export function initDashboard() {
  el('busqueda-producto').addEventListener('input', e => renderSugerencias(e.target.value));

  el('busqueda-producto').addEventListener('keydown', e => {
    const valor = e.target.value.trim();
    if (e.key === 'Enter') {
      e.preventDefault();
      if (valor === '') {
        cobrarQR(); // caja vacía + Enter = cobrar con QR
      } else {
        const producto = db.productos.all().find(p => p.codigo === valor);
        if (producto) agregarAlCarrito(producto);
        else toast.warning('Producto no encontrado. Elige uno de la lista.');
      }
    } else if (e.key === ' ' && valor === '') {
      // Espacio con la búsqueda vacía = abrir cobro en efectivo.
      e.preventDefault();
      abrirCobroEfectivo();
    }
  });

  el('sugerencias').addEventListener('click', e => {
    const item = e.target.closest('.sugerencia-item');
    if (!item || !item.dataset.id) return;
    const producto = db.productos.find(item.dataset.id);
    if (producto) agregarAlCarrito(producto);
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.venta-buscar')) el('sugerencias').classList.add('hidden');
  });

  el('carrito-body').addEventListener('input', e => {
    if (!e.target.classList.contains('cantidad-input')) return;
    const idx = Number(e.target.dataset.idx);
    const item = carrito[idx];
    const producto = db.productos.find(item.id);
    let nueva = Number(e.target.value);
    if (nueva < 1) nueva = 1;
    if (producto && nueva > producto.stock) {
      toast.error('No hay suficiente stock.');
      nueva = producto.stock;
    }
    item.cantidad = nueva;
    renderCarrito();
  });

  el('carrito-body').addEventListener('click', e => {
    if (!e.target.classList.contains('quitar-item')) return;
    carrito.splice(Number(e.target.dataset.idx), 1);
    renderCarrito();
  });

  el('descuento-monto').addEventListener('input', renderResumen);
  el('descuento-tipo').addEventListener('change', renderResumen);
  // Al terminar de escribir, si el descuento es en Bs, se redondea a múltiplos de 0.50.
  el('descuento-monto').addEventListener('change', () => {
    if (el('descuento-tipo').value === 'monto') {
      const v = Number(el('descuento-monto').value) || 0;
      el('descuento-monto').value = (Math.round(v * 2) / 2).toFixed(2);
      renderResumen();
    }
  });

  el('btn-cancelar-venta').addEventListener('click', cancelarVenta);
  el('btn-cobrar-qr').addEventListener('click', cobrarQR);
  el('btn-cobrar-efectivo').addEventListener('click', abrirCobroEfectivo);

  el('efectivo-recibido').addEventListener('input', () => {
    const { total } = renderResumen();
    const raw = el('efectivo-recibido').value;
    const cambioEl = el('efectivo-cambio');
    if (raw === '') {
      cambioEl.textContent = money(0);
      cambioEl.classList.remove('texto-alerta');
      return;
    }
    const recibido = Number(raw);
    if (recibido < total) {
      cambioEl.textContent = `Falta ${money(total - recibido)}`;
      cambioEl.classList.add('texto-alerta');
    } else {
      cambioEl.textContent = money(recibido - total);
      cambioEl.classList.remove('texto-alerta');
    }
  });

  el('btn-cerrar-modal-efectivo').addEventListener('click', () => cerrarModal(el('modal-efectivo')));
  el('btn-confirmar-efectivo').addEventListener('click', confirmarEfectivo);
  el('btn-pago-exacto').addEventListener('click', pagarEfectivoExacto);

  // Teclado dentro del cobro en efectivo: Enter confirma, Espacio = pago exacto.
  el('modal-efectivo').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); confirmarEfectivo(); }
    else if (e.key === ' ') { e.preventDefault(); pagarEfectivoExacto(); }
  });

  el('btn-cerrar-turno').addEventListener('click', abrirModalCierre);
  el('btn-cerrar-modal-cierre').addEventListener('click', () => cerrarModal(el('modal-cierre')));

  el('btn-confirmar-cierre').addEventListener('click', () => {
    const conteo = el('cierre-conteo').value;
    if (conteo === '') return toast.warning('Ingresa el conteo físico de efectivo.');
    const turno = turnoActivo();
    const cierre = cerrarCaja(turno.turnoId, conteo);
    const diffTexto = cierre.diferencia === 0
      ? '✅ Cuadra exacto.'
      : cierre.diferencia > 0
        ? `📈 Sobrante de ${money(cierre.diferencia)}.`
        : `📉 Faltante de ${money(Math.abs(cierre.diferencia))}.`;
    cerrarModal(el('modal-cierre'));
    clearSession();
    window.dispatchEvent(new CustomEvent('pos:logout'));
    toast[cierre.diferencia === 0 ? 'success' : 'warning'](`🔒 Turno cerrado. ${diffTexto}`);
  });

  // ESC en la pestaña Venta (sin ningún modal abierto) cancela la venta actual.
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const ventaActiva = el('view-dashboard').classList.contains('active') && el('tab-venta').classList.contains('active');
    const hayModal = document.querySelector('.modal:not(.hidden)');
    if (ventaActiva && !hayModal && carrito.length > 0) cancelarVenta();
  });

  actualizarAlertaStockBajo();
}

export function refrescarDashboard() {
  const s = getSession();
  el('sidebar-usuario').textContent = s?.username || '';
  el('sidebar-rol').textContent = s?.role === 'admin' ? 'Administrador' : 'Cajero';
  resetVenta();
  actualizarAlertaStockBajo();
  enfocarBusqueda();
}

// Pone el cursor en el campo de búsqueda para vender sin tener que hacer clic.
export function enfocarBusqueda() {
  const input = el('busqueda-producto');
  if (input) setTimeout(() => input.focus(), 60);
}

export { actualizarAlertaStockBajo };
