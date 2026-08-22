import { getConfig, setConfig } from './storage.js';
import {
  listarCategorias, agregarCategoria, eliminarCategoria,
  listarProveedores, agregarProveedor, eliminarProveedor,
  getMargenes, setMargenes,
} from './catalogo.js';
import { toast } from './toast.js';
import { confirmar, abrirModal, cerrarModal } from './modal.js';
import { db, getSession, resetearTodo, borrarHistorialMovimiento } from './storage.js';
import { turnosAbiertos } from './caja.js';
import { verifyPassword } from './crypto.js';
import { exportarInventarioExcel, importarInventarioExcel, exportarRespaldoCompleto, importarRespaldoCompleto } from './backup.js';
import { imprimirTicketPrueba } from './ticket.js';

const el = id => document.getElementById(id);
const money = n => `Bs ${Number(n).toFixed(2)}`;

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
  const valida = admin?.hash && await verifyPassword(password, admin.salt, admin.hash, admin.algo, admin.iter);
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

// Cierre de año: borra el historial de dinero pero conserva el inventario.
// Mismas protecciones que el reset total (escribir la frase + contraseña de admin).
async function ejecutarCierreAnio() {
  const errorEl = el('cierre-anio-error');
  errorEl.classList.add('hidden');

  // Guarda dura (no solo el botón deshabilitado): con cajas abiertas se perderían
  // las ventas del turno en curso y el cajero quedaría con un turno inexistente.
  const abiertas = turnosAbiertos();
  if (abiertas.length) {
    errorEl.textContent = `Hay ${abiertas.length} caja(s) abierta(s) (${abiertas.map(t => t.cajero).join(', ')}). Cerralas antes de cerrar el año.`;
    errorEl.classList.remove('hidden');
    return;
  }

  if (el('cierre-anio-confirmacion').value.trim().toUpperCase() !== 'CERRAR AÑO') {
    errorEl.textContent = 'Escribe CERRAR AÑO para confirmar.';
    errorEl.classList.remove('hidden');
    return;
  }
  const session = getSession();
  const admin = db.users.find(session?.userId);
  const valida = admin?.hash && await verifyPassword(el('cierre-anio-password').value, admin.salt, admin.hash, admin.algo, admin.iter);
  if (!valida) {
    errorEl.textContent = 'Contraseña de administrador incorrecta.';
    errorEl.classList.remove('hidden');
    return;
  }

  const btn = el('btn-confirmar-cierre-anio');
  btn.disabled = true;
  btn.textContent = 'Borrando…';
  const borrados = await borrarHistorialMovimiento();
  const total = Object.values(borrados).reduce((s, n) => s + n, 0);
  toast.info(`🧹 Historial borrado (${total} registros). El inventario se conservó. Reiniciando…`);
  setTimeout(() => location.reload(), 1200);
}

// Muestra qué se va a borrar y qué se conserva, con los números reales, y BLOQUEA
// el cierre si hay cajas abiertas. Motivo: al borrar el historial se borran las
// aperturas, pero la PC del cajero conserva su turno en su propio localStorage;
// seguiría vendiendo contra un turno que ya no existe y esas ventas no entrarían
// en ningún cierre. Además se perderían las ventas del turno en curso.
function resumenCierreAnio() {
  const cont = el('cierre-anio-resumen');
  if (!cont) return;
  const productos = db.productos.all();
  const unidades = productos.reduce((s, p) => s + (Number(p.stock) || 0), 0);
  const abiertas = turnosAbiertos();
  const btn = el('btn-confirmar-cierre-anio');

  const bloqueo = abiertas.length > 0;
  if (btn) {
    btn.disabled = bloqueo;
    btn.title = bloqueo ? 'Cerrá primero todas las cajas abiertas' : '';
  }

  cont.innerHTML = `
    ${bloqueo ? `<div class="reset-alerta">🚫 No se puede cerrar el año: hay <strong>${abiertas.length} caja(s) abierta(s)</strong>.<br>
      ${abiertas.map(t => `• <strong>${t.cajero}</strong> — abrió el ${new Date(t.fecha).toLocaleString('es-BO')} · lleva ${money(t.totalVendido)} vendido`).join('<br>')}
      <br><br>Cerralas primero: las del día las cierra el cajero desde su PC ("Cerrar turno"); las de días anteriores las cerrás vos en Ventas/Historial → "Cajas abiertas ahora".</div>` : ''}
    <div class="cierre-anio-cifras">
      <div>Se borrarán: <strong>${db.ventas.all().length}</strong> ventas · <strong>${db.compras.all().length}</strong> compras ·
      <strong>${db.devoluciones.all().length}</strong> devoluciones · <strong>${db.gastos.all().length}</strong> gastos ·
      <strong>${db.aperturas.all().length}</strong> aperturas · <strong>${db.cierres.all().length}</strong> cierres ·
      <strong>${db.movimientos.all().length}</strong> movimientos.</div>
      <div>Se conservarán: <strong>${productos.length}</strong> productos con <strong>${unidades}</strong> unidades en stock.</div>
      <div>⚠️ El borrado es para <strong>todo el negocio</strong>: se aplica a todas las PCs y a todos los usuarios, no solo a esta cuenta.</div>
    </div>`;
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
  el('btn-abrir-cierre-anio').addEventListener('click', () => {
    el('cierre-anio-confirmacion').value = '';
    el('cierre-anio-password').value = '';
    el('cierre-anio-error').classList.add('hidden');
    resumenCierreAnio();
    abrirModal(el('modal-cierre-anio'));
  });
  el('btn-cerrar-modal-cierre-anio').addEventListener('click', () => cerrarModal(el('modal-cierre-anio')));
  el('btn-cierre-anio-respaldo').addEventListener('click', exportarRespaldoCompleto);
  el('btn-confirmar-cierre-anio').addEventListener('click', ejecutarCierreAnio);

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
