import { recomendacionesCompra } from './reportes.js';

const el = id => document.getElementById(id);
const money = n => `Bs ${Number(n).toFixed(2)}`;

function render() {
  const grupos = recomendacionesCompra({ dias: 30 });
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

export function initRecomendaciones() {
  render();
}

export { render as refrescarRecomendaciones };
