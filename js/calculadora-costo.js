import { abrirModal, cerrarModal } from './modal.js';

// Calculadora de costo unitario real, orientada a productos unitarios.
// Contempla: unidades compradas (pagadas), precio unitario, unidades de
// bonificación (gratis) y descuento en monto fijo. Prorratea el total pagado
// entre TODAS las unidades recibidas (compradas + bonificadas).

const el = id => document.getElementById(id);
const money = n => `Bs ${Number(n).toFixed(2)}`;

let onAplicar = null;

export function calcularCosto({ unidades, precioUnitario, bonificacion, descuentoFijo }) {
  const N = Number(unidades) || 0;
  const P = Number(precioUnitario) || 0;
  const B = Number(bonificacion) || 0;
  const D = Number(descuentoFijo) || 0;

  const unidadesTotales = N + B;
  const totalPagado = Math.max(0, N * P - D);
  const costoUnit = unidadesTotales > 0 ? totalPagado / unidadesTotales : 0;

  return { unidadesTotales, totalPagado, costoUnit };
}

function leerCampos() {
  return {
    unidades: el('calc-unidades').value,
    precioUnitario: el('calc-precio-unitario').value,
    bonificacion: el('calc-bonificacion').value,
    descuentoFijo: el('calc-descuento').value,
  };
}

function recalcular() {
  const r = calcularCosto(leerCampos());
  el('calc-unidades-totales').textContent = `${r.unidadesTotales} u`;
  el('calc-total-pagado').textContent = money(r.totalPagado);
  el('calc-costo-unit').textContent = money(r.costoUnit);
  return r;
}

export function abrirCalculadora(callback) {
  onAplicar = callback;
  el('calc-unidades').value = '';
  el('calc-precio-unitario').value = '';
  el('calc-bonificacion').value = '0';
  el('calc-descuento').value = '0';
  recalcular();
  abrirModal(el('modal-calculadora'));
  setTimeout(() => el('calc-unidades').focus(), 50);
}

export function initCalculadora() {
  ['calc-unidades', 'calc-precio-unitario', 'calc-bonificacion', 'calc-descuento']
    .forEach(id => el(id).addEventListener('input', recalcular));

  // Enter en cualquier campo aplica el costo calculado.
  ['calc-unidades', 'calc-precio-unitario', 'calc-bonificacion', 'calc-descuento']
    .forEach(id => el(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); el('btn-aplicar-calc').click(); }
    }));

  el('btn-cerrar-modal-calc').addEventListener('click', () => cerrarModal(el('modal-calculadora')));
  el('btn-aplicar-calc').addEventListener('click', () => {
    const r = recalcular();
    if (r.costoUnit <= 0) return;
    if (onAplicar) onAplicar({ unidades: r.unidadesTotales, costoUnit: r.costoUnit });
    cerrarModal(el('modal-calculadora'));
  });
}
