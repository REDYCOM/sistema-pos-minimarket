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

export function calcularEfectivoEsperado(turnoId) {
  const apertura = db.aperturas.all().find(a => a.turnoId === turnoId);
  const montoApertura = apertura ? apertura.montoApertura : 0;

  const ventasTurno = db.ventas.all().filter(v => v.turnoId === turnoId && !v.cancelada);
  const ventasEfectivo = ventasTurno
    .filter(v => v.metodoPago === 'efectivo')
    .reduce((sum, v) => sum + v.total, 0);

  const movimientos = db.movimientos.all().filter(m => m.turnoId === turnoId);
  const entradas = movimientos.filter(m => m.tipo === 'entrada').reduce((s, m) => s + m.monto, 0);
  const salidas = movimientos.filter(m => m.tipo === 'salida').reduce((s, m) => s + m.monto, 0);

  const esperado = montoApertura + ventasEfectivo - salidas + entradas;

  return { montoApertura, ventasEfectivo, entradas, salidas, esperado };
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
