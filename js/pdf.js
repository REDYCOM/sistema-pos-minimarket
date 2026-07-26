import { getConfig } from './storage.js';

// Exportación a PDF sin dependencias externas: se abre una ventana con el
// reporte maquetado para impresión y se dispara el diálogo de impresión del
// navegador, donde el usuario elige "Guardar como PDF". Funciona 100% offline.

const ESTILOS_IMPRESION = `
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1c2420; margin: 32px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 24px 0 8px; color: #0f5c3a; border-bottom: 2px solid #17794f; padding-bottom: 4px; }
  .encabezado { display: flex; align-items: center; gap: 14px; border-bottom: 2px solid #17794f; padding-bottom: 12px; margin-bottom: 8px; }
  .encabezado img { max-height: 54px; max-width: 120px; object-fit: contain; }
  .meta { color: #667c72; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 12px; }
  th, td { padding: 6px 8px; border-bottom: 1px solid #dbe4de; text-align: left; }
  th { background: #e6f4ec; color: #0f5c3a; text-transform: uppercase; font-size: 10px; letter-spacing: 0.03em; }
  .kpis { display: flex; flex-wrap: wrap; gap: 12px; margin: 10px 0; }
  .kpi { border: 1px solid #dbe4de; border-radius: 10px; padding: 10px 14px; min-width: 130px; }
  .kpi .valor { font-size: 18px; font-weight: 800; color: #0f5c3a; }
  .kpi .etiqueta { font-size: 11px; color: #667c72; }
  .pie { margin-top: 28px; font-size: 10px; color: #99a5a0; text-align: center; }
  @media print { body { margin: 12mm; } }
`;

// Impresión vía iframe oculto en la MISMA página. Es más fiable que window.open
// (que los navegadores suelen bloquear como popup y por eso "no pasaba nada").
export function exportarReportePDF({ titulo, subtitulo, cuerpoHTML }) {
  const { logoDataUrl } = getConfig();
  const fecha = new Date().toLocaleString('es-BO');

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html lang="es"><head><meta charset="UTF-8"><title>${titulo}</title>
    <style>${ESTILOS_IMPRESION}</style></head>
    <body>
      <div class="encabezado">
        ${logoDataUrl ? `<img src="${logoDataUrl}" alt="Logo">` : ''}
        <div>
          <h1>${titulo}</h1>
          <div class="meta">${subtitulo || ''}</div>
        </div>
      </div>
      ${cuerpoHTML}
      <div class="pie">Generado por POS Minimarket · ${fecha}</div>
    </body></html>
  `);
  doc.close();

  const imprimir = () => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    // Se quita tras dar tiempo al diálogo de impresión.
    setTimeout(() => iframe.remove(), 60000);
  };
  // Espera a que carguen estilos/imágenes (el logo) antes de imprimir.
  if (iframe.contentWindow.document.readyState === 'complete') setTimeout(imprimir, 300);
  else iframe.onload = () => setTimeout(imprimir, 300);
}

export function tablaHTML(encabezados, filas) {
  const th = encabezados.map(h => `<th>${h}</th>`).join('');
  const tr = filas.map(f => `<tr>${f.map(c => `<td>${c}</td>`).join('')}</tr>`).join('');
  return `<table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
}

export function kpisHTML(items) {
  return `<div class="kpis">${items.map(k => `
    <div class="kpi"><div class="valor">${k.valor}</div><div class="etiqueta">${k.etiqueta}</div></div>
  `).join('')}</div>`;
}
