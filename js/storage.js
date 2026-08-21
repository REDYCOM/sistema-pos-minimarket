// Capa de datos (Fase B: conectada a Firestore).
// Cada colección mantiene un espejo en memoria actualizado en tiempo real vía
// onSnapshot, así que .all()/.find() siguen siendo síncronos como en la Fase A
// y el resto de la app (auth, caja, ventas, productos, dinero) no cambia.
// Las escrituras no se esperan (fire-and-forget): la caché local persistente
// de Firestore las guarda de inmediato y las sincroniza sola al reconectar,
// que es justo el comportamiento offline que pedía la especificación original.
import { firestore, authListo } from './firebase-config.js';
import {
  collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot,
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const NOMBRES_COLECCION = {
  users: 'usuarios',
  productos: 'productos',
  ventas: 'ventas',
  aperturas: 'aperturas',
  cierres: 'cierres',
  movimientos: 'movimientos_dinero',
  compras: 'compras',
  devoluciones: 'devoluciones',
};

export function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Aviso de fallo al guardar en la nube. Nota: Firestore NO rechaza las escrituras
// hechas sin conexión (quedan pendientes y se sincronizan al reconectar), así que
// un rechazo aquí suele indicar un problema real (permisos, cuota, etc.).
function notificarErrorNube(contexto, err) {
  console.error(contexto, err);
  window.dispatchEvent(new CustomEvent('pos:cloud-error', { detail: { contexto, mensaje: String(err?.message || err) } }));
}

function crearColeccion(nombre) {
  const ref = collection(firestore, nombre);
  let cache = [];
  let resolverListo;
  let recibida = false;
  const listo = new Promise(resolve => { resolverListo = resolve; });

  authListo.then(() => {
    onSnapshot(ref, snapshot => {
      cache = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      if (!recibida) { recibida = true; resolverListo(); }
    }, error => {
      console.error(`Firestore (${nombre}):`, error);
      if (!recibida) { recibida = true; resolverListo(); }
    });
  });

  return {
    listo,
    all() {
      return cache;
    },
    find(id) {
      return cache.find(x => x.id === id) || null;
    },
    add(item) {
      setDoc(doc(ref, item.id), item).catch(err => notificarErrorNube(`Firestore add (${nombre})`, err));
      cache = [...cache, item];
      return item;
    },
    update(id, patch) {
      updateDoc(doc(ref, id), patch).catch(err => notificarErrorNube(`Firestore update (${nombre})`, err));
      const idx = cache.findIndex(x => x.id === id);
      if (idx === -1) return null;
      const actualizado = { ...cache[idx], ...patch };
      cache = [...cache.slice(0, idx), actualizado, ...cache.slice(idx + 1)];
      return actualizado;
    },
    remove(id) {
      deleteDoc(doc(ref, id)).catch(err => notificarErrorNube(`Firestore remove (${nombre})`, err));
      cache = cache.filter(x => x.id !== id);
    },
  };
}

export const db = {
  users: crearColeccion(NOMBRES_COLECCION.users),
  productos: crearColeccion(NOMBRES_COLECCION.productos),
  ventas: crearColeccion(NOMBRES_COLECCION.ventas),
  aperturas: crearColeccion(NOMBRES_COLECCION.aperturas),
  cierres: crearColeccion(NOMBRES_COLECCION.cierres),
  movimientos: crearColeccion(NOMBRES_COLECCION.movimientos),
  compras: crearColeccion(NOMBRES_COLECCION.compras),
  devoluciones: crearColeccion(NOMBRES_COLECCION.devoluciones),
};

// --- Ajustes del negocio (un solo documento sincronizado) ---
// Márgenes por rotación, catálogo de categorías y de proveedores. Va en
// Firestore (no en localStorage) porque son datos del negocio que deben
// compartirse entre dispositivos, igual que productos o ventas.
const AJUSTES_DEFAULT = {
  margenes: { A: 0.20, B: 0.30, C: 0.40 },
  categorias: [],
  proveedores: [],
};
const ajustesRef = doc(collection(firestore, 'ajustes'), 'general');
let ajustesCache = null;
let resolverAjustes;
let ajustesRecibido = false;
export const ajustesListo = new Promise(resolve => { resolverAjustes = resolve; });

authListo.then(() => {
  onSnapshot(ajustesRef, snap => {
    ajustesCache = snap.exists() ? { ...AJUSTES_DEFAULT, ...snap.data() } : { ...AJUSTES_DEFAULT };
    if (!ajustesRecibido) { ajustesRecibido = true; resolverAjustes(); }
  }, error => {
    console.error('Firestore (ajustes):', error);
    ajustesCache = { ...AJUSTES_DEFAULT };
    if (!ajustesRecibido) { ajustesRecibido = true; resolverAjustes(); }
  });
});

export function getAjustes() {
  return ajustesCache || { ...AJUSTES_DEFAULT };
}

export function setAjustes(patch) {
  const nuevo = { ...getAjustes(), ...patch };
  setDoc(ajustesRef, nuevo).catch(err => console.error('Firestore setAjustes:', err));
  ajustesCache = nuevo;
  return nuevo;
}

// Se resuelve cuando todas las colecciones y los ajustes recibieron su primer
// snapshot (desde la caché local o el servidor). La app debe esperar esto antes
// de sembrar datos por defecto o decidir a qué pantalla enrutar.
export const storageListo = Promise.all([...Object.values(db).map(c => c.listo), ajustesListo]);

const KEYS = {
  session: 'pos_session',
  config: 'pos_config',
};

// Sesión: vive en localStorage porque es propia de este dispositivo/pestaña,
// no algo que deba compartirse entre cajas registradoras.
export function getSession() {
  const raw = localStorage.getItem(KEYS.session);
  return raw ? JSON.parse(raw) : null;
}

export function setSession(session) {
  localStorage.setItem(KEYS.session, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(KEYS.session);
}

// Configuración general del negocio (ej. logo). Se mantiene local por ahora
// (no en Firestore) para evitar guardar imágenes grandes en documentos.
export function getConfig() {
  const raw = localStorage.getItem(KEYS.config);
  return raw ? JSON.parse(raw) : {};
}

export function setConfig(patch) {
  const config = { ...getConfig(), ...patch };
  localStorage.setItem(KEYS.config, JSON.stringify(config));
  return config;
}

// Restablecimiento total: borra todos los documentos de todas las colecciones,
// reinicia los ajustes y limpia la configuración/sesión local. NO recrea el
// admin por defecto (eso lo hace la app al reiniciar, vía ensureDefaultAdmin).
export async function resetearTodo() {
  for (const col of Object.values(db)) {
    for (const item of col.all()) col.remove(item.id);
  }
  setDoc(ajustesRef, { ...AJUSTES_DEFAULT }).catch(err => console.error('Firestore reset ajustes:', err));
  ajustesCache = { ...AJUSTES_DEFAULT };
  localStorage.removeItem(KEYS.config);
  localStorage.removeItem(KEYS.session);
}

// Borra SOLO el historial de movimiento de dinero: ventas, compras, caja
// (aperturas y cierres), movimientos de efectivo y devoluciones. NO toca los
// productos (catálogo, stock ni precios), ni los usuarios, ni los ajustes.
// Pensado para arrancar un año nuevo con las cuentas en cero pero conservando
// el inventario cargado. Devuelve cuántos registros borró de cada colección.
export async function borrarHistorialMovimiento() {
  const aBorrar = ['ventas', 'compras', 'aperturas', 'cierres', 'movimientos', 'devoluciones'];
  const borrados = {};
  for (const nombre of aBorrar) {
    const col = db[nombre];
    if (!col) continue;
    const items = col.all();
    borrados[nombre] = items.length;
    for (const item of items) col.remove(item.id);
  }
  // La sesión guarda el turno abierto, que acaba de dejar de existir.
  const s = getSession();
  if (s) setSession({ ...s, turno: null });
  return borrados;
}
