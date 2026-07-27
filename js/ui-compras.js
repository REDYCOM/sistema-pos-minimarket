import { db } from './storage.js';
import { buscarProductos } from './productos.js';
import { registrarCompra, listarCompras, totalCompras, totalDeItems, totalDeCompra } from './compras.js';
import { actualizarAlertaStockBajo } from './ui-dashboard.js';
import { listarCategorias, listarProveedores, poblarSelectCatalogo, resolverValorCatalogo, vincularSelectNuevo } from './catalogo.js';
import { abrirCalculadora } from './calculadora-costo.js';
import { exportarReportePDF, tablaHTML, kpisHTML } from './pdf.js';
import { toast } from './toast.js';
import { abrirModal, cerrarModal, confirmar } from './modal.js';

const el = id => document.getElementById(id);
const money = n => `Bs ${Number(n).toFixed(2)}`;

// Compra en construcción (se limpia al registrar).
let items = [];
let modoItem = 'existente';
let productoElegido = null; // { id, nombre } cuando el modo es 'existente'

// ---------- Compra actual ----------

function renderItems() {
  const body = el('compra-items-body');
  if (items.length === 0) {
    body.innerHTML = '<tr><td colspan="5" class="hint">Aún no agregaste productos a esta compra.</td></tr>';
  } else {
    // .reverse() muestra el último ítem agregado ARRIBA. El data-idx conserva la
    // posición real en el arreglo, así que quitar y editar siguen apuntando bien.
    body.innerHTML = items.map((it, idx) => `
      <tr>
        <td>${it.nombre} ${it.productoId ? '' : '<span class="chip chip-info">nuevo</span>'}</td>
        <td><input type="number" min="1" step="1" value="${it.cantidad}" data-idx="${idx}" class="compra-cant-input bloque-cant" title="Editar cantidad"></td>
        <td><input type="number" min="0" step="0.01" value="${it.costoUnit}" data-idx="${idx}" class="compra-costo-input bloque-cant" title="Editar costo"></td>
        <td>${money(it.cantidad * it.costoUnit)}</td>
        <td><button class="icono-btn quitar-item-compra" data-idx="${idx}" title="Quitar">✕</button></td>
      </tr>
    `).reverse().join('');
  }
  el('compra-total-actual').textContent = money(totalDeItems(items));
}

function poblarProveedores() {
  poblarSelectCatalogo(el('compra-proveedor'), listarProveedores(), { labelNueva: '➕ Nuevo proveedor…' });
}

// ---------- Modal de ítem ----------

function setModo(modo) {
  modoItem = modo;
  document.querySelectorAll('#item-modo-toggle .segmento-btn')
    .forEach(b => b.classList.toggle('active', b.dataset.modo === modo));
  el('item-existente').classList.toggle('hidden', modo !== 'existente');
  el('item-nuevo').classList.toggle('hidden', modo !== 'nuevo');
}

function abrirModalItem() {
  productoElegido = null;
  el('form-item-compra').reset();
  el('item-buscar').value = '';
  el('item-existente-elegido').textContent = 'Ningún producto seleccionado.';
  el('item-sugerencias').classList.add('hidden');
  el('item-cantidad').value = 1;
  poblarSelectCatalogo(el('item-nuevo-categoria'), listarCategorias(), { labelNueva: '➕ Nueva categoría…' });
  el('item-nuevo-categoria-nueva').value = '';
  el('item-nuevo-categoria-nueva').classList.add('hidden');
  setModo('existente');
  abrirModal(el('modal-item-compra'));
}

function renderSugerenciasItem(query) {
  const caja = el('item-sugerencias');
  if (!query.trim()) { caja.classList.add('hidden'); caja.innerHTML = ''; return; }
  const resultados = buscarProductos(query).slice(0, 8);
  caja.innerHTML = resultados.length
    ? resultados.map(p => `<div class="sugerencia-item" data-id="${p.id}"><strong>${p.nombre}</strong> — ${p.codigo} — stock: ${p.stock}</div>`).join('')
    : '<div class="sugerencia-item">Sin resultados. Usa "Producto nuevo".</div>';
  caja.classList.remove('hidden');
}

function agregarItemDesdeModal() {
  const cantidad = Number(el('item-cantidad').value);
  const costoUnit = Number(el('item-costo').value);
  if (!(cantidad >= 1)) return toast.error('La cantidad debe ser al menos 1.');
  if (!(costoUnit >= 0) || el('item-costo').value === '') return toast.error('Ingresa el costo unitario.');

  if (modoItem === 'existente') {
    if (!productoElegido) return toast.warning('Selecciona un producto de la lista.');
    items.push({ productoId: productoElegido.id, nombre: productoElegido.nombre, cantidad, costoUnit });
  } else {
    const nombre = el('item-nuevo-nombre').value.trim();
    const codigo = el('item-nuevo-codigo').value.trim();
    const categoria = resolverValorCatalogo(el('item-nuevo-categoria'), el('item-nuevo-categoria-nueva'));
    if (!nombre || !codigo || !categoria) return toast.error('Completa nombre, código y categoría del producto nuevo.');
    if (db.productos.all().some(p => p.codigo === codigo)) return toast.error(`Ya existe un producto con el código ${codigo}.`);
    const precioVentaRaw = el('item-nuevo-precio-venta').value;
    items.push({
      productoId: null, nombre, codigo, categoria,
      categoriaRotacion: el('item-nuevo-rotacion').value,
      precioVenta: precioVentaRaw === '' ? '' : Number(precioVentaRaw),
      cantidad, costoUnit,
    });
  }
  renderItems();
  cerrarModal(el('modal-item-compra'));
}

// ---------- Registrar compra ----------

function registrar() {
  const proveedor = resolverValorCatalogo(el('compra-proveedor'), el('compra-proveedor-nuevo'));
  if (!proveedor) return toast.warning('Indica el proveedor.');
  if (items.length === 0) return toast.warning('Agrega al menos un producto a la compra.');

  const formaPago = el('compra-forma-pago').value;
  const compra = registrarCompra({ proveedor, formaPago, items });

  items = [];
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
        const resumenItems = Array.isArray(c.items)
          ? c.items.map(i => `${i.nombre} ×${i.cantidad}`).join(', ')
          : (c.producto || '—');
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
  el('btn-agregar-item-compra').addEventListener('click', abrirModalItem);
  el('btn-cerrar-modal-item').addEventListener('click', () => cerrarModal(el('modal-item-compra')));
  el('btn-vaciar-compra').addEventListener('click', async () => {
    if (items.length === 0) return;
    if (await confirmar('¿Vaciar la compra actual?', { aceptar: 'Sí, vaciar', peligro: true })) { items = []; renderItems(); }
  });
  el('btn-registrar-compra').addEventListener('click', registrar);

  document.querySelectorAll('#item-modo-toggle .segmento-btn')
    .forEach(b => b.addEventListener('click', () => setModo(b.dataset.modo)));

  vincularSelectNuevo(el('compra-proveedor'), el('compra-proveedor-nuevo'));
  vincularSelectNuevo(el('item-nuevo-categoria'), el('item-nuevo-categoria-nueva'));

  // Calculadora de costo real (prorrateo). Al aplicar, llena cantidad y costo.
  el('btn-abrir-calculadora').addEventListener('click', () => abrirCalculadora(({ unidades, costoUnit }) => {
    if (unidades) el('item-cantidad').value = unidades;
    el('item-costo').value = costoUnit.toFixed(2);
  }));

  el('form-item-compra').addEventListener('submit', e => { e.preventDefault(); agregarItemDesdeModal(); });

  el('item-buscar').addEventListener('input', e => renderSugerenciasItem(e.target.value));
  el('item-buscar').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); el('item-sugerencias').querySelector('.sugerencia-item[data-id]')?.click(); }
  });
  el('item-sugerencias').addEventListener('click', e => {
    const item = e.target.closest('.sugerencia-item');
    if (!item || !item.dataset.id) return;
    const producto = db.productos.find(item.dataset.id);
    productoElegido = { id: producto.id, nombre: producto.nombre };
    el('item-existente-elegido').textContent = `Seleccionado: ${producto.nombre} (stock actual: ${producto.stock})`;
    el('item-buscar').value = producto.nombre;
    el('item-sugerencias').classList.add('hidden');
  });

  el('compra-items-body').addEventListener('click', e => {
    const btn = e.target.closest('.quitar-item-compra');
    if (!btn) return;
    items.splice(Number(btn.dataset.idx), 1);
    renderItems();
  });

  // Edición en línea de cantidad y costo (por si te equivocas al agregar). Mientras
  // escribes solo se recalcula el subtotal de la fila y el total, sin reconstruir la
  // tabla, para no perder el foco del campo.
  el('compra-items-body').addEventListener('input', e => {
    const esCant = e.target.classList.contains('compra-cant-input');
    const esCosto = e.target.classList.contains('compra-costo-input');
    if (!esCant && !esCosto) return;
    const it = items[Number(e.target.dataset.idx)];
    if (!it) return;
    if (esCant) it.cantidad = Number(e.target.value);
    else it.costoUnit = Number(e.target.value);
    const fila = e.target.closest('tr');
    fila.children[3].textContent = money((Number(it.cantidad) || 0) * (Number(it.costoUnit) || 0));
    el('compra-total-actual').textContent = money(totalDeItems(items));
  });

  // Al salir del campo se normaliza: cantidad mínima 1 y costo mínimo 0.
  el('compra-items-body').addEventListener('change', e => {
    const esCant = e.target.classList.contains('compra-cant-input');
    const esCosto = e.target.classList.contains('compra-costo-input');
    if (!esCant && !esCosto) return;
    const it = items[Number(e.target.dataset.idx)];
    if (!it) return;
    if (esCant && !(Number(it.cantidad) >= 1)) it.cantidad = 1;
    if (esCosto && !(Number(it.costoUnit) >= 0)) it.costoUnit = 0;
    renderItems();
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
