import { db, uid, setSession } from './storage.js';
import { hashPassword, verifyPassword, necesitaMigracion } from './crypto.js';

const DEFAULT_ADMIN_USERNAME = 'avi2026';

export function ensureDefaultAdmin() {
  const users = db.users.all();
  const exists = users.some(u => u.username === DEFAULT_ADMIN_USERNAME);
  if (!exists) {
    db.users.add({
      id: uid(),
      username: DEFAULT_ADMIN_USERNAME,
      role: 'admin',
      salt: null,
      hash: null,
      mustChangePassword: true,
      createdAt: new Date().toISOString(),
    });
  }
}

// Devuelve { status: 'needs-password' | 'invalid' | 'ok', user }
export async function attemptLogin(username, password) {
  const user = db.users.all().find(u => u.username === username);
  if (!user) return { status: 'invalid' };

  if (user.mustChangePassword || !user.hash) {
    return { status: 'needs-password', user };
  }

  const valid = await verifyPassword(password, user.salt, user.hash, user.algo, user.iter);
  if (!valid) return { status: 'invalid' };

  // Migración transparente: si la contraseña estaba guardada con el método viejo
  // (SHA-256), ahora que la conocemos se vuelve a guardar con PBKDF2. El usuario
  // no nota nada y su contraseña sigue siendo la misma.
  if (necesitaMigracion(user.algo)) {
    try {
      const nuevo = await hashPassword(password);
      db.users.update(user.id, { salt: nuevo.salt, hash: nuevo.hash, algo: nuevo.algo, iter: nuevo.iter });
    } catch (e) {
      console.error('No se pudo migrar el hash de la contraseña:', e);
    }
  }

  return { status: 'ok', user };
}

export async function setInitialPassword(userId, newPassword) {
  const { salt, hash, algo, iter } = await hashPassword(newPassword);
  return db.users.update(userId, { salt, hash, algo, iter, mustChangePassword: false });
}

export function startSession(user) {
  setSession({
    userId: user.id,
    username: user.username,
    role: user.role,
    turno: null, // se completa al abrir caja
  });
}
