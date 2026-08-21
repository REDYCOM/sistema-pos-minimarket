import { db, getSession } from './storage.js';
import { fechaLocalYMD, hoyYMD } from './util.js';

// Pantalla propia del VENDEDOR: sus ventas de un día concreto (hoy por defecto).
// Sirve sobre todo para responder "¿esta venta se registró o no?", así que lista
// venta por venta con la hora y los productos, y no solo el total.
// El admin no la usa: él tiene Ventas/Historial, que es global.

const el = id => document.getElementById(id);
const money = n => `Bs ${Number(n).toFixed(2)}`;
const horaCorta = iso => new Date(iso).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });

function diaSeleccionado() {
  const v = el('mis-fecha')?.value;
  return v || hoyYMD();
}

// Ventas del usuario logueado en el día elegido, de la más reciente a la más
// antigua (la última venta hecha queda arriba, que es la que se suele revisar).
function misVentasDelDia() {
  const usuario = getSession()?.username;
  const dia = diaSeleccionado();
  return db.ventas.all()
    .filter(v => v.cajero === usuario && fechaLocalYMD(v.fecha) === dia)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

function render() {
  const ventas = misVentasDelDia();
  const validas = ventas.filter(v => !v.cancelada);
  const total = validas.reduce((s, v) => s + v.total, 0);
  const efectivo = validas.filter(v => v.metodoPago === 'efectivo').reduce((s, v) => s + v.total, 0);
  const qr = validas.filter(v => v.metodoPago === 'qr').reduce((s, v) => s + v.total, 0);

  el('mis-kpis').innerHTML = `
    <div class="stat-tile"><span class="stat-icono">🧾</span><div><div class="stat-valor">${validas.length}</div><div class="stat-label">Ventas del día</div></div></div>
    <div class="stat-tile"><span class="stat-icono">💰</span><div><div class="stat-valor">${money(total)}</div><div class="stat-label">Total cobrado</div></div></div>
    <div class="stat-tile"><span class="stat-icono">💵</span><div><div class="stat-valor">${money(efectivo)}</div><div class="stat-label">Efectivo</div></div></div>
    <div class="stat-tile"><span class="stat-icono">📱</span><div><div class="stat-valor">${money(qr)}</div><div class="stat-label">QR</div></div></div>
  `;

  // Detalle venta por venta, con sus productos, para verificar si se registró.
  el('mis-ventas-body').innerHTML = ventas.length
    ? ventas.map((v, i) => {
        const productos = (v.items || []).map(it => `${it.nombre} ×${it.cantidad}`).join(', ') || '—';
        const pago = v.metodoPago === 'efectivo'
          ? '<span class="chip chip-ok">💵 Efectivo</span>'
          : '<span class="chip chip-info">📱 QR</span>';
        const estado = v.cancelada ? ' <span class="chip chip-alerta">Cancelada</span>' : '';
        return `<tr${v.cancelada ? ' class="fila-cancelada"' : ''}>
          <td>${ventas.length - i}</td>
          <td>${horaCorta(v.fecha)}</td>
          <td>${productos}${estado}</td>
          <td>${pago}</td>
          <td><strong>${money(v.total)}</strong></td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="5" class="hint">No registraste ninguna venta en este día.</td></tr>';

  // Resumen de qué productos salieron ese día (cuántas unidades y cuánto).
  const acc = new Map();
  validas.forEach(v => (v.items || []).forEach(it => {
    const prev = acc.get(it.productoId) || { nombre: it.nombre, cantidad: 0, monto: 0 };
    prev.cantidad += it.cantidad;
    prev.monto += it.cantidad * it.precioUnit;
    acc.set(it.productoId, prev);
  }));
  const productos = [...acc.values()].sort((a, b) => b.cantidad - a.cantidad);
  el('mis-productos-body').innerHTML = productos.length
    ? productos.map((p, i) => `<tr><td>${i + 1}</td><td>${p.nombre}</td><td>${p.cantidad}</td><td>${money(p.monto)}</td></tr>`).join('')
    : '<tr><td colspan="4" class="hint">Sin productos vendidos en este día.</td></tr>';
}

export function initMisVentas() {
  const fecha = el('mis-fecha');
  if (fecha && !fecha.value) fecha.value = hoyYMD();
  fecha?.addEventListener('input', render);
  el('btn-mis-hoy')?.addEventListener('click', () => { el('mis-fecha').value = hoyYMD(); render(); });
  render();
}

export function refrescarMisVentas() {
  // Al volver a entrar se reposiciona en hoy si quedó en un día viejo.
  const fecha = el('mis-fecha');
  if (fecha && !fecha.value) fecha.value = hoyYMD();
  render();
}
