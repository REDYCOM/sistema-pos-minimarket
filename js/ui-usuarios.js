import { listarUsuarios, existeUsuario, crearUsuario, cambiarRol, cambiarContrasena, eliminarUsuario, setClaveMaestra, tieneClaveMaestra } from './usuarios.js';
import { getSession } from './storage.js';
import { toast } from './toast.js';
import { abrirModal, cerrarModal, confirmar } from './modal.js';

const el = id => document.getElementById(id);

function refrescarEstadoClave() {
  const estado = el('clave-maestra-estado');
  if (!estado) return;
  estado.innerHTML = tieneClaveMaestra()
    ? '✅ Hay una clave maestra configurada. Para cambiarla, escribe una nueva y guarda.'
    : '⚠️ <strong>Aún no hay clave maestra.</strong> Configúrala para poder recuperar el acceso si un admin olvida su contraseña.';
}

function renderUsuarios() {
  refrescarEstadoClave();
  const sesionUserId = getSession()?.userId;
  const usuarios = listarUsuarios();
  el('usuarios-body').innerHTML = usuarios.map(u => `
    <tr>
      <td>${u.username}${u.id === sesionUserId ? ' <span class="hint">(tú)</span>' : ''}</td>
      <td>
        <select class="rol-select" data-id="${u.id}" ${u.id === sesionUserId ? 'disabled title="No puedes cambiar tu propio rol"' : ''}>
          <option value="cajero" ${u.role === 'cajero' ? 'selected' : ''}>Cajero</option>
          <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
      </td>
      <td>${u.mustChangePassword ? '<span class="texto-alerta">⏳ Pendiente primer ingreso</span>' : '✅ Activo'}</td>
      <td>
        <button class="icono-btn cambiar-pass-usuario" data-id="${u.id}" data-user="${u.username}" title="Cambiar contraseña">🔑</button>
        <button class="icono-btn eliminar-usuario" data-id="${u.id}" title="Eliminar" ${u.id === sesionUserId ? 'disabled' : ''}>🗑️</button>
      </td>
    </tr>
  `).join('');
}

export function initUsuarios() {
  el('btn-nuevo-usuario').addEventListener('click', () => {
    el('form-usuario').reset();
    abrirModal(el('modal-usuario'));
  });
  el('btn-cerrar-modal-usuario').addEventListener('click', () => cerrarModal(el('modal-usuario')));

  el('form-usuario').addEventListener('submit', async e => {
    e.preventDefault();
    const username = el('nuevo-usuario-username').value.trim();
    const role = el('nuevo-usuario-rol').value;
    const pass = el('nuevo-usuario-pass').value;
    if (existeUsuario(username)) {
      toast.error(`Ya existe un usuario "${username}".`);
      return;
    }
    if (pass.length < 4) {
      toast.error('La contraseña debe tener al menos 4 caracteres.');
      return;
    }
    await crearUsuario(username, role, pass);
    cerrarModal(el('modal-usuario'));
    renderUsuarios();
    toast.success(`👤 Usuario "${username}" creado con su contraseña.`);
  });

  // Cambiar contraseña (el admin la asigna directamente).
  let editandoPassId = null;
  el('btn-cerrar-cambiar-pass').addEventListener('click', () => cerrarModal(el('modal-cambiar-pass')));
  el('form-cambiar-pass').addEventListener('submit', async e => {
    e.preventDefault();
    const pass = el('cambiar-pass-nueva').value;
    if (pass.length < 4) {
      toast.error('La contraseña debe tener al menos 4 caracteres.');
      return;
    }
    await cambiarContrasena(editandoPassId, pass);
    cerrarModal(el('modal-cambiar-pass'));
    renderUsuarios();
    toast.success('🔑 Contraseña actualizada.');
  });

  el('usuarios-body').addEventListener('change', e => {
    if (!e.target.classList.contains('rol-select')) return;
    cambiarRol(e.target.dataset.id, e.target.value);
    toast.success('Rol actualizado.');
  });

  el('usuarios-body').addEventListener('click', async e => {
    const cambiarBtn = e.target.closest('.cambiar-pass-usuario');
    const delBtn = e.target.closest('.eliminar-usuario');
    if (cambiarBtn) {
      editandoPassId = cambiarBtn.dataset.id;
      el('cambiar-pass-username').textContent = cambiarBtn.dataset.user;
      el('form-cambiar-pass').reset();
      abrirModal(el('modal-cambiar-pass'));
    } else if (delBtn) {
      if (await confirmar('¿Eliminar este usuario?', { aceptar: 'Sí, eliminar', peligro: true })) {
        const resultado = eliminarUsuario(delBtn.dataset.id);
        if (!resultado.ok) {
          toast.error(resultado.error);
        } else {
          renderUsuarios();
          toast.info('🗑️ Usuario eliminado.');
        }
      }
    }
  });

  // Clave maestra de recuperación.
  el('btn-guardar-clave-maestra').addEventListener('click', async () => {
    const val = el('clave-maestra-input').value;
    if (val.length < 6) {
      toast.error('La clave maestra debe tener al menos 6 caracteres.');
      return;
    }
    await setClaveMaestra(val);
    el('clave-maestra-input').value = '';
    refrescarEstadoClave();
    toast.success('🔐 Clave maestra guardada.');
  });

  renderUsuarios();
}

export { renderUsuarios as refrescarUsuarios };
