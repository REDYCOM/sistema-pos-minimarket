import { db } from './storage.js';
import { buscarProductos, tienePrecioFinal, productosConStockBajo } from './productos.js';
import { calcularSubtotal, calcularDescuento, registrarVenta } from './ventas.js';
import { turnoActivo, calcularEfectivoEsperado, cerrarCaja } from './caja.js';
import { clearSession, getSession, getConfig } from './storage.js';
import { imprimirTicket } from './ticket.js';
import { toast } from './toast.js';
import { abrirModal, cerrarModal, confirmar } from './modal.js';
import { refrescarAvisos } from './avisos.js';
import { seleccionarAlEnfocar, navegarSugerencias } from './util.js';

let carrito = [];
let ultimaVenta = null; // para reimprimir el ticket sin frenar la venta

const el = id => document.getElementById(id);

// Tras cobrar: guarda la venta para el botón de ticket y, si está activado el
// modo automático, la imprime. Por defecto NO imprime (no frena la venta rápida).
function trasVenta(venta) {
  ultimaVenta = venta;
  const btn = el('btn-ultimo-ticket');
  if (btn) btn.disabled = false;
  if (getConfig().ticketAuto) imprimirTicket(venta);
}

function money(n) {
  return `Bs ${Number(n).toFixed(2)}`;
}

function renderCarrito() {
  const body = el('carrito-body');
  body.innerHTML = '';
  // Se recorre del último al primero para que el producto recién agregado
  // aparezca ARRIBA. El data-idx conserva la posición real en el arreglo, así
  // que quitar/editar cantidad siguen funcionando igual.
  for (let idx = carrito.length - 1; idx >= 0; idx--) {
    const item = carrito[idx];
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.nombre}</td>
      <td><input type="number" min="1" value="${item.cantidad}" data-idx="${idx}" class="cantidad-input bloque-cant rueda-numero"></td>
      <td><span class="bloque bloque-precio">${money(item.precioUnit)}</span></td>
      <td><span class="bloque bloque-total">${money(item.precioUnit * item.cantidad)}</span></td>
      <td><button class="icono-btn quitar-item" data-idx="${idx}" title="Quitar">✕</button></td>
    `;
    body.appendChild(tr);
  }
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
  const existente = carrito.find(i => i.id === producto.id);
  const nuevaCantidad = existente ? existente.cantidad + 1 : 1;
  // Se permite vender aunque no haya stock: a veces hay unidades físicas que no se
  // registraron y no hay que perder la venta. En vez de bloquear, solo se avisa;
  // los productos que queden en stock negativo aparecen en Avisos para registrarlos.
  if (nuevaCantidad > producto.stock) {
    toast.warning(`⚠️ "${producto.nombre}" se vende sin stock. Recuerda registrarlo (aparecerá en Avisos).`);
  }
  if (existente) existente.cantidad = nuevaCantidad;
  else carrito.push({ id: producto.id, nombre: producto.nombre, precioUnit: producto.precioVentaFinal, cantidad: 1 });
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
  const r = calcularEfectivoEsperado(turno.turnoId);
  el('cierre-resumen').innerHTML = `
    <div class="cierre-bloque">
      <h4>🛒 Ventas del turno</h4>
      <div class="cierre-linea"><span>💵 Efectivo</span><strong>${money(r.ventasEfectivo)}</strong></div>
      <div class="cierre-linea"><span>📱 QR</span><strong>${money(r.ventasQR)}</strong></div>
      <div class="cierre-linea cierre-linea-total"><span>Total vendido</span><strong>${money(r.totalVendido)}</strong></div>
    </div>
    <div class="cierre-bloque">
      <h4>🧾 Compras del turno</h4>
      <div class="cierre-linea"><span>Pagadas de caja</span><strong>${money(r.comprasCaja)}</strong></div>
      <div class="cierre-linea"><span>Pagadas aparte</span><strong>${money(r.comprasAparte)}</strong></div>
      <p class="hint">Las pagadas de caja ya están incluidas en las salidas de abajo.</p>
    </div>
    <div class="cierre-bloque">
      <h4>💵 Efectivo esperado en caja</h4>
      <div class="cierre-linea"><span>Apertura</span><strong>${money(r.montoApertura)}</strong></div>
      <div class="cierre-linea"><span>+ Ventas en efectivo</span><strong>${money(r.ventasEfectivo)}</strong></div>
      <div class="cierre-linea"><span>+ Entradas de dinero</span><strong>${money(r.entradas)}</strong></div>
      <div class="cierre-linea"><span>− Salidas de dinero</span><strong>${money(r.salidas)}</strong></div>
      <div class="cierre-linea cierre-linea-total"><span>Efectivo esperado</span><strong>${money(r.esperado)}</strong></div>
    </div>
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
  trasVenta(registrarVenta({ carrito, descuentoAplicado: descuento, metodoPago: 'qr' }));
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
  trasVenta(registrarVenta({ carrito, descuentoAplicado: descuento, metodoPago: 'efectivo', montoRecibido: total }));
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
  trasVenta(registrarVenta({ carrito, descuentoAplicado: descuento, metodoPago: 'efectivo', montoRecibido: recibido }));
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
  // Navegación con flechas ↑/↓ en las sugerencias (antes del keydown propio).
  navegarSugerencias(el('busqueda-producto'), el('sugerencias'));
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
    let nueva = Number(e.target.value);
    if (nueva < 1) nueva = 1;
    item.cantidad = nueva; // se permite superar el stock (venta sin stock registrado)
    renderCarrito();
  });

  el('carrito-body').addEventListener('click', e => {
    if (!e.target.classList.contains('quitar-item')) return;
    carrito.splice(Number(e.target.dataset.idx), 1);
    renderCarrito();
    enfocarBusqueda(); // tras quitar, el cursor vuelve al código de barras
  });

  // Mantener el cursor en el código de barras al volver a la ventana/pestaña
  // (ej. tras usar otra aplicación), si la pestaña Venta está activa y no hay
  // ningún modal abierto (para no interrumpir un cobro en curso).
  const reenfocarSiVenta = () => {
    const ventaActiva = el('view-dashboard').classList.contains('active') && el('tab-venta').classList.contains('active');
    const hayModal = document.querySelector('.modal:not(.hidden)');
    if (ventaActiva && !hayModal) enfocarBusqueda();
  };
  window.addEventListener('focus', reenfocarSiVenta);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reenfocarSiVenta(); });

  el('descuento-monto').addEventListener('input', renderResumen);
  el('descuento-tipo').addEventListener('change', renderResumen);
  seleccionarAlEnfocar(el('descuento-monto'));
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
  el('btn-ultimo-ticket').addEventListener('click', () => { if (ultimaVenta) imprimirTicket(ultimaVenta); });

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
