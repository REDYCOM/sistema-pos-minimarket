import { db, uid, getSession } from './storage.js';
import { turnoActivo } from './caja.js';
import { registrarMovimiento } from './dinero.js';

// Una devolución es el reverso de una venta: los productos vuelven al inventario
// (sube el stock) y se le devuelve dinero al cliente. Si el reembolso es en
// efectivo, se registra como una SALIDA para que el cierre de caja lo refleje;
// si es por QR, solo se guarda el registro (no toca el efectivo del cajón).
export function registrarDevolucion({ items, metodo, motivo }) {
  const session = getSession();
  const turno = turnoActivo();

  const itemsNormalizados = items.map(it => {
    const producto = db.productos.find(it.productoId);
    if (producto) {
      db.productos.update(it.productoId, { stock: producto.stock + Number(it.cantidad) });
    }
    return {
      productoId: it.productoId,
      nombre: it.nombre,
      cantidad: Number(it.cantidad),
      precioUnit: Number(it.precioUnit),
      subtotal: Number(it.cantidad) * Number(it.precioUnit),
    };
  });

  const total = itemsNormalizados.reduce((s, it) => s + it.subtotal, 0);

  const devolucion = {
    id: uid(),
    fecha: new Date().toISOString(),
    cajero: session.username,
    turnoId: turno?.turnoId || null,
    items: itemsNormalizados,
    total,
    metodo, // 'efectivo' | 'qr'
    motivo: motivo || '',
  };
  db.devoluciones.add(devolucion);

  // Reembolso en efectivo = sale dinero de la caja (afecta el cierre del turno).
  if (metodo === 'efectivo') {
    registrarMovimiento('salida', total, `Devolución${motivo ? ': ' + motivo : ''}`);
  }

  return devolucion;
}

export function listarDevoluciones({ desde, hasta } = {}) {
  return db.devoluciones.all()
    .filter(d => !desde || d.fecha.slice(0, 10) >= desde)
    .filter(d => !hasta || d.fecha.slice(0, 10) <= hasta)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

export function totalDevoluciones(lista) {
  return lista.reduce((s, d) => s + Number(d.total || 0), 0);
}
