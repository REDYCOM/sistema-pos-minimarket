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

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const filas = datos.map((d, i) => {
    const y = i * filaAlto + 8;
    const w = Math.max(2, (d.valor / max) * anchoBarra);
    const color = PALETA[i % PALETA.length];
    const etiqueta = d.etiqueta.length > 20 ? d.etiqueta.slice(0, 19) + '…' : d.etiqueta;
    // <title> = tooltip nativo al pasar el mouse; muestra nombre completo + valor.
    const tip = `${esc(d.etiqueta)} — ${esc(formato(d.valor))}`;
    return `
      <g class="barra-g">
        <title>${tip}</title>
        <text x="${anchoEtiqueta - 8}" y="${y + 16}" text-anchor="end" font-size="12" fill="#1c2420">${esc(etiqueta)}</text>
        <rect x="${anchoEtiqueta}" y="${y}" width="${w}" height="22" rx="6" fill="${color}" class="barra-rect">
          <animate attributeName="width" from="0" to="${w}" dur="0.5s" fill="freeze" calcMode="spline" keySplines="0.16 1 0.3 1" keyTimes="0;1"/>
        </rect>
        <text x="${anchoEtiqueta + w + 8}" y="${y + 16}" font-size="12" font-weight="700" fill="#0f5c3a">${esc(formato(d.valor))}</text>
      </g>
    `;
  }).join('');

  return `<svg viewBox="0 0 ${ancho} ${alto}" width="100%" style="max-width:${ancho}px" role="img">${filas}</svg>`;
}

// Gráfico de línea para serie temporal + proyección opcional.
// serie = [{ dia, total }], proyeccion = [valores...] (se dibujan punteados).
export function lineaTemporal(serie, proyeccion = []) {
  if (serie.length < 2) return '<p class="hint">Se necesitan al menos 2 días con ventas para el gráfico.</p>';
  const ancho = 640, alto = 240, m = { t: 16, r: 16, b: 38, l: 62 };
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
            <text x="${m.l - 6}" y="${y + 4}" text-anchor="end" font-size="10" fill="#99a5a0">${_fMontoEje(v)}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${ancho} ${alto}" width="100%" style="max-width:${ancho}px" role="img">
    ${gridY}
    ${_ejeX(serie, proyeccion.length, px, alto, m)}
    <polyline points="${puntosReales}" fill="none" stroke="#17794f" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${proyeccion.length ? `<polyline points="${puntosProy}" fill="none" stroke="#c2410c" stroke-width="2.5" stroke-dasharray="6 5" stroke-linecap="round"/>` : ''}
    ${serie.map((p, i) => `<circle cx="${px(i)}" cy="${py(p.total)}" r="3" fill="#17794f"/>`).join('')}
  </svg>`;
}

// --- Fecha helper para tooltips: 'YYYY-MM-DD' → "lun 18/08/2026" ---
function _diaLegible(ymd) {
  const [a, m, d] = ymd.split('-').map(Number);
  const dow = new Date(a, m - 1, d).toLocaleDateString('es-BO', { weekday: 'short' });
  return `${dow} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${a}`;
}
function _sumarDias(ymd, n) {
  const [a, m, d] = ymd.split('-').map(Number);
  const f = new Date(a, m - 1, d);
  f.setDate(f.getDate() + n);
  const yy = f.getFullYear(), mm = String(f.getMonth() + 1).padStart(2, '0'), dd = String(f.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
// Etiqueta corta de fecha para el eje X: 'YYYY-MM-DD' → 'dd/mm'.
function _ddmm(ymd) { const [, m, d] = ymd.split('-'); return `${d}/${m}`; }
// Monto compacto para el eje Y: 1200 → 'Bs 1.2k', 260 → 'Bs 260'.
function _fMontoEje(v) {
  if (v >= 1000) return 'Bs ' + (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'k';
  return 'Bs ' + Math.round(v);
}
// Etiquetas de fecha del eje X (hasta 7 marcas, repartidas). Las de proyección
// se pintan en naranja. `px` mapea índice → x; `serie`/`proyLen` dan las fechas.
function _ejeX(serie, proyLen, px, alto, m) {
  const fechas = serie.map(p => p.dia);
  if (serie.length) { const u = serie[serie.length - 1].dia; for (let j = 0; j < proyLen; j++) fechas.push(_sumarDias(u, j + 1)); }
  const total = fechas.length;
  const nTicks = Math.min(total, 7);
  const vistos = new Set();
  let out = '';
  for (let k = 0; k < nTicks; k++) {
    const i = nTicks <= 1 ? 0 : Math.round(k * (total - 1) / (nTicks - 1));
    if (vistos.has(i)) continue;
    vistos.add(i);
    const esProy = i >= serie.length;
    out += `<text x="${px(i)}" y="${alto - 8}" text-anchor="middle" font-size="9" fill="${esProy ? '#c2410c' : '#99a5a0'}">${_ddmm(fechas[i])}</text>`;
  }
  return out;
}

// Versión INTERACTIVA de la línea temporal: devuelve { html, puntos, vb } para
// que la capa de UI le enganche el tooltip (día, fecha, monto) al pasar el mouse,
// al estilo de los gráficos de acciones. `puntos` trae coords y etiquetas listas.
export function lineaTemporalInteractiva(serie, proyeccion = []) {
  if (serie.length < 2) return { html: '<p class="hint">Se necesitan al menos 2 días con ventas para el gráfico.</p>', puntos: [], vb: null };
  const ancho = 640, alto = 240, m = { t: 16, r: 16, b: 38, l: 62 };
  const todos = [...serie.map(p => p.total), ...proyeccion];
  const max = Math.max(...todos, 1);
  const n = serie.length + proyeccion.length;
  const px = i => m.l + (i / (n - 1)) * (ancho - m.l - m.r);
  const py = v => alto - m.b - (v / max) * (alto - m.t - m.b);

  const ultima = serie[serie.length - 1].dia;
  const puntos = [];
  serie.forEach((p, i) => puntos.push({
    cx: px(i), cy: py(p.total), tipo: 'real',
    fechaLabel: _diaLegible(p.dia), valorLabel: money(p.total),
  }));
  proyeccion.forEach((v, j) => puntos.push({
    cx: px(serie.length + j), cy: py(v), tipo: 'proyeccion',
    fechaLabel: _diaLegible(_sumarDias(ultima, j + 1)), valorLabel: money(v),
  }));

  const puntosReales = serie.map((p, i) => `${px(i)},${py(p.total)}`).join(' ');
  const puntosProy = [
    `${px(serie.length - 1)},${py(serie[serie.length - 1].total)}`,
    ...proyeccion.map((v, i) => `${px(serie.length + i)},${py(v)}`),
  ].join(' ');
  const gridY = [0, 0.5, 1].map(f => {
    const v = max * f, y = py(v);
    return `<line x1="${m.l}" y1="${y}" x2="${ancho - m.r}" y2="${y}" stroke="#dbe4de" stroke-width="1"/>
            <text x="${m.l - 6}" y="${y + 4}" text-anchor="end" font-size="10" fill="#99a5a0">${_fMontoEje(v)}</text>`;
  }).join('');

  const html = `<div class="linea-wrap" style="position:relative">
    <svg viewBox="0 0 ${ancho} ${alto}" width="100%" style="max-width:${ancho}px;display:block" role="img">
      ${gridY}
      ${_ejeX(serie, proyeccion.length, px, alto, m)}
      <line class="linea-cross" x1="0" y1="${m.t}" x2="0" y2="${alto - m.b}" stroke="#99a5a0" stroke-width="1" stroke-dasharray="4 3" style="visibility:hidden;pointer-events:none"/>
      <polyline points="${puntosReales}" fill="none" stroke="#17794f" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" style="pointer-events:none"/>
      ${proyeccion.length ? `<polyline points="${puntosProy}" fill="none" stroke="#c2410c" stroke-width="2.5" stroke-dasharray="6 5" stroke-linecap="round" style="pointer-events:none"/>` : ''}
      ${serie.map((p, i) => `<circle cx="${px(i)}" cy="${py(p.total)}" r="3" fill="#17794f" style="pointer-events:none"/>`).join('')}
      <circle class="linea-hl" r="5" fill="#fff" stroke="#17794f" stroke-width="2.5" style="visibility:hidden;pointer-events:none"/>
    </svg>
    <div class="linea-tooltip" style="position:absolute;display:none;pointer-events:none"></div>
  </div>`;

  return { html, puntos, vb: { w: ancho, h: alto } };
}

// Engancha el tooltip interactivo a un contenedor ya inyectado en el DOM.
export function activarLineaInteractiva(wrap, puntos, vb) {
  if (!wrap || !puntos.length || !vb) return;
  const svg = wrap.querySelector('svg');
  const tooltip = wrap.querySelector('.linea-tooltip');
  const cross = wrap.querySelector('.linea-cross');
  const hl = wrap.querySelector('.linea-hl');
  if (!svg || !tooltip || !cross || !hl) return;

  const mover = e => {
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return;
    const clientX = e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX;
    const vbX = (clientX - rect.left) / rect.width * vb.w;
    let best = puntos[0], bd = Infinity;
    for (const p of puntos) { const d = Math.abs(p.cx - vbX); if (d < bd) { bd = d; best = p; } }

    cross.setAttribute('x1', best.cx); cross.setAttribute('x2', best.cx);
    cross.style.visibility = 'visible';
    const color = best.tipo === 'proyeccion' ? '#c2410c' : '#17794f';
    hl.setAttribute('cx', best.cx); hl.setAttribute('cy', best.cy);
    hl.setAttribute('stroke', color);
    hl.style.visibility = 'visible';

    tooltip.innerHTML = `<strong>${best.fechaLabel}</strong><br>${best.valorLabel}${best.tipo === 'proyeccion' ? '<br><span style="color:#c2410c">proyección</span>' : ''}`;
    tooltip.style.display = 'block';
    const leftPx = best.cx / vb.w * rect.width;
    const topPx = best.cy / vb.h * rect.height;
    const tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
    tooltip.style.left = Math.min(Math.max(leftPx - tw / 2, 0), rect.width - tw) + 'px';
    tooltip.style.top = Math.max(topPx - th - 12, 0) + 'px';
  };
  const ocultar = () => { tooltip.style.display = 'none'; cross.style.visibility = 'hidden'; hl.style.visibility = 'hidden'; };
  svg.addEventListener('mousemove', mover);
  svg.addEventListener('mouseleave', ocultar);
  svg.addEventListener('touchstart', mover, { passive: true });
  svg.addEventListener('touchmove', mover, { passive: true });
  svg.addEventListener('touchend', ocultar);
}
