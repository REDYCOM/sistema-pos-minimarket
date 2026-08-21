import { ensureDefaultAdmin, attemptLogin, setInitialPassword, startSession } from './auth.js';
import { ensureProductosDemo } from './productos.js';
import { getSession, clearSession, storageListo } from './storage.js';
import { abrirCaja, turnoActivo } from './caja.js';
import { initDashboard, refrescarDashboard, enfocarBusqueda } from './ui-dashboard.js';
import { initProductosInventario, refrescarProductosInventario } from './ui-productos.js';
import { initDinero, refrescarDinero } from './ui-dinero.js';
import { initConfiguracion, aplicarLogoGuardado, refrescarConfiguracion } from './ui-configuracion.js';
import { initCompras, refrescarCompras } from './ui-compras.js';
import { initDevoluciones, refrescarDevoluciones } from './ui-devoluciones.js';
import { initUsuarios, refrescarUsuarios } from './ui-usuarios.js';
import { initHistorial, refrescarHistorial } from './ui-historial.js';
import { initRecomendaciones, refrescarRecomendaciones } from './ui-recomendaciones.js';
import { initEstadisticas, refrescarEstadisticas } from './ui-estadisticas.js';
import { initCalculadora } from './calculadora-costo.js';
import { initModales, abrirModal, cerrarModal } from './modal.js';
import { toast } from './toast.js';
import { verificarClaveMaestra, usuarioPorNombre, cambiarContrasena, tieneClaveMaestra } from './usuarios.js';
import { initAvisos, refrescarAvisos } from './avisos.js';
import { initRuedaNumeros } from './util.js';

const el = id => document.getElementById(id);

// Versión visible de la app (subir junto con la del service worker). Sirve para
// saber de un vistazo si un cajero quedó con una versión vieja en caché.
const APP_VERSION = 'v29';

let pendingUserId = null; // usuario que está fijando su contraseña inicial

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  el(id).classList.add('active');
}

function showTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${tabName}`));
}

function startClock() {
  const tick = () => {
    el('clock').textContent = new Date().toLocaleString('es-BO', {
      dateStyle: 'medium', timeStyle: 'medium',
    });
  };
  tick();
  setInterval(tick, 1000);
}

function goToApertura() {
  const session = getSession();
  el('apertura-usuario').textContent = session.username;
  el('apertura-fecha').textContent = new Date().toLocaleString('es-BO');
  showView('view-apertura');
}

function goToDashboard() {
  const session = getSession();
  const esAdmin = session.role === 'admin';
  ['tab-btn-configuracion', 'tab-btn-historial', 'tab-btn-estadisticas', 'tab-btn-recomendaciones']
    .forEach(id => el(id).classList.toggle('hidden', !esAdmin));
  refrescarDashboard();
  refrescarProductosInventario();
  refrescarDinero();
  showTab('venta');
  showView('view-dashboard');
}

function routeBySession() {
  const session = getSession();
  if (!session) {
    showView('view-login');
    return;
  }
  if (!session.turno) {
    goToApertura();
  } else {
    goToDashboard();
  }
}

function initLoginForm() {
  el('form-login').addEventListener('submit', async e => {
    e.preventDefault();
    const username = el('login-username').value.trim();
    const password = el('login-password').value;
    el('login-error').classList.add('hidden');

    const resultado = await attemptLogin(username, password);
    if (resultado.status === 'invalid') {
      el('login-error').textContent = 'Usuario o contraseña incorrectos.';
      el('login-error').classList.remove('hidden');
    } else if (resultado.status === 'needs-password') {
      pendingUserId = resultado.user.id;
      el('set-password-username').textContent = resultado.user.username;
      el('form-login').reset();
      showView('view-set-password');
    } else if (resultado.status === 'ok') {
      startSession(resultado.user);
      el('form-login').reset();
      goToApertura();
    }
  });
}

function initSetPasswordForm() {
  el('form-set-password').addEventListener('submit', async e => {
    e.preventDefault();
    const nueva = el('new-password').value;
    const confirmar = el('new-password-confirm').value;
    const errorEl = el('set-password-error');
    if (nueva !== confirmar) {
      errorEl.textContent = 'Las contraseñas no coinciden.';
      errorEl.classList.remove('hidden');
      return;
    }
    if (nueva.length < 4) {
      errorEl.textContent = 'La contraseña debe tener al menos 4 caracteres.';
      errorEl.classList.remove('hidden');
      return;
    }
    const usuario = await setInitialPassword(pendingUserId, nueva);
    errorEl.classList.add('hidden');
    e.target.reset();
    startSession(usuario);
    goToApertura();
  });
}

function initAperturaForm() {
  el('form-apertura').addEventListener('submit', e => {
    e.preventDefault();
    const monto = el('apertura-monto').value;
    abrirCaja(monto);
    e.target.reset();
    goToDashboard();
  });
}

function cerrarSidebarMovil() {
  el('sidebar').classList.remove('abierto');
  el('sidebar-overlay').classList.remove('activo');
}

function initSidebar() {
  const esMovil = () => window.matchMedia('(max-width: 860px)').matches;
  el('btn-toggle-sidebar').addEventListener('click', () => {
    if (esMovil()) {
      // Móvil: la barra se desliza sobre el contenido con overlay.
      el('sidebar').classList.toggle('abierto');
      el('sidebar-overlay').classList.toggle('activo');
    } else {
      // Escritorio: la barra se colapsa y el contenido ocupa toda la pantalla.
      el('view-dashboard').classList.toggle('colapsado');
    }
  });
  el('sidebar-overlay').addEventListener('click', cerrarSidebarMovil);
}

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      showTab(btn.dataset.tab);
      cerrarSidebarMovil(); // en móvil, elegir una sección cierra el menú
      refrescarAvisos();
      // Los datos pueden haber cambiado en otra pestaña (ej. stock tras una venta),
      // así que se refrescan al entrar en vez de cachear lo último renderizado.
      if (btn.dataset.tab === 'venta') {
        enfocarBusqueda();
      } else if (btn.dataset.tab === 'inventario' || btn.dataset.tab === 'productos') {
        refrescarProductosInventario();
      } else if (btn.dataset.tab === 'dinero') {
        refrescarDinero();
      } else if (btn.dataset.tab === 'compras') {
        refrescarCompras();
      } else if (btn.dataset.tab === 'devoluciones') {
        refrescarDevoluciones();
      } else if (btn.dataset.tab === 'recomendaciones') {
        refrescarRecomendaciones();
      } else if (btn.dataset.tab === 'historial') {
        refrescarHistorial();
      } else if (btn.dataset.tab === 'estadisticas') {
        refrescarEstadisticas();
      } else if (btn.dataset.tab === 'configuracion') {
        refrescarUsuarios();
        refrescarConfiguracion();
      }
    });
  });
}

function initLogout() {
  window.addEventListener('pos:logout', () => {
    showView('view-login');
  });
}

function initRecuperar() {
  el('btn-abrir-recuperar').addEventListener('click', () => {
    el('form-recuperar').reset();
    el('recuperar-error').classList.add('hidden');
    abrirModal(el('modal-recuperar'));
    el('recuperar-username').focus();
  });
  el('btn-cerrar-recuperar').addEventListener('click', () => cerrarModal(el('modal-recuperar')));
  el('form-recuperar').addEventListener('submit', async e => {
    e.preventDefault();
    const errEl = el('recuperar-error');
    errEl.classList.add('hidden');
    const mostrarError = msg => { errEl.textContent = msg; errEl.classList.remove('hidden'); };
    const username = el('recuperar-username').value.trim();
    const maestra = el('recuperar-maestra').value;
    const nueva = el('recuperar-nueva').value;
    if (!tieneClaveMaestra()) return mostrarError('No hay clave maestra configurada. Pídele a un admin que la configure en Configuración.');
    if (nueva.length < 4) return mostrarError('La nueva contraseña debe tener al menos 4 caracteres.');
    if (!(await verificarClaveMaestra(maestra))) return mostrarError('Clave maestra incorrecta.');
    const usuario = usuarioPorNombre(username);
    if (!usuario) return mostrarError(`No existe el usuario "${username}".`);
    await cambiarContrasena(usuario.id, nueva);
    cerrarModal(el('modal-recuperar'));
    toast.success(`✅ Contraseña de "${usuario.username}" restablecida. Ya puedes ingresar.`);
    el('login-username').value = usuario.username;
    el('login-password').value = '';
    el('login-password').focus();
  });
}

async function init() {
  const vEl = el('app-version');
  if (vEl) vEl.textContent = APP_VERSION;
  aplicarLogoGuardado();

  initLoginForm();
  initRecuperar();
  initSetPasswordForm();
  initAperturaForm();
  initSidebar();
  initTabs();
  initLogout();
  startClock();

  initDashboard();
  initProductosInventario();
  initDinero();
  initConfiguracion();
  initCompras();
  initDevoluciones();
  initRecomendaciones();
  initUsuarios();
  initHistorial();
  initEstadisticas();
  initCalculadora();
  initModales();
  initAvisos();
  initRuedaNumeros();

  // Atajos globales de teclado (solo dentro del sistema y sin modales abiertos):
  //   Esc → ir a Venta y dejar el cursor en el código de barras.
  //   F1  → cancelar venta.  F2..F6 → pestañas de trabajo.
  // Se registra DESPUÉS de initDashboard/initModales: si hay un modal abierto,
  // Esc lo cierran ellos y las F no hacen nada.
  const irAVenta = () => {
    if (el('tab-venta').classList.contains('active')) enfocarBusqueda();
    else document.querySelector('.tab-btn[data-tab="venta"]')?.click(); // el click ya enfoca
  };
  const F_TABS = { F2: 'inventario', F3: 'productos', F4: 'dinero', F5: 'compras', F6: 'devoluciones' };
  document.addEventListener('keydown', e => {
    if (!el('view-dashboard').classList.contains('active')) return;
    if (document.querySelector('.modal:not(.hidden)')) return;
    if (e.key === 'Escape') { irAVenta(); return; }
    if (e.key === 'F1') { e.preventDefault(); document.getElementById('btn-cancelar-venta')?.click(); return; }
    const tab = F_TABS[e.key];
    if (tab) { e.preventDefault(); document.querySelector(`.tab-btn[data-tab="${tab}"]`)?.click(); }
  });

  // La UI ya es interactiva; lo que depende de datos espera a que Firestore
  // entregue el primer snapshot de cada colección (caché local o servidor).
  await storageListo;
  el('loading-overlay').classList.add('hidden');

  ensureDefaultAdmin();
  ensureProductosDemo();
  routeBySession();
  refrescarAvisos();
}

init();
