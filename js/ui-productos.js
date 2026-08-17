import { db } from './storage.js';
import {
  buscarProductos, precioSugerido, tienePrecioFinal,
  crearProducto, actualizarProducto, eliminarProducto, productosConStockBajo, nivelStock,
} from './productos.js';
import { actualizarAlertaStockBajo } from './ui-dashboard.js';
import { listarCategorias, listarProveedores, poblarSelectCatalogo, resolverValorCatalogo, vincularSelectNuevo } from './catalogo.js';
import { exportarInventarioExcel, importarInventarioExcel } from './backup.js';
import { refrescarAvisos } from './avisos.js';
import { toast } from './toast.js';
import { abrirModal, cerrarModal, confirmar } from './modal.js';

const el = id => document.getElementById(id);
const money = n => `Bs ${Number(n).toFixed(2)}`;

const TITULO_NIVEL = { bajo: 'Stock bajo', medio: 'Stock medio', alto: 'Stock alto' };
// Bolita de color + valor de stock.
function celdaStock(p) {
  const nivel = nivelStock(p);
  return `<span class="stock-celda"><span class="bolita bolita-${nivel}" title="${TITULO_NIVEL[nivel]}"></span>${p.stock}</span>`;
}

// ---------- INVENTARIO ----------

function poblarCategorias() {
  const categorias = listarCategorias();
  const select = el('inv-filtro-categoria');
  const actual = select.value;
  select.innerHTML = '<option value="">Todas las categorías</option>' +
    categorias.map(c => `<option value="${c}">${c}</option>`).join('');
  select.value = actual;
}

function renderInventario() {
  poblarCategorias();
  const query = el('inv-buscar').value;
  const categoria = el('inv-filtro-categoria').value;
  const filtroStock = el('inv-filtro-stock').value;

  let productos = buscarProductos(query);
  if (categoria) productos = productos.filter(p => p.categoria === categoria);
  if (filtroStock === 'bajo') productos = productos.filter(p => p.stock < p.stockMinimo);
  if (filtroStock === 'alto') productos = productos.filter(p => p.stock >= p.stockMinimo * 2);

  const body = el('inventario-body');
  body.innerHTML = productos.map(p => `
    <tr class="${!tienePrecioFinal(p) ? 'fila-sin-precio' : ''}">
      <td>${p.codigo}</td>
      <td>${p.nombre}</td>
      <td>${p.categoria}</td>
      <td>${p.categoriaRotacion}</td>
      <td>${celdaStock(p)}</td>
      <td>${money(p.precioCompra)}</td>
      <td>${money(precioSugerido(p))}</td>
      <td>${tienePrecioFinal(p) ? money(p.precioVentaFinal) : '<span class="texto-alerta">⚠️ Producto sin precio de venta</span>'}</td>
    </tr>
  `).join('');

  const bajos = productosConStockBajo();
  const alerta = el('stock-bajo-lista');
  const filtroActivo = el('inv-filtro-stock').value === 'bajo';
  if (bajos.length > 0 && !filtroActivo) {
    // Resumen compacto (no lista todos los nombres, que puede ser enorme).
    alerta.innerHTML = `⚠️ <strong>${bajos.length}</strong> producto(s) con stock bajo o agotado. <button type="button" id="btn-ver-bajos" class="btn-mini">Ver solo esos</button>`;
    alerta.classList.remove('hidden');
  } else {
    alerta.classList.add('hidden');
  }
}

// La exportación/importación de inventario vive en backup.js (se comparte con
// el apartado de Respaldo de Configuración).

// ---------- PRODUCTOS ----------

function renderProductos() {
  const query = el('prod-buscar').value;
  const filtroPrecio = el('prod-filtro-precio').value;
  let productos = buscarProductos(query);

  // Filtro por precios faltantes (para ubicar rápido lo que falta completar).
  const sinVenta = p => !tienePrecioFinal(p);
  const sinCompra = p => !(Number(p.precioCompra) > 0);
  if (filtroPrecio === 'sin-venta') productos = productos.filter(sinVenta);
  else if (filtroPrecio === 'sin-compra') productos = productos.filter(sinCompra);
  else if (filtroPrecio === 'sin-alguno') productos = productos.filter(p => sinVenta(p) || sinCompra(p));
  else if (filtroPrecio === 'sin-ambos') productos = productos.filter(p => sinVenta(p) && sinCompra(p));
  else if (filtroPrecio === 'stock-negativo') productos = productos.filter(p => Number(p.stock) < 0);

  const body = el('productos-body');
  body.innerHTML = productos.map(p => `
    <tr>
      <td>${p.codigo}</td>
      <td>${p.nombre}</td>
      <td>${p.categoria}</td>
      <td>${p.proveedor || '—'}</td>
      <td>${celdaStock(p)}</td>
      <td>${money(p.precioCompra)}</td>
      <td>${tienePrecioFinal(p) ? money(p.precioVentaFinal) : '<span class="texto-alerta">⚠️ Sin precio</span>'}</td>
      <td>
        <button class="icono-btn editar-producto" data-id="${p.id}" title="Editar">✏️</button>
        <button class="icono-btn eliminar-producto" data-id="${p.id}" title="Eliminar">🗑️</button>
      </td>
    </tr>
  `).join('');
}

function actualizarPrecioSugeridoModal() {
  const precioCompra = Number(el('prod-precio-compra').value) || 0;
  const rotacion = el('prod-rotacion').value;
  el('prod-precio-sugerido').textContent = money(precioSugerido({ precioCompra, categoriaRotacion: rotacion }));
}

function abrirModalProducto(producto = null) {
  el('modal-producto-titulo').textContent = producto ? 'Editar producto' : 'Nuevo producto';
  el('prod-id').value = producto?.id || '';
  el('prod-nombre').value = producto?.nombre || '';
  el('prod-codigo').value = producto?.codigo || '';
  poblarSelectCatalogo(el('prod-categoria'), listarCategorias(), { labelNueva: '➕ Nueva categoría…', valorSeleccionado: producto?.categoria || '' });
  el('prod-categoria-nueva').value = '';
  el('prod-categoria-nueva').classList.add('hidden');
  el('prod-rotacion').value = producto?.categoriaRotacion || 'B';
  poblarSelectCatalogo(el('prod-proveedor'), listarProveedores(), { labelNueva: '➕ Nuevo proveedor…', valorSeleccionado: producto?.proveedor || '', placeholder: '— Sin proveedor —' });
  el('prod-proveedor-nuevo').value = '';
  el('prod-proveedor-nuevo').classList.add('hidden');
  el('prod-stock').value = producto ? producto.stock : '';
  el('prod-stock-minimo').value = producto ? producto.stockMinimo : 5;
  el('prod-precio-compra').value = producto ? producto.precioCompra : '';
  el('prod-precio-venta').value = producto && producto.precioVentaFinal !== null ? producto.precioVentaFinal : '';
  actualizarPrecioSugeridoModal();
  abrirModal(el('modal-producto'));
}

function renderTodo() {
  renderInventario();
  renderProductos();
  actualizarAlertaStockBajo();
  refrescarAvisos();
}

export function initProductosInventario() {
  ['inv-buscar', 'inv-filtro-categoria', 'inv-filtro-stock'].forEach(id =>
    el(id).addEventListener('input', renderInventario));
  el('inv-filtro-categoria').addEventListener('change', renderInventario);
  el('inv-filtro-stock').addEventListener('change', renderInventario);

  // "Ver solo esos" del aviso de stock bajo → aplica el filtro de stock bajo.
  el('stock-bajo-lista').addEventListener('click', e => {
    if (e.target.id === 'btn-ver-bajos') {
      el('inv-filtro-stock').value = 'bajo';
      renderInventario();
    }
  });

  el('btn-exportar-excel').addEventListener('click', exportarInventarioExcel);
  el('btn-importar-excel').addEventListener('click', () => el('input-importar-excel').click());
  el('input-importar-excel').addEventListener('change', e => {
    if (e.target.files[0]) importarInventarioExcel(e.target.files[0], renderTodo);
    e.target.value = '';
  });

  el('prod-buscar').addEventListener('input', renderProductos);
  el('prod-filtro-precio').addEventListener('change', renderProductos);
  el('btn-nuevo-producto').addEventListener('click', () => abrirModalProducto());
  el('btn-cerrar-modal-producto').addEventListener('click', () => cerrarModal(el('modal-producto')));

  el('prod-precio-compra').addEventListener('input', actualizarPrecioSugeridoModal);
  el('prod-rotacion').addEventListener('change', actualizarPrecioSugeridoModal);
  vincularSelectNuevo(el('prod-categoria'), el('prod-categoria-nueva'));
  vincularSelectNuevo(el('prod-proveedor'), el('prod-proveedor-nuevo'));

  el('productos-body').addEventListener('click', async e => {
    const editarBtn = e.target.closest('.editar-producto');
    const eliminarBtn = e.target.closest('.eliminar-producto');
    if (editarBtn) {
      abrirModalProducto(db.productos.find(editarBtn.dataset.id));
    } else if (eliminarBtn) {
      const prod = db.productos.find(eliminarBtn.dataset.id);
      const ok = await confirmar(`¿Eliminar el producto "${prod?.nombre || ''}"?`, { aceptar: 'Sí, eliminar', peligro: true });
      if (ok) {
        eliminarProducto(eliminarBtn.dataset.id);
        // Se MANTIENE el filtro/búsqueda para seguir trabajando sobre el mismo listado.
        renderTodo();
        toast.info('🗑️ Producto eliminado.');
        el('prod-buscar').focus();
      }
    }
  });

  el('form-producto').addEventListener('submit', e => {
    e.preventDefault();
    const id = el('prod-id').value;
    const categoria = resolverValorCatalogo(el('prod-categoria'), el('prod-categoria-nueva'));
    if (!categoria) return toast.error('Selecciona o escribe una categoría.');
    const datos = {
      nombre: el('prod-nombre').value.trim(),
      codigo: el('prod-codigo').value.trim(),
      categoria,
      categoriaRotacion: el('prod-rotacion').value,
      proveedor: resolverValorCatalogo(el('prod-proveedor'), el('prod-proveedor-nuevo')),
      stock: el('prod-stock').value,
      stockMinimo: el('prod-stock-minimo').value,
      precioCompra: el('prod-precio-compra').value,
      precioVentaFinal: el('prod-precio-venta').value,
    };
    if (id) actualizarProducto(id, datos);
    else crearProducto(datos);
    cerrarModal(el('modal-producto'));
    // Se MANTIENE el filtro/búsqueda para seguir trabajando sobre el mismo listado.
    renderTodo();
    toast.success('✅ Actualizado satisfactoriamente.');
    el('prod-buscar').focus();
  });

  renderTodo();
}

export { renderTodo as refrescarProductosInventario };
