import { db, uid, getSession, getAjustes, setAjustes } from './storage.js';
import { hashPassword, verifyPassword } from './crypto.js';

export function listarUsuarios() {
  return db.users.all().slice().sort((a, b) => a.username.localeCompare(b.username));
}

export function existeUsuario(username) {
  return db.users.all().some(u => u.username.toLowerCase() === username.toLowerCase());
}

// El admin crea el usuario con su contraseña (queda activo de inmediato).
export async function crearUsuario(username, role, password) {
  const { salt, hash, algo, iter } = await hashPassword(password);
  const usuario = {
    id: uid(),
    username,
    role, // 'admin' | 'cajero'
    salt,
    hash,
    algo,
    iter,
    mustChangePassword: false,
    createdAt: new Date().toISOString(),
  };
  db.users.add(usuario);
  return usuario;
}

export function cambiarRol(id, role) {
  return db.users.update(id, { role });
}

// El admin cambia directamente la contraseña de un usuario.
export async function cambiarContrasena(id, password) {
  const { salt, hash, algo, iter } = await hashPassword(password);
  return db.users.update(id, { salt, hash, algo, iter, mustChangePassword: false });
}

function cantidadAdmins() {
  return db.users.all().filter(u => u.role === 'admin').length;
}

export function usuarioPorNombre(username) {
  return db.users.all().find(u => u.username.toLowerCase() === username.trim().toLowerCase()) || null;
}

// --- Clave maestra de recuperación (para recuperar acceso de admin) ---
// Se guarda cifrada (SHA-256 + salt) dentro de los ajustes del negocio.
export function tieneClaveMaestra() {
  return !!getAjustes().recoveryHash;
}
export async function setClaveMaestra(password) {
  const { salt, hash, algo, iter } = await hashPassword(password);
  setAjustes({ recoverySalt: salt, recoveryHash: hash, recoveryAlgo: algo, recoveryIter: iter });
}
export async function verificarClaveMaestra(password) {
  const aj = getAjustes();
  if (!aj.recoveryHash || !aj.recoverySalt) return false;
  return verifyPassword(password, aj.recoverySalt, aj.recoveryHash, aj.recoveryAlgo, aj.recoveryIter);
}

export function eliminarUsuario(id) {
  const session = getSession();
  const usuario = db.users.find(id);
  if (!usuario) return { ok: false, error: 'Usuario no encontrado.' };
  if (session.userId === id) return { ok: false, error: 'No puedes eliminar tu propio usuario mientras tienes sesión iniciada.' };
  if (usuario.role === 'admin' && cantidadAdmins() <= 1) {
    return { ok: false, error: 'Debe existir al menos un administrador.' };
  }
  db.users.remove(id);
  return { ok: true };
}
