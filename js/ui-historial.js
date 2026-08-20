import {
  rankingProductos, productosSinVenta, resumenVentas,
  aperturasEnRango, cierresEnRango, ventasPorCajero,
  gananciaEnRango, rankingGanancia, ventasPorDia,
} from './reportes.js';
import { exportarReportePDF, tablaHTML, kpisHTML } from './pdf.js';
import { getSession } from './storage.js';

const el = id => document.getElementById(id);
const money = n => `Bs ${Number(n).toFixed(2)}`;
const fechaHora = iso => new Date(iso).toLocaleString('es-BO');
const soloFecha = iso => new Date(iso).toLocaleDateString('es-BO');
// 'YYYY-MM-DD' → "lun 18/08/2026" (día de la semana, sin depender de zona horaria).
const diaLegible = ymd => {
  const [a, m, d] = ymd.split('-').map(Number);
  const fecha = new Date(a, m - 1, d);
  const dow = fecha.toLocaleDateString('es-BO', { weekday: 'short' });
  return `${dow} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${a}`;
};

function rangoActual() {
  return { desde: el('hist-desde').value, hasta: el('hist-hasta').value };
}

function etiquetaRango() {
  const { desde, hasta } = rangoActual();
  if (!desde && !hasta) return 'Todo el histórico';
  return `${desde || 'inicio'} → ${hasta || 'hoy'}`;
}

function render() {
  const rango = rangoActual();
  const resumen = resumenVentas(rango);
  const ganancia = gananciaEnRango(rango);
  const ranking = rankingProductos(rango);
  const rentables = rankingGanancia(rango);
  const sinVenta = productosSinVenta(rango);
  const aperturas = aperturasEnRango(rango);
  const cierres = cierresEnRango(rango);

  el('hist-kpis').innerHTML = `
    <div class="stat-tile"><span class="stat-icono">🧾</span><div><div class="stat-valor">${resumen.cantidadVentas}</div><div class="stat-label">Ventas</div></div></div>
    <div class="stat-tile"><span class="stat-icono">💰</span><div><div class="stat-valor">${money(resumen.totalVendido)}</div><div class="stat-label">Total vendido</div></div></div>
    <div class="stat-tile"><span class="stat-icono">📈</span><div><div class="stat-valor">${money(ganancia.ganancia)}</div><div class="stat-label">Ganancia (${ganancia.margen.toFixed(0)}%)</div></div></div>
    <div class="stat-tile"><span class="stat-icono">💵</span><div><div class="stat-valor">${money(resumen.efectivo)}</div><div class="stat-label">Efectivo</div></div></div>
    <div class="stat-tile"><span class="stat-icono">📱</span><div><div class="stat-valor">${money(resumen.qr)}</div><div class="stat-label">QR</div></div></div>
    <div class="stat-tile"><span class="stat-icono">🎫</span><div><div class="stat-valor">${money(resumen.ticketPromedio)}</div><div class="stat-label">Ticket promedio</div></div></div>
  `;

  const porDia = ventasPorDia(rango);
  el('hist-por-dia').innerHTML = porDia.length
    ? porDia.map(d => `<tr><td>${diaLegible(d.dia)}</td><td>${d.cantidad}</td><td>${money(d.efectivo)}</td><td>${money(d.qr)}</td><td><strong>${money(d.total)}</strong></td><td>${money(d.ganancia)}</td></tr>`).join('')
    : '<tr><td colspan="6" class="hint">Sin ventas en el rango.</td></tr>';

  const porCajero = ventasPorCajero(rango);
  el('hist-cajeros').innerHTML = porCajero.length
    ? porCajero.map(c => `<tr><td>${c.cajero}</td><td>${c.cantidad}</td><td>${money(c.efectivo)}</td><td>${money(c.qr)}</td><td>${money(c.total)}</td></tr>`).join('')
    : '<tr><td colspan="5" class="hint">Sin ventas en el rango.</td></tr>';

  el('hist-ranking').innerHTML = ranking.length
    ? ranking.slice(0, 50).map((p, i) => `<tr><td>${i + 1}</td><td>${p.nombre}</td><td>${p.cantidad}</td><td>${money(p.monto)}</td></tr>`).join('')
    : '<tr><td colspan="4" class="hint">Sin ventas en el rango.</td></tr>';

  el('hist-rentables').innerHTML = rentables.length
    ? rentables.slice(0, 50).map((p, i) => `<tr><td>${i + 1}</td><td>${p.nombre}</td><td>${p.cantidad}</td><td>${money(p.ganancia)}</td></tr>`).join('')
    : '<tr><td colspan="4" class="hint">Sin ventas en el rango.</td></tr>';

  el('hist-sin-venta').innerHTML = sinVenta.length
    ? sinVenta.slice(0, 50).map(p => `<tr><td>${p.codigo}</td><td>${p.nombre}</td><td>${p.categoriaRotacion}</td><td>${p.stock}</td></tr>`).join('')
      + (sinVenta.length > 50 ? `<tr><td colspan="4" class="hint">…y ${sinVenta.length - 50} más.</td></tr>` : '')
    : '<tr><td colspan="4" class="hint">Todos los productos tuvieron ventas.</td></tr>';

  el('hist-aperturas').innerHTML = aperturas.length
    ? aperturas.map(a => `<tr><td>${fechaHora(a.fecha)}</td><td>${a.cajero}</td><td>${money(a.montoApertura)}</td></tr>`).join('')
    : '<tr><td colspan="3" class="hint">Sin aperturas en el rango.</td></tr>';

  el('hist-cierres').innerHTML = cierres.length
    ? cierres.map(c => {
        const dif = c.diferencia === 0
          ? '<span class="chip chip-ok">Cuadra</span>'
          : c.diferencia > 0
            ? `<span class="chip chip-info">Sobrante ${money(c.diferencia)}</span>`
            : `<span class="chip chip-alerta">Faltante ${money(Math.abs(c.diferencia))}</span>`;
        return `<tr><td>${fechaHora(c.fecha)}</td><td>${c.cajero}</td><td>${money(c.efectivoEsperado)}</td><td>${money(c.efectivoContado)}</td><td>${dif}</td></tr>`;
      }).join('')
    : '<tr><td colspan="5" class="hint">Sin cierres en el rango.</td></tr>';
}

function exportarPDF() {
  const rango = rangoActual();
  const resumen = resumenVentas(rango);
  const ganancia = gananciaEnRango(rango);
  const ranking = rankingProductos(rango);
  const rentables = rankingGanancia(rango);
  const sinVenta = productosSinVenta(rango);
  const aperturas = aperturasEnRango(rango);
  const cierres = cierresEnRango(rango);

  const porCajero = ventasPorCajero(rango);

  const cuerpo = `
    ${kpisHTML([
      { valor: resumen.cantidadVentas, etiqueta: 'Ventas' },
      { valor: money(resumen.totalVendido), etiqueta: 'Total vendido' },
      { valor: money(ganancia.ganancia), etiqueta: `Ganancia (${ganancia.margen.toFixed(0)}%)` },
      { valor: money(resumen.efectivo), etiqueta: 'Efectivo' },
      { valor: money(resumen.qr), etiqueta: 'QR' },
      { valor: money(resumen.ticketPromedio), etiqueta: 'Ticket promedio' },
    ])}
    <h2>Ventas por día</h2>
    ${tablaHTML(['Fecha', 'Ventas', 'Efectivo', 'QR', 'Total', 'Ganancia'],
      ventasPorDia(rango).map(d => [diaLegible(d.dia), d.cantidad, money(d.efectivo), money(d.qr), money(d.total), money(d.ganancia)]))}
    <h2>Ventas por cajero</h2>
    ${tablaHTML(['Cajero', 'Ventas', 'Efectivo', 'QR', 'Total'],
      porCajero.map(c => [c.cajero, c.cantidad, money(c.efectivo), money(c.qr), money(c.total)]))}
    <h2>Productos vendidos (mayor a menor)</h2>
    ${tablaHTML(['#', 'Producto', 'Cantidad', 'Monto'],
      ranking.map((p, i) => [i + 1, p.nombre, p.cantidad, money(p.monto)]))}
    <h2>Productos más rentables (mayor ganancia)</h2>
    ${tablaHTML(['#', 'Producto', 'Cantidad', 'Ganancia'],
      rentables.map((p, i) => [i + 1, p.nombre, p.cantidad, money(p.ganancia)]))}
    <h2>Productos sin venta / baja rotación</h2>
    ${tablaHTML(['Código', 'Producto', 'Rotación', 'Stock'],
      sinVenta.map(p => [p.codigo, p.nombre, p.categoriaRotacion, p.stock]))}
    <h2>Aperturas de caja</h2>
    ${tablaHTML(['Fecha', 'Cajero', 'Monto apertura'],
      aperturas.map(a => [fechaHora(a.fecha), a.cajero, money(a.montoApertura)]))}
    <h2>Cierres de caja</h2>
    ${tablaHTML(['Fecha', 'Cajero', 'Esperado', 'Contado', 'Diferencia'],
      cierres.map(c => [fechaHora(c.fecha), c.cajero, money(c.efectivoEsperado), money(c.efectivoContado),
        c.diferencia === 0 ? 'Cuadra' : c.diferencia > 0 ? `Sobrante ${money(c.diferencia)}` : `Faltante ${money(Math.abs(c.diferencia))}`]))}
  `;

  const cajeroActual = getSession()?.username || '—';
  exportarReportePDF({
    titulo: 'Reporte de Ventas e Historial',
    subtitulo: `Período: ${etiquetaRango()} · Generado por: ${cajeroActual}`,
    cuerpoHTML: cuerpo,
  });
}

// Reporte enfocado solo en cuánto se vendió cada día del rango (una fila por día).
function exportarPorDias() {
  const rango = rangoActual();
  const porDia = ventasPorDia(rango);
  const resumen = resumenVentas(rango);
  const ganancia = gananciaEnRango(rango);
  const cajeroActual = getSession()?.username || '—';

  const cuerpo = `
    ${kpisHTML([
      { valor: porDia.length, etiqueta: 'Días con ventas' },
      { valor: money(resumen.totalVendido), etiqueta: 'Total vendido' },
      { valor: money(ganancia.ganancia), etiqueta: 'Ganancia' },
      { valor: money(porDia.length ? resumen.totalVendido / porDia.length : 0), etiqueta: 'Promedio por día' },
    ])}
    <h2>Ventas por día</h2>
    ${tablaHTML(['Fecha', 'Ventas', 'Efectivo', 'QR', 'Total', 'Ganancia'],
      porDia.map(d => [diaLegible(d.dia), d.cantidad, money(d.efectivo), money(d.qr), money(d.total), money(d.ganancia)]))}
  `;

  exportarReportePDF({
    titulo: 'Ventas por día',
    subtitulo: `Período: ${etiquetaRango()} · Generado por: ${cajeroActual}`,
    cuerpoHTML: cuerpo,
  });
}

export function initHistorial() {
  el('hist-desde').addEventListener('input', render);
  el('hist-hasta').addEventListener('input', render);
  el('btn-hist-pdf').addEventListener('click', exportarPDF);
  el('btn-hist-pdf-dias').addEventListener('click', exportarPorDias);
  render();
}

export { render as refrescarHistorial };
