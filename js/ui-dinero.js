import { registrarMovimiento, listarMovimientos } from './dinero.js';
import { toast } from './toast.js';

const el = id => document.getElementById(id);
const money = n => `Bs ${Number(n).toFixed(2)}`;

function poblarFiltroCajero() {
  const cajeros = [...new Set(listarMovimientos().map(m => m.cajero))].sort();
  const select = el('dinero-filtro-cajero');
  const actual = select.value;
  select.innerHTML = '<option value="">Todos los cajeros</option>' +
    cajeros.map(c => `<option value="${c}">${c}</option>`).join('');
  select.value = actual;
}

function renderHistorial() {
  poblarFiltroCajero();
  const fecha = el('dinero-filtro-fecha').value;
  const cajero = el('dinero-filtro-cajero').value;
  const movimientos = listarMovimientos({ fecha, cajero });
  el('dinero-body').innerHTML = movimientos.map(m => `
    <tr>
      <td>${new Date(m.fecha).toLocaleString('es-BO')}</td>
      <td>${m.cajero}</td>
      <td>${m.tipo === 'entrada' ? '⬆️ Entrada' : '⬇️ Salida'}</td>
      <td>${money(m.monto)}</td>
      <td>${m.motivo}</td>
    </tr>
  `).join('');
}

export function initDinero() {
  el('form-dinero').addEventListener('submit', e => {
    e.preventDefault();
    const tipo = el('dinero-tipo').value;
    const monto = el('dinero-monto').value;
    const motivo = el('dinero-motivo').value.trim();
    registrarMovimiento(tipo, monto, motivo);
    e.target.reset();
    renderHistorial();
    toast.success(tipo === 'entrada' ? '⬆️ Entrada registrada.' : '⬇️ Salida registrada.');
  });

  el('dinero-filtro-fecha').addEventListener('input', renderHistorial);
  el('dinero-filtro-cajero').addEventListener('change', renderHistorial);

  renderHistorial();
}

export { renderHistorial as refrescarDinero };
