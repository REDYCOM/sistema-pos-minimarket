import { db, getAjustes, setAjustes } from './storage.js';
import { crearProducto, actualizarProducto } from './productos.js';
import { toast } from './toast.js';

// --- Respaldo COMPLETO (todos los datos, en un archivo JSON) ---
const COLECCIONES = ['users', 'productos', 'ventas', 'aperturas', 'cierres', 'movimientos', 'compras', 'devoluciones'];

export function exportarRespaldoCompleto() {
  try {
    const colecciones = {};
    COLECCIONES.forEach(n => { colecciones[n] = db[n] ? db[n].all() : []; });
    const datos = {
      _tipo: 'respaldo-pos-minimarket',
      _version: 1,
      _fecha: new Date().toISOString(),
      colecciones,
      ajustes: getAjustes(),
    };
    const blob = new Blob([JSON.stringify(datos)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `respaldo-completo-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success('📤 Respaldo completo descargado.');
  } catch (e) {
    toast.error('No se pudo generar el respaldo completo.');
  }
}

export async function importarRespaldoCompleto(file, onDone) {
  try {
    const datos = JSON.parse(await file.text());
    if (datos._tipo !== 'respaldo-pos-minimarket' || !datos.colecciones) {
      toast.error('El archivo no es un respaldo válido.');
      return;
    }
    let total = 0;
    COLECCIONES.forEach(nombre => {
      const items = datos.colecciones[nombre];
      if (!db[nombre] || !Array.isArray(items)) return;
      items.forEach(item => { if (item && item.id) { db[nombre].add(item); total++; } });
    });
    if (datos.ajustes) setAjustes(datos.ajustes);
    toast.success(`📥 Respaldo restaurado: ${total} registros. Recargá la página para verlo todo.`);
    if (onDone) onDone({ total });
  } catch (e) {
    toast.error('No se pudo leer el respaldo (¿archivo dañado?).');
  }
}

// Respaldo del inventario en Excel real (.xlsx) usando SheetJS (vendorizado en
// js/vendor para funcionar offline). Se ve en filas y columnas, fácil de rellenar
// y de reimportar. Se usa desde Inventario y desde Respaldo en Configuración.

const ENCABEZADOS = ['Código de barras', 'Nombre', 'Categoría', 'Rotación (A/B/C)', 'Proveedor', 'Stock', 'Stock mínimo', 'Precio compra', 'Precio venta'];

let xlsxPromesa = null;
export function ensureXLSX() {
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
      'Código de barras': p.codigo == null ? '' : String(p.codigo),
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

    // La columna A ("Código de barras") se marca como TEXTO para que Excel
    // conserve los ceros a la izquierda (ej. 01654656) y no los borre. Se
    // preformatean filas extra para que también respete lo que se escriba nuevo.
    const FILAS_EXTRA = 300;
    const rango = XLSX.utils.decode_range(ws['!ref']);
    rango.e.r = Math.max(rango.e.r, filas.length + FILAS_EXTRA);
    for (let r = 1; r <= rango.e.r; r++) { // r=0 es el encabezado
      const ref = XLSX.utils.encode_cell({ c: 0, r });
      const celda = ws[ref] || (ws[ref] = { t: 's', v: '' });
      celda.t = 's';   // tipo texto
      celda.z = '@';   // formato de celda: texto
    }
    ws['!ref'] = XLSX.utils.encode_range(rango);
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
