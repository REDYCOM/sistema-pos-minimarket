import { getConfig, setConfig } from './storage.js';
import {
  listarCategorias, agregarCategoria, eliminarCategoria,
  listarProveedores, agregarProveedor, eliminarProveedor,
  getMargenes, setMargenes,
} from './catalogo.js';
import { toast } from './toast.js';
import { confirmar, abrirModal, cerrarModal } from './modal.js';
import { db, getSession, resetearTodo } from './storage.js';
import { verifyPassword } from './crypto.js';
import { exportarInventarioExcel, importarInventarioExcel, exportarRespaldoCompleto, importarRespaldoCompleto } from './backup.js';
import { imprimirTicketPrueba } from './ticket.js';

const el = id => document.getElementById(id);

function renderTicketConfig() {
  const c = getConfig();
  el('ticket-negocio-input').value = c.nombreNegocio || '';
  el('ticket-auto-check').checked = !!c.ticketAuto;
}

function renderRespaldo() {
  el('respaldo-cantidad').textContent = db.productos.all().length;
}

// ---- Márgenes por rotación ----
function renderMargenes() {
  const m = getMargenes();
  el('margen-a').value = Math.round((m.A ?? 0.20) * 100);
  el('margen-b').value = Math.round((m.B ?? 0.30) * 100);
  el('margen-c').value = Math.round((m.C ?? 0.40) * 100);
}

function guardarMargenes() {
  const nuevos = {
    A: (Number(el('margen-a').value) || 0) / 100,
    B: (Number(el('margen-b').value) || 0) / 100,
    C: (Number(el('margen-c').value) || 0) / 100,
  };
  setMargenes(nuevos);
  toast.success('📊 Márgenes actualizados.');
}

// ---- Categorías y proveedores ----
function renderChips(ulId, valores, claseBtn) {
  el(ulId).innerHTML = valores.length
    ? valores.map(v => `<li class="chip-item"><span>${v}</span><button class="chip-quitar ${claseBtn}" data-valor="${v}" title="Quitar">✕</button></li>`).join('')
    : '<li class="hint">Todavía no hay ninguno.</li>';
}

function renderCatalogos() {
  renderChips('lista-categorias-config', listarCategorias(), 'quitar-categoria');
  renderChips('lista-proveedores-config', listarProveedores(), 'quitar-proveedor');
}

async function ejecutarReset() {
  const errorEl = el('reset-error');
  errorEl.classList.add('hidden');

  if (el('reset-confirmacion').value.trim().toUpperCase() !== 'BORRAR') {
    errorEl.textContent = 'Escribe BORRAR para confirmar.';
    errorEl.classList.remove('hidden');
    return;
  }

  // La contraseña debe ser la del admin con la sesión iniciada.
  const session = getSession();
  const admin = db.users.find(session?.userId);
  const password = el('reset-password').value;
  const valida = admin?.hash && await verifyPassword(password, admin.salt, admin.hash);
  if (!valida) {
    errorEl.textContent = 'Contraseña de administrador incorrecta.';
    errorEl.classList.remove('hidden');
    return;
  }

  el('btn-confirmar-reset').disabled = true;
  el('btn-confirmar-reset').textContent = 'Borrando…';
  await resetearTodo();
  toast.info('🗑️ Sistema restablecido. Reiniciando…');
  setTimeout(() => location.reload(), 900);
}

const MAX_LOGO_BYTES = 1.5 * 1024 * 1024; // suficiente para un logo, sin inflar demasiado el localStorage

function aplicarLogoEnPagina(logoDataUrl) {
  [el('login-logo'), el('topbar-logo')].forEach(img => {
    if (logoDataUrl) {
      img.src = logoDataUrl;
      img.classList.remove('hidden');
    } else {
      img.removeAttribute('src');
      img.classList.add('hidden');
    }
  });
}

function renderPreview() {
  const { logoDataUrl } = getConfig();
  const preview = el('config-logo-preview');
  const vacio = el('config-logo-vacio');
  const btnQuitar = el('btn-quitar-logo');
  if (logoDataUrl) {
    preview.src = logoDataUrl;
    preview.classList.remove('hidden');
    vacio.classList.add('hidden');
    btnQuitar.classList.remove('hidden');
  } else {
    preview.classList.add('hidden');
    vacio.classList.remove('hidden');
    btnQuitar.classList.add('hidden');
  }
}

export function aplicarLogoGuardado() {
  aplicarLogoEnPagina(getConfig().logoDataUrl);
}

export function initConfiguracion() {
  el('btn-subir-logo').addEventListener('click', () => el('input-logo').click());

  el('input-logo').addEventListener('change', e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) {
      toast.error('La imagen es muy pesada. Usa un logo de menos de 1.5 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setConfig({ logoDataUrl: reader.result });
      aplicarLogoEnPagina(reader.result);
      renderPreview();
      toast.success('🖼️ Logo actualizado.');
    };
    reader.readAsDataURL(file);
  });

  el('btn-quitar-logo').addEventListener('click', async () => {
    if (!await confirmar('¿Quitar el logo del negocio?', { aceptar: 'Sí, quitar', peligro: true })) return;
    setConfig({ logoDataUrl: null });
    aplicarLogoEnPagina(null);
    renderPreview();
    toast.info('Logo quitado.');
  });

  // Márgenes
  el('btn-guardar-margenes').addEventListener('click', guardarMargenes);

  // Categorías
  el('btn-agregar-categoria').addEventListener('click', () => {
    const nombre = el('nueva-categoria').value;
    if (agregarCategoria(nombre)) {
      el('nueva-categoria').value = '';
      renderCatalogos();
      toast.success('🏷️ Categoría agregada.');
    } else {
      toast.warning('Esa categoría ya existe o está vacía.');
    }
  });

  // Proveedores
  el('btn-agregar-proveedor').addEventListener('click', () => {
    const nombre = el('nuevo-proveedor').value;
    if (agregarProveedor(nombre)) {
      el('nuevo-proveedor').value = '';
      renderCatalogos();
      toast.success('🚚 Proveedor agregado.');
    } else {
      toast.warning('Ese proveedor ya existe o está vacío.');
    }
  });

  // Quitar (delegado). Nota: solo quita los gestionados manualmente; los que
  // provienen de un producto/compra existente reaparecen mientras se usen.
  el('lista-categorias-config').addEventListener('click', e => {
    const btn = e.target.closest('.quitar-categoria');
    if (btn) { eliminarCategoria(btn.dataset.valor); renderCatalogos(); }
  });
  el('lista-proveedores-config').addEventListener('click', e => {
    const btn = e.target.closest('.quitar-proveedor');
    if (btn) { eliminarProveedor(btn.dataset.valor); renderCatalogos(); }
  });

  // Respaldo de inventario (Excel .xlsx)
  el('btn-respaldo-descargar').addEventListener('click', exportarInventarioExcel);
  el('btn-respaldo-importar').addEventListener('click', () => el('input-respaldo').click());
  el('input-respaldo').addEventListener('change', e => {
    if (e.target.files[0]) importarInventarioExcel(e.target.files[0], renderRespaldo);
    e.target.value = '';
  });

  // Restablecer sistema (zona de peligro)
  el('btn-abrir-reset').addEventListener('click', () => {
    el('reset-confirmacion').value = '';
    el('reset-password').value = '';
    el('reset-error').classList.add('hidden');
    abrirModal(el('modal-reset'));
  });
  el('btn-cerrar-modal-reset').addEventListener('click', () => cerrarModal(el('modal-reset')));
  el('btn-reset-respaldo').addEventListener('click', exportarInventarioExcel);
  el('btn-confirmar-reset').addEventListener('click', ejecutarReset);

  // Respaldo completo (todos los datos, JSON).
  el('btn-respaldo-completo-descargar').addEventListener('click', exportarRespaldoCompleto);
  el('btn-respaldo-completo-restaurar').addEventListener('click', () => el('input-respaldo-completo').click());
  el('input-respaldo-completo').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (await confirmar('¿Restaurar el respaldo completo? Se volverán a cargar todos los registros del archivo sobre los actuales.', { aceptar: 'Sí, restaurar', peligro: true })) {
      importarRespaldoCompleto(file);
    }
  });

  // Ticket / impresión (config por dispositivo).
  el('btn-guardar-ticket-config').addEventListener('click', () => {
    setConfig({ nombreNegocio: el('ticket-negocio-input').value.trim(), ticketAuto: el('ticket-auto-check').checked });
    toast.success('🧾 Configuración del ticket guardada.');
  });
  el('btn-ticket-prueba').addEventListener('click', imprimirTicketPrueba);

  renderPreview();
  renderMargenes();
  renderCatalogos();
  renderRespaldo();
  renderTicketConfig();
}

export function refrescarConfiguracion() {
  renderMargenes();
  renderCatalogos();
  renderRespaldo();
  renderTicketConfig();
}
