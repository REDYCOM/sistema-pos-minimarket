import { db } from './storage.js';
import { buscarProductos } from './productos.js';
import { registrarCompra, listarCompras, totalCompras, totalDeItems, totalDeCompra } from './compras.js';
import { actualizarAlertaStockBajo } from './ui-dashboard.js';
import { listarCategorias, listarProveedores, poblarSelectCatalogo, resolverValorCatalogo, vincularSelectNuevo } from './catalogo.js';
import { abrirCalculadora } from './calculadora-costo.js';
import { exportarReportePDF, tablaHTML, kpisHTML } from './pdf.js';
import { toast } from './toast.js';
import { abrirModal, cerrarModal, confirmar } from './modal.js';
import { seleccionarAlEnfocar } from './util.js';

const el = id => document.getElementById(id);
const money = n => `Bs ${Number(n).toFixed(2)}`;
const redondear2 = n => Math.round((Number(n) || 0) * 100) / 100;

// Compra en construcción (se limpia al registrar).
let items = [];

// ---------- Compra actual ----------

function renderItems() {
  const body = el('compra-items-body');
  if (items.length === 0) {
    body.innerHTML = '<tr><td colspan="7" class="hint">Aún no agregaste productos a esta compra.</td></tr>';
  } else {
    // .reverse() muestra el último ítem agregado ARRIBA. El data-idx conserva la
    // posición real en el arreglo, así que quitar y editar siguen apuntando bien.
    body.innerHTML = items.map((it, idx) => `
      <tr>
        <td>${it.nombre} ${it.productoId ? '' : '<span class="chip chip-info">nuevo</span>'}</td>
        <td><input type="number" min="1" step="1" value="${it.cantidad}" data-idx="${idx}" class="compra-cant-input bloque-cant rueda-numero" title="Editar cantidad"></td>
        <td><input type="number" min="0" step="0.01" value="${it.costoUnit}" data-idx="${idx}" class="compra-costo-input bloque-cant" title="Editar precio de compra"></td>
        <td><input type="number" min="0" step="0.01" value="${it.precioVenta ?? ''}" data-idx="${idx}" class="compra-venta-input bloque-cant" placeholder="—" title="Editar precio de venta"></td>
        <td><input type="number" min="0" step="0.01" value="${redondear2(it.cantidad * it.costoUnit)}" data-idx="${idx}" class="compra-total-input bloque-cant" title="Total pagado por este producto (se divide entre la cantidad para sacar el precio de compra)"></td>
        <td><button class="icono-btn calc-item-compra" data-idx="${idx}" title="Calcular costo">🧮</button></td>
        <td><button class="icono-btn quitar-item-compra" data-idx="${idx}" title="Quitar">✕</button></td>
      </tr>
    `).reverse().join('');
  }
  renderTotales();
}

// Calcula subtotal, descuento (con tope al subtotal) y el total ya descontado.
function renderTotales() {
  const subtotal = totalDeItems(items);
  const descuento = Math.min(Math.max(0, Number(el('compra-descuento').value) || 0), subtotal);
  el('compra-subtotal-actual').textContent = money(subtotal);
  el('compra-total-actual').textContent = money(subtotal - descuento);
  return { subtotal, descuento, total: subtotal - descuento };
}

// Agrega un producto ya existente a la compra (desde el buscador en línea).
// Precarga el último precio de compra y el precio de venta actual para ir rápido.
function agregarExistente(producto) {
  items.push({
    productoId: producto.id,
    nombre: producto.nombre,
    cantidad: 1,
    costoUnit: Number(producto.precioCompra) || 0,
    precioVenta: producto.precioVentaFinal ?? '',
  });
  renderItems();
  el('compra-buscar').value = '';
  el('compra-sugerencias').classList.add('hidden');
  el('compra-buscar').focus();
}

function poblarProveedores() {
  poblarSelectCatalogo(el('compra-proveedor'), listarProveedores(), { labelNueva: '➕ Nuevo proveedor…' });
}

// ---------- Buscador en línea de productos existentes ----------

function renderSugerenciasCompra(query) {
  const caja = el('compra-sugerencias');
  if (!query.trim()) { caja.classList.add('hidden'); caja.innerHTML = ''; return; }
  const resultados = buscarProductos(query).slice(0, 8);
  caja.innerHTML = resultados.length
    ? resultados.map(p => `<div class="sugerencia-item" data-id="${p.id}"><strong>${p.nombre}</strong> — ${p.codigo} — stock: ${p.stock}</div>`).join('')
    : '<div class="sugerencia-item">Sin resultados. Usa "➕ Nuevo producto".</div>';
  caja.classList.remove('hidden');
}

// ---------- Modal de producto NUEVO ----------

function abrirModalNuevo() {
  el('form-item-compra').reset();
  el('item-cantidad').value = 1;
  poblarSelectCatalogo(el('item-nuevo-categoria'), listarCategorias(), { labelNueva: '➕ Nueva categoría…' });
  el('item-nuevo-categoria-nueva').value = '';
  el('item-nuevo-categoria-nueva').classList.add('hidden');
  abrirModal(el('modal-item-compra'));
  setTimeout(() => el('item-nuevo-nombre').focus(), 50);
}

function agregarNuevoDesdeModal() {
  const cantidad = Number(el('item-cantidad').value);
  const costoUnit = Number(el('item-costo').value);
  if (!(cantidad >= 1)) return toast.error('La cantidad debe ser al menos 1.');
  if (!(costoUnit >= 0) || el('item-costo').value === '') return toast.error('Ingresa el costo unitario.');

  const nombre = el('item-nuevo-nombre').value.trim();
  const codigo = el('item-nuevo-codigo').value.trim();
  const categoria = resolverValorCatalogo(el('item-nuevo-categoria'), el('item-nuevo-categoria-nueva'));
  if (!nombre || !codigo || !categoria) return toast.error('Completa nombre, código y categoría del producto nuevo.');
  if (db.productos.all().some(p => p.codigo === codigo)) return toast.error(`Ya existe un producto con el código ${codigo}.`);
  if (items.some(it => !it.productoId && it.codigo === codigo)) return toast.error(`Ya agregaste un producto nuevo con el código ${codigo}.`);
  const precioVentaRaw = el('item-nuevo-precio-venta').value;
  items.push({
    productoId: null, nombre, codigo, categoria,
    categoriaRotacion: el('item-nuevo-rotacion').value,
    precioVenta: precioVentaRaw === '' ? '' : Number(precioVentaRaw),
    cantidad, costoUnit,
  });
  renderItems();
  cerrarModal(el('modal-item-compra'));
}

// ---------- Registrar compra ----------

function registrar() {
  const proveedor = resolverValorCatalogo(el('compra-proveedor'), el('compra-proveedor-nuevo'));
  if (!proveedor) return toast.warning('Indica el proveedor.');
  if (items.length === 0) return toast.warning('Agrega al menos un producto a la compra.');

  const formaPago = el('compra-forma-pago').value;
  const { descuento } = renderTotales();
  const compra = registrarCompra({ proveedor, formaPago, items, descuento });

  items = [];
  el('compra-descuento').value = 0;
  renderItems();
  poblarProveedores(); // repuebla e incluye el proveedor recién usado
  el('compra-proveedor-nuevo').value = '';
  el('compra-proveedor-nuevo').classList.add('hidden');
  renderHistorial();
  actualizarAlertaStockBajo();

  const nota = formaPago === 'caja' ? ' Se descontó de la caja.' : '';
  toast.success(`🧾 Compra registrada: ${money(compra.total)}.${nota} Stock actualizado.`);
}

// ---------- Historial ----------

function renderHistorial() {
  const desde = el('compra-filtro-fecha-desde').value;
  const hasta = el('compra-filtro-fecha-hasta').value;
  const compras = listarCompras({ desde, hasta });
  el('compras-body').innerHTML = compras.length
    ? compras.map(c => {
        // Compras nuevas traen `items`; las antiguas solo `producto`.
        // Vista compacta: "N productos · M uds" para no llenar la fila de texto.
        // El detalle completo queda en el title (al pasar el mouse) y en el PDF.
        let resumenItems, detalle;
        if (Array.isArray(c.items)) {
          const nProd = c.items.length;
          const nUds = c.items.reduce((s, i) => s + (Number(i.cantidad) || 0), 0);
          detalle = c.items.map(i => `${i.nombre} ×${i.cantidad}`).join(', ');
          resumenItems = `<span class="compra-resumen" title="${detalle.replace(/"/g, '&quot;')}">${nProd} producto${nProd === 1 ? '' : 's'} · ${nUds} uds</span>`;
        } else {
          resumenItems = c.producto || '—';
        }
        const pago = c.formaPago === 'caja'
          ? '<span class="chip chip-alerta">Caja</span>'
          : c.formaPago === 'aparte'
            ? '<span class="chip chip-info">Aparte</span>'
            : '<span class="hint">—</span>';
        return `<tr>
          <td>${new Date(c.fecha).toLocaleString('es-BO')}</td>
          <td>${c.proveedor || '—'}</td>
          <td>${resumenItems}</td>
          <td>${money(totalDeCompra(c))}</td>
          <td>${pago}</td>
          <td>${c.cajero || '—'}</td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="6" class="hint">Sin compras en el rango.</td></tr>';
  el('compras-total').textContent = `Total del período: ${money(totalCompras(compras))}`;
}

function exportarPDF() {
  const desde = el('compra-filtro-fecha-desde').value;
  const hasta = el('compra-filtro-fecha-hasta').value;
  const compras = listarCompras({ desde, hasta });
  const rango = (!desde && !hasta) ? 'Todo el histórico' : `${desde || 'inicio'} → ${hasta || 'hoy'}`;

  const filas = compras.map(c => {
    const items = Array.isArray(c.items) ? c.items.map(i => `${i.nombre} ×${i.cantidad}`).join(', ') : (c.producto || '—');
    const pago = c.formaPago === 'caja' ? 'Caja' : c.formaPago === 'aparte' ? 'Aparte' : '—';
    return [new Date(c.fecha).toLocaleString('es-BO'), c.proveedor || '—', items, money(totalDeCompra(c)), pago, c.cajero || '—'];
  });

  exportarReportePDF({
    titulo: 'Reporte de Compras',
    subtitulo: `Período: ${rango}`,
    cuerpoHTML: `
      ${kpisHTML([
        { valor: compras.length, etiqueta: 'Compras' },
        { valor: money(totalCompras(compras)), etiqueta: 'Total del período' },
      ])}
      <h2>Detalle de compras</h2>
      ${tablaHTML(['Fecha', 'Proveedor', 'Productos', 'Total', 'Pago', 'Cajero'], filas)}
    `,
  });
}

export function initCompras() {
  el('btn-agregar-item-compra').addEventListener('click', abrirModalNuevo);
  el('btn-cerrar-modal-item').addEventListener('click', () => cerrarModal(el('modal-item-compra')));
  el('btn-vaciar-compra').addEventListener('click', async () => {
    if (items.length === 0) return;
    if (await confirmar('¿Vaciar la compra actual?', { aceptar: 'Sí, vaciar', peligro: true })) { items = []; el('compra-descuento').value = 0; renderItems(); }
  });
  el('btn-registrar-compra').addEventListener('click', registrar);
  el('compra-descuento').addEventListener('input', renderTotales);
  seleccionarAlEnfocar(el('compra-descuento'));

  vincularSelectNuevo(el('compra-proveedor'), el('compra-proveedor-nuevo'));
  vincularSelectNuevo(el('item-nuevo-categoria'), el('item-nuevo-categoria-nueva'));

  // Calculadora dentro del modal de producto nuevo: al aplicar, llena cantidad y costo.
  el('btn-abrir-calculadora').addEventListener('click', () => abrirCalculadora(({ unidades, costoUnit }) => {
    if (unidades) el('item-cantidad').value = unidades;
    el('item-costo').value = costoUnit.toFixed(2);
  }));

  el('form-item-compra').addEventListener('submit', e => { e.preventDefault(); agregarNuevoDesdeModal(); });

  // Buscador en línea: agrega productos existentes sin abrir modal (registro rápido).
  el('compra-buscar').addEventListener('input', e => renderSugerenciasCompra(e.target.value));
  el('compra-buscar').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); el('compra-sugerencias').querySelector('.sugerencia-item[data-id]')?.click(); }
  });
  el('compra-sugerencias').addEventListener('click', e => {
    const item = e.target.closest('.sugerencia-item');
    if (!item || !item.dataset.id) return;
    const producto = db.productos.find(item.dataset.id);
    if (producto) agregarExistente(producto);
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.venta-buscar')) el('compra-sugerencias').classList.add('hidden');
  });

  // Clic en la tabla: quitar el ítem o abrir la calculadora de costo de esa fila.
  el('compra-items-body').addEventListener('click', e => {
    const quitar = e.target.closest('.quitar-item-compra');
    if (quitar) { items.splice(Number(quitar.dataset.idx), 1); renderItems(); return; }
    const calc = e.target.closest('.calc-item-compra');
    if (calc) {
      const idx = Number(calc.dataset.idx);
      abrirCalculadora(({ unidades, costoUnit }) => {
        if (!items[idx]) return;
        if (unidades) items[idx].cantidad = unidades;
        items[idx].costoUnit = Number(costoUnit.toFixed(2));
        renderItems();
      });
    }
  });

  // Edición en línea. La columna "Total pagado" es el reparto POR PRODUCTO: al
  // escribir el total de ese producto, su precio de compra = total ÷ cantidad
  // (así cada tipo de producto de un mismo proveedor queda con su costo real).
  // Se actualizan los campos ligados sin reconstruir la tabla (no se pierde el foco).
  el('compra-items-body').addEventListener('input', e => {
    const t = e.target;
    const it = items[Number(t.dataset.idx)];
    if (!it) return;
    const fila = t.closest('tr');
    const inputCosto = fila.children[2].querySelector('input');
    const inputTotal = fila.children[4].querySelector('input');
    if (t.classList.contains('compra-cant-input')) {
      it.cantidad = Number(t.value);
      if (inputTotal) inputTotal.value = redondear2((Number(it.cantidad) || 0) * (Number(it.costoUnit) || 0));
    } else if (t.classList.contains('compra-costo-input')) {
      it.costoUnit = Number(t.value);
      if (inputTotal) inputTotal.value = redondear2((Number(it.cantidad) || 0) * (Number(it.costoUnit) || 0));
    } else if (t.classList.contains('compra-venta-input')) {
      it.precioVenta = t.value === '' ? '' : Number(t.value);
    } else if (t.classList.contains('compra-total-input')) {
      const total = Number(t.value);
      const cant = Number(it.cantidad) || 0;
      it.costoUnit = cant > 0 ? redondear2(total / cant) : 0;
      if (inputCosto) inputCosto.value = it.costoUnit;
    } else return;
    renderTotales();
  });

  // Al salir del campo se normaliza: cantidad mínima 1 y precio de compra mínimo 0.
  el('compra-items-body').addEventListener('change', e => {
    const t = e.target;
    const it = items[Number(t.dataset.idx)];
    if (!it) return;
    const esFila = t.classList.contains('compra-cant-input') || t.classList.contains('compra-costo-input')
      || t.classList.contains('compra-venta-input') || t.classList.contains('compra-total-input');
    if (!esFila) return;
    if (!(Number(it.cantidad) >= 1)) it.cantidad = 1;
    if (!(Number(it.costoUnit) >= 0)) it.costoUnit = 0;
    renderItems(); // normaliza todos los campos ligados (precio de compra ↔ total pagado)
  });

  el('compra-filtro-fecha-desde').addEventListener('input', renderHistorial);
  el('compra-filtro-fecha-hasta').addEventListener('input', renderHistorial);
  el('btn-compras-pdf').addEventListener('click', exportarPDF);

  renderItems();
  poblarProveedores();
  renderHistorial();
}

export function refrescarCompras() {
  poblarProveedores();
  renderHistorial();
}
