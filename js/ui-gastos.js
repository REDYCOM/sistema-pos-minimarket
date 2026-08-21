import {
  CATEGORIAS_GASTO, registrarGasto, eliminarGasto, listarGastos,
  totalGastos, gastosPorCategoria, copiarGastosDeMes,
} from './gastos.js';
import { gananciaEnRango, resumenVentas } from './reportes.js';
import { exportarReportePDF, tablaHTML, kpisHTML } from './pdf.js';
import { hoyYMD } from './util.js';
import { toast } from './toast.js';
import { confirmar } from './modal.js';

const el = id => document.getElementById(id);
const money = n => `Bs ${Number(n).toFixed(2)}`;
const NOMBRE_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const mesLegible = ym => `${NOMBRE_MES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const fechaLegible = ymd => ymd.split('-').reverse().join('/');
const mesAnterior = ym => {
  const [a, m] = ym.split('-').map(Number);
  const d = new Date(a, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// Por defecto el rango es el MES en curso: los gastos fijos se miran por mes.
function rangoActual() {
  return { desde: el('gasto-desde').value, hasta: el('gasto-hasta').value };
}

function etiquetaRango() {
  const { desde, hasta } = rangoActual();
  if (!desde && !hasta) return 'Todo el histórico';
  return `${desde || 'inicio'} → ${hasta || 'hoy'}`;
}

function render() {
  const rango = rangoActual();
  const gastos = listarGastos(rango);
  const total = totalGastos(gastos);
  const ganancia = gananciaEnRango(rango);
  const resumen = resumenVentas(rango);
  const neta = ganancia.ganancia - total;

  // La cuenta completa: de lo vendido, cuánto queda después del costo de la
  // mercadería y de los gastos fijos. Esa es la ganancia real del período.
  el('gasto-kpis').innerHTML = `
    <div class="stat-tile"><span class="stat-icono">💰</span><div><div class="stat-valor">${money(resumen.totalVendido)}</div><div class="stat-label">Vendido en el período</div></div></div>
    <div class="stat-tile"><span class="stat-icono">📈</span><div><div class="stat-valor">${money(ganancia.ganancia)}</div><div class="stat-label">Ganancia bruta (venta − costo)</div></div></div>
    <div class="stat-tile"><span class="stat-icono">🧾</span><div><div class="stat-valor">${money(total)}</div><div class="stat-label">Gastos del período</div></div></div>
    <div class="stat-tile"><span class="stat-icono">${neta >= 0 ? '✅' : '⚠️'}</span><div><div class="stat-valor">${money(neta)}</div><div class="stat-label">Ganancia NETA (real)</div></div></div>
  `;

  const porCategoria = gastosPorCategoria(rango);
  el('gasto-categorias').innerHTML = porCategoria.length
    ? porCategoria.map(c => `<tr><td>${c.categoria}</td><td>${c.cantidad}</td><td><strong>${money(c.total)}</strong></td><td>${total > 0 ? ((c.total / total) * 100).toFixed(0) : 0}%</td></tr>`).join('')
    : '<tr><td colspan="4" class="hint">Sin gastos en el período.</td></tr>';

  el('gasto-body').innerHTML = gastos.length
    ? gastos.map(g => `<tr>
        <td>${fechaLegible(g.fecha)}</td>
        <td>${g.categoria}</td>
        <td>${g.descripcion || '<span class="hint">—</span>'}</td>
        <td>${g.formaPago === 'caja' ? '<span class="chip chip-alerta">Caja</span>' : '<span class="chip chip-info">Aparte</span>'}</td>
        <td><strong>${money(g.monto)}</strong></td>
        <td><button class="icono-btn eliminar-gasto" data-id="${g.id}" title="Eliminar">🗑️</button></td>
      </tr>`).join('')
    : '<tr><td colspan="6" class="hint">Todavía no registraste gastos en este período.</td></tr>';

  el('gasto-total').textContent = `Total de gastos: ${money(total)}`;
}

function guardar(e) {
  e.preventDefault();
  const monto = Number(el('gasto-monto').value);
  if (!(monto > 0)) return toast.error('Ingresá un monto mayor a 0.');
  const categoria = el('gasto-categoria').value;
  if (!categoria) return toast.error('Elegí una categoría.');
  registrarGasto({
    fecha: el('gasto-fecha').value || hoyYMD(),
    categoria,
    descripcion: el('gasto-descripcion').value,
    monto,
    formaPago: el('gasto-forma-pago').value,
  });
  el('form-gasto').reset();
  el('gasto-fecha').value = hoyYMD();
  render();
  toast.success(`🧾 Gasto registrado: ${money(monto)} (${categoria}).`);
  el('gasto-monto').focus();
}

function exportarPDF() {
  const rango = rangoActual();
  const gastos = listarGastos(rango);
  const total = totalGastos(gastos);
  const ganancia = gananciaEnRango(rango);
  const resumen = resumenVentas(rango);
  const neta = ganancia.ganancia - total;

  exportarReportePDF({
    titulo: 'Gastos y Ganancia Neta',
    subtitulo: `Período: ${etiquetaRango()}`,
    cuerpoHTML: `
      ${kpisHTML([
        { valor: money(resumen.totalVendido), etiqueta: 'Vendido' },
        { valor: money(ganancia.ganancia), etiqueta: 'Ganancia bruta (venta − costo)' },
        { valor: money(total), etiqueta: 'Gastos del período' },
        { valor: money(neta), etiqueta: 'GANANCIA NETA' },
      ])}
      <h2>Gastos por categoría</h2>
      ${tablaHTML(['Categoría', 'N.º', 'Total', '% del total'],
        gastosPorCategoria(rango).map(c => [c.categoria, c.cantidad, money(c.total),
          `${total > 0 ? ((c.total / total) * 100).toFixed(0) : 0}%`]))}
      <h2>Detalle de gastos</h2>
      ${tablaHTML(['Fecha', 'Categoría', 'Descripción', 'Pago', 'Monto'],
        gastos.map(g => [fechaLegible(g.fecha), g.categoria, g.descripcion || '—',
          g.formaPago === 'caja' ? 'Caja' : 'Aparte', money(g.monto)]))}
    `,
  });
}

// Deja el filtro en el mes en curso (del 1 al último día).
function ponerMesActual() {
  const hoy = hoyYMD();
  const [a, m] = hoy.split('-').map(Number);
  const ultimo = new Date(a, m, 0).getDate();
  el('gasto-desde').value = `${hoy.slice(0, 7)}-01`;
  el('gasto-hasta').value = `${hoy.slice(0, 7)}-${String(ultimo).padStart(2, '0')}`;
}

export function initGastos() {
  el('gasto-categoria').innerHTML = '<option value="">— Elegí una categoría —</option>'
    + CATEGORIAS_GASTO.map(c => `<option value="${c}">${c}</option>`).join('');
  el('gasto-fecha').value = hoyYMD();
  ponerMesActual();

  el('form-gasto').addEventListener('submit', guardar);
  el('gasto-desde').addEventListener('input', render);
  el('gasto-hasta').addEventListener('input', render);
  el('btn-gasto-mes-actual').addEventListener('click', () => { ponerMesActual(); render(); });
  el('btn-gasto-pdf').addEventListener('click', exportarPDF);

  // Alquiler, sueldos y servicios se repiten mes a mes: se copian del anterior.
  el('btn-gasto-copiar').addEventListener('click', async () => {
    const mes = (el('gasto-desde').value || hoyYMD()).slice(0, 7);
    const anterior = mesAnterior(mes);
    const ok = await confirmar(
      `¿Copiar los gastos de ${mesLegible(anterior)} a ${mesLegible(mes)}? No se duplican los que ya estén cargados.`,
      { aceptar: 'Sí, copiar' });
    if (!ok) return;
    const n = copiarGastosDeMes(anterior, mes);
    render();
    if (n) toast.success(`📋 ${n} gasto(s) copiados de ${mesLegible(anterior)}.`);
    else toast.info(`No había gastos nuevos que copiar de ${mesLegible(anterior)}.`);
  });

  el('gasto-body').addEventListener('click', async e => {
    const btn = e.target.closest('.eliminar-gasto');
    if (!btn) return;
    if (!await confirmar('¿Eliminar este gasto?', { aceptar: 'Sí, eliminar', peligro: true })) return;
    eliminarGasto(btn.dataset.id);
    render();
    toast.info('🗑️ Gasto eliminado.');
  });

  render();
}

export { render as refrescarGastos };
