import { db, uid, getSession } from './storage.js';
import { turnoActivo } from './caja.js';
import { fechaLocalYMD } from './util.js';

export function registrarMovimiento(tipo, monto, motivo) {
  const session = getSession();
  const turno = turnoActivo();
  const movimiento = {
    id: uid(),
    turnoId: turno?.turnoId || null,
    cajero: session.username,
    fecha: new Date().toISOString(),
    tipo, // 'entrada' | 'salida'
    monto: Number(monto),
    motivo,
  };
  db.movimientos.add(movimiento);
  return movimiento;
}

export function listarMovimientos({ fecha, cajero } = {}) {
  return db.movimientos.all()
    .filter(m => !fecha || fechaLocalYMD(m.fecha) === fecha)
    .filter(m => !cajero || m.cajero === cajero)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}
