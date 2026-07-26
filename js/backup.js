import { db } from './storage.js';
import { crearProducto, actualizarProducto } from './productos.js';
import { toast } from './toast.js';

// Respaldo del inventario en Excel real (.xlsx) usando SheetJS (vendorizado en
// js/vendor para funcionar offline). Se ve en filas y columnas, fácil de rellenar
// y de reimportar. Se usa desde Inventario y desde Respaldo en Configuración.

const ENCABEZADOS = ['Código de barras', 'Nombre', 'Categoría', 'Rotación (A/B/C)', 'Proveedor', 'Stock', 'Stock mínimo', 'Precio compra', 'Precio venta'];

let xlsxPromesa = null;
function ensureXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!xlsxPromesa) {
    xlsxPromesa = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'js/vendor/xlsx.full.min.js';
      s.onload = () => resolve(window.XLSX);
      s.onerror = () => reject(new Error('No se pudo cargar la librería de Excel.'));
      document.head.appendChild(s);
    });
  }
  return xlsxPromesa;
}

export async function exportarInventarioExcel() {
  try {
    const XLSX = await ensureXLSX();
    const filas = db.productos.all().map(p => ({
      'Código de barras': p.codigo ?? '',
      'Nombre': p.nombre ?? '',
      'Categoría': p.categoria ?? '',
      'Rotación (A/B/C)': p.categoriaRotacion ?? '',
      'Proveedor': p.proveedor ?? '',
      'Stock': Number(p.stock) || 0,
      'Stock mínimo': Number(p.stockMinimo) || 0,
      'Precio compra': Number(p.precioCompra) || 0,
      'Precio venta': (p.precioVentaFinal === null || p.precioVentaFinal === undefined || p.precioVentaFinal === '') ? '' : Number(p.precioVentaFinal),
    }));
    const ws = XLSX.utils.json_to_sheet(filas, { header: ENCABEZADOS });
    ws['!cols'] = ENCABEZADOS.map(h => ({ wch: Math.max(12, h.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
    XLSX.writeFile(wb, `respaldo-inventario-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success('📤 Respaldo de inventario descargado (Excel).');
  } catch (e) {
    toast.error(e.message || 'No se pudo exportar el inventario.');
  }
}

function mapearFila(f) {
  const g = (...nombres) => {
    for (const n of nombres) if (f[n] !== undefined && f[n] !== '') return f[n];
    return '';
  };
  const rot = String(g('Rotación (A/B/C)', 'categoriaRotacion', 'Rotación', 'Rotacion') || 'B').trim().toUpperCase();
  const pv = g('Precio venta', 'precioVentaFinal');
  return {
    codigo: String(g('Código de barras', 'codigo', 'Codigo', 'Código')).trim(),
    nombre: String(g('Nombre', 'nombre')).trim(),
    categoria: String(g('Categoría', 'categoria', 'Categoria')).trim(),
    categoriaRotacion: ['A', 'B', 'C'].includes(rot) ? rot : 'B',
    proveedor: String(g('Proveedor', 'proveedor')).trim(),
    stock: Number(g('Stock', 'stock')) || 0,
    stockMinimo: Number(g('Stock mínimo', 'stockMinimo', 'Stock minimo')) || 5,
    precioCompra: Number(g('Precio compra', 'precioCompra')) || 0,
    precioVentaFinal: pv === '' ? '' : Number(pv),
  };
}

export async function importarInventarioExcel(file, onDone) {
  try {
    const XLSX = await ensureXLSX();
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const filas = XLSX.utils.sheet_to_json(ws, { defval: '' });
    let creados = 0, actualizados = 0;
    filas.forEach(fila => {
      const datos = mapearFila(fila);
      if (!datos.codigo && !datos.nombre) return;
      const existente = datos.codigo ? db.productos.all().find(p => p.codigo === datos.codigo) : null;
      if (existente) { actualizarProducto(existente.id, { ...existente, ...datos }); actualizados++; }
      else { crearProducto(datos); creados++; }
    });
    toast.success(`📥 Inventario recuperado: ${creados} nuevo(s), ${actualizados} actualizado(s).`);
    if (onDone) onDone({ creados, actualizados });
  } catch (e) {
    toast.error(e.message || 'No se pudo leer el archivo de Excel.');
  }
}
