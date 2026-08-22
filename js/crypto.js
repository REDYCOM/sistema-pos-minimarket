// Hashing de contraseñas en el cliente (la app no tiene backend propio).
//
// Se usa PBKDF2-SHA256 con muchas iteraciones en vez de un SHA-256 simple: un
// SHA-256 de una pasada se calcula millones de veces por segundo, así que si
// alguien consigue leer los hashes puede probar contraseñas por fuerza bruta muy
// rápido. PBKDF2 hace que cada intento cueste tiempo real, lo que vuelve el
// ataque miles de veces más lento.
//
// COMPATIBILIDAD: los usuarios creados antes tienen hash SHA-256 sin marca de
// algoritmo. Esos siguen validando con el método viejo (`legacy`) y se vuelven a
// guardar en PBKDF2 la próxima vez que la persona inicia sesión, así nadie queda
// bloqueado y la migración es transparente.

export const ALGO_ACTUAL = 'pbkdf2-sha256';
export const ITERACIONES = 210000; // recomendación OWASP para PBKDF2-SHA256

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function randomSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return bufferToHex(bytes.buffer);
}

// Método viejo: SHA-256 de "salt:password". Solo para validar hashes antiguos.
async function sha256Legacy(password, salt) {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bufferToHex(digest);
}

async function pbkdf2(password, salt, iteraciones = ITERACIONES) {
  const enc = new TextEncoder();
  const clave = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: iteraciones, hash: 'SHA-256' },
    clave,
    256,
  );
  return bufferToHex(bits);
}

// Genera un hash nuevo. Devuelve también el algoritmo y las iteraciones para
// poder validarlo después aunque el día de mañana se cambien los parámetros.
export async function hashPassword(password, salt = randomSalt(), iteraciones = ITERACIONES) {
  const hash = await pbkdf2(password, salt, iteraciones);
  return { salt, hash, algo: ALGO_ACTUAL, iter: iteraciones };
}

// Valida una contraseña. Si el registro no trae `algo`, es de los viejos y se
// comprueba con SHA-256.
export async function verifyPassword(password, salt, expectedHash, algo, iter) {
  if (!salt || !expectedHash) return false;
  const calculado = algo === ALGO_ACTUAL
    ? await pbkdf2(password, salt, Number(iter) || ITERACIONES)
    : await sha256Legacy(password, salt);
  return calculado === expectedHash;
}

// ¿Este registro está guardado con el método viejo y conviene regenerarlo?
export function necesitaMigracion(algo) {
  return algo !== ALGO_ACTUAL;
}
