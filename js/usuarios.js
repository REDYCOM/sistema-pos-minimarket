import { db, uid, getSession } from './storage.js';

export function listarUsuarios() {
  return db.users.all().slice().sort((a, b) => a.username.localeCompare(b.username));
}

export function existeUsuario(username) {
  return db.users.all().some(u => u.username.toLowerCase() === username.toLowerCase());
}

export function crearUsuario(username, role) {
  const usuario = {
    id: uid(),
    username,
    role, // 'admin' | 'cajero'
    salt: null,
    hash: null,
    mustChangePassword: true,
    createdAt: new Date().toISOString(),
  };
  db.users.add(usuario);
  return usuario;
}

export function cambiarRol(id, role) {
  return db.users.update(id, { role });
}

// Solo el admin puede hacer esto (la pantalla ya está restringida a admin):
// deja al usuario sin contraseña para que defina una nueva en su próximo ingreso,
// igual que el flujo de primera vez.
export function resetearContrasena(id) {
  return db.users.update(id, { salt: null, hash: null, mustChangePassword: true });
}

function cantidadAdmins() {
  return db.users.all().filter(u => u.role === 'admin').length;
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
