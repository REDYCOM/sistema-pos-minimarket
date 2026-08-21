import {
  rankingProductos, productosSinVenta, resumenVentas,
  aperturasEnRango, cierresEnRango, ventasPorCajero,
  gananciaEnRango, rankingGanancia, ventasPorDia, cuadrePorTurno, ventasPorDiaDetalle,
} from './reportes.js';
import { exportarReportePDF, tablaHTML, kpisHTML } from './pdf.js';
import { getSession } from './storage.js';
import { turnosAbiertos, cerrarCajaAbandonada } from './caja.js';
import { fechaLocalYMD, hoyYMD } from './util.js';
import { toast } from './toast.js';
import { confirmar } from './modal.js';

const el = id => document.getElementById(id);
const money = n => `Bs ${Number(n).toFixed(2)}`;
const fechaHora = iso => new Date(iso).toLocaleString('es-BO');
const soloFecha = iso => new Date(iso).toLocaleDateString('es-BO');
const horaCorta = iso => new Date(iso).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
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

// Panel "en vivo": cajas que están abiertas ahora mismo y cuánto llevan vendido.
// Se refresca solo mientras la pestaña Historial está a la vista.
function renderCajasVivo() {
  const cont = el('hist-cajas-vivo');
  if (!cont) return;
  const abiertas = turnosAbiertos();
  if (!abiertas.length) {
    cont.innerHTML = '<p class="hint">⚪ No hay ninguna caja abierta en este momento.</p>';
    return;
  }
  const hoy = hoyYMD();
  cont.innerHTML = `<div class="stat-grid">${abiertas.map(t => {
    // Una caja abierta de un día anterior quedó ABANDONADA: nadie la va a
    // cerrar y su efectivo sigue sumando al capital. Se ofrece cerrarla.
    const vieja = fechaLocalYMD(t.fecha) < hoy;
    return `
    <div class="stat-tile stat-tile-vivo${vieja ? ' stat-tile-vieja' : ''}">
      <span class="stat-icono">${vieja ? '⚠️' : '🟢'}</span>
      <div>
        <div class="stat-valor">${money(t.totalVendido)}</div>
        <div class="stat-label">${t.cajero} — vendido en su turno</div>
        <div class="stat-detalle">
          Abrió ${vieja ? fechaHora(t.fecha) : horaCorta(t.fecha)} con ${money(t.montoApertura)}<br>
          💵 ${money(t.ventasEfectivo)} · 📱 ${money(t.ventasQR)}<br>
          Efectivo esperado en caja: <strong>${money(t.esperado)}</strong>
          ${vieja ? `<br><button type="button" class="btn-mini cerrar-caja-vieja" data-turno="${t.turnoId}" data-esperado="${t.esperado}" data-cajero="${t.cajero}">🔒 Cerrar esta caja</button>` : ''}
        </div>
      </div>
    </div>`;
  }).join('')}</div>
  ${abiertas.some(t => fechaLocalYMD(t.fecha) < hoy)
    ? '<p class="hint">⚠️ Las cajas marcadas quedaron abiertas de días anteriores (nadie las cerró) y su efectivo sigue sumando al capital. Ciérralas para limpiar el dato.</p>'
    : ''}`;
}

function render() {
  renderCajasVivo();
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

  const nota = el('hist-ganancia-nota');
  if (ganancia.ventaSinCosto > 0) {
    nota.textContent = `⚠️ La ganancia excluye ${money(ganancia.ventaSinCosto)} en ventas de productos sin precio de compra registrado (${ganancia.itemsSinCosto} uds). Registrá su costo para que cuenten.`;
    nota.classList.remove('hidden');
  } else {
    nota.classList.add('hidden');
  }

  // Ventas por día, con una fila desplegable por día que muestra cada turno:
  // qué cajero cobró, con cuánto abrió la caja y con cuánto la cerró.
  const porDia = ventasPorDia(rango);
  const detalle = new Map(ventasPorDiaDetalle(rango).map(d => [d.dia, d.turnos]));
  el('hist-por-dia').innerHTML = porDia.length
    ? porDia.map(d => {
        const turnos = detalle.get(d.dia) || [];
        const filaDia = `<tr class="fila-dia" data-dia="${d.dia}" title="Clic para ver el detalle por cajero">
          <td class="col-expandir"><span class="expandir-icono">▶</span></td>
          <td>${diaLegible(d.dia)}</td><td>${d.cantidad}</td><td>${money(d.efectivo)}</td>
          <td>${money(d.qr)}</td><td><strong>${money(d.total)}</strong></td><td>${money(d.ganancia)}</td>
        </tr>`;
        const sub = turnos.map(t => {
          const estado = t.sinTurno
            ? '<span class="chip chip-alerta">Sin turno</span>'
            : t.abierto ? '<span class="chip chip-info">Caja abierta</span>' : '<span class="chip chip-ok">Cerrada</span>';
          const dif = t.diferencia === null ? '' : t.diferencia === 0
            ? ' <span class="chip chip-ok">cuadra</span>'
            : t.diferencia > 0
              ? ` <span class="chip chip-info">sobra ${money(t.diferencia)}</span>`
              : ` <span class="chip chip-alerta">falta ${money(Math.abs(t.diferencia))}</span>`;
          return `<tr>
            <td><strong>${t.cajero}</strong> ${estado}</td>
            <td>${t.aperturaFecha ? horaCorta(t.aperturaFecha) : '—'}</td>
            <td>${t.montoApertura === null ? '—' : money(t.montoApertura)}</td>
            <td>${t.cierreFecha ? horaCorta(t.cierreFecha) : '—'}</td>
            <td>${t.efectivoContado === null ? '—' : money(t.efectivoContado)}${dif}</td>
            <td>${t.cantidad}</td><td>${money(t.efectivo)}</td><td>${money(t.qr)}</td>
            <td><strong>${money(t.total)}</strong></td>
          </tr>`;
        }).join('');
        const filaDetalle = `<tr class="fila-detalle hidden" data-detalle="${d.dia}"><td colspan="7">
          <table class="tabla-datos tabla-anidada">
            <thead><tr><th>Cajero</th><th>Abrió</th><th>Monto apertura</th><th>Cerró</th><th>Efectivo contado</th><th>Ventas</th><th>Efectivo</th><th>QR</th><th>Total</th></tr></thead>
            <tbody>${sub || '<tr><td colspan="9" class="hint">Sin detalle.</td></tr>'}</tbody>
          </table>
        </td></tr>`;
        return filaDia + filaDetalle;
      }).join('')
    : '<tr><td colspan="7" class="hint">Sin ventas en el rango.</td></tr>';


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

  // Cuadre turno por turno: permite reconciliar el total del día (que suma TODOS
  // los turnos) contra cada cierre de caja individual que ve el cajero.
  const cuadre = cuadrePorTurno(rango);
  el('hist-cuadre').innerHTML = (cuadre.turnos.length || cuadre.sinTurno.cantidad)
    ? cuadre.turnos.map(t => {
        const estado = t.abierto
          ? '<span class="chip chip-info">Abierta</span>'
          : '<span class="chip chip-ok">Cerrada</span>';
        const dif = t.diferencia === null
          ? '<span class="hint">—</span>'
          : t.diferencia === 0
            ? '<span class="chip chip-ok">Cuadra</span>'
            : t.diferencia > 0
              ? `<span class="chip chip-info">Sobra ${money(t.diferencia)}</span>`
              : `<span class="chip chip-alerta">Falta ${money(Math.abs(t.diferencia))}</span>`;
        return `<tr>
          <td>${fechaHora(t.apertura)}</td><td>${t.cajero}</td><td>${estado}</td>
          <td>${t.cantidad}</td><td>${money(t.efectivo)}</td><td>${money(t.qr)}</td>
          <td><strong>${money(t.total)}</strong></td><td>${money(t.esperado)}</td>
          <td>${t.contado === null ? '<span class="hint">—</span>' : money(t.contado)}</td><td>${dif}</td>
        </tr>`;
      }).join('')
      + (cuadre.sinTurno.cantidad
        ? `<tr><td colspan="3"><strong>⚠️ Ventas sin turno</strong></td><td>${cuadre.sinTurno.cantidad}</td><td>${money(cuadre.sinTurno.efectivo)}</td><td>${money(cuadre.sinTurno.qr)}</td><td><strong>${money(cuadre.sinTurno.total)}</strong></td><td colspan="3" class="hint">No aparecen en ningún cierre de caja.</td></tr>`
        : '')
    : '<tr><td colspan="10" class="hint">Sin turnos en el rango.</td></tr>';

  const descuadre = Math.round((resumen.totalVendido - cuadre.totales.total) * 100) / 100;
  el('hist-cuadre-nota').innerHTML = cuadre.turnos.length
    ? `Total del período (todos los turnos): <strong>${money(resumen.totalVendido)}</strong> · Suma de los turnos listados: <strong>${money(cuadre.totales.total)}</strong>`
      + (descuadre === 0 ? ' · ✅ Cuadra.' : ` · ⚠️ Diferencia: <strong>${money(descuadre)}</strong>.`)
      + (cuadre.turnos.length > 1
          ? `<br>ℹ️ Hubo <strong>${cuadre.turnos.length} turnos</strong> en este rango: por eso el cierre de caja que ve el cajero (un solo turno) muestra menos que el total del día.`
          : '')
    : '';

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
    ${ganancia.ventaSinCosto > 0 ? `<p style="color:#8a6d3b;font-size:11px;margin:4px 0 0">⚠️ La ganancia excluye ${money(ganancia.ventaSinCosto)} en ventas de productos sin precio de compra registrado (${ganancia.itemsSinCosto} uds).</p>` : ''}
    <h2>Ventas por día</h2>
    ${tablaHTML(['Fecha', 'Ventas', 'Efectivo', 'QR', 'Total', 'Ganancia'],
      ventasPorDia(rango).map(d => [diaLegible(d.dia), d.cantidad, money(d.efectivo), money(d.qr), money(d.total), money(d.ganancia)]))}
    <h2>Detalle diario por cajero (apertura y cierre de caja)</h2>
    ${tablaHTML(['Fecha', 'Cajero', 'Abrió', 'Monto apertura', 'Cerró', 'Efectivo contado', 'Diferencia', 'Ventas', 'Efectivo', 'QR', 'Total'],
      ventasPorDiaDetalle(rango).flatMap(d => d.turnos.map(t => [
        diaLegible(d.dia), t.cajero,
        t.aperturaFecha ? horaCorta(t.aperturaFecha) : '—',
        t.montoApertura === null ? '—' : money(t.montoApertura),
        t.cierreFecha ? horaCorta(t.cierreFecha) : (t.abierto ? 'ABIERTA' : '—'),
        t.efectivoContado === null ? '—' : money(t.efectivoContado),
        t.diferencia === null ? '—' : t.diferencia === 0 ? 'Cuadra' : t.diferencia > 0 ? `Sobra ${money(t.diferencia)}` : `Falta ${money(Math.abs(t.diferencia))}`,
        t.cantidad, money(t.efectivo), money(t.qr), money(t.total),
      ])))}
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
    <h2>Cuadre por turno (caja por caja)</h2>
    <p style="font-size:11px;color:#667c72">Cada cierre de caja cubre SOLO su turno; el total del período suma todos los turnos.</p>
    ${tablaHTML(['Apertura', 'Cajero', 'Estado', 'Ventas', 'Efectivo', 'QR', 'Total vendido', 'Esperado', 'Contado', 'Diferencia'],
      (() => {
        const c = cuadrePorTurno(rango);
        const filas = c.turnos.map(t => [fechaHora(t.apertura), t.cajero, t.abierto ? 'Abierta' : 'Cerrada',
          t.cantidad, money(t.efectivo), money(t.qr), money(t.total), money(t.esperado),
          t.contado === null ? '—' : money(t.contado),
          t.diferencia === null ? '—' : t.diferencia === 0 ? 'Cuadra' : t.diferencia > 0 ? `Sobra ${money(t.diferencia)}` : `Falta ${money(Math.abs(t.diferencia))}`]);
        if (c.sinTurno.cantidad) filas.push(['— Ventas sin turno —', '—', '—', c.sinTurno.cantidad,
          money(c.sinTurno.efectivo), money(c.sinTurno.qr), money(c.sinTurno.total), '—', '—', 'No están en ningún cierre']);
        return filas;
      })())}
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
    ${ganancia.ventaSinCosto > 0 ? `<p style="color:#8a6d3b;font-size:11px;margin:4px 0 0">⚠️ La ganancia excluye ${money(ganancia.ventaSinCosto)} en ventas de productos sin precio de compra registrado (${ganancia.itemsSinCosto} uds).</p>` : ''}
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
  // Clic en una fila de día: despliega/oculta el detalle por cajero de ese día.
  el('hist-por-dia').addEventListener('click', e => {
    const fila = e.target.closest('.fila-dia');
    if (!fila) return;
    const dia = fila.dataset.dia;
    const det = el('hist-por-dia').querySelector(`.fila-detalle[data-detalle="${dia}"]`);
    if (!det) return;
    const abierto = !det.classList.toggle('hidden');
    fila.classList.toggle('fila-dia-abierta', abierto);
    const icono = fila.querySelector('.expandir-icono');
    if (icono) icono.textContent = abierto ? '▼' : '▶';
  });

  // Las cajas abiertas cambian solas mientras el cajero vende: se refrescan cada
  // 30 s, pero solo si la pestaña Historial está visible (no gasta si no se ve).
  setInterval(() => {
    if (el('tab-historial')?.classList.contains('active')) renderCajasVivo();
  }, 30000);

  // Cerrar una caja abandonada (abierta de días anteriores) desde el panel en vivo.
  el('hist-cajas-vivo').addEventListener('click', async e => {
    const btn = e.target.closest('.cerrar-caja-vieja');
    if (!btn) return;
    const { turno, esperado, cajero } = btn.dataset;
    const ok = await confirmar(
      `¿Cerrar la caja abandonada de "${cajero}"? Su efectivo esperado es ${money(esperado)} y dejará de sumar al capital.`,
      { aceptar: 'Sí, cerrarla', peligro: true });
    if (!ok) return;
    const escrito = window.prompt(
      `Efectivo realmente contado para la caja de "${cajero}" (Bs).\nSi ya no se puede contar, deja el valor sugerido para cerrarla sin diferencia.`,
      Number(esperado).toFixed(2));
    if (escrito === null) return;
    const contado = Number(escrito);
    if (!Number.isFinite(contado) || contado < 0) return toast.error('Monto inválido.');
    const cierre = cerrarCajaAbandonada(turno, contado);
    const dif = cierre.diferencia === 0
      ? 'sin diferencia'
      : cierre.diferencia > 0 ? `sobrante de ${money(cierre.diferencia)}` : `faltante de ${money(Math.abs(cierre.diferencia))}`;
    toast.success(`🔒 Caja de "${cajero}" cerrada (${dif}).`);
    render();
  });

  el('btn-hist-pdf').addEventListener('click', exportarPDF);
  el('btn-hist-pdf-dias').addEventListener('click', exportarPorDias);
  render();
}

export { render as refrescarHistorial };
