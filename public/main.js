// Dirty Game : logique de partie et interface (écrans repris de la maquette Claude Design).
import { createBoard } from './board3d.js';

const COUNT = 45;
const LV = {
  soft: { label: 'Soft', color: '#d98cff', glow: 'rgba(217,140,255,.45)' },
  chaud: { label: 'Chaud', color: '#ff5fa2', glow: 'rgba(255,95,162,.45)' },
  hot: { label: 'Hot', color: '#ff3b3b', glow: 'rgba(255,59,59,.5)' },
};
const TY = {
  D: { label: 'Départ', glyph: 'Go', color: '#ffffff', font: 'script', size: 120, desc: 'Case de départ' },
  A: { label: 'Action', glyph: 'A', color: '#4dff9e', font: 'script', size: 170, desc: 'Un gage à réaliser' },
  V: { label: 'Vérité', glyph: 'V', color: '#62c7ff', font: 'script', size: 170, desc: 'Une question, une réponse sincère' },
  C: { label: 'Choix libre', glyph: '?', color: '#ffffff', font: 'script', size: 170, desc: 'Tu choisis : action ou vérité' },
  J: { label: 'Joker', glyph: '★', color: '#ffd23f', size: 110, desc: 'Éviter un gage ou en donner un' },
  R: { label: 'Recul de 3 cases', glyph: '−3', color: '#ff7a4a', size: 88, desc: 'Ton pion recule de 3 cases' },
  E: { label: 'Échange de places', glyph: '⇄', color: '#c79bff', size: 110, desc: 'Les deux pions échangent leur case' },
  B: { label: 'Bonus', glyph: '↻', color: '#ffa53d', size: 110, desc: 'Tu relances le dé' },
  F: { label: 'Arrivée', glyph: '♥', color: '#ff3fa4', size: 130, desc: 'Case 45, à atteindre pile' },
};
// Cases 1 à 45 : soft 1–15, chaud 16–30, hot 31–45 (pas de vérité au niveau hot)
const TILES = ' DAVCABVAJVAEVCA' + 'RVABCVAJVRACEVA' + 'BAARCAJAEARABAF';
// Couleur unique en jeu : l'intensité d'une case ou d'une carte ne doit pas se deviner
const NEON = { color: '#ff3fa4', glow: 'rgba(255,63,164,.45)' };
const PCOL = ['#ff4fa3', '#4fa8ff'], PGLOW = ['rgba(255,79,163,.55)', 'rgba(79,168,255,.55)'], PSOFT = ['#ffe1ef', '#e0efff'];
const DECK = window.DECK || { soft: { A: [], V: [] }, chaud: { A: [], V: [] }, hot: { A: [], V: [] } };
const wait = ms => new Promise(r => setTimeout(r, ms));
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const S = {
  screen: 'home',
  players: [{ name: 'Léa', gender: 'F', pos: 1, jokers: 0 }, { name: 'Hugo', gender: 'H', pos: 1, jokers: 0 }],
  mode: 'progressif', fixedLevel: 'chaud', turn: 0, busy: false,
  card: null, choiceFor: 0, choiceGiven: false,
  timerLeft: 0, timerTotal: 0, timerRunning: false,
  winner: 0, finalStep: 'pick', finalPick: 0,
};
let board = null, boardReady = null, timerIv = null;

const levelAt = pos => (S.mode === 'fixe' ? S.fixedLevel : pos <= 15 ? 'soft' : pos <= 30 ? 'chaud' : 'hot');
const other = p => S.players[1 - p];

// ---------- Cartes ----------
const bags = {};
function draw(level, type, gender) {
  const pool = (DECK[level] && DECK[level][type] || []).filter(c => c.g === 'Tous' || c.g === gender);
  if (!pool.length) return null;
  const key = level + type + gender;
  if (!bags[key] || !bags[key].length) {
    bags[key] = pool.map((_, i) => i).sort(() => Math.random() - 0.5);
  }
  return pool[bags[key].pop()];
}
function personalize(text, p) {
  const me = S.players[p], o = other(p), oF = o.gender === 'F', meF = me.gender === 'F';
  const vowel = /^[aeiouyàâéèêëîïôöûüh]/i.test(o.name);
  return text
    .replace(/\b([Dd])e (?:[Tt]on\/ta|[Tt]on|[Tt]a) partenaire\b/g, (_, d) => (vowel ? `${d}'${o.name}` : `${d}e ${o.name}`))
    .replace(/\b(?:[Tt]on\/ta|[Tt]on|[Tt]a) partenaire\b/g, o.name)
    .replace(/\ble\/la\b/g, oF ? 'la' : 'le')
    .replace(/\bil\/elle\b/g, oF ? 'elle' : 'il')
    .replace(/\bfou\/folle\b/g, meF ? 'folle' : 'fou');
}
function makeCard(type, level, p, given) {
  if (level === 'hot' && type === 'V') type = 'A';
  let c = draw(level, type, S.players[p].gender);
  if (!c && type === 'V') { type = 'A'; c = draw(level, 'A', S.players[p].gender); }
  const text = c ? personalize(c.t, p) : 'Pas encore de gage écrit pour ce niveau.';
  return { type, level, player: p, text, dur: c ? c.d : 0, given };
}

// ---------- Rendu ----------
function show(screen) {
  S.screen = screen;
  document.querySelectorAll('.screen').forEach(el => el.classList.toggle('on', el.id === screen));
  if (screen === 'board') ensureBoard().then(b => b && b.start());
  else if (board) board.stop();
  if (screen === 'setup') renderSetup();
  if (screen === 'win') renderWin();
  if (screen === 'final') renderFinal();
}
function modal(name) {
  for (const m of ['mChoice', 'mJoker', 'mCard']) $(m).classList.toggle('on', m === name);
}

function renderSetup() {
  $('setupPlayers').innerHTML = S.players.map((p, i) => `
    <div class="pl">
      <div class="pl-av" style="background:${PSOFT[i]}"><b style="color:${PCOL[i]}" data-init="${i}"></b><i style="background:${PCOL[i]}"></i></div>
      <div class="pl-lab">Joueur ${i + 1}</div>
      <input data-name="${i}" value="${esc(p.name)}" placeholder="Prénom" maxlength="14" autocomplete="off">
      <div class="grid2">
        <button type="button" class="seg" data-g="${i}H">Homme</button>
        <button type="button" class="seg" data-g="${i}F">Femme</button>
      </div>
    </div>`).join('');
  $('fixeInfo').innerHTML = ['soft', 'chaud', 'hot'].map(k => `<button type="button" class="lvl-choice" data-lvl="${k}"><i></i>${LV[k].label}</button>`).join('');
  syncSetup();
}
function syncSetup() {
  S.players.forEach((p, i) => {
    document.querySelector(`[data-init="${i}"]`).textContent = (p.name.trim()[0] || '?').toUpperCase();
    document.querySelector(`[data-g="${i}H"]`).classList.toggle('on', p.gender === 'H');
    document.querySelector(`[data-g="${i}F"]`).classList.toggle('on', p.gender === 'F');
  });
  const prog = S.mode === 'progressif';
  $('modeProg').classList.toggle('on', prog);
  $('modeFixe').classList.toggle('on', !prog);
  $('progInfo').style.display = prog ? 'flex' : 'none';
  $('fixeInfo').style.display = prog ? 'none' : 'grid';
  document.querySelectorAll('[data-lvl]').forEach(b => {
    const k = b.dataset.lvl, on = S.fixedLevel === k;
    Object.assign(b.style, { background: on ? LV[k].color : '#fff', borderColor: on ? '#111' : '#d9d6cf', color: on ? '#111' : '#555' });
    b.querySelector('i').style.background = on ? '#111' : LV[k].color;
  });
}

function renderHud() {
  const P = S.players, col = PCOL[S.turn];
  $('turnDot').style.cssText = `background:${col}; box-shadow:0 0 10px ${col}`;
  $('turnName').textContent = P[S.turn].name;
  $('chips').innerHTML = P.map((p, i) => `<div class="chip" style="border-color:${i === S.turn ? PCOL[i] : '#2a2830'}"><i style="background:${PCOL[i]}"></i><span>${esc(p.name)}</span><em>· case ${p.pos}</em>${p.jokers ? `<b>★ ${p.jokers}</b>` : ''}</div>`).join('');
  const roll = $('roll');
  roll.disabled = S.busy;
  roll.style.borderColor = col;
  roll.style.boxShadow = `0 0 24px ${PGLOW[S.turn]}, inset 0 0 20px ${PGLOW[S.turn]}`;
  $('rollLabel').textContent = S.busy ? 'Ça roule…' : 'Lancer le dé';
  $('rollLabel').style.textShadow = `0 0 8px ${col}, 0 0 20px ${col}`;
  if (board) board.setActive(P[S.turn].pos, S.turn);
}

function renderCard() {
  const c = S.card; if (!c) return;
  const lv = NEON, P = S.players;
  $('cardSheet').style.boxShadow = `0 0 0 3px ${lv.color}, 0 0 60px ${lv.glow}`;
  $('cardType').textContent = c.type === 'A' ? 'ACTION' : 'VÉRITÉ';
  $('cardPawn').style.background = PCOL[c.player];
  $('cardFor').textContent = `Pour ${P[c.player].name}${c.given ? ` · offert par ${P[1 - c.player].name}` : ''}`;
  $('cardText').textContent = c.text;
  $('timer').style.display = c.dur ? 'flex' : 'none';
  $('timerBar').style.background = lv.color;
  const j = P[c.player].jokers;
  $('useJoker').style.display = j > 0 ? 'block' : 'none';
  $('useJoker').textContent = `★ Utiliser mon joker (${j})`;
  renderTimer();
}
function renderTimer() {
  $('timerLeft').textContent = S.timerLeft;
  $('timerBar').style.width = S.timerTotal ? `${(S.timerLeft / S.timerTotal) * 100}%` : '0%';
  $('timerBtn').textContent = S.timerRunning ? 'Pause' : S.timerLeft === 0 ? 'Recommencer' : S.timerLeft === S.timerTotal ? 'Démarrer' : 'Reprendre';
}

function renderChoice() {
  const P = S.players, lv = NEON, chooser = P[S.choiceFor];
  const col = S.choiceGiven ? '#ffd23f' : lv.color, glow = S.choiceGiven ? 'rgba(255,210,63,.45)' : lv.glow;
  $('choiceSheet').style.boxShadow = `0 0 0 3px ${col}, 0 0 60px ${glow}`;
  $('choiceTitle').textContent = S.choiceGiven ? 'GAGE À DONNER' : 'CHOIX LIBRE';
  $('choiceText').textContent = S.choiceGiven ? `${P[S.turn].name}, quel gage pour ${chooser.name} ?` : `${chooser.name}, à toi de choisir.`;
}

function finals() {
  const W = S.players[S.winner], L = other(S.winner);
  return [
    `${L.name} exauce un souhait de ${W.name}, ce soir, sans discuter.`,
    `${L.name} offre à ${W.name} un massage de dix minutes, à l'endroit de son choix.`,
    `${L.name} se laisse bander les yeux et guider par ${W.name} pendant deux minutes.`,
  ];
}
function renderWin() {
  const W = S.players[S.winner], L = other(S.winner), col = PCOL[S.winner];
  $('winHalo').style.background = `radial-gradient(circle, ${PGLOW[S.winner]}, transparent 66%)`;
  $('winName').textContent = W.name;
  $('winName').style.textShadow = `0 0 3px #fff, 0 0 12px ${col}, 0 0 28px ${col}, 0 0 60px ${col}`;
  $('winSub').textContent = `${W.name} est arrivé${W.gender === 'F' ? 'e' : ''} pile sur la dernière case. À ${L.name} de s'exécuter : ${W.name} impose le gage final.`;
  $('goFinal').style.boxShadow = `0 0 28px ${PGLOW[S.winner]}, 6px 6px 0 ${col}`;
}
function renderFinal() {
  const W = S.players[S.winner], L = other(S.winner);
  $('finalSub').textContent = S.finalStep === 'show' ? `Pour ${L.name}, imposé par ${W.name}` : `${W.name}, choisis le gage final de ${L.name}.`;
  $('finalPick').style.display = S.finalStep === 'pick' ? 'flex' : 'none';
  $('finalShow').style.display = S.finalStep === 'show' ? 'flex' : 'none';
  $('finalEnd').style.display = S.finalStep === 'end' ? 'flex' : 'none';
  const custom = $('finalCustom').value.trim();
  $('finalOptions').innerHTML = finals().map((t, i) => `<button type="button" class="final-opt${!custom && S.finalPick === i ? ' on' : ''}" data-final="${i}">${esc(t)}</button>`).join('');
}

let toastQ = Promise.resolve();
function toast(title, text, color) {
  $('toastTitle').textContent = title;
  $('toastTitle').style.textShadow = `0 0 8px ${color}, 0 0 22px ${color}`;
  $('toastText').textContent = text;
  $('toastBox').style.borderColor = color;
  $('toastBox').style.boxShadow = `0 0 34px ${color}, inset 0 0 20px rgba(0,0,0,.5)`;
  $('toast').classList.add('on');
  return wait(2000).then(() => { $('toast').classList.remove('on'); return wait(150); });
}

// ---------- Plateau ----------
function ensureBoard() {
  if (!boardReady) {
    boardReady = createBoard($('stage'), {
      count: COUNT,
      typeAt: n => TILES[n],
      levelColorAt: () => '#e46cff',
      types: TY,
      playerColors: PCOL,
    }).then(b => {
      board = b;
      syncInsets();
      b.placePawns(S.players.map(p => p.pos));
      renderHud();
      return b;
    }).catch(err => {
      console.error(err);
      $('stage').innerHTML = '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:40px;text-align:center;font-weight:800;color:#cfc8d3">La 3D ne peut pas démarrer sur cet appareil (WebGL indisponible).</div>';
      return null;
    });
  }
  return boardReady;
}
function syncInsets() {
  if (!board) return;
  const top = document.querySelector('.hud-top').getBoundingClientRect().bottom;
  const bottom = window.innerHeight - document.querySelector('.hud-bottom').getBoundingClientRect().top;
  board.setInsets(top + 8, bottom + 8);
}
window.addEventListener('resize', () => requestAnimationFrame(syncInsets));

// ---------- Déroulé d'un tour ----------
async function moveTo(p, to) {
  while (S.players[p].pos !== to) {
    const d = to > S.players[p].pos ? 1 : -1;
    S.players[p].pos += d;
    renderHud();
    if (board) await board.hopPawn(p, S.players[p].pos); else await wait(230);
  }
}
function endTurn() {
  clearInterval(timerIv);
  S.turn = 1 - S.turn; S.busy = false; S.card = null; S.timerRunning = false;
  modal(null);
  renderHud();
}
function openCard(type, level, p, given) {
  clearInterval(timerIv);
  S.card = makeCard(type, level, p, given);
  S.timerLeft = S.timerTotal = S.card.dur; S.timerRunning = false;
  renderCard();
  modal('mCard');
}

async function roll() {
  if (S.busy) return;
  S.busy = true; renderHud();
  const v = 1 + Math.floor(Math.random() * 6);
  if (board) await board.rollDie(v); else await wait(900);
  await wait(300);
  const p = S.turn, from = S.players[p].pos, target = from + v, name = S.players[p].name;
  if (target <= COUNT) await moveTo(p, target);
  else {
    await moveTo(p, COUNT);
    const over = target - COUNT, need = COUNT - from;
    await toast('Dépassement !', `Il fallait faire ${need} pour arriver pile. ${name} recule de ${over} case${over > 1 ? 's' : ''} → case ${COUNT - over}.`, '#ffd23f');
    await moveTo(p, COUNT - over);
  }
  await wait(250);
  resolve(p, false);
}

async function resolve(p, chained) {
  const pl = S.players[p], pos = pl.pos, type = TILES[pos], lvl = levelAt(pos);
  if (pos === COUNT) { await wait(400); S.busy = false; S.winner = p; S.finalStep = 'pick'; S.finalPick = 0; $('finalCustom').value = ''; show('win'); return; }
  if (type === 'A' || type === 'V') return openCard(type, lvl, p, false);
  if (type === 'C') {
    if (lvl === 'hot') return openCard('A', lvl, p, false);
    S.choiceFor = p; S.choiceGiven = false; renderChoice(); return modal('mChoice');
  }
  if (chained) return endTurn();
  if (type === 'J') {
    $('jokerText').textContent = `${pl.name}, tu tombes sur un joker. Que veux-tu en faire ?`;
    $('jokerGiveSub').textContent = lvl === 'hot' ? `${other(p).name} reçoit une action.` : `${other(p).name} reçoit un gage, tu choisis action ou vérité.`;
    return modal('mJoker');
  }
  if (type === 'R') {
    const to = Math.max(1, pos - 3);
    await toast('Recul !', `${pl.name} recule de 3 cases → case ${to}.`, '#ff7a4a');
    await moveTo(p, to);
    await wait(200);
    return resolve(p, true);
  }
  if (type === 'E') {
    const o = other(p);
    await toast('Échange !', `${pl.name} et ${o.name} échangent leurs places.`, '#c79bff');
    [S.players[0].pos, S.players[1].pos] = [S.players[1].pos, S.players[0].pos];
    if (board) await board.swapPawns();
    renderHud();
    await wait(200);
    return endTurn();
  }
  if (type === 'B') { await toast('Bonus !', `${pl.name} relance le dé.`, '#ffa53d'); S.busy = false; return renderHud(); }
  endTurn();
}

function toggleTimer() {
  clearInterval(timerIv);
  if (S.timerRunning) { S.timerRunning = false; return renderTimer(); }
  if (S.timerLeft === 0) S.timerLeft = S.timerTotal;
  S.timerRunning = true;
  renderTimer();
  timerIv = setInterval(() => {
    S.timerLeft -= 1;
    if (S.timerLeft <= 0) {
      S.timerLeft = 0; S.timerRunning = false; clearInterval(timerIv);
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    }
    renderTimer();
  }, 1000);
}

function resetGame() {
  clearInterval(timerIv);
  S.turn = 0; S.busy = false; S.card = null;
  S.players.forEach((p, i) => { p.name = p.name.trim() || `Joueur ${i + 1}`; p.pos = 1; p.jokers = 0; });
  modal(null);
  show('board');
  ensureBoard().then(b => { if (b) { b.setLevels(); b.placePawns([1, 1]); } renderHud(); });
  renderHud();
}

// ---------- Événements ----------
document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.go) { clearInterval(timerIv); modal(null); S.busy = false; return show(t.dataset.go); }
  if (t.dataset.g) { S.players[+t.dataset.g[0]].gender = t.dataset.g[1]; return syncSetup(); }
  if (t.dataset.lvl) { S.fixedLevel = t.dataset.lvl; return syncSetup(); }
  if (t.dataset.final) { S.finalPick = +t.dataset.final; $('finalCustom').value = ''; return renderFinal(); }
});
document.addEventListener('input', e => {
  const i = e.target.dataset && e.target.dataset.name;
  if (i !== undefined) { S.players[+i].name = e.target.value; syncSetup(); }
  if (e.target.id === 'finalCustom') renderFinal();
});
$('modeProg').onclick = () => { S.mode = 'progressif'; syncSetup(); };
$('modeFixe').onclick = () => { S.mode = 'fixe'; syncSetup(); };
$('startGame').onclick = resetGame;
$('rematch').onclick = resetGame;
$('roll').onclick = roll;
$('pickA').onclick = () => openCard('A', levelAt(S.players[S.turn].pos), S.choiceFor, S.choiceGiven);
$('pickV').onclick = () => openCard('V', levelAt(S.players[S.turn].pos), S.choiceFor, S.choiceGiven);
$('keepJoker').onclick = async () => {
  S.players[S.turn].jokers += 1; modal(null); renderHud();
  await toast('Joker gardé', 'Il annulera ton prochain gage.', '#ffd23f');
  endTurn();
};
$('giveGage').onclick = () => {
  const lvl = levelAt(S.players[S.turn].pos);
  S.choiceFor = 1 - S.turn; S.choiceGiven = true;
  if (lvl === 'hot') return openCard('A', lvl, S.choiceFor, true);
  renderChoice(); modal('mChoice');
};
$('cardDone').onclick = endTurn;
$('timerBtn').onclick = toggleTimer;
$('useJoker').onclick = async () => {
  const p = S.card.player;
  clearInterval(timerIv);
  S.players[p].jokers -= 1; S.card = null; modal(null); renderHud();
  await toast('Joker !', `${S.players[p].name} échappe à ce gage.`, '#ffd23f');
  endTurn();
};
$('openLegend').onclick = () => {
  $('legendList').innerHTML = ['A', 'V', 'C', 'J', 'R', 'E', 'B', 'F'].map(k => {
    const t = TY[k];
    return `<div class="leg"><span class="leg-ic${t.font === 'script' ? ' script' : ''}" style="color:${t.color}; text-shadow:0 0 6px ${t.color}">${t.glyph}</span><div><b>${t.label}</b><span>${t.desc}</span></div></div>`;
  }).join('');
  $('mLegend').classList.add('on');
};
$('closeLegend').onclick = () => $('mLegend').classList.remove('on');
$('mLegend').onclick = e => { if (e.target.id === 'mLegend') $('mLegend').classList.remove('on'); };
$('goFinal').onclick = () => { S.finalStep = 'pick'; show('final'); };
$('imposeFinal').onclick = () => {
  $('finalText').textContent = $('finalCustom').value.trim() || finals()[S.finalPick];
  S.finalStep = 'show'; renderFinal();
};
$('finalDone').onclick = () => { S.finalStep = 'end'; renderFinal(); };

// Aperçu direct d'un écran : index.html#board, #win…
const start = location.hash.slice(1);
if (['setup', 'board', 'win', 'final'].includes(start)) {
  if (start === 'board') resetGame(); else show(start);
} else show('home');
