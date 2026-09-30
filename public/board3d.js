// Plateau 3D (Three.js) : 45 cases néon en forme de cœur, deux pions cœur, un dé.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
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
function heartLayout(n) {
  const M = 4000, raw = [];
  for (let i = 0; i <= M; i++) {
    const t = Math.PI + (i / M) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    raw.push(new THREE.Vector2(x, -y));
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
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);

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

  const { pts, spacing, box } = heartLayout(count);
  const R = spacing * 0.43;
  const tileR = n => (n === count ? R * 1.12 : R);
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
  const textZ = box.getCenter(new THREE.Vector2()).y + (box.max.y - box.min.y) * 0.02;
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
    m.position.set(0, 0.05, textZ);
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
  const pawnScale = (R * 1.7) / 23;
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
    const base = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.36, R * 0.42, 0.14, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.6), toneMapped: false }));
    base.position.y = 0.07;
    g.add(base);
    scene.add(g);
    return { g, heart, tile: 1, hop: 0, phase: i * 1.7 };
  });

  // Dé
  const dieSize = R * 1.35;
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
  const dieHome = new THREE.Vector3((box.max.x - box.min.x) * 0.2, dieSize / 2, textZ - (box.max.y - box.min.y) * 0.15);
  die.position.copy(dieHome);
  die.quaternion.setFromEuler(new THREE.Euler(...DIE_UP[5])).premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.5));
  scene.add(die);

  // Caméra, post-traitement
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minPolarAngle = 0.12;
  controls.maxPolarAngle = 1.2;
  controls.minAzimuthAngle = -1.0;
  controls.maxAzimuthAngle = 1.0;
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.5, 0.7);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let insets = { top: 120, bottom: 130 };
  function fit() {
    const w = el.clientWidth || window.innerWidth, h = el.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.clearViewOffset();
    const polar = w > h ? 0.78 : 0.6;
    const target = new THREE.Vector3(0, 0, 0);
    const dir = new THREE.Vector3(0, Math.cos(polar), Math.sin(polar));
    const band = Math.max(0.2, 2 - (2 * (insets.top + insets.bottom)) / h);
    const corners = [];
    for (const x of [box.min.x - R, box.max.x + R]) for (const z of [box.min.y - R, box.max.y + R]) for (const y of [0, 1.5]) corners.push(new THREE.Vector3(x, y, z));
    let d = 10, mid = 0;
    for (; d < 400; d += 0.5) {
      camera.position.copy(target).addScaledVector(dir, d);
      camera.lookAt(target);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();
      const ps = corners.map(c => c.clone().project(camera));
      const top = Math.max(...ps.map(p => p.y)), bot = Math.min(...ps.map(p => p.y)), side = Math.max(...ps.map(p => Math.abs(p.x)));
      mid = (top + bot) / 2;
      if (side <= 0.96 && top - bot <= band * 0.97) break;
    }
    // Recentre le cœur dans la bande libre entre les bandeaux du haut et du bas
    const shiftPx = (insets.top - insets.bottom) / 2 + (mid * h) / 2;
    camera.setViewOffset(w, h, 0, -shiftPx, w, h);
    follow = h > w;
    home.copy(target);
    const dd = follow ? d * 0.62 : d;
    camera.position.copy(target).addScaledVector(dir, dd);
    controls.target.copy(target);
    controls.minDistance = d * 0.35;
    controls.maxDistance = d * 1.3;
    controls.update();
  }
  // Portrait : la caméra suit le pion en jeu (pincer pour dézoomer)
  let follow = false, followPawn = 0;
  const home = new THREE.Vector3(), desired = new THREE.Vector3(), delta = new THREE.Vector3();
  function updateFollow(dt) {
    if (!follow) return;
    desired.copy(home).lerp(pawns[followPawn].g.position, 0.7);
    desired.y = 0;
    delta.subVectors(desired, controls.target).multiplyScalar(Math.min(1, dt * 3));
    controls.target.add(delta);
    camera.position.add(delta);
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
    followPawn = i;
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
  async function rollDie(v) {
    const from = die.position.clone();
    const qFinal = new THREE.Quaternion().setFromEuler(new THREE.Euler(...DIE_UP[v]))
      .premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 1.2));
    const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    const turns = Math.PI * (5 + Math.random() * 3);
    const land = dieHome.clone().add(new THREE.Vector3((Math.random() - 0.5) * R * 1.5, 0, (Math.random() - 0.5) * R));
    const spin = new THREE.Quaternion();
    await tween(1100, t => {
      const e = easeOut(t);
      die.position.lerpVectors(from, land, e);
      const hop = t < 0.72 ? Math.sin((Math.PI * t) / 0.72) * R * 4.5 : Math.sin((Math.PI * (t - 0.72)) / 0.28) * R * 0.5;
      die.position.y = dieSize / 2 + hop;
      spin.setFromAxisAngle(axis, turns * (1 - e));
      die.quaternion.copy(qFinal).multiply(spin);
    });
    die.position.y = dieSize / 2;
    die.quaternion.copy(qFinal);
  }

  let active = 0, activeColor = new THREE.Color(), turnIdx = 0;
  function setActive(tile, playerIndex) { active = tile; turnIdx = playerIndex; followPawn = playerIndex; activeColor.set(playerColors[playerIndex]); }

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
    }
    pawns.forEach((pw, i) => {
      const bob = i === turnIdx ? Math.sin(now / 300 + pw.phase) * 0.12 : 0;
      pw.heart.position.y = 0.16 + (23 * pawnScale) / 2 + Math.max(0, bob);
      pw.heart.rotation.z = Math.sin(now / 520 + pw.phase) * 0.08;
      const s = 1 + pw.hop * 0.08;
      pw.heart.scale.set(pawnScale / s, pawnScale * s, pawnScale);
      pw.g.rotation.y = Math.atan2(camera.position.x - pw.g.position.x, camera.position.z - pw.g.position.z);
    });
    pinkLight.intensity = 50 + 15 * pulse;
    updateFollow(dt);
    controls.update(dt);
    composer.render();
  }
  function start() { if (running) return; running = true; last = performance.now(); fit(); requestAnimationFrame(frame); }
  function stop() { running = false; }

  window.addEventListener('resize', () => { if (running) fit(); });

  return {
    start, stop, setLevels, placePawns, hopPawn, swapPawns, rollDie, setActive,
    setInsets(top, bottom) { insets = { top, bottom }; if (running) fit(); },
    resetView: fit,
  };
}
