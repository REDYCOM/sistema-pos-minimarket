import { getConfig } from './storage.js';

// Impresión de ticket para impresora térmica (Epson TM, rollo 80mm).
// Se imprime con la impresión del navegador: el CSS @media print aísla el ticket
// y lo formatea al ancho del rollo. La Epson TM debe estar instalada como
// impresora de Windows y seleccionada en el diálogo de impresión.

const money = n => `Bs ${Number(n).toFixed(2)}`;

export function imprimirTicket(venta) {
  if (!venta) return;
  const cont = document.getElementById('ticket-print');
  if (!cont) return;
  const negocio = (getConfig().nombreNegocio || 'MINIMARKET').toUpperCase();

  const items = (venta.items || []).map(i => `
    <div class="tk-item">
      <div class="tk-nom">${i.nombre}</div>
      <div class="tk-fila"><span>${i.cantidad} x ${money(i.precioUnit)}</span><span>${money(i.cantidad * i.precioUnit)}</span></div>
    </div>`).join('');

  const efectivo = venta.metodoPago === 'efectivo' && venta.montoRecibido != null;

  cont.innerHTML = `
    <div class="ticket">
      <div class="tk-negocio">${negocio}</div>
      <div class="tk-fecha">${new Date(venta.fecha).toLocaleString('es-BO')}</div>
      <div class="tk-fecha">Cajero: ${venta.cajero || '—'}</div>
      <div class="tk-sep"></div>
      ${items}
      <div class="tk-sep"></div>
      ${venta.descuento ? `<div class="tk-fila"><span>Descuento</span><span>-${money(venta.descuento)}</span></div>` : ''}
      <div class="tk-total"><span>TOTAL</span><span>${money(venta.total)}</span></div>
      <div class="tk-fecha">Pago: ${venta.metodoPago === 'efectivo' ? 'Efectivo' : 'QR'}</div>
      ${efectivo ? `<div class="tk-fila"><span>Recibido</span><span>${money(venta.montoRecibido)}</span></div><div class="tk-fila"><span>Cambio</span><span>${money(venta.cambio || 0)}</span></div>` : ''}
      <div class="tk-sep"></div>
      <div class="tk-gracias">¡Gracias por su compra!</div>
    </div>`;

  window.print();
}

// Ticket de prueba para calibrar la impresora.
export function imprimirTicketPrueba() {
  imprimirTicket({
    fecha: new Date().toISOString(),
    cajero: 'PRUEBA',
    items: [
      { nombre: 'Producto de prueba 1', cantidad: 2, precioUnit: 5 },
      { nombre: 'Producto de prueba 2', cantidad: 1, precioUnit: 12.5 },
    ],
    total: 22.5,
    metodoPago: 'efectivo',
    montoRecibido: 25,
    cambio: 2.5,
    descuento: 0,
  });
}
