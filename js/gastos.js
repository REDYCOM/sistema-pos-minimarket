import { db, uid, getSession } from './storage.js';
import { fechaLocalYMD } from './util.js';

// Gastos operativos del negocio: alquiler, sueldos, servicios, impuestos…
// Son distintos de las "salidas de dinero" de caja: aquellas mueven el efectivo
// del cajón y afectan el CIERRE del turno; estos afectan la GANANCIA del
// negocio, se paguen como se paguen (efectivo, transferencia, etc.).
// Ganancia neta = (ventas − costo de lo vendido) − gastos del período.

export const CATEGORIAS_GASTO = [
  'Alquiler',
  'Sueldos',
  'Servicios (luz, agua, gas)',
  'Internet y teléfono',
  'Impuestos',
  'Transporte',
  'Mantenimiento',
  'Publicidad',
  'Otros',
];

export function registrarGasto({ fecha, categoria, descripcion, monto, formaPago = 'aparte' }) {
  const gasto = {
    id: uid(),
    // `fecha` es el día al que corresponde el gasto (elegido por el admin, puede
    // ser retroactivo); `registradoEn` es cuándo se cargó realmente.
    fecha: fecha || fechaLocalYMD(new Date()),
    registradoEn: new Date().toISOString(),
    categoria,
    descripcion: (descripcion || '').trim(),
    monto: Number(monto) || 0,
    formaPago, // 'caja' | 'aparte'
    usuario: getSession()?.username || '—',
  };
  db.gastos.add(gasto);
  return gasto;
}

export function actualizarGasto(id, patch) {
  db.gastos.update(id, patch);
}

export function eliminarGasto(id) {
  db.gastos.remove(id);
}

// Los gastos guardan la fecha ya en 'YYYY-MM-DD' (día local), así que se
// comparan directamente contra el rango.
export function listarGastos({ desde, hasta } = {}) {
  return db.gastos.all()
    .filter(g => !desde || g.fecha >= desde)
    .filter(g => !hasta || g.fecha <= hasta)
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.registradoEn || '').localeCompare(a.registradoEn || ''));
}

export function totalGastos(lista) {
  return lista.reduce((s, g) => s + (Number(g.monto) || 0), 0);
}

export function gastosPorCategoria({ desde, hasta } = {}) {
  const acc = new Map();
  listarGastos({ desde, hasta }).forEach(g => {
    const c = g.categoria || 'Otros';
    const prev = acc.get(c) || { categoria: c, cantidad: 0, total: 0 };
    prev.cantidad += 1;
    prev.total += Number(g.monto) || 0;
    acc.set(c, prev);
  });
  return [...acc.values()].sort((a, b) => b.total - a.total);
}

// Total de gastos por mes ('YYYY-MM'), para restarlos a la ganancia mensual.
export function gastosPorMes({ desde, hasta } = {}) {
  const acc = new Map();
  listarGastos({ desde, hasta }).forEach(g => {
    const mes = g.fecha.slice(0, 7);
    acc.set(mes, (acc.get(mes) || 0) + (Number(g.monto) || 0));
  });
  return acc; // Map('YYYY-MM' -> total)
}

// Copia los gastos de un mes al siguiente (alquiler, sueldos y servicios suelen
// repetirse). Devuelve cuántos copió; no duplica si el mes destino ya los tiene.
export function copiarGastosDeMes(mesOrigen, mesDestino) {
  const origen = db.gastos.all().filter(g => g.fecha.slice(0, 7) === mesOrigen);
  const destino = db.gastos.all().filter(g => g.fecha.slice(0, 7) === mesDestino);
  const yaEsta = new Set(destino.map(g => `${g.categoria}|${g.descripcion}`));
  let copiados = 0;
  origen.forEach(g => {
    if (yaEsta.has(`${g.categoria}|${g.descripcion}`)) return;
    registrarGasto({
      fecha: `${mesDestino}-${g.fecha.slice(8, 10)}`,
      categoria: g.categoria,
      descripcion: g.descripcion,
      monto: g.monto,
      formaPago: g.formaPago,
    });
    copiados += 1;
  });
  return copiados;
}
