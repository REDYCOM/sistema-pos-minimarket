import { db, uid, getSession } from './storage.js';
import { descontarStock } from './productos.js';
import { turnoActivo } from './caja.js';

export function calcularSubtotal(carrito) {
  return carrito.reduce((sum, item) => sum + item.precioUnit * item.cantidad, 0);
}

export function calcularDescuento(subtotal, montoDescuento, tipoDescuento) {
  if (!montoDescuento) return 0;
  if (tipoDescuento === 'porcentaje') {
    return Math.min(subtotal, subtotal * (montoDescuento / 100));
  }
  return Math.min(subtotal, montoDescuento);
}

export function registrarVenta({ carrito, descuentoAplicado, metodoPago, montoRecibido }) {
  const session = getSession();
  const turno = turnoActivo();
  const subtotal = calcularSubtotal(carrito);
  const total = Math.max(0, subtotal - descuentoAplicado);
  const cambio = metodoPago === 'efectivo' ? Number(montoRecibido) - total : 0;

  const venta = {
    id: uid(),
    turnoId: turno?.turnoId || null,
    cajero: session.username,
    fecha: new Date().toISOString(),
    // Se guarda el costo del momento (precio de compra) para poder calcular la
    // ganancia real aunque el costo del producto cambie después.
    items: carrito.map(i => {
      const prod = db.productos.find(i.id);
      return { productoId: i.id, nombre: i.nombre, cantidad: i.cantidad, precioUnit: i.precioUnit, costoUnit: prod ? Number(prod.precioCompra) || 0 : 0 };
    }),
    subtotal,
    descuento: descuentoAplicado,
    total,
    metodoPago,
    montoRecibido: metodoPago === 'efectivo' ? Number(montoRecibido) : null,
    cambio: metodoPago === 'efectivo' ? cambio : null,
    cancelada: false,
  };

  carrito.forEach(item => descontarStock(item.id, item.cantidad));
  db.ventas.add(venta);
  return venta;
}
