// Gráficos SVG mínimos, sin librerías. Devuelven una cadena SVG lista para
// inyectar con innerHTML. Pensados para ser responsivos (viewBox + width 100%).

const PALETA = ['#17794f', '#2563eb', '#c2410c', '#0891b2', '#4338ca', '#9333ea', '#b3691e', '#0f766e'];

const money = n => `Bs ${Number(n).toFixed(2)}`;

// Gráfico de barras horizontales: datos = [{ etiqueta, valor }]
export function barrasHorizontales(datos, { formato = money } = {}) {
  if (!datos.length) return '<p class="hint">Sin datos en el rango seleccionado.</p>';
  const max = Math.max(...datos.map(d => d.valor), 1);
  const filaAlto = 34;
  const anchoEtiqueta = 150;
  const anchoBarra = 320;
  const alto = datos.length * filaAlto + 10;
  const ancho = anchoEtiqueta + anchoBarra + 90;

  const filas = datos.map((d, i) => {
    const y = i * filaAlto + 8;
    const w = Math.max(2, (d.valor / max) * anchoBarra);
    const color = PALETA[i % PALETA.length];
    const etiqueta = d.etiqueta.length > 20 ? d.etiqueta.slice(0, 19) + '…' : d.etiqueta;
    return `
      <text x="${anchoEtiqueta - 8}" y="${y + 16}" text-anchor="end" font-size="12" fill="#1c2420">${etiqueta}</text>
      <rect x="${anchoEtiqueta}" y="${y}" width="${w}" height="22" rx="6" fill="${color}">
        <animate attributeName="width" from="0" to="${w}" dur="0.5s" fill="freeze" calcMode="spline" keySplines="0.16 1 0.3 1" keyTimes="0;1"/>
      </rect>
      <text x="${anchoEtiqueta + w + 8}" y="${y + 16}" font-size="12" font-weight="700" fill="#0f5c3a">${formato(d.valor)}</text>
    `;
  }).join('');

  return `<svg viewBox="0 0 ${ancho} ${alto}" width="100%" style="max-width:${ancho}px" role="img">${filas}</svg>`;
}

// Gráfico de línea para serie temporal + proyección opcional.
// serie = [{ dia, total }], proyeccion = [valores...] (se dibujan punteados).
export function lineaTemporal(serie, proyeccion = []) {
  if (serie.length < 2) return '<p class="hint">Se necesitan al menos 2 días con ventas para el gráfico.</p>';
  const ancho = 640, alto = 240, m = { t: 16, r: 16, b: 28, l: 52 };
  const todos = [...serie.map(p => p.total), ...proyeccion];
  const max = Math.max(...todos, 1);
  const n = serie.length + proyeccion.length;
  const px = i => m.l + (i / (n - 1)) * (ancho - m.l - m.r);
  const py = v => alto - m.b - (v / max) * (alto - m.t - m.b);

  const puntosReales = serie.map((p, i) => `${px(i)},${py(p.total)}`).join(' ');
  const idxInicioProy = serie.length - 1;
  const puntosProy = [
    `${px(idxInicioProy)},${py(serie[serie.length - 1].total)}`,
    ...proyeccion.map((v, i) => `${px(serie.length + i)},${py(v)}`),
  ].join(' ');

  const gridY = [0, 0.5, 1].map(f => {
    const v = max * f, y = py(v);
    return `<line x1="${m.l}" y1="${y}" x2="${ancho - m.r}" y2="${y}" stroke="#dbe4de" stroke-width="1"/>
            <text x="${m.l - 6}" y="${y + 4}" text-anchor="end" font-size="10" fill="#99a5a0">${Math.round(v)}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${ancho} ${alto}" width="100%" style="max-width:${ancho}px" role="img">
    ${gridY}
    <polyline points="${puntosReales}" fill="none" stroke="#17794f" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${proyeccion.length ? `<polyline points="${puntosProy}" fill="none" stroke="#c2410c" stroke-width="2.5" stroke-dasharray="6 5" stroke-linecap="round"/>` : ''}
    ${serie.map((p, i) => `<circle cx="${px(i)}" cy="${py(p.total)}" r="3" fill="#17794f"/>`).join('')}
  </svg>`;
}
