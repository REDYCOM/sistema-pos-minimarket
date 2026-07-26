// Hashing de contraseñas en el cliente para la Fase A (offline, sin backend).
// En la Fase B esto se reemplaza por hash bcrypt en el servidor/Cloud Function
// antes de guardar en Firestore; aquí usamos SHA-256 + salt vía Web Crypto
// para no guardar nunca la contraseña en texto plano, ni siquiera localmente.

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function randomSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return bufferToHex(bytes.buffer);
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bufferToHex(digest);
}

export async function hashPassword(password, salt = randomSalt()) {
  const hash = await sha256Hex(`${salt}:${password}`);
  return { salt, hash };
}

export async function verifyPassword(password, salt, expectedHash) {
  const { hash } = await hashPassword(password, salt);
  return hash === expectedHash;
}
