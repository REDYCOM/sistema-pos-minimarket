import { db } from './storage.js';
import { fechaLocalYMD } from './util.js';

// --- Utilidades de fecha ---
const soloFecha = iso => fechaLocalYMD(iso); // fecha LOCAL 'YYYY-MM-DD' (ver util.js)

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

// Costo unitario CONOCIDO de un ítem vendido: usa el guardado en la venta; si es
// una venta vieja (sin costo), aproxima con el precio de compra actual del
// producto. Devuelve `null` cuando NO hay un costo real (> 0) registrado, para
// poder EXCLUIR ese ítem de la ganancia en vez de contarlo como ganancia total
// (costo 0). Así los productos sin precio de compra no inflan la ganancia hasta
// que se les registre su costo real.
function costoConocido(item) {
  const guardado = Number(item.costoUnit);
  if (item.costoUnit !== undefined && item.costoUnit !== null && guardado > 0) return guardado;
  const prod = db.productos.find(item.productoId);
  const pc = prod ? Number(prod.precioCompra) : 0;
  return pc > 0 ? pc : null;
}

// --- Ganancia real del período (venta − costo − descuentos) ---
// Solo cuenta los ítems con precio de compra conocido. Los ítems sin costo no
// suman ni restan a la ganancia; se reportan aparte (itemsSinCosto/ventaSinCosto).
export function gananciaEnRango({ desde, hasta } = {}) {
  const ventas = ventasEnRango({ desde, hasta });
  let ventaBruta = 0, costoTotal = 0, descuentos = 0;
  let itemsSinCosto = 0, ventaSinCosto = 0;
  ventas.forEach(v => {
    let brutaVenta = 0, brutaConCosto = 0;
    v.items.forEach(item => {
      const sub = item.cantidad * item.precioUnit;
      brutaVenta += sub;
      const costo = costoConocido(item);
      if (costo === null) { itemsSinCosto += item.cantidad; ventaSinCosto += sub; return; }
      ventaBruta += sub;
      costoTotal += item.cantidad * costo;
      brutaConCosto += sub;
    });
    // El descuento de la venta se prorratea sobre la parte que sí tiene costo.
    if (brutaVenta > 0) descuentos += (Number(v.descuento) || 0) * (brutaConCosto / brutaVenta);
  });
  const ganancia = ventaBruta - descuentos - costoTotal;
  const base = ventaBruta - descuentos;
  const margen = base > 0 ? (ganancia / base) * 100 : 0;
  return { ventaBruta, costoTotal, descuentos, ganancia, margen, itemsSinCosto, ventaSinCosto };
}

// Productos que más ganancia dejaron (de mayor a menor).
// Omite los ítems sin precio de compra conocido (no se les puede calcular ganancia).
export function rankingGanancia({ desde, hasta } = {}) {
  const ventas = ventasEnRango({ desde, hasta });
  const acc = new Map();
  ventas.forEach(v => {
    v.items.forEach(item => {
      const costo = costoConocido(item);
      if (costo === null) return;
      const prev = acc.get(item.productoId) || { nombre: item.nombre, cantidad: 0, ganancia: 0 };
      prev.cantidad += item.cantidad;
      prev.ganancia += item.cantidad * (item.precioUnit - costo);
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

// --- Análisis de rotación de productos ---
// Clasifica el inventario según su movimiento en el período:
//  • vendidos: los que tuvieron ventas (ordenados de mayor a menor cantidad)
//  • sinVenta: stock parado, no se vendió nada en el rango (con capital inmovilizado)
// A cada uno se le adjunta stock actual, código, categoría de rotación y, para el
// stock parado, el capital inmovilizado (stock × precio de compra).
export function analisisRotacion({ desde, hasta } = {}) {
  const productos = db.productos.all();
  const byId = new Map(productos.map(p => [p.id, p]));
  const byCodigo = new Map(productos.map(p => [p.codigo, p]));

  const vendidos = rankingProductos({ desde, hasta }).map(p => {
    const prod = byId.get(p.productoId);
    const stock = prod ? Number(prod.stock) || 0 : 0;
    return {
      nombre: p.nombre,
      codigo: prod ? prod.codigo : '',
      rotacion: prod ? prod.categoriaRotacion : '',
      cantidad: p.cantidad,
      monto: p.monto,
      stock,
    };
  });

  const sinVenta = productosSinVenta({ desde, hasta }).map(p => {
    const prod = byCodigo.get(p.codigo);
    const pc = prod ? Number(prod.precioCompra) || 0 : 0;
    return { ...p, capitalInmovil: (Number(p.stock) || 0) * pc };
  }).sort((a, b) => b.capitalInmovil - a.capitalInmovil);

  return {
    vendidos,
    sinVenta,
    unidadesVendidas: vendidos.reduce((s, p) => s + p.cantidad, 0),
    capitalParado: sinVenta.reduce((s, p) => s + p.capitalInmovil, 0),
  };
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
// `costo` y `venta` suman TODO el stock (valor total del inventario). La
// `ganancia` potencial solo cuenta productos con precio de compra real (> 0),
// para no inflarla contando el precio de venta completo cuando falta el costo.
// Los que quedan fuera se reportan en `sinCosto` / `ventaSinCosto`.
export function valorInventario() {
  let costo = 0, venta = 0, unidades = 0, ganancia = 0;
  let sinCosto = 0, ventaSinCosto = 0;
  const productos = db.productos.all();
  productos.forEach(p => {
    const stock = Number(p.stock) || 0;
    unidades += stock;
    const pc = Number(p.precioCompra) || 0;
    const pv = Number(p.precioVentaFinal);
    const pvVal = Number.isFinite(pv) ? pv : 0;
    costo += stock * pc;
    venta += stock * pvVal;
    if (pc > 0) {
      ganancia += stock * (pvVal - pc);
    } else if (stock > 0 && pvVal > 0) {
      sinCosto += 1;
      ventaSinCosto += stock * pvVal;
    }
  });
  return { costo, venta, ganancia, unidades, productos: productos.length, sinCosto, ventaSinCosto };
}

// --- Recomendaciones de compra ---
function fechaHaceDias(dias) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return fechaLocalYMD(d);
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
    // Ganancia solo de ítems con costo conocido; el descuento se prorratea.
    let brutaVenta = 0, brutaConCosto = 0, costoTotal = 0;
    v.items.forEach(item => {
      const sub = item.cantidad * item.precioUnit;
      brutaVenta += sub;
      const costo = costoConocido(item);
      if (costo === null) return;
      brutaConCosto += sub;
      costoTotal += item.cantidad * costo;
    });
    const descItem = brutaVenta > 0 ? (Number(v.descuento) || 0) * (brutaConCosto / brutaVenta) : 0;
    prev.ganancia += brutaConCosto - descItem - costoTotal;
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

// --- Cuadre de caja por turno ---
// El "Cierre de Caja" que ve el cajero cubre SOLO su turno (desde que abrió esa
// caja hasta que la cerró), mientras que "Ventas por día" cubre TODO el día
// (todos los turnos juntos). Si en un día hubo varias aperturas/cierres, los
// números no coinciden aunque todo esté bien. Esta función desglosa turno por
// turno para poder cuadrarlos contra el total del día.
//
// Devuelve { turnos, sinTurno, totales } donde `sinTurno` son las ventas del
// rango que quedaron SIN turnoId (no aparecen en ningún cierre: hay que
// revisarlas aparte).
export function cuadrePorTurno({ desde, hasta } = {}) {
  const ventas = ventasEnRango({ desde, hasta });
  const cierresPorTurno = new Map(db.cierres.all().map(c => [c.turnoId, c]));

  // Turnos que tocan el rango: los que tienen apertura en el rango o ventas del rango.
  const turnoIdsConVenta = new Set(ventas.map(v => v.turnoId).filter(Boolean));
  const aperturas = db.aperturas.all()
    .filter(a => enRango(a.fecha, desde, hasta) || turnoIdsConVenta.has(a.turnoId));

  const turnos = aperturas.map(a => {
    // OJO: las ventas del turno se filtran por turnoId (no por fecha), que es
    // exactamente lo que hace el cierre de caja del cajero.
    const vt = db.ventas.all().filter(v => !v.cancelada && v.turnoId === a.turnoId);
    const efectivo = vt.filter(v => v.metodoPago === 'efectivo').reduce((s, v) => s + v.total, 0);
    const qr = vt.filter(v => v.metodoPago === 'qr').reduce((s, v) => s + v.total, 0);
    const movs = db.movimientos.all().filter(m => m.turnoId === a.turnoId);
    const entradas = movs.filter(m => m.tipo === 'entrada').reduce((s, m) => s + m.monto, 0);
    const salidas = movs.filter(m => m.tipo === 'salida').reduce((s, m) => s + m.monto, 0);
    const montoApertura = Number(a.montoApertura) || 0;
    const esperado = montoApertura + efectivo - salidas + entradas;
    const cierre = cierresPorTurno.get(a.turnoId) || null;
    return {
      turnoId: a.turnoId,
      cajero: a.cajero || '—',
      apertura: a.fecha,
      cierreFecha: cierre ? cierre.fecha : null,
      abierto: !cierre,
      montoApertura, cantidad: vt.length, efectivo, qr,
      total: efectivo + qr, entradas, salidas, esperado,
      contado: cierre ? Number(cierre.efectivoContado) || 0 : null,
      diferencia: cierre ? Number(cierre.diferencia) || 0 : null,
    };
  }).sort((a, b) => (b.apertura || '').localeCompare(a.apertura || ''));

  // Ventas del rango sin turno (o con un turnoId que ya no tiene apertura).
  const idsValidos = new Set(aperturas.map(a => a.turnoId));
  const huerfanas = ventas.filter(v => !v.turnoId || !idsValidos.has(v.turnoId));
  const sinTurno = {
    cantidad: huerfanas.length,
    efectivo: huerfanas.filter(v => v.metodoPago === 'efectivo').reduce((s, v) => s + v.total, 0),
    qr: huerfanas.filter(v => v.metodoPago === 'qr').reduce((s, v) => s + v.total, 0),
    total: huerfanas.reduce((s, v) => s + v.total, 0),
  };

  return {
    turnos, sinTurno,
    totales: {
      // Suma de turnos + huérfanas debe dar el total del día del rango.
      cantidad: turnos.reduce((s, t) => s + t.cantidad, 0) + sinTurno.cantidad,
      total: turnos.reduce((s, t) => s + t.total, 0) + sinTurno.total,
    },
  };
}
