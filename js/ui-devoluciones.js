import { db } from './storage.js';
import { buscarProductos } from './productos.js';
import { registrarDevolucion, listarDevoluciones, totalDevoluciones } from './devoluciones.js';
import { actualizarAlertaStockBajo } from './ui-dashboard.js';
import { toast } from './toast.js';
import { confirmar } from './modal.js';

const el = id => document.getElementById(id);
const money = n => `Bs ${Number(n).toFixed(2)}`;

// Devolución en construcción (se limpia al registrar).
let items = [];

function renderItems() {
  const body = el('devolucion-items-body');
  if (items.length === 0) {
    body.innerHTML = '<tr><td colspan="5" class="hint">Aún no agregaste productos a devolver.</td></tr>';
  } else {
    // .reverse() muestra el último agregado arriba; data-idx conserva la posición real.
    body.innerHTML = items.map((it, idx) => `
      <tr>
        <td>${it.nombre}</td>
        <td><input type="number" min="1" step="1" value="${it.cantidad}" data-idx="${idx}" class="dev-cant-input bloque-cant rueda-numero" title="Cantidad devuelta"></td>
        <td><input type="number" min="0" step="0.01" value="${it.precioUnit}" data-idx="${idx}" class="dev-precio-input bloque-cant" title="Precio devuelto por unidad"></td>
        <td>${money(it.cantidad * it.precioUnit)}</td>
        <td><button class="icono-btn quitar-item-dev" data-idx="${idx}" title="Quitar">✕</button></td>
      </tr>
    `).reverse().join('');
  }
  renderTotal();
}

function renderTotal() {
  const total = items.reduce((s, it) => s + (Number(it.cantidad) || 0) * (Number(it.precioUnit) || 0), 0);
  el('devolucion-total-actual').textContent = money(total);
  return total;
}

// Al agregar un producto se precarga su precio de venta como monto a devolver.
function agregarProducto(producto) {
  items.push({
    productoId: producto.id,
    nombre: producto.nombre,
    cantidad: 1,
    precioUnit: producto.precioVentaFinal ?? 0,
  });
  renderItems();
  el('devolucion-buscar').value = '';
  el('devolucion-sugerencias').classList.add('hidden');
  el('devolucion-buscar').focus();
}

function renderSugerencias(query) {
  const caja = el('devolucion-sugerencias');
  if (!query.trim()) { caja.classList.add('hidden'); caja.innerHTML = ''; return; }
  const resultados = buscarProductos(query).slice(0, 8);
  caja.innerHTML = resultados.length
    ? resultados.map(p => `<div class="sugerencia-item" data-id="${p.id}"><strong>${p.nombre}</strong> — ${p.codigo} — stock: ${p.stock}</div>`).join('')
    : '<div class="sugerencia-item">Sin resultados.</div>';
  caja.classList.remove('hidden');
}

function registrar() {
  if (items.length === 0) return toast.warning('Agrega al menos un producto a devolver.');
  const total = renderTotal();
  if (!(total > 0)) return toast.warning('El monto a devolver debe ser mayor a 0.');
  const metodo = el('devolucion-metodo').value;
  const motivo = el('devolucion-motivo').value.trim();
  const dev = registrarDevolucion({ items, metodo, motivo });

  items = [];
  renderItems();
  el('devolucion-motivo').value = '';
  renderHistorial();
  actualizarAlertaStockBajo();

  const nota = metodo === 'efectivo' ? ' Se descontó de la caja.' : '';
  toast.success(`↩️ Devolución registrada: ${money(dev.total)}.${nota} Stock actualizado.`);
}

function renderHistorial() {
  const desde = el('devolucion-filtro-fecha-desde').value;
  const hasta = el('devolucion-filtro-fecha-hasta').value;
  const devs = listarDevoluciones({ desde, hasta });
  el('devoluciones-body').innerHTML = devs.length
    ? devs.map(d => {
        const resumen = Array.isArray(d.items) ? d.items.map(i => `${i.nombre} ×${i.cantidad}`).join(', ') : '—';
        const pago = d.metodo === 'efectivo'
          ? '<span class="chip chip-alerta">Efectivo</span>'
          : '<span class="chip chip-info">QR</span>';
        return `<tr>
          <td>${new Date(d.fecha).toLocaleString('es-BO')}</td>
          <td>${resumen}</td>
          <td>${money(d.total)}</td>
          <td>${pago}</td>
          <td>${d.motivo || '—'}</td>
          <td>${d.cajero || '—'}</td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="6" class="hint">Sin devoluciones en el rango.</td></tr>';
  el('devoluciones-total').textContent = `Total del período: ${money(totalDevoluciones(devs))}`;
}

export function initDevoluciones() {
  el('btn-vaciar-devolucion').addEventListener('click', async () => {
    if (items.length === 0) return;
    if (await confirmar('¿Vaciar la devolución actual?', { aceptar: 'Sí, vaciar', peligro: true })) { items = []; renderItems(); }
  });
  el('btn-registrar-devolucion').addEventListener('click', registrar);

  // Buscador en línea de productos existentes.
  el('devolucion-buscar').addEventListener('input', e => renderSugerencias(e.target.value));
  el('devolucion-buscar').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); el('devolucion-sugerencias').querySelector('.sugerencia-item[data-id]')?.click(); }
  });
  el('devolucion-sugerencias').addEventListener('click', e => {
    const item = e.target.closest('.sugerencia-item');
    if (!item || !item.dataset.id) return;
    const producto = db.productos.find(item.dataset.id);
    if (producto) agregarProducto(producto);
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#tab-devoluciones .venta-buscar')) el('devolucion-sugerencias').classList.add('hidden');
  });

  // Quitar ítem de la lista.
  el('devolucion-items-body').addEventListener('click', e => {
    const btn = e.target.closest('.quitar-item-dev');
    if (!btn) return;
    items.splice(Number(btn.dataset.idx), 1);
    renderItems();
  });

  // Edición en línea de cantidad y precio devuelto (recalcula sin reconstruir la tabla).
  el('devolucion-items-body').addEventListener('input', e => {
    const t = e.target;
    const it = items[Number(t.dataset.idx)];
    if (!it) return;
    if (t.classList.contains('dev-cant-input')) it.cantidad = Number(t.value);
    else if (t.classList.contains('dev-precio-input')) it.precioUnit = Number(t.value);
    else return;
    const fila = t.closest('tr');
    fila.children[3].textContent = money((Number(it.cantidad) || 0) * (Number(it.precioUnit) || 0));
    renderTotal();
  });
  el('devolucion-items-body').addEventListener('change', e => {
    const t = e.target;
    const it = items[Number(t.dataset.idx)];
    if (!it) return;
    if (t.classList.contains('dev-cant-input') && !(Number(it.cantidad) >= 1)) { it.cantidad = 1; renderItems(); }
    else if (t.classList.contains('dev-precio-input') && !(Number(it.precioUnit) >= 0)) { it.precioUnit = 0; renderItems(); }
  });

  el('devolucion-filtro-fecha-desde').addEventListener('input', renderHistorial);
  el('devolucion-filtro-fecha-hasta').addEventListener('input', renderHistorial);

  renderItems();
  renderHistorial();
}

export function refrescarDevoluciones() {
  renderHistorial();
}
