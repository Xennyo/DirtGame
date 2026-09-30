// Icônes des cases, en tracés SVG (repère 24×24) : dessinées en néon sur le plateau 3D
// et en SVG dans la légende. s = trait, f = remplissage, t = petit texte.
export const ICONS = {
  // Action : une flamme
  A: {
    s: 'M12 2.8c.6 3.4 5.6 5.8 5.6 11a5.6 5.6 0 0 1-11.2 0c0-2.6 1.2-4.4 2.6-5.6.1 2 .9 3.2 2 3.7-.5-3.4.2-6.3 1-9.1z',
    f: 'M12 13.2c1.2 1.3 2.6 2.4 2.6 4a2.6 2.6 0 0 1-5.2 0c0-1.5 1.3-2.6 2.6-4z',
  },
  // Vérité : un œil grand ouvert
  V: {
    s: 'M2.6 12S6 5.8 12 5.8 21.4 12 21.4 12 18 18.2 12 18.2 2.6 12 2.6 12z',
    f: 'M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 1 0 0-6.8z',
  },
  // Choix libre : un chemin qui se sépare en deux
  C: {
    s: 'M12 21.2v-6.4M12 14.8 6.2 7.4M12 14.8l5.8-7.4M5.7 11.4l.5-4 4 .5M18.3 11.4l-.5-4-4 .5',
  },
  // Joker : un bonnet de fou à grelots
  J: {
    s: 'M6 18.6c.2-4.4-.8-7-3.4-8.6 3-.8 5.6.4 7 2.8.2-4.2 1-7.4 2.4-9.6 1.4 2.2 2.2 5.4 2.4 9.6 1.4-2.4 4-3.6 7-2.8-2.6 1.6-3.6 4.2-3.4 8.6zM6 18.6h12M8.6 15.6h.01M12 15.6h.01M15.4 15.6h.01',
    f: 'M2.4 8.6a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 1 0 0-3.4zM12 .6a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 1 0 0-3.4zM21.6 8.6a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 1 0 0-3.4z',
  },
  // Recul de 3 : une flèche qui repart en arrière
  R: {
    s: 'M4.6 9.2A8 8 0 1 1 4 13.4M4.2 4.4v5h5',
    t: '3',
  },
  // Échange : deux flèches opposées
  E: {
    s: 'M4 8.4h14.6M15 4.6l3.8 3.8-3.8 3.8M20 15.6H5.4M9 11.8l-3.8 3.8L9 19.4',
  },
  // Bonus : un dé, on rejoue
  B: {
    s: 'M7 3.6h10A3.4 3.4 0 0 1 20.4 7v10a3.4 3.4 0 0 1-3.4 3.4H7A3.4 3.4 0 0 1 3.6 17V7A3.4 3.4 0 0 1 7 3.6z',
    f: 'M8.2 6.7a1.5 1.5 0 1 0 0 3 1.5 1.5 0 1 0 0-3zM12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 1 0 0-3zM15.8 14.3a1.5 1.5 0 1 0 0 3 1.5 1.5 0 1 0 0-3z',
  },
  // Arrivée : un cœur plein
  F: {
    s: 'M12 20.4S3.2 15.2 3.2 9A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8.8 2c0 6.2-8.8 11.4-8.8 11.4z',
    f: 'M12 20.4S3.2 15.2 3.2 9A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8.8 2c0 6.2-8.8 11.4-8.8 11.4z',
  },
};

const path2d = {};
const P = d => path2d[d] || (path2d[d] = new Path2D(d));

// Dessine l'icône en néon sur un canvas 2D, centrée en (cx, cy), de côté size.
export function drawIcon(ctx, ic, cx, cy, size, color) {
  const k = size / 24;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(k, k);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const pass = (fillStyle, strokeStyle, lw, blur, glow, core) => {
    ctx.shadowColor = glow; ctx.shadowBlur = blur; // flou en pixels (hors transformation)
    ctx.fillStyle = fillStyle; ctx.strokeStyle = strokeStyle; ctx.lineWidth = lw;
    if (ic.f && !(core && ic.f === ic.s)) ctx.fill(P(ic.f));
    if (ic.s) ctx.stroke(P(ic.s));
    if (ic.t) {
      ctx.font = "900 9px 'Nunito', sans-serif";
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(ic.t, 12.6, 13.1);
    }
  };
  // halo coloré large, puis le trait coloré, puis un cœur blanc fin
  const g = size / 130;
  for (const b of [30, 14]) pass(color, color, 3.2, b * g, color);
  pass(color, color, 3, 4 * g, color);
  ctx.globalAlpha = 0.85;
  pass('rgba(255,255,255,.8)', 'rgba(255,255,255,.9)', 1.1, 2 * g, '#fff', true);
  ctx.restore();
}

// Même icône en SVG pour la légende.
export function iconSvg(ic, color) {
  return `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 3px ${color})">`
    + (ic.f ? `<path d="${ic.f}" fill="${color}" stroke="none"/>` : '')
    + (ic.s ? `<path d="${ic.s}"/>` : '')
    + (ic.t ? `<text x="12.6" y="13.1" fill="${color}" stroke="none" font-size="9" font-weight="900" font-family="Nunito, sans-serif" text-anchor="middle" dominant-baseline="central">${ic.t}</text>` : '')
    + '</svg>';
}
