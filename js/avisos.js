import { db } from './storage.js';
import { tienePrecioFinal, productosConStockBajo } from './productos.js';
import { ensureXLSX } from './backup.js';
import { toast } from './toast.js';
import { hoyYMD } from './util.js';

// Pestaña de Avisos/Notificaciones: revisa el estado del sistema y lista los
// problemas importantes (precios faltantes, stock, códigos de barra, descuadres
// de caja, conexión / guardado en la nube). El sidebar muestra un contador.

const el = id => document.getElementById(id);

let errorNube = false;

function calcularAvisos() {
  const avisos = [];
  const productos = db.productos.all();

  // --- Conexión / sistema ---
  if (!navigator.onLine) {
    avisos.push({ tipo: 'info', icono: '📴', titulo: 'Sin conexión', mensaje: 'Los cambios se guardan localmente y se sincronizarán al reconectar.' });
  }
  if (errorNube) {
    avisos.push({ tipo: 'error', icono: '☁️', titulo: 'Error al guardar en la nube', mensaje: 'Algunos datos podrían no haberse sincronizado. Revisa tu conexión.' });
  }

  // --- Precios ---
  const sinVenta = productos.filter(p => !tienePrecioFinal(p));
  if (sinVenta.length) {
    avisos.push({ tipo: 'warning', icono: '🏷️', titulo: 'Sin precio de venta', mensaje: `${sinVenta.length} producto(s) no se pueden vender hasta asignarlo: ${nombres(sinVenta)}`, tab: 'productos', filtroPrecio: 'sin-venta' });
  }
  const sinCompra = productos.filter(p => !(Number(p.precioCompra) > 0));
  if (sinCompra.length) {
    avisos.push({ tipo: 'warning', icono: '💲', titulo: 'Sin precio de compra', mensaje: `${sinCompra.length} producto(s): ${nombres(sinCompra)}`, tab: 'productos', filtroPrecio: 'sin-compra' });
  }
  const conPerdida = productos.filter(p => tienePrecioFinal(p) && Number(p.precioCompra) > 0 && Number(p.precioVentaFinal) < Number(p.precioCompra));
  if (conPerdida.length) {
    avisos.push({ tipo: 'error', icono: '📉', titulo: 'Precio de venta menor al de compra', mensaje: `${conPerdida.length} producto(s) se venden con pérdida: ${nombres(conPerdida)}`, tab: 'productos' });
  }

  // --- Stock ---
  // Productos vendidos sin stock: quedaron en negativo porque se vendieron más
  // unidades de las registradas (ej. unidades físicas del almacén no cargadas).
  const vendidosSinStock = productos.filter(p => Number(p.stock) < 0);
  if (vendidosSinStock.length) {
    avisos.push({ tipo: 'error', icono: '🛒', titulo: 'Vendidos sin stock registrado', mensaje: `${vendidosSinStock.length} producto(s) quedaron en stock negativo (se vendieron sin stock): ${nombres(vendidosSinStock)}. Registra las unidades encontradas para cuadrar el inventario.`, tab: 'productos', filtroPrecio: 'stock-negativo' });
  }
  // "Stock bajo" excluye los negativos (esos ya salen en el aviso de arriba).
  const bajos = productosConStockBajo().filter(p => Number(p.stock) >= 0);
  if (bajos.length) {
    avisos.push({ tipo: 'warning', icono: '📦', titulo: 'Stock bajo', mensaje: `${bajos.length} producto(s) por debajo del mínimo: ${nombres(bajos)}`, tab: 'inventario' });
  }

  // --- Códigos de barra ---
  const sinCodigo = productos.filter(p => !p.codigo || !String(p.codigo).trim());
  if (sinCodigo.length) {
    avisos.push({ tipo: 'warning', icono: '🔢', titulo: 'Productos sin código de barras', mensaje: `${sinCodigo.length} producto(s): ${nombres(sinCodigo)}`, tab: 'productos' });
  }

  const sinCategoria = productos.filter(p => !p.categoria || !String(p.categoria).trim());
  if (sinCategoria.length) {
    avisos.push({ tipo: 'warning', icono: '🗂️', titulo: 'Productos sin categoría', mensaje: `${sinCategoria.length} producto(s): ${nombres(sinCategoria)}`, tab: 'productos' });
  }
  const duplicados = codigosDuplicados(productos);
  if (duplicados.length) {
    avisos.push({ tipo: 'error', icono: '🚫', titulo: 'Códigos de barra duplicados', mensaje: `Se repiten los códigos: ${duplicados.join(', ')}. Puede causar errores al escanear.`, tab: 'productos' });
  }

  // --- Incongruencias de datos ---
  const incongruencias = detectarIncongruencias(productos);
  if (incongruencias.length) {
    const ejemplos = incongruencias.slice(0, 3).map(f => `${f.producto.nombre} (${f.campo}: ${f.valor})`).join(', ');
    avisos.push({ tipo: 'error', icono: '🔎', titulo: 'Incongruencias en los datos', mensaje: `${incongruencias.length} producto(s) con valores imposibles, probablemente mal cargados: ${ejemplos}${incongruencias.length > 3 ? ', y más' : ''}. Descargá el detalle en Excel para corregirlos.`, tab: 'productos' });
  }

  // --- Pagos / caja ---
  const descuadres = db.cierres.all().filter(c => Number(c.diferencia) !== 0);
  if (descuadres.length) {
    avisos.push({ tipo: 'warning', icono: '⚖️', titulo: 'Cierres de caja con descuadre', mensaje: `${descuadres.length} cierre(s) con sobrante o faltante registrado.` });
  }

  return avisos;
}

// --- Incongruencias en los datos de los productos ---
// Valores que casi con seguridad son un error de carga, no un dato real. El caso
// típico: el código de barras tecleado en el campo Stock (ej. stock 7779804080039).
// Se detectan por umbrales: un minimarket no tiene 10.000 unidades de un producto
// ni lo vende a Bs 5.000, así que superar eso delata el error.
const TOPE_STOCK = 10000;      // unidades de un mismo producto
const TOPE_PRECIO = 5000;      // Bs por unidad
const TOPE_MARGEN = 20;        // veces el precio de compra

function detectarIncongruencias(productos) {
  const filas = [];
  const agregar = (p, problema, campo, valor) => filas.push({ producto: p, problema, campo, valor });
  productos.forEach(p => {
    const stock = Number(p.stock);
    const pc = Number(p.precioCompra);
    const pv = Number(p.precioVentaFinal);
    if (Number.isFinite(stock) && Math.abs(stock) > TOPE_STOCK) {
      agregar(p, 'Stock imposible (parece un código de barras cargado como stock)', 'Stock', stock);
    } else if (Number.isFinite(stock) && stock % 1 !== 0) {
      agregar(p, 'Stock con decimales', 'Stock', stock);
    }
    if (Number.isFinite(pc) && pc > TOPE_PRECIO) {
      agregar(p, 'Precio de compra desorbitado', 'Precio compra', pc);
    }
    if (Number.isFinite(pv) && pv > TOPE_PRECIO) {
      agregar(p, 'Precio de venta desorbitado', 'Precio venta', pv);
    }
    if (pc > 0 && Number.isFinite(pv) && pv > pc * TOPE_MARGEN) {
      agregar(p, `Precio de venta más de ${TOPE_MARGEN}× el de compra`, 'Precio venta', pv);
    }
  });
  return filas;
}

// Todas las filas problemáticas (para descargar y trabajarlas una por una).
// Reúne las incongruencias con el resto de problemas de producto que ya se avisan.
function filasProblemas() {
  const productos = db.productos.all();
  const filas = [];
  const push = (p, problema, detalle = '') => filas.push({
    Problema: problema,
    Detalle: detalle,
    'Código de barras': p.codigo == null ? '' : String(p.codigo),
    Nombre: p.nombre ?? '',
    Categoría: p.categoria ?? '',
    Proveedor: p.proveedor ?? '',
    Stock: Number(p.stock) || 0,
    'Stock mínimo': Number(p.stockMinimo) || 0,
    'Precio compra': Number(p.precioCompra) || 0,
    'Precio venta': (p.precioVentaFinal === null || p.precioVentaFinal === undefined || p.precioVentaFinal === '') ? '' : Number(p.precioVentaFinal),
  });

  detectarIncongruencias(productos).forEach(f => push(f.producto, f.problema, `${f.campo}: ${f.valor}`));
  productos.filter(p => !tienePrecioFinal(p)).forEach(p => push(p, 'Sin precio de venta'));
  productos.filter(p => !(Number(p.precioCompra) > 0)).forEach(p => push(p, 'Sin precio de compra'));
  productos.filter(p => tienePrecioFinal(p) && Number(p.precioCompra) > 0 && Number(p.precioVentaFinal) < Number(p.precioCompra))
    .forEach(p => push(p, 'Se vende con pérdida'));
  productos.filter(p => Number(p.stock) < 0).forEach(p => push(p, 'Stock negativo (vendido sin registrar)'));
  productosConStockBajo().filter(p => Number(p.stock) >= 0).forEach(p => push(p, 'Stock bajo'));
  productos.filter(p => !p.codigo || !String(p.codigo).trim()).forEach(p => push(p, 'Sin código de barras'));
  productos.filter(p => !p.categoria || !String(p.categoria).trim()).forEach(p => push(p, 'Sin categoría'));
  const dup = codigosDuplicados(productos);
  if (dup.length) {
    productos.filter(p => dup.includes(p.codigo)).forEach(p => push(p, 'Código de barras duplicado', `Se repite: ${p.codigo}`));
  }
  return filas;
}

// Descarga en Excel la lista completa de productos con problemas, para revisarlos
// y corregirlos cómodamente cuando son muchos.
export async function exportarAvisosExcel() {
  try {
    const filas = filasProblemas();
    if (!filas.length) return toast.info('✅ No hay problemas que descargar.');
    const XLSX = await ensureXLSX();
    const ws = XLSX.utils.json_to_sheet(filas);
    // El código de barras se fuerza a TEXTO para que Excel no borre ceros ni lo
    // pase a notación científica.
    const rango = XLSX.utils.decode_range(ws['!ref']);
    for (let r = 1; r <= rango.e.r; r++) {
      const ref = XLSX.utils.encode_cell({ c: 2, r });
      if (ws[ref]) { ws[ref].t = 's'; ws[ref].z = '@'; ws[ref].v = String(ws[ref].v); }
    }
    ws['!cols'] = [{ wch: 42 }, { wch: 28 }, { wch: 18 }, { wch: 40 }, { wch: 18 }, { wch: 18 }, { wch: 9 }, { wch: 12 }, { wch: 13 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Avisos');
    XLSX.writeFile(wb, `avisos-productos-${hoyYMD()}.xlsx`);
    toast.success(`📥 Descargados ${filas.length} problema(s) en Excel.`);
  } catch (e) {
    toast.error(e.message || 'No se pudo descargar el informe de avisos.');
  }
}

function nombres(lista, max = 4) {
  const ns = lista.map(p => p.nombre);
  return ns.slice(0, max).join(', ') + (ns.length > max ? `, y ${ns.length - max} más` : '');
}

function codigosDuplicados(productos) {
  const cuenta = {};
  productos.forEach(p => { if (p.codigo) cuenta[p.codigo] = (cuenta[p.codigo] || 0) + 1; });
  return Object.keys(cuenta).filter(c => cuenta[c] > 1);
}

export function refrescarAvisos() {
  const lista = el('avisos-lista');
  const badge = el('avisos-badge');
  if (!lista) return;

  const avisos = calcularAvisos();

  // Contador en el sidebar
  if (badge) {
    if (avisos.length > 0) { badge.textContent = avisos.length; badge.classList.remove('hidden'); }
    else badge.classList.add('hidden');
  }

  if (avisos.length === 0) {
    lista.innerHTML = '<div class="avisos-ok">✅ Todo en orden. No hay avisos por ahora.</div>';
    return;
  }

  lista.innerHTML = avisos.map(a => `
    <div class="aviso aviso-${a.tipo}" ${a.tab ? `data-tab="${a.tab}"` : ''}${a.filtroPrecio ? ` data-filtro-precio="${a.filtroPrecio}"` : ''}>
      <span class="aviso-icono">${a.icono}</span>
      <div class="aviso-cuerpo">
        <div class="aviso-titulo">${a.titulo}</div>
        <div class="aviso-msg">${a.mensaje}</div>
      </div>
      ${a.tab ? '<span class="aviso-ir">Ir →</span>' : ''}
    </div>`).join('');
}

export function initAvisos() {
  window.addEventListener('pos:cloud-error', () => { errorNube = true; refrescarAvisos(); });
  window.addEventListener('online', () => { errorNube = false; refrescarAvisos(); });
  window.addEventListener('offline', refrescarAvisos);

  el('avisos-lista').addEventListener('click', e => {
    const aviso = e.target.closest('.aviso[data-tab]');
    if (!aviso) return;
    document.querySelector(`.tab-btn[data-tab="${aviso.dataset.tab}"]`)?.click();
    // Si el aviso trae un filtro, se aplica en Productos para ver solo los afectados.
    const fp = aviso.dataset.filtroPrecio;
    if (fp) {
      const buscar = document.getElementById('prod-buscar');
      const select = document.getElementById('prod-filtro-precio');
      if (buscar) buscar.value = '';
      if (select) { select.value = fp; select.dispatchEvent(new Event('change')); }
    }
  });

  el('btn-avisos-excel').addEventListener('click', exportarAvisosExcel);

  refrescarAvisos();
}
