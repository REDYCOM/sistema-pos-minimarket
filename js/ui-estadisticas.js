import { rankingProductos, serieDiaria, proyeccionVentas, resumenVentas, valorInventario, analisisRotacion, rankingGanancia, resumenMensual, comparativaPeriodos, aniosConVentas, comprasEnRango } from './reportes.js';
import { turnosAbiertos, efectivoEnCajaTotal } from './caja.js';
import { toast } from './toast.js';
import { barrasHorizontales, lineaTemporal, lineaTemporalInteractiva, activarLineaInteractiva } from './graficos.js';
import { exportarReportePDF, tablaHTML, kpisHTML } from './pdf.js';

const el = id => document.getElementById(id);
const money = n => `Bs ${Number(n).toFixed(2)}`;
const diaLegible = ymd => {
  const [a, m, d] = ymd.split('-').map(Number);
  const dow = new Date(a, m - 1, d).toLocaleDateString('es-BO', { weekday: 'short' });
  return `${dow} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${a}`;
};
const sumarDias = (ymd, n) => {
  const [a, m, d] = ymd.split('-').map(Number);
  const f = new Date(a, m - 1, d); f.setDate(f.getDate() + n);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
};

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
  const abiertas = turnosAbiertos();
  const efectivo = efectivoEnCajaTotal();
  const capitalTotal = cap.costo + efectivo;
  el('stats-capital').innerHTML = `
    <div class="stat-tile"><span class="stat-icono">🏦</span><div><div class="stat-valor">${money(capitalTotal)}</div><div class="stat-label">Capital total (stock + caja)</div></div></div>
    <div class="stat-tile"><span class="stat-icono">📦</span><div><div class="stat-valor">${money(cap.costo)}</div><div class="stat-label">Capital en stock (a costo)</div></div></div>
    <div class="stat-tile"><span class="stat-icono">💵</span><div><div class="stat-valor">${money(efectivo)}</div><div class="stat-label">Efectivo en caja</div></div></div>
    <div class="stat-tile"><span class="stat-icono">🏷️</span><div><div class="stat-valor">${money(cap.venta)}</div><div class="stat-label">Valor a precio de venta</div></div></div>
    <div class="stat-tile"><span class="stat-icono">📈</span><div><div class="stat-valor">${money(cap.ganancia)}</div><div class="stat-label">Ganancia potencial</div></div></div>
  `;
  const nota = el('stats-capital-nota');
  const avisos = [];
  if (abiertas.length > 0) {
    const detalle = abiertas.map(t => `${t.cajero} (${money(t.esperado)})`).join(', ');
    avisos.push(`🟢 ${abiertas.length} caja(s) abierta(s): ${detalle}.`);
  } else {
    avisos.push('⚪ No hay cajas abiertas ahora mismo (Efectivo en caja = Bs 0).');
  }
  if (cap.sinCosto > 0) {
    avisos.push(`⚠️ La ganancia potencial excluye ${cap.sinCosto} producto(s) con stock sin precio de compra registrado (${money(cap.ventaSinCosto)} a precio de venta).`);
  }
  nota.innerHTML = avisos.join('<br>');
  nota.classList.remove('hidden');
}

function render() {
  renderCapital();
  const rango = rangoActual();
  const ranking = rankingProductos(rango);

  // Controles: cuántos productos mostrar (0 = todos) y qué métrica graficar.
  const topN = Number(el('stats-top').value) || 0;
  const metrica = el('stats-metrica').value; // 'cantidad' | 'monto'
  const limite = topN > 0 ? topN : ranking.length;
  const valorDe = p => metrica === 'monto' ? p.monto : p.cantidad;
  const formato = metrica === 'monto' ? money : (v => `${v} u`);

  // Más vendidos: ranking ya viene desc por cantidad; si mides por monto, reordena.
  const ordenado = metrica === 'monto' ? [...ranking].sort((a, b) => b.monto - a.monto) : ranking;
  const masVendidos = ordenado.slice(0, limite).map(p => ({ etiqueta: p.nombre, valor: valorDe(p) }));
  const menosVendidos = ordenado.slice(-limite).reverse().map(p => ({ etiqueta: p.nombre, valor: valorDe(p) }));
  const serie = serieDiaria(rango);
  const proy = proyeccionVentas(rango);

  el('stats-mas-vendidos').innerHTML = barrasHorizontales(masVendidos, { formato });
  el('stats-menos-vendidos').innerHTML = ranking.length > 1
    ? barrasHorizontales(menosVendidos, { formato })
    : '<p class="hint">Se necesitan más ventas para comparar.</p>';

  const chart = lineaTemporalInteractiva(serie, proy.disponible ? proy.puntosProyectados : []);
  el('stats-linea').innerHTML = chart.html;
  activarLineaInteractiva(el('stats-linea').querySelector('.linea-wrap'), chart.puntos, chart.vb);

  // Apartado de stock parado (productos sin ninguna venta en el período).
  const rot = analisisRotacion(rango);
  const sin = rot.sinVenta;
  el('stats-sin-rotacion-kpi').innerHTML =
    `<strong>${sin.length}</strong> producto(s) sin venta en el período · Capital parado: <strong>${money(rot.capitalParado)}</strong>`;
  el('stats-sin-rotacion-body').innerHTML = sin.length
    ? sin.slice(0, 100).map(p => `<tr><td>${p.codigo}</td><td>${p.nombre}</td><td>${p.categoriaRotacion || '—'}</td><td>${p.stock}</td><td>${money(p.capitalInmovil)}</td></tr>`).join('')
      + (sin.length > 100 ? `<tr><td colspan="5" class="hint">…y ${sin.length - 100} más (ver el informe PDF).</td></tr>` : '')
    : '<tr><td colspan="5" class="hint">🎉 Todos los productos con stock tuvieron ventas en el período.</td></tr>';

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
  const efectivo = efectivoEnCajaTotal();

  const cuerpo = `
    <h2>Capital del negocio</h2>
    ${kpisHTML([
      { valor: money(cap.costo + efectivo), etiqueta: 'Capital total (stock + caja)' },
      { valor: money(cap.costo), etiqueta: 'Capital en stock (a costo)' },
      { valor: money(efectivo), etiqueta: 'Efectivo en caja' },
      { valor: money(cap.venta), etiqueta: 'Valor a precio de venta' },
      { valor: money(cap.ganancia), etiqueta: 'Ganancia potencial' },
    ])}
    ${cap.sinCosto > 0 ? `<p style="color:#8a6d3b;font-size:11px;margin:4px 0 0">⚠️ La ganancia potencial excluye ${cap.sinCosto} producto(s) con stock sin precio de compra registrado (${money(cap.ventaSinCosto)} a precio de venta).</p>` : ''}
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

// Informe de rotación: alta rotación (más vendidos), baja rotación (poca salida)
// y sin rotación (stock parado con capital inmovilizado).
function exportarRotacion() {
  const rango = rangoActual();
  const { vendidos, sinVenta, unidadesVendidas, capitalParado } = analisisRotacion(rango);
  const TOP = 30;
  const alta = vendidos.slice(0, TOP);
  // Baja rotación: los que MENOS se vendieron (pero con al menos 1 venta),
  // evitando repetir los que ya salen en "alta" cuando hay pocos productos.
  const baja = [...vendidos].reverse().filter(p => !alta.includes(p)).slice(0, TOP);
  const sin = sinVenta.slice(0, 100);

  const cuerpo = `
    ${kpisHTML([
      { valor: vendidos.length, etiqueta: 'Productos con ventas' },
      { valor: unidadesVendidas, etiqueta: 'Unidades vendidas' },
      { valor: sinVenta.length, etiqueta: 'Productos sin venta' },
      { valor: money(capitalParado), etiqueta: 'Capital parado (stock sin venta)' },
    ])}
    <h2>🏆 Alta rotación — más vendidos (top ${TOP})</h2>
    ${tablaHTML(['#', 'Producto', 'Rotación', 'Unidades', 'Monto', 'Stock actual'],
      alta.map((p, i) => [i + 1, p.nombre, p.rotacion || '—', p.cantidad, money(p.monto), p.stock]))}
    <h2>🐢 Baja rotación — poca salida (top ${TOP})</h2>
    ${baja.length
      ? tablaHTML(['Producto', 'Rotación', 'Unidades', 'Monto', 'Stock actual'],
          baja.map(p => [p.nombre, p.rotacion || '—', p.cantidad, money(p.monto), p.stock]))
      : '<p>No hay suficientes productos para separar baja rotación.</p>'}
    <h2>💤 Sin rotación — stock parado en el período${sinVenta.length > 100 ? ` (top 100 de ${sinVenta.length})` : ''}</h2>
    ${sin.length
      ? tablaHTML(['Código', 'Producto', 'Rotación', 'Stock', 'Capital inmovilizado'],
          sin.map(p => [p.codigo, p.nombre, p.categoriaRotacion || '—', p.stock, money(p.capitalInmovil)]))
      : '<p>Todos los productos con stock tuvieron ventas. 🎉</p>'}
  `;

  exportarReportePDF({
    titulo: 'Informe de Rotación de Productos',
    subtitulo: `Período: ${etiquetaRango()}`,
    cuerpoHTML: cuerpo,
  });
}

// Informe de proyección: explica la estimación, incluye el gráfico y las tablas
// del histórico diario y de los días proyectados.
function exportarProyeccion() {
  const rango = rangoActual();
  const serie = serieDiaria(rango);
  const proy = proyeccionVentas(rango);
  const chartSVG = lineaTemporal(serie, proy.disponible ? proy.puntosProyectados : []);

  const ultima = serie.length ? serie[serie.length - 1].dia : null;
  const filasProy = (proy.disponible && ultima)
    ? proy.puntosProyectados.map((v, i) => [diaLegible(sumarDias(ultima, i + 1)), money(v)])
    : [];

  const cuerpo = `
    <p style="font-size:12px;color:#667c72">Este informe estima las ventas de los próximos días a partir de la tendencia
    de las ventas diarias del período (regresión lineal). La línea verde son ventas reales; la naranja punteada, la proyección.</p>
    ${proy.disponible
      ? kpisHTML([
          { valor: money(proy.promedioDiario), etiqueta: 'Promedio diario' },
          { valor: money(proy.totalProyectado), etiqueta: `Proyección próximos ${proy.diasFuturos} días` },
          { valor: proy.tendencia, etiqueta: 'Tendencia' },
          { valor: `${proy.diasHistorico} días`, etiqueta: 'Histórico usado' },
        ])
      : `<p>⚠️ Proyección no disponible: se necesitan al menos ${proy.diasMinimos} días distintos con ventas y hay ${proy.diasHistorico}. Se muestra igual el histórico de ventas por día.</p>`}
    <h2>Gráfico de ventas y proyección</h2>
    ${chartSVG}
    ${filasProy.length ? `<h2>Detalle de la proyección (próximos ${proy.diasFuturos} días)</h2>
    ${tablaHTML(['Fecha estimada', 'Venta proyectada'], filasProy)}` : ''}
    <h2>Ventas por día (histórico del período)</h2>
    ${serie.length
      ? tablaHTML(['Fecha', 'Total vendido'], serie.map(p => [diaLegible(p.dia), money(p.total)]))
      : '<p>Sin ventas en el período.</p>'}
  `;

  exportarReportePDF({
    titulo: 'Informe de Proyección de Ventas',
    subtitulo: `Período analizado: ${etiquetaRango()}`,
    cuerpoHTML: cuerpo,
  });
}

// Informe enfocado en el stock parado: productos sin ninguna venta en el período,
// ordenados por capital inmovilizado (lo que hay invertido en stock que no rota).
function exportarSinRotacion() {
  const rango = rangoActual();
  const { sinVenta, capitalParado } = analisisRotacion(rango);

  const cuerpo = `
    ${kpisHTML([
      { valor: sinVenta.length, etiqueta: 'Productos sin venta' },
      { valor: money(capitalParado), etiqueta: 'Capital inmovilizado' },
    ])}
    <p style="font-size:12px;color:#667c72">Productos con stock que <strong>no registraron ninguna venta</strong> en el período.
    Ordenados por capital inmovilizado (stock × precio de compra) para priorizar dónde hay más plata parada.</p>
    <h2>Productos sin rotación</h2>
    ${sinVenta.length
      ? tablaHTML(['#', 'Código', 'Producto', 'Rotación', 'Stock', 'Capital inmovilizado'],
          sinVenta.map((p, i) => [i + 1, p.codigo, p.nombre, p.categoriaRotacion || '—', p.stock, money(p.capitalInmovil)]))
      : '<p>Todos los productos con stock tuvieron ventas en el período. 🎉</p>'}
  `;

  exportarReportePDF({
    titulo: 'Informe de Stock Parado (sin rotación)',
    subtitulo: `Período: ${etiquetaRango()}`,
    cuerpoHTML: cuerpo,
  });
}

const NOMBRE_MES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const mesLegible = ym => `${NOMBRE_MES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const pct = v => v === null || v === undefined ? '—' : `${v >= 0 ? '▲ +' : '▼ '}${v.toFixed(1)}%`;

// Informe de CIERRE DE AÑO: un único documento con todo lo que hace falta para
// decidir si el negocio creció — mes a mes, crecimiento, capital e inventario.
function exportarCierreAnio() {
  const anio = el('stats-anio').value;
  const rango = { desde: `${anio}-01-01`, hasta: `${anio}-12-31` };

  const resumen = resumenVentas(rango);
  const ganancia = gananciaEnRango(rango);
  const meses = resumenMensual(rango);
  const comp = comparativaPeriodos(rango);
  const compras = comprasEnRango(rango);
  const cap = valorInventario();
  const efectivo = efectivoEnCajaTotal();
  const rot = analisisRotacion(rango);
  const rentables = rankingGanancia(rango).slice(0, 20);
  const vendidos = rankingProductos(rango).slice(0, 20);

  if (!meses.length) {
    return toast.warning(`No hay ventas registradas en ${anio}.`);
  }

  const serieMeses = meses.map(m => ({ dia: m.mes + '-01', total: m.total }));
  const grafico = meses.length > 1 ? lineaTemporal(serieMeses, []) : '';

  const cuerpo = `
    ${kpisHTML([
      { valor: money(resumen.totalVendido), etiqueta: 'Ventas del año' },
      { valor: money(ganancia.ganancia), etiqueta: `Ganancia real (${ganancia.margen.toFixed(0)}%)` },
      { valor: resumen.cantidadVentas, etiqueta: 'N.º de ventas' },
      { valor: money(resumen.ticketPromedio), etiqueta: 'Ticket promedio' },
      { valor: money(compras.total), etiqueta: 'Invertido en compras' },
    ])}
    ${ganancia.ventaSinCosto > 0 ? `<p style="color:#8a6d3b;font-size:11px;margin:4px 0 0">⚠️ La ganancia excluye ${money(ganancia.ventaSinCosto)} en ventas de productos sin precio de compra registrado.</p>` : ''}

    <h2>¿Creció el negocio?</h2>
    ${comp.disponible ? `
      ${kpisHTML([
        { valor: pct(comp.crecimiento), etiqueta: `2.ª mitad del año vs 1.ª` },
        { valor: money(comp.primera.total), etiqueta: `Primeros ${comp.primera.meses} meses` },
        { valor: money(comp.segunda.total), etiqueta: `Últimos ${comp.segunda.meses} meses` },
        { valor: mesLegible(comp.mejorMes.mes), etiqueta: `Mejor mes (${money(comp.mejorMes.total)})` },
        { valor: mesLegible(comp.peorMes.mes), etiqueta: `Mes más flojo (${money(comp.peorMes.total)})` },
      ])}
      <p style="font-size:12px;color:#667c72">Se comparan los primeros meses del año contra los últimos. Un porcentaje positivo indica que el negocio vendió más hacia el final del año.</p>
    ` : `<p>Se necesitan al menos 2 meses con ventas para comparar. Hay ${comp.meses}.</p>`}

    <h2>Ventas mes a mes</h2>
    ${grafico}
    ${tablaHTML(['Mes', 'Ventas', 'Días con venta', 'Total vendido', 'Promedio diario', 'Ganancia', 'Crecimiento'],
      meses.map(m => [mesLegible(m.mes), m.cantidad, m.diasConVenta, money(m.total),
        money(m.promedioDiario), money(m.ganancia), pct(m.crecimiento)]))}

    <h2>Situación al cierre</h2>
    ${kpisHTML([
      { valor: money(cap.costo + efectivo), etiqueta: 'Capital total (stock + caja)' },
      { valor: money(cap.costo), etiqueta: 'Capital en stock (a costo)' },
      { valor: money(efectivo), etiqueta: 'Efectivo en caja' },
      { valor: money(cap.venta), etiqueta: 'Valor del inventario a precio de venta' },
      { valor: money(cap.ganancia), etiqueta: 'Ganancia potencial del stock' },
    ])}
    ${tablaHTML(['Concepto', 'Valor'], [
      ['Productos en catálogo', cap.productos],
      ['Unidades en stock', cap.unidades],
      ['Productos sin ninguna venta en el año', rot.sinVenta.length],
      ['Capital inmovilizado (stock que no rotó)', money(rot.capitalParado)],
    ])}

    <h2>Productos más rentables del año (top 20)</h2>
    ${tablaHTML(['#', 'Producto', 'Unidades', 'Ganancia'],
      rentables.map((p, i) => [i + 1, p.nombre, p.cantidad, money(p.ganancia)]))}

    <h2>Productos más vendidos del año (top 20)</h2>
    ${tablaHTML(['#', 'Producto', 'Unidades', 'Monto'],
      vendidos.map((p, i) => [i + 1, p.nombre, p.cantidad, money(p.monto)]))}
  `;

  exportarReportePDF({
    titulo: `Informe de Cierre de Año ${anio}`,
    subtitulo: `Período: 01/01/${anio} — 31/12/${anio} · Generado el ${new Date().toLocaleDateString('es-BO')}`,
    cuerpoHTML: cuerpo,
  });
}

function poblarAnios() {
  const sel = el('stats-anio');
  if (!sel) return;
  const anios = aniosConVentas();
  const actual = String(new Date().getFullYear());
  if (!anios.includes(actual)) anios.unshift(actual);
  sel.innerHTML = anios.map(a => `<option value="${a}">${a}</option>`).join('');
}

export function initEstadisticas() {
  el('stats-desde').addEventListener('input', render);
  el('stats-hasta').addEventListener('input', render);
  el('stats-top').addEventListener('change', render);
  el('stats-metrica').addEventListener('change', render);
  el('btn-stats-pdf').addEventListener('click', exportarPDF);
  el('btn-stats-rotacion').addEventListener('click', exportarRotacion);
  el('btn-stats-proyeccion').addEventListener('click', exportarProyeccion);
  el('btn-stats-sin-rotacion').addEventListener('click', exportarSinRotacion);
  poblarAnios();
  el('btn-stats-cierre-anio').addEventListener('click', exportarCierreAnio);
  render();
}

export { render as refrescarEstadisticas };
