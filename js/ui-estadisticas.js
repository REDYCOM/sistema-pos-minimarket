import { rankingProductos, serieDiaria, proyeccionVentas, resumenVentas, valorInventario } from './reportes.js';
import { turnoActivo, calcularEfectivoEsperado } from './caja.js';
import { barrasHorizontales, lineaTemporal } from './graficos.js';
import { exportarReportePDF, tablaHTML, kpisHTML } from './pdf.js';

const el = id => document.getElementById(id);
const money = n => `Bs ${Number(n).toFixed(2)}`;

function rangoActual() {
  return { desde: el('stats-desde').value, hasta: el('stats-hasta').value };
}

function etiquetaRango() {
  const { desde, hasta } = rangoActual();
  if (!desde && !hasta) return 'Todo el histórico';
  return `${desde || 'inicio'} → ${hasta || 'hoy'}`;
}

function renderCapital() {
  const cap = valorInventario();
  const turno = turnoActivo();
  const efectivo = turno ? calcularEfectivoEsperado(turno.turnoId).esperado : 0;
  const capitalTotal = cap.costo + efectivo;
  el('stats-capital').innerHTML = `
    <div class="stat-tile"><span class="stat-icono">🏦</span><div><div class="stat-valor">${money(capitalTotal)}</div><div class="stat-label">Capital total (stock + caja)</div></div></div>
    <div class="stat-tile"><span class="stat-icono">📦</span><div><div class="stat-valor">${money(cap.costo)}</div><div class="stat-label">Capital en stock (a costo)</div></div></div>
    <div class="stat-tile"><span class="stat-icono">💵</span><div><div class="stat-valor">${money(efectivo)}</div><div class="stat-label">Efectivo en caja</div></div></div>
    <div class="stat-tile"><span class="stat-icono">🏷️</span><div><div class="stat-valor">${money(cap.venta)}</div><div class="stat-label">Valor a precio de venta</div></div></div>
    <div class="stat-tile"><span class="stat-icono">📈</span><div><div class="stat-valor">${money(cap.ganancia)}</div><div class="stat-label">Ganancia potencial</div></div></div>
  `;
}

function render() {
  renderCapital();
  const rango = rangoActual();
  const ranking = rankingProductos(rango);
  const masVendidos = ranking.slice(0, 6).map(p => ({ etiqueta: p.nombre, valor: p.cantidad }));
  const menosVendidos = ranking.slice(-6).reverse().map(p => ({ etiqueta: p.nombre, valor: p.cantidad }));
  const serie = serieDiaria(rango);
  const proy = proyeccionVentas(rango);

  el('stats-mas-vendidos').innerHTML = barrasHorizontales(masVendidos, { formato: v => `${v} u` });
  el('stats-menos-vendidos').innerHTML = ranking.length > 1
    ? barrasHorizontales(menosVendidos, { formato: v => `${v} u` })
    : '<p class="hint">Se necesitan más ventas para comparar.</p>';

  el('stats-linea').innerHTML = lineaTemporal(serie, proy.disponible ? proy.puntosProyectados : []);

  if (proy.disponible) {
    el('stats-proyeccion').innerHTML = `
      <div class="stat-tile"><span class="stat-icono">📈</span><div><div class="stat-valor">${money(proy.promedioDiario)}</div><div class="stat-label">Promedio diario</div></div></div>
      <div class="stat-tile"><span class="stat-icono">🔮</span><div><div class="stat-valor">${money(proy.totalProyectado)}</div><div class="stat-label">Proyección próx. ${proy.diasFuturos} días</div></div></div>
      <div class="stat-tile"><span class="stat-icono">${proy.tendencia === 'al alza' ? '⬆️' : '⬇️'}</span><div><div class="stat-valor">Tendencia ${proy.tendencia}</div><div class="stat-label">Sobre ${proy.diasHistorico} días</div></div></div>
    `;
    el('stats-proyeccion-aviso').classList.add('hidden');
  } else {
    el('stats-proyeccion').innerHTML = '';
    el('stats-proyeccion-aviso').classList.remove('hidden');
    el('stats-proyeccion-aviso').textContent =
      `🔒 La proyección se habilita con al menos ${proy.diasMinimos} días distintos con ventas. Llevas ${proy.diasHistorico}.`;
  }
}

function exportarPDF() {
  const rango = rangoActual();
  const resumen = resumenVentas(rango);
  const ranking = rankingProductos(rango);
  const proy = proyeccionVentas(rango);

  const cap = valorInventario();
  const turno = turnoActivo();
  const efectivo = turno ? calcularEfectivoEsperado(turno.turnoId).esperado : 0;

  const cuerpo = `
    <h2>Capital del negocio</h2>
    ${kpisHTML([
      { valor: money(cap.costo + efectivo), etiqueta: 'Capital total (stock + caja)' },
      { valor: money(cap.costo), etiqueta: 'Capital en stock (a costo)' },
      { valor: money(efectivo), etiqueta: 'Efectivo en caja' },
      { valor: money(cap.venta), etiqueta: 'Valor a precio de venta' },
      { valor: money(cap.ganancia), etiqueta: 'Ganancia potencial' },
    ])}
    <h2>Ventas</h2>
    ${kpisHTML([
      { valor: resumen.cantidadVentas, etiqueta: 'Ventas' },
      { valor: money(resumen.totalVendido), etiqueta: 'Total vendido' },
      { valor: money(resumen.ticketPromedio), etiqueta: 'Ticket promedio' },
    ])}
    <h2>Ranking de productos vendidos</h2>
    ${tablaHTML(['#', 'Producto', 'Cantidad', 'Monto'],
      ranking.map((p, i) => [i + 1, p.nombre, p.cantidad, money(p.monto)]))}
    <h2>Proyección de ventas</h2>
    ${proy.disponible
      ? kpisHTML([
          { valor: money(proy.promedioDiario), etiqueta: 'Promedio diario' },
          { valor: money(proy.totalProyectado), etiqueta: `Proyección ${proy.diasFuturos} días` },
          { valor: proy.tendencia, etiqueta: `Tendencia (${proy.diasHistorico} días)` },
        ])
      : `<p>Proyección no disponible: se requieren ${proy.diasMinimos} días con ventas y hay ${proy.diasHistorico}.</p>`}
  `;

  exportarReportePDF({
    titulo: 'Reporte de Estadísticas y Proyección',
    subtitulo: `Período: ${etiquetaRango()}`,
    cuerpoHTML: cuerpo,
  });
}

export function initEstadisticas() {
  el('stats-desde').addEventListener('input', render);
  el('stats-hasta').addEventListener('input', render);
  el('btn-stats-pdf').addEventListener('click', exportarPDF);
  render();
}

export { render as refrescarEstadisticas };
