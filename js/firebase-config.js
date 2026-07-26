// Conexión a Firebase (Fase B). Se usa el SDK modular directo desde la CDN de
// Google (gstatic) porque este proyecto no tiene Node/npm ni bundler — el
// import funciona igual que con un paquete instalado, solo que la URL es remota.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDqiBbdBcanYy48I9VVZY5uS-1hi1MnGQk',
  authDomain: 'pos-minimarket-d3583.firebaseapp.com',
  projectId: 'pos-minimarket-d3583',
  storageBucket: 'pos-minimarket-d3583.firebasestorage.app',
  messagingSenderId: '587326361561',
  appId: '1:587326361561:web:0a685d45861b17853293c8',
};

const app = initializeApp(firebaseConfig);

// Caché local persistente (IndexedDB): permite leer/escribir sin internet y
// sincroniza solo cuando vuelve la conexión, igual que pedía la Fase A pero
// ahora administrado por el propio SDK de Firestore en vez de código manual.
export const firestore = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export const auth = getAuth(app);

// Autenticación anónima: no reemplaza el login de usuario/contraseña de la
// app (eso sigue siendo lógica propia guardada en Firestore), es solo una
// puerta técnica mínima para que las reglas de seguridad de Firestore puedan
// exigir "request.auth != null" y así bloquear accesos externos a la base de
// datos que no pasen por esta aplicación.
export const authListo = signInAnonymously(auth).then(() => true).catch(err => {
  console.error('No se pudo iniciar sesión anónima en Firebase:', err);
  return false;
});
