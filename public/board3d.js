// Plateau 3D (Three.js) : 45 cases néon en forme de cœur, deux pions cœur, un dé.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { drawIcon } from './icons.js';

const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOut = t => 1 - Math.pow(1 - t, 3);
const TILE_H = 0.42;
// Faces du dé dans l'ordre de BoxGeometry : +x, -x, +y, -y, +z, -z
const DIE_FACES = [3, 4, 1, 6, 2, 5];
const DIE_UP = {
  1: [0, 0, 0], 6: [Math.PI, 0, 0], 2: [-Math.PI / 2, 0, 0],
  5: [Math.PI / 2, 0, 0], 3: [0, 0, Math.PI / 2], 4: [0, 0, -Math.PI / 2],
};

// Points de la courbe en cœur, répartis à distance égale, départ à la pointe du bas.
// sy étire le cœur en hauteur (téléphone en portrait) : plus de place, donc des cases plus grandes.
function heartLayout(n, sy = 1) {
  const M = 4000, raw = [];
  for (let i = 0; i <= M; i++) {
    const t = Math.PI + (i / M) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    raw.push(new THREE.Vector2(x, -y * sy));
  }
  const cum = [0];
  for (let i = 1; i <= M; i++) cum.push(cum[i - 1] + raw[i].distanceTo(raw[i - 1]));
  const L = cum[M], out = [];
  let j = 0;
  // Une case pile dans le creux du cœur (sinon deux cases s'y chevauchent)
  const half = Math.floor((n - 1) / 2), left = L / 2 / half, right = L / 2 / (n - half);
  for (let k = 0; k < n; k++) {
    const s = k <= half ? k * left : L / 2 + (k - half) * right;
    while (j < M && cum[j + 1] < s) j++;
    const f = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    out.push(raw[j].clone().lerp(raw[j + 1], f));
  }
  // Écarte les cases trop proches (creux du cœur)
  const minD = Math.min(left, right) * 0.95, dv = new THREE.Vector2();
  for (let it = 0; it < 40; it++) {
    for (let i = 0; i < n; i++) for (let k = i + 1; k < n; k++) {
      dv.subVectors(out[k], out[i]);
      const dist = dv.length();
      if (dist < minD && dist > 1e-6) {
        dv.multiplyScalar((minD - dist) / dist / 2);
        out[k].add(dv); out[i].sub(dv);
      }
    }
  }
  const box = new THREE.Box2().setFromPoints(out), c = box.getCenter(new THREE.Vector2());
  out.forEach(p => p.sub(c));
  return { pts: out, spacing: Math.min(left, right), box: box.translate(c.negate()) };
}

function octShape(r) {
  const s = new THREE.Shape();
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i * Math.PI) / 4, x = Math.cos(a) * r, y = Math.sin(a) * r;
    i ? s.lineTo(x, y) : s.moveTo(x, y);
  }
  s.closePath();
  return s;
}
function octRing(r, w) {
  const s = octShape(r);
  s.holes.push(new THREE.Path(octShape(r - w).getPoints().reverse()));
  return s;
}
const flat = g => g.rotateX(-Math.PI / 2);

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function neonText(ctx, text, x, y, color, blur) {
  ctx.shadowColor = color;
  for (const b of [blur * 2.2, blur, blur * 0.4]) { ctx.shadowBlur = b; ctx.fillStyle = color; ctx.fillText(text, x, y); }
  ctx.shadowBlur = 2; ctx.shadowColor = '#fff'; ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillText(text, x, y);
}

function heartGeometry() {
  const s = new THREE.Shape();
  s.moveTo(5, 5);
  s.bezierCurveTo(5, 5, 4, 0, 0, 0);
  s.bezierCurveTo(-6, 0, -6, 7, -6, 7);
  s.bezierCurveTo(-6, 11, -3, 15.4, 5, 19);
  s.bezierCurveTo(12, 15.4, 16, 11, 16, 7);
  s.bezierCurveTo(16, 7, 16, 0, 10, 0);
  s.bezierCurveTo(7, 0, 5, 5, 5, 5);
  const g = new THREE.ExtrudeGeometry(s, { depth: 5, bevelEnabled: true, bevelThickness: 2.4, bevelSize: 2, bevelSegments: 8, curveSegments: 24 });
  g.center();
  g.rotateZ(Math.PI);
  return g;
}

export async function createBoard(el, { count, typeAt, levelColorAt, types, playerColors }) {
  try { await Promise.all([document.fonts.load('80px Yellowtail'), document.fonts.load('900 80px Nunito')]); } catch (e) { /* polices facultatives */ }

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07060a);
  scene.fog = new THREE.Fog(0x07060a, 60, 170);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 400);

  scene.add(new THREE.HemisphereLight(0xffd6ec, 0x140a18, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(-8, 30, 18);
  scene.add(key);
  const pinkLight = new THREE.PointLight(0xff3fa4, 60, 40, 1.6);
  pinkLight.position.set(0, 6, 2);
  scene.add(pinkLight);

  // Ciel étoilé
  {
    const n = 1800, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 70 + Math.random() * 90, th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI;
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = -Math.abs(r * Math.cos(ph)) * 0.6 - 4;
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffd9ee, size: 0.35, transparent: true, opacity: 0.7, fog: false })));
  }

  // Disposition du cœur : recalculée selon la forme de l'écran (voir relayout).
  // Les objets sont construits à la taille de référence R0 puis mis à l'échelle k = R / R0.
  const base = heartLayout(count, 1);
  const R0 = base.spacing * 0.47;
  const baseRatio = (base.box.max.y - base.box.min.y + 2 * R0) / (base.box.max.x - base.box.min.x + 2 * R0);
  let pts = base.pts, box = base.box, R = R0, k = 1, stretch = 1, laidOut = false;
  const tileR = n => (n === count ? R0 * 1.12 : R0);
  const P3 = n => new THREE.Vector3(pts[n - 1].x, 0, pts[n - 1].y);

  // Halo au sol
  {
    const tex = canvasTex(512, 512, (c, w) => {
      const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      g.addColorStop(0, 'rgba(255,63,164,.55)'); g.addColorStop(0.45, 'rgba(160,40,200,.18)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, w);
    });
    const m = new THREE.Mesh(flat(new THREE.PlaneGeometry(70, 70)), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.y = -0.3;
    scene.add(m);
  }

  // Titre néon au centre
  let textZ = 0;
  const drawTitle = () => canvasTex(1024, 640, (c, w, h) => {
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.translate(w / 2, h / 2); c.rotate(-0.12);
      c.font = "210px 'Yellowtail', cursive";
      neonText(c, 'Dirty', -60, -95, '#ff3fa4', 26);
      neonText(c, 'Game', 90, 105, '#ff3b3b', 26);
  });
  let titleMesh;
  {
    const tex = drawTitle();
    const width = (box.max.x - box.min.x) * 0.5;
    const m = new THREE.Mesh(flat(new THREE.PlaneGeometry(width, width * 0.625)), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
    m.material.color.setScalar(1.25);
    m.position.y = 0.05;
    scene.add(m);
    titleMesh = m;
  }

  // Cases
  const bodyGeo = new Map(), ringGeo = new Map();
  const geoFor = r => {
    if (!bodyGeo.has(r)) {
      bodyGeo.set(r, flat(new THREE.ExtrudeGeometry(octShape(r * 0.96), { depth: TILE_H, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2 })));
      ringGeo.set(r, flat(new THREE.ExtrudeGeometry(octRing(r, r * 0.1), { depth: 0.05, bevelEnabled: false })));
    }
    return [bodyGeo.get(r), ringGeo.get(r)];
  };
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x141118, roughness: 0.32, metalness: 0.55 });
  const tiles = [];
  const faceTex = (n, lvColor) => canvasTex(256, 256, (c, w) => {
    const ty = types[typeAt(n)];
    const pad = 18, r = w / 2 - pad;
    c.save();
    c.beginPath();
    for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + (i * Math.PI) / 4; c.lineTo(w / 2 + Math.cos(a) * r, w / 2 + Math.sin(a) * r); }
    c.closePath(); c.clip();
    const g = c.createRadialGradient(w / 2, w * 0.38, 0, w / 2, w / 2, r * 1.1);
    g.addColorStop(0, lvColor + '55'); g.addColorStop(1, 'rgba(10,9,13,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, w);
    c.restore();
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = "800 34px 'Nunito', sans-serif";
    c.fillStyle = 'rgba(255,255,255,.7)';
    c.fillText(String(n), w / 2, 46);
    if (ty.icon) return drawIcon(c, ty.icon, w / 2, w / 2 + 16, 150, ty.color);
    const script = ty.font === 'script';
    c.font = script ? `${ty.size || 150}px 'Yellowtail', cursive` : `900 ${ty.size || 96}px 'Nunito', sans-serif`;
    neonText(c, ty.glyph, w / 2 + (script ? -4 : 0), w / 2 + 22, ty.color, 14);
  });

  for (let n = 1; n <= count; n++) {
    const r = tileR(n), [bg, rg] = geoFor(r), p = P3(n);
    const grp = new THREE.Group();
    grp.position.copy(p);
    const body = new THREE.Mesh(bg, bodyMat);
    grp.add(body);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const ring = new THREE.Mesh(rg, ringMat);
    ring.position.y = TILE_H + 0.07;
    grp.add(ring);
    const echoes = [0.62, 0.3].map((y, i) => {
      const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: i ? 0.35 : 0.6, toneMapped: false }));
      m.position.y = TILE_H * y - 0.2 * i;
      m.scale.setScalar(1 + 0.04 * (i + 1));
      grp.add(m);
      return m;
    });
    const face = new THREE.Mesh(flat(new THREE.PlaneGeometry(r * 2, r * 2)), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }));
    face.position.y = TILE_H + 0.1;
    grp.add(face);
    scene.add(grp);
    tiles.push({ n, grp, ringMat, echoes, face, base: new THREE.Color() });
  }

  function setLevels() {
    for (const t of tiles) {
      const col = levelColorAt(t.n);
      t.base.set(col).multiplyScalar(1.7);
      t.ringMat.color.copy(t.base);
      t.echoes.forEach(e => e.material.color.set(col).multiplyScalar(1.2));
      if (t.face.material.map) t.face.material.map.dispose();
      t.face.material.map = faceTex(t.n, col);
      t.face.material.color.setScalar(1.05);
      t.face.material.needsUpdate = true;
    }
  }
  setLevels();
  // Si les polices arrivent après coup, on redessine les textures
  document.fonts && document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', () => {
    setLevels();
    titleMesh.material.map.dispose();
    titleMesh.material.map = drawTitle();
  });

  // Pions
  const heartGeo = heartGeometry();
  const pawnScale = (R0 * 1.7) / 23;
  const pawns = playerColors.map((col, i) => {
    const g = new THREE.Group();
    const mat = new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12, sheen: 0.4, emissive: new THREE.Color(col), emissiveIntensity: 0.12 });
    const heart = new THREE.Mesh(heartGeo, mat);
    heart.scale.setScalar(pawnScale);
    const hh = 23 * pawnScale;
    heart.position.y = 0.16 + hh / 2;
    g.add(heart);
    // Visage (coordonnées locales du cœur, avant mise à l'échelle)
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a0a14, roughness: 0.15 });
    const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const blushMat = new THREE.MeshBasicMaterial({ color: 0xff9cc6, transparent: true, opacity: 0.85 });
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(2.1, 20, 14), eyeMat);
      eye.position.set(sx * 3.9, 2, 4.6);
      eye.scale.z = 0.55;
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.75, 10, 8), glintMat);
      glint.position.set(0.7, 0.8, 1.9);
      eye.add(glint);
      heart.add(eye);
      const blush = new THREE.Mesh(new THREE.CircleGeometry(1.5, 20), blushMat);
      blush.position.set(sx * 7, -1.2, 4.95);
      blush.scale.set(1.3, 0.8, 1);
      heart.add(blush);
    }
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(R0 * 0.36, R0 * 0.42, 0.14, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.6), toneMapped: false }));
    disc.position.y = 0.07;
    g.add(disc);
    scene.add(g);
    return { g, heart, tile: 1, hop: 0, phase: i * 1.7 };
  });

  // Dé
  const dieSize = R0 * 1.35, dieHalf = () => (dieSize * k) / 2;
  const pipTex = v => canvasTex(256, 256, (c, w) => {
    const g = c.createLinearGradient(0, 0, w, w);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#ffd3e9');
    c.fillStyle = g; c.fillRect(0, 0, w, w);
    c.strokeStyle = 'rgba(196,106,152,.55)'; c.lineWidth = 10; c.strokeRect(5, 5, w - 10, w - 10);
    const P = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }[v];
    c.fillStyle = '#2a0c1c';
    for (const k of P) { c.beginPath(); c.arc(w * (0.25 + 0.25 * (k % 3)), w * (0.25 + 0.25 * Math.floor(k / 3)), w * 0.085, 0, Math.PI * 2); c.fill(); }
  });
  const die = new THREE.Mesh(new THREE.BoxGeometry(dieSize, dieSize, dieSize), DIE_FACES.map(v => new THREE.MeshStandardMaterial({ map: pipTex(v), roughness: 0.3, emissive: 0xffffff, emissiveIntensity: 0.08 })));
  const dieHome = new THREE.Vector3();
  die.quaternion.setFromEuler(new THREE.Euler(...DIE_UP[5])).premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.5));
  scene.add(die);
  // Ombre douce sous le dé et éclat lumineux quand il touche le plateau
  const blob = (inner, outer) => canvasTex(128, 128, (c, w) => {
    const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, inner); g.addColorStop(1, outer);
    c.fillStyle = g; c.fillRect(0, 0, w, w);
  });
  const dieShadow = new THREE.Mesh(flat(new THREE.PlaneGeometry(dieSize * 1.9, dieSize * 1.9)), new THREE.MeshBasicMaterial({ map: blob('rgba(0,0,0,.75)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false }));
  const dieGlow = new THREE.Mesh(flat(new THREE.PlaneGeometry(dieSize * 4, dieSize * 4)), new THREE.MeshBasicMaterial({ map: blob('rgba(255,120,200,1)', 'rgba(255,63,164,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0 }));
  dieShadow.position.y = 0.02; dieGlow.position.y = 0.03;
  scene.add(dieShadow, dieGlow);
  let glowLevel = 0;
  // Chiffre néon qui apparaît au-dessus du dé
  const numSprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false, toneMapped: false, opacity: 0 }));
  numSprite.renderOrder = 10;
  scene.add(numSprite);
  const numTex = {};
  const numberTex = v => numTex[v] || (numTex[v] = canvasTex(256, 256, (c, w) => {
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = "900 170px 'Nunito', sans-serif";
    neonText(c, String(v), w / 2, w / 2 + 8, '#ff3fa4', 22);
  }));

  // Onde lumineuse et faisceau sur la case où le pion s'arrête
  const waves = [0, 1].map(() => {
    const m = new THREE.Mesh(geoFor(R0)[1], new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
    m.visible = false;
    scene.add(m);
    return m;
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(R0 * 0.85, R0 * 0.95, R0 * 7, 32, 1, true), new THREE.MeshBasicMaterial({
    map: canvasTex(8, 128, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,1)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    }),
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0,
  }));
  beam.visible = false;
  scene.add(beam);
  let flash = { n: 0, v: 0 };

  // Place tout selon l'étirement du cœur (1 = cœur d'origine)
  function relayout(sy) {
    const L = heartLayout(count, sy);
    pts = L.pts; box = L.box; stretch = sy;
    R = L.spacing * 0.47; k = R / R0;
    textZ = box.getCenter(new THREE.Vector2()).y + (box.max.y - box.min.y) * 0.02;
    titleMesh.position.z = textZ;
    titleMesh.scale.setScalar(Math.min(1.25, 0.9 + 0.35 * (sy - 1)));
    for (const t of tiles) { t.grp.position.copy(P3(t.n)); t.grp.scale.set(k, 1, k); }
    pawns.forEach(pw => pw.g.scale.setScalar(k));
    pawns.forEach((pw, i) => pw.g.position.copy(pawnSpot(i, pw.tile)));
    die.scale.setScalar(k);
    dieShadow.scale.setScalar(k); dieGlow.scale.setScalar(k);
    dieHome.set((box.max.x - box.min.x) * 0.2, dieHalf(), textZ - (box.max.y - box.min.y) * 0.15);
    die.position.copy(dieHome);
    beam.scale.setScalar(k);
  }

  // Caméra fixe (pas de zoom ni de rotation), post-traitement
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.5, 0.7);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // Zone libre entre les bandeaux de l'interface, en pixels depuis chaque bord
  let insets = { top: 120, bottom: 130, left: 0, right: 0 };
  function fit() {
    const w = el.clientWidth || window.innerWidth, h = el.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.clearViewOffset();
    // Vue presque de dessus, légèrement inclinée : lisible et sans déformation
    const polar = w > h ? 0.5 : 0.36;
    // En portrait, on étire le cœur pour remplir la hauteur libre (et agrandir les cases)
    const freeW = Math.max(1, w - insets.left - insets.right), freeH = Math.max(1, h - insets.top - insets.bottom);
    const sy = Math.round(Math.min(1.8, Math.max(1, (freeH / freeW) / (baseRatio * Math.cos(polar)))) * 50) / 50;
    if (Math.abs(sy - stretch) > 0.01 || !laidOut) { laidOut = true; relayout(sy); }
    const target = new THREE.Vector3(0, 0, 0);
    const dir = new THREE.Vector3(0, Math.cos(polar), Math.sin(polar));
    const bandY = Math.max(0.2, 2 - (2 * (insets.top + insets.bottom)) / h);
    const bandX = Math.max(0.2, 2 - (2 * (insets.left + insets.right)) / w);
    const corners = [];
    for (const x of [box.min.x - R, box.max.x + R]) for (const z of [box.min.y - R, box.max.y + R]) for (const y of [0, 1.5]) corners.push(new THREE.Vector3(x, y, z));
    let midX = 0, midY = 0, d = 10;
    for (; d < 400; d += 0.25) {
      camera.position.copy(target).addScaledVector(dir, d);
      camera.lookAt(target);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();
      const ps = corners.map(c => c.clone().project(camera));
      const top = Math.max(...ps.map(p => p.y)), bot = Math.min(...ps.map(p => p.y));
      const right = Math.max(...ps.map(p => p.x)), left = Math.min(...ps.map(p => p.x));
      midX = (right + left) / 2; midY = (top + bot) / 2;
      if (right - left <= bandX * 0.96 && top - bot <= bandY * 0.96) break;
    }
    // Le brouillard suit la distance, sinon le plateau s'assombrit quand la caméra recule (portrait)
    scene.fog.near = d * 0.9; scene.fog.far = d * 2.6;
    // Recentre le cœur dans la zone libre
    const shiftX = (insets.left - insets.right) / 2 - (midX * w) / 2;
    const shiftY = (insets.top - insets.bottom) / 2 + (midY * h) / 2;
    camera.setViewOffset(w, h, -shiftX, -shiftY, w, h);
  }

  // Petites animations
  const tweens = [];
  const tween = (dur, fn) => new Promise(res => tweens.push({ t0: performance.now(), dur, fn, res }));

  function pawnSpot(i, tile) {
    const p = P3(tile);
    const other = pawns[1 - i];
    if (other && other.tile === tile) p.x += (i === 0 ? -1 : 1) * R * 0.48;
    p.y = TILE_H + 0.12;
    return p;
  }
  function placePawns(positions) {
    positions.forEach((t, i) => { pawns[i].tile = t; });
    pawns.forEach((pw, i) => pw.g.position.copy(pawnSpot(i, pw.tile)));
  }
  async function hopPawn(i, tile, dur = 230) {
    const pw = pawns[i], from = pw.g.position.clone();
    const oldTile = pw.tile;
    pw.tile = tile;
    const to = pawnSpot(i, tile);
    const other = pawns[1 - i];
    const otherFrom = other.g.position.clone(), otherTo = pawnSpot(1 - i, other.tile);
    const needOther = other.tile === oldTile || other.tile === tile;
    await tween(dur, t => {
      const e = easeInOut(t);
      pw.g.position.lerpVectors(from, to, e);
      pw.g.position.y += Math.sin(Math.PI * t) * R * 1.1;
      pw.hop = Math.sin(Math.PI * t);
      if (needOther) other.g.position.lerpVectors(otherFrom, otherTo, e);
    });
    pw.hop = 0;
  }
  async function swapPawns() {
    const a = pawns[0], b = pawns[1];
    [a.tile, b.tile] = [b.tile, a.tile];
    const fa = a.g.position.clone(), fb = b.g.position.clone(), ta = pawnSpot(0, a.tile), tb = pawnSpot(1, b.tile);
    await tween(700, t => {
      const e = easeInOut(t), lift = Math.sin(Math.PI * t) * R * 2.2;
      a.g.position.lerpVectors(fa, ta, e); a.g.position.y += lift;
      b.g.position.lerpVectors(fb, tb, e); b.g.position.y += lift;
    });
  }
  // Le dé est lancé depuis le bas de l'écran, rebondit et roule jusqu'au centre du cœur
  async function rollDie(v) {
    const half = dieHalf(), H = box.max.y - box.min.y, W = box.max.x - box.min.x;
    const qFinal = new THREE.Quaternion().setFromEuler(new THREE.Euler(...DIE_UP[v]))
      .premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 1.2));
    // Atterrit au-dessus ou en dessous du titre, sans le cacher
    const above = Math.random() < 0.5;
    const land = new THREE.Vector3((Math.random() - 0.5) * W * (above ? 0.5 : 0.25), half, textZ + (above ? -1 : 1) * H * (0.19 + Math.random() * 0.05));
    const from = new THREE.Vector3(land.x + (Math.random() - 0.5) * W * 0.5, half + R * 6, box.max.y + R * 5);
    const dir = new THREE.Vector3().subVectors(land, from).setY(0);
    const dist = dir.length();
    dir.normalize();
    const rollAxis = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
    const tumbleAxis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    const tumble = Math.PI * (2 + Math.random() * 2);
    // Rebonds : [début, fin, hauteur]
    const hops = [[0.38, 0.62, R * 1.8], [0.62, 0.78, R * 0.7], [0.78, 0.88, R * 0.22]];
    let impacts = 0;
    const impact = strength => {
      glowLevel = Math.max(glowLevel, strength);
      if (navigator.vibrate) navigator.vibrate(Math.round(10 + 25 * strength));
    };
    const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
    numSprite.material.opacity = 0;
    await tween(1500, t => {
      // Avance rapide puis ralentit, le dé roule sur la distance qui reste
      const e = 1 - Math.pow(1 - t, 2.4);
      const left = dist * (1 - e);
      die.position.copy(land).addScaledVector(dir, -left);
      let y = 0;
      if (t < 0.38) { const u = t / 0.38; y = (1 - u) * (from.y - half) + 4 * u * (1 - u) * R * 2.5; }
      for (const [a, b, peak] of hops) if (t >= a && t < b) { const u = (t - a) / (b - a); y = 4 * u * (1 - u) * peak; }
      die.position.y = half + y;
      const n = t < 0.38 ? 0 : t < 0.62 ? 1 : t < 0.78 ? 2 : 3;
      while (impacts < n) { impacts++; impact([1, 0.6, 0.3][impacts - 1]); }
      qa.setFromAxisAngle(rollAxis, -left / half);
      qb.setFromAxisAngle(tumbleAxis, tumble * Math.pow(1 - Math.min(1, t / 0.62), 2));
      die.quaternion.copy(qa).multiply(qb).multiply(qFinal);
    });
    die.position.copy(land);
    die.quaternion.copy(qFinal);
    // Le résultat s'affiche en néon au-dessus du dé
    numSprite.material.map = numberTex(v);
    numSprite.material.needsUpdate = true;
    const size = R * 4.2;
    tween(1300, t => {
      const pop = t < 0.25 ? easeOut(t / 0.25) * 1.15 : 1.15 - 0.15 * Math.min(1, (t - 0.25) / 0.15);
      numSprite.scale.setScalar(size * pop);
      numSprite.position.set(land.x, half * 2 + R * 1.6 + t * R * 1.2, land.z);
      numSprite.material.opacity = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    });
    await new Promise(r => setTimeout(r, 450));
  }

  // La case d'arrivée s'allume : onde, faisceau et petit saut de la case
  async function landOn(n, color = '#ff3fa4') {
    const tile = tiles[n - 1], p = tile.grp.position, col = new THREE.Color(color).multiplyScalar(2.2);
    for (const w of waves) { w.position.set(p.x, TILE_H + 0.1, p.z); w.material.color.copy(col); w.visible = true; w.scale.setScalar(0.001); }
    beam.position.set(p.x, TILE_H + (R0 * 7 * k) / 2, p.z);
    beam.material.color.copy(col).multiplyScalar(0.6);
    beam.visible = true;
    flash.n = n;
    await tween(720, t => {
      waves.forEach((w, i) => {
        const u = Math.max(0, Math.min(1, (t - i * 0.22) / 0.78));
        w.scale.set(k * (1 + 1.6 * easeOut(u)), 1, k * (1 + 1.6 * easeOut(u)));
        w.material.opacity = u <= 0 ? 0 : (1 - u) * (i ? 0.6 : 1);
      });
      beam.material.opacity = Math.sin(Math.PI * t) * 0.75;
      tile.grp.position.y = Math.sin(Math.PI * Math.min(1, t * 1.6)) * R * 0.22;
      flash.v = Math.sin(Math.PI * t);
    });
    tile.grp.position.y = 0;
    flash.v = 0;
    waves.forEach(w => { w.visible = false; });
    beam.visible = false;
  }

  function tileScreen(n) {
    const v = P3(n).project(camera), r = el.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }

  let active = 0, activeColor = new THREE.Color(), turnIdx = 0;
  function setActive(tile, playerIndex) { active = tile; turnIdx = playerIndex; activeColor.set(playerColors[playerIndex]); }

  let running = false, last = performance.now();
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i], t = Math.min(1, (now - tw.t0) / tw.dur);
      tw.fn(t);
      if (t >= 1) { tweens.splice(i, 1); tw.res(); }
    }
    const pulse = 0.5 + 0.5 * Math.sin(now / 260);
    for (const t of tiles) {
      if (t.n === active) t.ringMat.color.copy(t.base).lerp(activeColor.clone().multiplyScalar(2.2), 0.35 + 0.35 * pulse).multiplyScalar(1 + 0.4 * pulse);
      else t.ringMat.color.copy(t.base);
      const f = t.n === flash.n ? flash.v : 0;
      if (f) t.ringMat.color.multiplyScalar(1 + 1.5 * f);
      t.face.material.color.setScalar(1.05 + 0.9 * f);
    }
    // Ombre et éclat suivent le dé
    const lift = Math.max(0, die.position.y - dieHalf());
    dieShadow.position.x = dieGlow.position.x = die.position.x;
    dieShadow.position.z = dieGlow.position.z = die.position.z;
    dieShadow.material.opacity = 0.8 / (1 + lift / (R * 1.5));
    glowLevel *= Math.exp(-dt * 5);
    dieGlow.material.opacity = glowLevel;
    pawns.forEach((pw, i) => {
      const bob = i === turnIdx ? Math.sin(now / 300 + pw.phase) * 0.12 : 0;
      pw.heart.position.y = 0.16 + (23 * pawnScale) / 2 + Math.max(0, bob);
      pw.heart.rotation.z = Math.sin(now / 520 + pw.phase) * 0.08;
      const s = 1 + pw.hop * 0.08;
      pw.heart.scale.set(pawnScale / s, pawnScale * s, pawnScale);
      pw.g.rotation.y = Math.atan2(camera.position.x - pw.g.position.x, camera.position.z - pw.g.position.z);
    });
    pinkLight.intensity = 50 + 15 * pulse;
    composer.render();
  }
  function start() { if (running) return; running = true; last = performance.now(); fit(); requestAnimationFrame(frame); }
  function stop() { running = false; }

  window.addEventListener('resize', () => { if (running) fit(); });
  // Les iPhone donnent parfois leurs nouvelles dimensions un peu après la rotation
  window.addEventListener('orientationchange', () => setTimeout(() => { if (running) fit(); }, 350));

  return {
    start, stop, setLevels, placePawns, hopPawn, swapPawns, rollDie, landOn, tileScreen, setActive,
    setInsets(next) { insets = { top: 0, bottom: 0, left: 0, right: 0, ...next }; if (running) fit(); },
    resetView: fit,
  };
}
