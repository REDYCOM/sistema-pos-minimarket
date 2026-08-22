import { recomendacionesCompra } from './reportes.js';
import { exportarReportePDF, tablaHTML, kpisHTML } from './pdf.js';
import { toast } from './toast.js';

const el = id => document.getElementById(id);
const money = n => `Bs ${Number(n).toFixed(2)}`;
const DIAS = 30;

function render() {
  const grupos = recomendacionesCompra({ dias: DIAS });
  const cont = el('recomendaciones-lista');
  if (!grupos.length) {
    cont.innerHTML = '<div class="avisos-ok">✅ Nada urgente por comprar: no hay productos con stock bajo que se estén vendiendo.</div>';
    return;
  }
  cont.innerHTML = grupos.map(g => `
    <div class="card reco-grupo">
      <div class="reco-cabecera">
        <h3>🚚 ${g.proveedor}</h3>
        <span class="reco-ganancia">Ganancia que mueve: <strong>${money(g.gananciaTotal)}</strong></span>
      </div>
      <table class="tabla-datos">
        <thead><tr><th>Producto</th><th>Stock</th><th>Vendidos (30d)</th><th>Margen/u</th><th>Comprar</th></tr></thead>
        <tbody>
          ${g.items.map(p => `
            <tr>
              <td>${p.nombre}</td>
              <td>${p.stock <= 0 ? '<span class="texto-alerta">0 (agotado)</span>' : `${p.stock} / mín ${p.stockMinimo}`}</td>
              <td>${p.mov}</td>
              <td>${money(p.margen)}</td>
              <td><strong class="reco-sugerido">${p.sugerido}</strong></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`).join('');
}

// Informe para llevar al proveedor: una tabla por proveedor con qué comprar y
// cuánto, más el costo estimado de reponer (sirve para presupuestar la compra).
function exportarPDF() {
  const grupos = recomendacionesCompra({ dias: DIAS });
  if (!grupos.length) return toast.info('No hay recomendaciones de compra para exportar.');

  const totalProductos = grupos.reduce((s, g) => s + g.items.length, 0);
  const totalUnidades = grupos.reduce((s, g) => s + g.items.reduce((x, p) => x + p.sugerido, 0), 0);
  const gananciaTotal = grupos.reduce((s, g) => s + g.gananciaTotal, 0);

  const cuerpo = `
    ${kpisHTML([
      { valor: grupos.length, etiqueta: 'Proveedores' },
      { valor: totalProductos, etiqueta: 'Productos a reponer' },
      { valor: totalUnidades, etiqueta: 'Unidades sugeridas' },
      { valor: money(gananciaTotal), etiqueta: 'Ganancia que mueven' },
    ])}
    <p style="font-size:12px;color:#667c72">Productos con <strong>stock bajo que sí se venden</strong>, según los últimos ${DIAS} días,
    ordenados por la ganancia que mueven y agrupados por proveedor. El stock bajo que no rota no aparece.</p>
    ${grupos.map(g => `
      <h2>${g.proveedor} — ganancia que mueve: ${money(g.gananciaTotal)}</h2>
      ${tablaHTML(['Producto', 'Stock actual', 'Stock mínimo', `Vendidos (${DIAS}d)`, 'Margen/u', 'Comprar'],
        g.items.map(p => [p.nombre, p.stock <= 0 ? '0 (agotado)' : p.stock, p.stockMinimo, p.mov, money(p.margen), p.sugerido]))}
    `).join('')}
  `;

  exportarReportePDF({
    titulo: 'Recomendaciones de Compra',
    subtitulo: `Según las ventas de los últimos ${DIAS} días · Generado el ${new Date().toLocaleDateString('es-BO')}`,
    cuerpoHTML: cuerpo,
  });
}

export function initRecomendaciones() {
  el('btn-reco-pdf').addEventListener('click', exportarPDF);
  render();
}

export { render as refrescarRecomendaciones };
