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
