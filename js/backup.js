import { db } from './storage.js';
import { crearProducto, actualizarProducto } from './productos.js';
import { toast } from './toast.js';

// Respaldo del inventario en CSV (compatible con Excel). Se usa tanto desde la
// pestaña Inventario como desde el apartado de Respaldo en Configuración.
// El BOM inicial (﻿) hace que Excel abra el archivo con acentos correctos.

const CAMPOS = ['codigo', 'nombre', 'categoria', 'categoriaRotacion', 'proveedor', 'stock', 'stockMinimo', 'precioCompra', 'precioVentaFinal'];

export function exportarInventarioCSV() {
  const productos = db.productos.all();
  const filas = productos.map(p => CAMPOS.map(c => p[c] ?? '').join(','));
  const csv = [CAMPOS.join(','), ...filas].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `respaldo-inventario-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success('📤 Respaldo de inventario descargado.');
}

export function importarInventarioCSV(file, onDone) {
  const reader = new FileReader();
  reader.onload = () => {
    const texto = String(reader.result).replace(/^﻿/, '');
    const lineas = texto.split(/\r?\n/).filter(l => l.trim());
    if (lineas.length < 2) {
      toast.error('El archivo no tiene datos para importar.');
      return;
    }
    const [encabezado, ...filas] = lineas;
    const campos = encabezado.split(',').map(s => s.trim());
    let creados = 0, actualizados = 0;
    filas.forEach(linea => {
      const valores = linea.split(',');
      const datos = {};
      campos.forEach((campo, i) => { datos[campo] = (valores[i] ?? '').trim(); });
      if (!datos.codigo) return;
      const existente = db.productos.all().find(p => p.codigo === datos.codigo);
      if (existente) { actualizarProducto(existente.id, { ...existente, ...datos }); actualizados++; }
      else { crearProducto(datos); creados++; }
    });
    toast.success(`📥 Inventario recuperado: ${creados} nuevo(s), ${actualizados} actualizado(s).`);
    if (onDone) onDone({ creados, actualizados });
  };
  reader.readAsText(file);
}
