import { db, uid, getSession } from './storage.js';
import { crearProducto } from './productos.js';
import { registrarMovimiento } from './dinero.js';
import { turnoActivo } from './caja.js';

// Una compra es como el carrito de venta pero al revés: en vez de descontar
// stock, lo suma. Cada ítem puede referir a un producto existente (por id) o
// a uno nuevo que se crea al vuelo. Además puede pagarse desde la caja
// (registra una salida que afecta el cierre) o aparte (fondos del negocio).

export function totalDeItems(items) {
  return items.reduce((sum, it) => sum + Number(it.cantidad) * Number(it.costoUnit), 0);
}

export function registrarCompra({ proveedor, formaPago, items }) {
  const session = getSession();
  const turno = turnoActivo();

  const itemsNormalizados = items.map(it => {
    let productoId = it.productoId;
    let nombre = it.nombre;

    if (productoId) {
      // Producto existente: sube stock y actualiza el precio de compra al costo real.
      const producto = db.productos.find(productoId);
      if (producto) {
        const patch = {
          stock: producto.stock + Number(it.cantidad),
          precioCompra: Number(it.costoUnit),
        };
        // Si en la compra se indicó un precio de venta, se actualiza el del producto.
        if (it.precioVenta !== '' && it.precioVenta !== null && it.precioVenta !== undefined && !Number.isNaN(Number(it.precioVenta))) {
          patch.precioVentaFinal = Number(it.precioVenta);
        }
        db.productos.update(productoId, patch);
        nombre = producto.nombre;
      }
    } else {
      // Producto nuevo: se crea con el stock comprado y sin precio de venta
      // (queda pendiente de asignar, según la especificación 5.6).
      const nuevo = crearProducto({
        nombre: it.nombre,
        codigo: it.codigo,
        categoria: it.categoria,
        categoriaRotacion: it.categoriaRotacion || 'B',
        proveedor,
        stock: it.cantidad,
        precioCompra: it.costoUnit,
        precioVentaFinal: it.precioVenta ?? '', // opcional; vacío = se asigna después
      });
      productoId = nuevo.id;
    }

    return {
      productoId,
      nombre,
      cantidad: Number(it.cantidad),
      costoUnit: Number(it.costoUnit),
      esNuevo: !it.productoId,
    };
  });

  const total = totalDeItems(itemsNormalizados);

  const compra = {
    id: uid(),
    fecha: new Date().toISOString(),
    proveedor,
    cajero: session.username,
    turnoId: turno?.turnoId || null,
    items: itemsNormalizados,
    total,
    formaPago, // 'caja' | 'aparte'
  };
  db.compras.add(compra);

  // Si se pagó con el efectivo del cajón, se registra como salida para que el
  // cierre de caja lo refleje.
  if (formaPago === 'caja') {
    registrarMovimiento('salida', total, `Compra a ${proveedor}`);
  }

  return compra;
}

export function listarCompras({ desde, hasta } = {}) {
  return db.compras.all()
    .filter(c => !desde || c.fecha.slice(0, 10) >= desde)
    .filter(c => !hasta || c.fecha.slice(0, 10) <= hasta)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

// Tolera compras del formato antiguo (campo `monto`) además del nuevo (`total`).
export function totalDeCompra(c) {
  return Number(c.total ?? c.monto ?? 0);
}

export function totalCompras(lista) {
  return lista.reduce((sum, c) => sum + totalDeCompra(c), 0);
}
