import { listarUsuarios, existeUsuario, crearUsuario, cambiarRol, resetearContrasena, eliminarUsuario } from './usuarios.js';
import { getSession } from './storage.js';
import { toast } from './toast.js';
import { abrirModal, cerrarModal, confirmar } from './modal.js';

const el = id => document.getElementById(id);

function renderUsuarios() {
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
        <button class="icono-btn resetear-usuario" data-id="${u.id}" title="Resetear contraseña">🔁</button>
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

  el('form-usuario').addEventListener('submit', e => {
    e.preventDefault();
    const username = el('nuevo-usuario-username').value.trim();
    const role = el('nuevo-usuario-rol').value;
    if (existeUsuario(username)) {
      toast.error(`Ya existe un usuario "${username}".`);
      return;
    }
    crearUsuario(username, role);
    cerrarModal(el('modal-usuario'));
    renderUsuarios();
    toast.success(`👤 Usuario "${username}" creado. Definirá su contraseña en su primer ingreso.`);
  });

  el('usuarios-body').addEventListener('change', e => {
    if (!e.target.classList.contains('rol-select')) return;
    cambiarRol(e.target.dataset.id, e.target.value);
    toast.success('Rol actualizado.');
  });

  el('usuarios-body').addEventListener('click', async e => {
    const resetBtn = e.target.closest('.resetear-usuario');
    const delBtn = e.target.closest('.eliminar-usuario');
    if (resetBtn) {
      if (await confirmar('¿Resetear la contraseña de este usuario? Deberá definir una nueva en su próximo ingreso.', { aceptar: 'Sí, resetear' })) {
        resetearContrasena(resetBtn.dataset.id);
        renderUsuarios();
        toast.success('🔁 Contraseña reseteada.');
      }
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

  renderUsuarios();
}

export { renderUsuarios as refrescarUsuarios };
