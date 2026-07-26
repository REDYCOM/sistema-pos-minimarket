import { db, uid, getAjustes } from './storage.js';

// Márgenes referenciales por categoría de rotación (solo para el precio sugerido).
// Ahora son configurables en Configuración; este objeto es solo el respaldo por
// defecto. El precio de venta final siempre se asigna manualmente o por
// importación, nunca se autocompleta con este valor (ver sección 5.6).
export const MARGEN_POR_ROTACION = { A: 0.20, B: 0.30, C: 0.40 };

export function precioSugerido(producto) {
  const margenes = getAjustes().margenes || MARGEN_POR_ROTACION;
  const margen = margenes[producto.categoriaRotacion] ?? 0.30;
  return Math.round(producto.precioCompra * (1 + margen) * 100) / 100;
}

export function tienePrecioFinal(producto) {
  return producto.precioVentaFinal !== null && producto.precioVentaFinal !== undefined && producto.precioVentaFinal !== '';
}

export function crearProducto(datos) {
  const producto = {
    id: uid(),
    nombre: datos.nombre,
    codigo: datos.codigo,
    categoria: datos.categoria,
    categoriaRotacion: datos.categoriaRotacion || 'B',
    proveedor: datos.proveedor || '',
    stock: Number(datos.stock) || 0,
    stockMinimo: Number(datos.stockMinimo) || 5,
    precioCompra: Number(datos.precioCompra) || 0,
    precioVentaFinal: datos.precioVentaFinal === '' || datos.precioVentaFinal === undefined || datos.precioVentaFinal === null
      ? null
      : Number(datos.precioVentaFinal),
  };
  db.productos.add(producto);
  return producto;
}

export function actualizarProducto(id, datos) {
  const patch = {
    nombre: datos.nombre,
    codigo: datos.codigo,
    categoria: datos.categoria,
    categoriaRotacion: datos.categoriaRotacion,
    proveedor: datos.proveedor,
    stock: Number(datos.stock),
    stockMinimo: Number(datos.stockMinimo),
    precioCompra: Number(datos.precioCompra),
    precioVentaFinal: datos.precioVentaFinal === '' || datos.precioVentaFinal === undefined || datos.precioVentaFinal === null
      ? null
      : Number(datos.precioVentaFinal),
  };
  return db.productos.update(id, patch);
}

export function eliminarProducto(id) {
  db.productos.remove(id);
}

export function buscarProductos(query) {
  const q = (query || '').trim().toLowerCase();
  const all = db.productos.all();
  if (!q) return all;
  return all.filter(p =>
    p.nombre.toLowerCase().includes(q) ||
    p.codigo.toLowerCase().includes(q) ||
    (p.categoria || '').toLowerCase().includes(q) ||
    (p.proveedor || '').toLowerCase().includes(q)
  );
}

export function productosConStockBajo() {
  return db.productos.all().filter(p => p.stock < p.stockMinimo);
}

// Nivel de stock para el indicador visual:
//  bajo  (rojo)     → por debajo del mínimo
//  medio (amarillo) → entre el mínimo y el doble del mínimo
//  alto  (verde)    → del doble del mínimo en adelante
export function nivelStock(p) {
  const min = p.stockMinimo || 0;
  if (p.stock < min) return 'bajo';
  if (p.stock < min * 2) return 'medio';
  return 'alto';
}

export function descontarStock(productoId, cantidad) {
  const producto = db.productos.find(productoId);
  if (!producto) return null;
  return db.productos.update(productoId, { stock: producto.stock - cantidad });
}

// --- Seed de ejemplo para poder probar la app sin cargar datos manualmente ---
export function ensureProductosDemo() {
  if (db.productos.all().length > 0) return;
  const demo = [
    { nombre: 'Arroz 1kg', codigo: '7750001000019', categoria: 'Alimentación', categoriaRotacion: 'A', proveedor: 'Distribuidora Central', stock: 40, stockMinimo: 10, precioCompra: 6.5, precioVentaFinal: 8.5 },
    { nombre: 'Aceite 900ml', codigo: '7750001000026', categoria: 'Alimentación', categoriaRotacion: 'A', proveedor: 'Distribuidora Central', stock: 25, stockMinimo: 8, precioCompra: 12, precioVentaFinal: 15 },
    { nombre: 'Detergente 1kg', codigo: '7750001000033', categoria: 'Limpieza', categoriaRotacion: 'B', proveedor: 'Insumos del Sur', stock: 3, stockMinimo: 5, precioCompra: 9, precioVentaFinal: null },
    { nombre: 'Coca Cola 2L', codigo: '7750001000040', categoria: 'Bebidas', categoriaRotacion: 'A', proveedor: 'Embotelladora Andina', stock: 30, stockMinimo: 10, precioCompra: 8, precioVentaFinal: 11 },
    { nombre: 'Papel higiénico x4', codigo: '7750001000057', categoria: 'Limpieza', categoriaRotacion: 'C', proveedor: 'Insumos del Sur', stock: 2, stockMinimo: 6, precioCompra: 10, precioVentaFinal: null },
  ];
  demo.forEach(crearProducto);
}
