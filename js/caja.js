import { db, uid, getSession, setSession } from './storage.js';

export function abrirCaja(montoApertura) {
  const session = getSession();
  const turnoId = uid();
  const apertura = {
    id: uid(),
    turnoId,
    cajero: session.username,
    fecha: new Date().toISOString(),
    montoApertura: Number(montoApertura),
  };
  db.aperturas.add(apertura);
  setSession({ ...session, turno: { turnoId, aperturaId: apertura.id } });
  return apertura;
}

export function turnoActivo() {
  const session = getSession();
  return session?.turno || null;
}

// Turnos ABIERTOS de cualquier cajero (tienen apertura pero aún no cierre).
// Sirve para ver el efectivo real en caja aunque quien mira no sea el cajero
// que está vendiendo (los datos vienen de Firestore, compartidos entre PCs).
export function turnosAbiertos() {
  const cerrados = new Set(db.cierres.all().map(c => c.turnoId));
  return db.aperturas.all()
    .filter(a => !cerrados.has(a.turnoId))
    .map(a => ({
      turnoId: a.turnoId,
      cajero: a.cajero || '—',
      fecha: a.fecha,
      esperado: calcularEfectivoEsperado(a.turnoId).esperado,
    }))
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
}

// Efectivo esperado sumando TODAS las cajas abiertas (todos los cajeros).
export function efectivoEnCajaTotal() {
  return turnosAbiertos().reduce((s, t) => s + t.esperado, 0);
}

export function calcularEfectivoEsperado(turnoId) {
  const apertura = db.aperturas.all().find(a => a.turnoId === turnoId);
  const montoApertura = apertura ? apertura.montoApertura : 0;

  const ventasTurno = db.ventas.all().filter(v => v.turnoId === turnoId && !v.cancelada);
  const ventasEfectivo = ventasTurno
    .filter(v => v.metodoPago === 'efectivo')
    .reduce((sum, v) => sum + v.total, 0);
  const ventasQR = ventasTurno
    .filter(v => v.metodoPago === 'qr')
    .reduce((sum, v) => sum + v.total, 0);
  const totalVendido = ventasEfectivo + ventasQR;

  const movimientos = db.movimientos.all().filter(m => m.turnoId === turnoId);
  const entradas = movimientos.filter(m => m.tipo === 'entrada').reduce((s, m) => s + m.monto, 0);
  const salidas = movimientos.filter(m => m.tipo === 'salida').reduce((s, m) => s + m.monto, 0);

  // Compras del turno (solo para la vista rápida del cierre). Las pagadas de caja
  // YA están reflejadas dentro de `salidas`, así que aquí no se restan otra vez.
  const comprasTurno = db.compras.all().filter(c => c.turnoId === turnoId);
  const montoCompra = c => Number(c.total ?? c.monto ?? 0);
  const comprasCaja = comprasTurno.filter(c => c.formaPago === 'caja').reduce((s, c) => s + montoCompra(c), 0);
  const comprasAparte = comprasTurno.filter(c => c.formaPago === 'aparte').reduce((s, c) => s + montoCompra(c), 0);

  const esperado = montoApertura + ventasEfectivo - salidas + entradas;

  return { montoApertura, ventasEfectivo, ventasQR, totalVendido, entradas, salidas, comprasCaja, comprasAparte, esperado };
}

export function cerrarCaja(turnoId, conteoFisico) {
  const session = getSession();
  const { esperado, ...detalle } = calcularEfectivoEsperado(turnoId);
  const diferencia = Number(conteoFisico) - esperado;

  const cierre = {
    id: uid(),
    turnoId,
    cajero: session.username,
    fecha: new Date().toISOString(),
    ...detalle,
    efectivoEsperado: esperado,
    efectivoContado: Number(conteoFisico),
    diferencia,
  };
  db.cierres.add(cierre);
  setSession({ ...session, turno: null });
  return cierre;
}
