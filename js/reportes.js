import { db } from './storage.js';

// --- Utilidades de fecha ---
const soloFecha = iso => iso.slice(0, 10); // 'YYYY-MM-DD'

function enRango(iso, desde, hasta) {
  const f = soloFecha(iso);
  if (desde && f < desde) return false;
  if (hasta && f > hasta) return false;
  return true;
}

export function ventasEnRango({ desde, hasta } = {}) {
  return db.ventas.all().filter(v => !v.cancelada && enRango(v.fecha, desde, hasta));
}

// --- Ranking de productos vendidos (de mayor a menor) ---
export function rankingProductos({ desde, hasta } = {}) {
  const ventas = ventasEnRango({ desde, hasta });
  const acumulado = new Map(); // productoId -> { nombre, cantidad, monto }
  ventas.forEach(v => {
    v.items.forEach(item => {
      const prev = acumulado.get(item.productoId) || { nombre: item.nombre, cantidad: 0, monto: 0 };
      prev.cantidad += item.cantidad;
      prev.monto += item.cantidad * item.precioUnit;
      acumulado.set(item.productoId, prev);
    });
  });
  return [...acumulado.entries()]
    .map(([productoId, datos]) => ({ productoId, ...datos }))
    .sort((a, b) => b.cantidad - a.cantidad);
}

// Costo unitario de un ítem vendido: usa el guardado en la venta; si es una
// venta vieja (sin costo), aproxima con el precio de compra actual del producto.
function costoDeItem(item) {
  if (item.costoUnit !== undefined && item.costoUnit !== null) return Number(item.costoUnit) || 0;
  const prod = db.productos.find(item.productoId);
  return prod ? Number(prod.precioCompra) || 0 : 0;
}

// --- Ganancia real del período (venta − costo − descuentos) ---
export function gananciaEnRango({ desde, hasta } = {}) {
  const ventas = ventasEnRango({ desde, hasta });
  let ventaBruta = 0, costoTotal = 0, descuentos = 0;
  ventas.forEach(v => {
    v.items.forEach(item => {
      ventaBruta += item.cantidad * item.precioUnit;
      costoTotal += item.cantidad * costoDeItem(item);
    });
    descuentos += Number(v.descuento) || 0;
  });
  const ganancia = ventaBruta - descuentos - costoTotal;
  const margen = ventaBruta > 0 ? (ganancia / (ventaBruta - descuentos)) * 100 : 0;
  return { ventaBruta, costoTotal, descuentos, ganancia, margen };
}

// Productos que más ganancia dejaron (de mayor a menor).
export function rankingGanancia({ desde, hasta } = {}) {
  const ventas = ventasEnRango({ desde, hasta });
  const acc = new Map();
  ventas.forEach(v => {
    v.items.forEach(item => {
      const prev = acc.get(item.productoId) || { nombre: item.nombre, cantidad: 0, ganancia: 0 };
      prev.cantidad += item.cantidad;
      prev.ganancia += item.cantidad * (item.precioUnit - costoDeItem(item));
      acc.set(item.productoId, prev);
    });
  });
  return [...acc.entries()]
    .map(([productoId, d]) => ({ productoId, ...d }))
    .sort((a, b) => b.ganancia - a.ganancia);
}

// Productos del inventario que NO se vendieron en el rango (baja rotación).
export function productosSinVenta({ desde, hasta } = {}) {
  const vendidos = new Set(rankingProductos({ desde, hasta }).map(p => p.productoId));
  return db.productos.all()
    .filter(p => !vendidos.has(p.id))
    .map(p => ({ nombre: p.nombre, codigo: p.codigo, stock: p.stock, categoriaRotacion: p.categoriaRotacion }));
}

// --- Totales del período ---
export function resumenVentas({ desde, hasta } = {}) {
  const ventas = ventasEnRango({ desde, hasta });
  const totalVendido = ventas.reduce((s, v) => s + v.total, 0);
  const efectivo = ventas.filter(v => v.metodoPago === 'efectivo').reduce((s, v) => s + v.total, 0);
  const qr = ventas.filter(v => v.metodoPago === 'qr').reduce((s, v) => s + v.total, 0);
  const descuentos = ventas.reduce((s, v) => s + (v.descuento || 0), 0);
  return {
    cantidadVentas: ventas.length,
    totalVendido,
    efectivo,
    qr,
    descuentos,
    ticketPromedio: ventas.length ? totalVendido / ventas.length : 0,
  };
}

// Ventas agrupadas por cajero (quién vendió y cuánto en el período).
export function ventasPorCajero({ desde, hasta } = {}) {
  const ventas = ventasEnRango({ desde, hasta });
  const porCajero = new Map();
  ventas.forEach(v => {
    const c = v.cajero || '—';
    const prev = porCajero.get(c) || { cajero: c, cantidad: 0, total: 0, efectivo: 0, qr: 0 };
    prev.cantidad += 1;
    prev.total += v.total;
    if (v.metodoPago === 'efectivo') prev.efectivo += v.total;
    else if (v.metodoPago === 'qr') prev.qr += v.total;
    porCajero.set(c, prev);
  });
  return [...porCajero.values()].sort((a, b) => b.total - a.total);
}

// --- Aperturas y cierres del período ---
export function aperturasEnRango({ desde, hasta } = {}) {
  return db.aperturas.all()
    .filter(a => enRango(a.fecha, desde, hasta))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

export function cierresEnRango({ desde, hasta } = {}) {
  return db.cierres.all()
    .filter(c => enRango(c.fecha, desde, hasta))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

// --- Valor del inventario (capital en stock) ---
export function valorInventario() {
  let costo = 0, venta = 0, unidades = 0;
  const productos = db.productos.all();
  productos.forEach(p => {
    const stock = Number(p.stock) || 0;
    unidades += stock;
    costo += stock * (Number(p.precioCompra) || 0);
    const pv = Number(p.precioVentaFinal);
    venta += stock * (Number.isFinite(pv) ? pv : 0);
  });
  return { costo, venta, ganancia: venta - costo, unidades, productos: productos.length };
}

// --- Recomendaciones de compra ---
function fechaHaceDias(dias) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

// Productos con stock bajo que ADEMÁS se venden, priorizados por la ganancia que
// mueven, agrupados por proveedor. Ignora el stock bajo que no rota (stock muerto).
export function recomendacionesCompra({ dias = 30 } = {}) {
  const desde = fechaHaceDias(dias);
  const movMap = new Map();
  rankingProductos({ desde }).forEach(p => movMap.set(p.productoId, p.cantidad));

  const candidatos = db.productos.all()
    .filter(p => Number(p.stock) <= 0 || Number(p.stock) < Number(p.stockMinimo || 0))
    .map(p => {
      const mov = movMap.get(p.id) || 0;
      const margen = (Number(p.precioVentaFinal) || 0) - (Number(p.precioCompra) || 0);
      const gananciaPotencial = mov * Math.max(0, margen);
      const sugerido = Math.max(1, Math.round(mov) - Number(p.stock));
      const urgencia = Number(p.stock) <= 0 ? 1.6 : 1; // agotado = más urgente
      const score = gananciaPotencial * urgencia + mov * 0.01;
      return {
        id: p.id, nombre: p.nombre, proveedor: p.proveedor || '',
        stock: Number(p.stock) || 0, stockMinimo: Number(p.stockMinimo) || 0,
        mov, margen, gananciaPotencial, sugerido, score,
      };
    })
    .filter(p => p.mov > 0)
    .sort((a, b) => b.score - a.score);

  const porProveedor = new Map();
  candidatos.forEach(p => {
    const prov = p.proveedor || '— Sin proveedor —';
    if (!porProveedor.has(prov)) porProveedor.set(prov, []);
    porProveedor.get(prov).push(p);
  });

  return [...porProveedor.entries()]
    .map(([proveedor, items]) => ({
      proveedor, items,
      gananciaTotal: items.reduce((s, p) => s + p.gananciaPotencial, 0),
    }))
    .sort((a, b) => b.gananciaTotal - a.gananciaTotal);
}

// --- Ventas agrupadas por día (resumen diario: cuánto se vendió cada día) ---
// Devuelve una fila por día con cantidad de ventas, efectivo, QR, total y ganancia.
// Ordenado del día más reciente al más antiguo.
export function ventasPorDia({ desde, hasta } = {}) {
  const ventas = ventasEnRango({ desde, hasta });
  const porDia = new Map(); // 'YYYY-MM-DD' -> { cantidad, efectivo, qr, total, ganancia }
  ventas.forEach(v => {
    const dia = soloFecha(v.fecha);
    const prev = porDia.get(dia) || { dia, cantidad: 0, efectivo: 0, qr: 0, total: 0, ganancia: 0 };
    prev.cantidad += 1;
    prev.total += v.total;
    if (v.metodoPago === 'efectivo') prev.efectivo += v.total;
    else if (v.metodoPago === 'qr') prev.qr += v.total;
    let ventaBruta = 0, costoTotal = 0;
    v.items.forEach(item => {
      ventaBruta += item.cantidad * item.precioUnit;
      costoTotal += item.cantidad * costoDeItem(item);
    });
    prev.ganancia += ventaBruta - (Number(v.descuento) || 0) - costoTotal;
    porDia.set(dia, prev);
  });
  return [...porDia.values()].sort((a, b) => b.dia.localeCompare(a.dia));
}

// --- Serie diaria de ventas (para gráficos y proyección) ---
export function serieDiaria({ desde, hasta } = {}) {
  const ventas = ventasEnRango({ desde, hasta });
  const porDia = new Map(); // 'YYYY-MM-DD' -> total
  ventas.forEach(v => {
    const dia = soloFecha(v.fecha);
    porDia.set(dia, (porDia.get(dia) || 0) + v.total);
  });
  return [...porDia.entries()]
    .map(([dia, total]) => ({ dia, total }))
    .sort((a, b) => a.dia.localeCompare(b.dia));
}

// --- Proyección de ventas por regresión lineal (mínimos cuadrados) ---
// Devuelve { disponible, diasHistorico, puntosProyectados, promedioDiario, tendencia }.
// Solo se habilita con suficiente histórico (por defecto 30 días distintos con ventas).
export function proyeccionVentas({ desde, hasta, diasMinimos = 30, diasFuturos = 7 } = {}) {
  const serie = serieDiaria({ desde, hasta });
  const diasHistorico = serie.length;

  if (diasHistorico < diasMinimos) {
    return { disponible: false, diasHistorico, diasMinimos };
  }

  // x = índice del día (0..n-1), y = total de ese día.
  const n = serie.length;
  const xs = serie.map((_, i) => i);
  const ys = serie.map(p => p.total);
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const sumXX = xs.reduce((a, x) => a + x * x, 0);
  const pendiente = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX || 1);
  const interseccion = (sumY - pendiente * sumX) / n;

  const puntosProyectados = [];
  for (let i = 0; i < diasFuturos; i++) {
    const x = n + i;
    puntosProyectados.push(Math.max(0, interseccion + pendiente * x));
  }

  return {
    disponible: true,
    diasHistorico,
    promedioDiario: sumY / n,
    tendencia: pendiente >= 0 ? 'al alza' : 'a la baja',
    pendiente,
    puntosProyectados,
    totalProyectado: puntosProyectados.reduce((a, b) => a + b, 0),
    diasFuturos,
  };
}
