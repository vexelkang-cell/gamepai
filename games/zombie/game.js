'use strict';
/* DEAD CITY - LAST SURVIVOR | TAHAP 1: Fondasi Isometric Engine
   Dunia = koordinat tile (x,y). Layar = toS(x,y). Semua logika (gerak, collision,
   AI, proyektil, bidik) berjalan di koordinat dunia; isometrik hanya lewat toS/toW. */
(() => {
const cfg = loadCfg(); let ZA = 1, ZS = 1;
const TW = 64, TH = 32, HW = 32, HH = 16, N = 96, P = 14;
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
let W = 0, H = 0, dpr = 1;
function resize() {
  dpr = Math.min(devicePixelRatio || 1, matchMedia('(pointer:coarse)').matches ? 1.25 : 1.5); W = innerWidth; H = innerHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
}
addEventListener('resize', resize); resize();

// ---------- util: konversi isometrik ----------
const toS = (x, y) => [(x - y) * HW, (x + y) * HH];            // dunia -> layar
const toW = (sx, sy) => [(sx / HW + sy / HH) / 2, (sy / HH - sx / HW) / 2]; // layar -> dunia
let seed = 1337;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- peta: 0 jalan, 1 rumput, 2 dinding, 3 pohon, 4 lantai, 5 mobil ----------
const map = new Uint8Array(N * N);
const T = (x, y) => (x < 0 || y < 0 || x >= N || y >= N) ? 2 : map[y * N + x];
const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < N && y < N) map[y * N + x] = v; };
const solid = t => t === 2 || t === 3 || t === 5 || (t >= 6 && t !== 10 && t < 16);
const ZC = [['#6e5f43', '#756548'], ['#5b4a36', '#62503a'], ['#6d5a3a', '#75623f'], ['#4d3a3a', '#553f3f']];
const ZNAME = ['Perkemahan Aman', 'Padang Rumput', 'Tanah Tandus', 'Zona Merah'];
const zoneAt = (x, y) => { const d = Math.hypot(x - N / 2, y - N / 2); return d < 9 ? 0 : d < 24 ? 1 : d < 38 ? 2 : 3; };
(function gen() { // dunia luas: hamparan tanah dengan 4 zona, hanya pohon
  for (let i = 0; i < N * N; i++) map[i] = 1;
  const dens = [0.015, 0.07, 0.045, 0.08];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (rnd() < dens[zoneAt(x, y)] && Math.hypot(x - N / 2, y - N / 2) > 3.5) set(x, y, 3);
  for (let i = 0; i < N; i++) { set(i, 0, 3); set(i, N - 1, 3); set(0, i, 3); set(N - 1, i, 3); }
})();
const blocked = (x, y, r) => solid(T(Math.floor(x - r), Math.floor(y - r))) || solid(T(Math.floor(x + r), Math.floor(y - r))) ||
  solid(T(Math.floor(x + r), Math.floor(y + r))) || solid(T(Math.floor(x - r), Math.floor(y + r)));
function move(e, dx, dy) { if (!blocked(e.x + dx, e.y, e.r)) e.x += dx; if (!blocked(e.x, e.y + dy, e.r)) e.y += dy; }
function los(ax, ay, bx, by) { // garis pandang: hanya dinding (tipe 2) menghalangi
  const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 0.4);
  for (let i = 1; i < n; i++) { const t = i / n; { const q = T(Math.floor(ax + (bx - ax) * t), Math.floor(ay + (by - ay) * t)); if (q === 2 || q === 6 || q === 7) return false; } }
  return true;
}

// ---------- entitas ----------
const WPN = [
  { n: 'Pistol 9mm', gun: true, dmg: 34, cd: 0.28, mag: 12, rl: 1.1, spread: 0.04, range: 14, noise: 16 },
  { n: 'Pisau', gun: false, dmg: 42, cd: 0.5, range: 1.5, noise: 3 }
];
const ZT = {
  walker: { hp: 60, sp: 1.1, ch: 1.9, dmg: 10, col: '#6f8a5a', vis: 7, windup: 0.5, reach: 0.85, r: 0.3, sc: 1 },
  runner: { hp: 45, sp: 1.5, ch: 4.3, dmg: 8, col: '#9a6a55', vis: 10, windup: 0.3, reach: 0.85, r: 0.28, sc: 0.95 },
  brute: { hp: 300, sp: 0.8, ch: 1.5, dmg: 28, col: '#5d4f6a', vis: 7, windup: 0.8, reach: 1.2, r: 0.45, sc: 1.6 },
  screamer: { hp: 40, sp: 1.2, ch: 2.4, dmg: 5, col: '#a79a6a', vis: 13, windup: 0.5, reach: 0.85, r: 0.28, sc: 0.9 },
  bloater: { hp: 120, sp: 0.8, ch: 1.3, dmg: 7, col: '#7f9a3a', vis: 6, windup: 0.6, reach: 0.95, r: 0.4, sc: 1.3 }
};
let pl, zs, bullets, over, mouse = { x: 0, y: 0, down: false };
let loot = [], fx = [], gas = [], decals = [], inv = { money: 0, g: [] };
const RAR = [['Common', '#b8b8b8'], ['Uncommon', '#4fc36a'], ['Rare', '#4a8fe0'], ['Epic', '#a55be0'], ['Legendary', '#f0a030']];
const LT = { // tabel loot per jenis zombie
  walker: [['mat', 'Kain'], ['food', 'Makanan Busuk'], ['money', 'Uang'], ['mat', 'Komponen Kecil'], ['food', 'Air Minum'], ['food', 'Makanan Kaleng']],
  runner: [['med', 'Bahan Medis'], ['ammo', 'Amunisi'], ['mat', 'Perlengkapan Kecil'], ['food', 'Air Minum']],
  brute: [['mat', 'Material Langka'], ['armor', 'Armor'], ['mat', 'Komponen Senjata']],
  screamer: [['mat', 'Komponen Elektronik'], ['mat', 'Bahan Kimia']],
  bloater: [['mat', 'Bahan Kimia'], ['mat', 'Zat Infeksi'], ['mat', 'Komponen Langka']] };
const LB = { walker: 0, runner: 0.5, brute: 2, screamer: 1, bloater: 1 };
function startGame() { if (over) clearSave();
  pl = { x: N / 2 + 2, y: N / 2 + 2, onTower: null, r: 0.28, hp: 100, st: 100, ang: 0, wpn: 0, ammo: 12, res: 60, rl: 0, cd: 0, dash: 0, dvx: 0, dvy: 0, hurt: 0, stDelay: 0, mv: 0, armor: 0, kills: 0 };
  zs = []; bullets = []; over = false; loot = []; fx = []; gas = []; decals = []; inv = { money: 0, g: new Array(40).fill(null) }; initKit();
  while (zs.length < ZN) {
    const x = rnd() * N, y = rnd() * N;
    if (solid(T(x | 0, y | 0)) || Math.hypot(x - pl.x, y - pl.y) < 12) continue;
    const zn = zoneAt(x, y); if (zn === 0) continue; const type = pickType(zn, rnd());
    zs.push({ x, y, r: ZT[type].r, t: ZT[type], type, hp: ZT[type].hp, s: 'idle', tm: rnd() * 3, px: x, py: y, lx: x, ly: y, lost: 0,
      cd: 0, wind: 0, a: 0, hit: 0, steer: 0, steerT: 0, stuck: 0, ox: x, oy: y });
  }
  document.getElementById('over').style.display = 'none';
}
function hurtPlayer(d, z) { if (pl.dash > 0 || over || pl.onTower) return; d *= DM[cfg.diff]; const A = pl.eq[3]; if (A && A.val > 0) { const ab = Math.min(A.val, d * 0.5); A.val -= ab; d -= ab; if (A.val <= 0) pl.eq[3] = null; } pl.hp -= d; pl.hurt = 0.25; snd.hurt(); if (z) { pl.inf = Math.min(100, pl.inf + (z.type === 'brute' ? 3 : 6)); if (Math.random() < (z.type === 'brute' ? 0.6 : 0.3)) pl.bleed = 1; }
  if (pl.hp <= 0) { pl.hp = 0; over = true; document.getElementById('over').style.display = 'flex'; } }
function noise(x, y, r) { r *= (1 - pl.sk.t * 0.08) * cfg.aggr; for (const z of zs) if ((z.s === 'idle' || z.s === 'patrol' || z.s === 'search') && Math.hypot(z.x - x, z.y - y) < r) {
  z.s = 'search'; z.lx = x; z.ly = y; } }

// ---------- AI zombie: idle, patrol, detect, chase, attack, search last known, return to patrol ----------
function go(z, tx, ty, sp, dt) {
  const d = Math.hypot(tx - z.x, ty - z.y); if (d < 0.15) return d;
  const a = Math.atan2(ty - z.y, tx - z.x) + z.steer; z.a = a;
  const sm = z.s === 'chase' ? ZS : 1; move(z, Math.cos(a) * sp * sm * dt, Math.sin(a) * sp * sm * dt);
  if (z.s === 'chase' || z.s === 'search') { const bx = (z.x + Math.cos(a) * (z.r + 0.3)) | 0, by = (z.y + Math.sin(a) * (z.r + 0.3)) | 0; // zombie merusak bangunan pemain
    if (HIT.has(T(bx, by))) { z.bt = (z.bt || 0) + dt; if (z.bt > 0.8) { z.bt = 0; hitStruct(bx, by, z.t.dmg * (z.type === 'brute' ? 3 : 1)); } } }
  z.stuck += dt; if (z.stuck > 0.3) { // deteksi tersangkut -> belok sementara
    if (Math.hypot(z.x - z.ox, z.y - z.oy) < sp * 0.12) { z.steer = (rnd() < 0.5 ? -1 : 1) * 1.3; z.steerT = 0.6; }
    z.ox = z.x; z.oy = z.y; z.stuck = 0; }
  if ((z.steerT -= dt) <= 0) z.steer = 0;
  return d;
}
function updZ(z, dt) {
  const d = Math.hypot(pl.x - z.x, pl.y - z.y);
  const see = !over && d < z.t.vis * (1 - pl.sk.t * 0.05) * ZA && los(z.x, z.y, pl.x, pl.y);
  z.hit = Math.max(0, z.hit - dt); z.cd = Math.max(0, z.cd - dt); z.scd = Math.max(0, (z.scd || 0) - dt);
  if (see && (z.s === 'idle' || z.s === 'patrol' || z.s === 'search')) { z.s = 'chase'; z.lost = 0; }
  if (see && z.s === 'chase') { z.lx = pl.x; z.ly = pl.y; z.lost = 0; }
  switch (z.s) {
    case 'idle': if ((z.tm -= dt) <= 0) { // pilih titik patroli
      for (let k = 0; k < 8; k++) { const x = z.x + (rnd() - 0.5) * 12, y = z.y + (rnd() - 0.5) * 12;
        if (!solid(T(x | 0, y | 0))) { z.px = x; z.py = y; break; } } z.s = 'patrol'; z.tm = 6; } break;
    case 'patrol': if (go(z, z.px, z.py, z.t.sp, dt) < 0.3 || (z.tm -= dt) <= 0) { z.s = 'idle'; z.tm = 1 + rnd() * 3; } break;
    case 'chase':
      go(z, z.lx, z.ly, z.t.ch, dt);
      if (!see && (z.lost += dt) > 2.5) { z.s = 'search'; }
      if (see && z.type === 'screamer' && z.scd <= 0) { z.s = 'scream'; z.wind = 1.1; break; }
      if (see && z.type === 'runner' && d < 2.8 && d > 1.1 && z.cd <= 0) { z.s = 'lunge'; z.wind = 0.28; z.hd = false; z.a = Math.atan2(pl.y - z.y, pl.x - z.x); break; }
      if (see && d < z.t.reach && z.cd <= 0) { z.s = 'attack'; z.wind = z.t.windup; z.a = Math.atan2(pl.y - z.y, pl.x - z.x); }
      break;
    case 'search': if (go(z, z.lx, z.ly, z.t.sp * 1.3, dt) < 0.3) { z.s = 'idle'; z.tm = 2; } break; // lalu kembali patroli
    case 'attack': if ((z.wind -= dt) <= 0) { const R = z.type === 'brute' ? 1.9 : z.t.reach + 0.3; if (d < R) hurtPlayer(z.t.dmg, z); // brute: damage area
      if (z.type === 'brute') fx.push({ k: 'ring', x: z.x, y: z.y, t: 0.35, T: 0.35, R: 1.9, col: '210,180,140' });
      z.cd = z.type === 'brute' ? 1.8 : 1.1; z.s = 'chase'; } break;
    case 'scream': if ((z.wind -= dt) <= 0) { fx.push({ k: 'ring', x: z.x, y: z.y, t: 0.9, T: 0.9, R: 6, col: '240,240,200' });
      alertAll(z.x, z.y, 22); snd.scream(z); z.scd = 14; z.s = 'chase'; } break; // jeritan memanggil zombie lain
    case 'lunge': z.wind -= dt; move(z, Math.cos(z.a) * 9 * dt, Math.sin(z.a) * 9 * dt);
      if (!z.hd && d < 0.8) { hurtPlayer(z.t.dmg * 1.4, z); z.hd = true; } if (z.wind <= 0) { z.cd = 1.6; z.s = 'chase'; } break;
  }
}

// ---------- input: PC + Android ----------
const keys = {}; const joy = { on: false, x: 0, y: 0 }; const tch = { atk: false, spr: false };
addEventListener('keydown', e => { const k = e.key.toLowerCase(); keys[k] = true;
  if (k === ' ') { e.preventDefault(); dash(); } if (k === 'r') reload(); if (k === 'q') swap(); if (k >= '1' && k <= '3') swap(+k - 1); if (k === 'h') quickHeal(); if (k === 'g') throwNow(); if (k === 'e') interact(); if (k === 'b') { if (bmode != null) cancelBuild(); else toggleInv(true); } if (k === 'f') { if (bmode != null) placeBuild(); else toggleFlash(); } if (k === 'i' || k === 'tab') { e.preventDefault(); toggleInv(); } if (k === 'escape') { const w = invOpen || mapOpen || bmode != null || menuOpen; toggleInv(false); cancelBuild(); if (menuOpen) toggleMenu(false); else if (!w) toggleMenu(true); } });
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
cv.addEventListener('pointermove', e => { mouse.x = e.clientX; mouse.y = e.clientY; if (bmode != null && buildPointerId === e.pointerId && e.pointerType !== 'mouse') { const w = toW(e.clientX - W / 2 + cam.x, e.clientY - H / 2 + cam.y); buildTarget = [Math.floor(w[0]), Math.floor(w[1])]; } });
cv.addEventListener('pointerdown', e => { mouse.x = e.clientX; mouse.y = e.clientY; if (over) { startGame(); return; }
  if (e.pointerType === 'mouse' && e.button === 2) { if (bmode != null) { cancelBuild(); return; } swap(); return; }
  if (bmode != null && e.pointerType !== 'mouse') { buildPointerId = e.pointerId; try { cv.setPointerCapture(e.pointerId); } catch (_) {} const w = toW(e.clientX - W / 2 + cam.x, e.clientY - H / 2 + cam.y); buildTarget = [Math.floor(w[0]), Math.floor(w[1])]; msg('Lokasi dipilih — geser jari untuk mengatur posisi, lalu tekan PASANG', '#6cf'); return; }
  if (e.pointerType === 'mouse') { if (bmode != null) { placeBuild(); return; } mouse.down = true; } });
addEventListener('pointerup', e => { mouse.down = false; if (buildPointerId === e.pointerId) buildPointerId = null; });
addEventListener('pointercancel', e => { if (buildPointerId === e.pointerId) buildPointerId = null; });
cv.addEventListener('contextmenu', e => e.preventDefault());
document.getElementById('over').addEventListener('pointerdown', () => startGame());
if ('ontouchstart' in window || matchMedia('(pointer:coarse)').matches) document.body.classList.add('t');
(function touchUI() {
  const j = document.getElementById('joy'), k = document.getElementById('knob'); let id = null;
  const upd = e => { const r = j.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = (e.clientX - cx) / 55, dy = (e.clientY - cy) / 55, m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
    joy.x = dx; joy.y = dy; k.style.transform = `translate(${dx * 40}px,${dy * 40}px)`; };
  j.addEventListener('pointerdown', e => { id = e.pointerId; j.setPointerCapture(id); joy.on = true; upd(e); });
  j.addEventListener('pointermove', e => { if (e.pointerId === id) upd(e); });
  const end = e => { if (e.pointerId === id) { id = null; joy.on = false; joy.x = joy.y = 0; k.style.transform = ''; } };
  j.addEventListener('pointerup', end); j.addEventListener('pointercancel', end);
  const btn = (el, on, off) => { const b = document.getElementById(el);
    b.addEventListener('pointerdown', e => { e.preventDefault(); b.classList.add('on'); on(); });
    const u = () => { b.classList.remove('on'); if (off) off(); };
    b.addEventListener('pointerup', u); b.addEventListener('pointercancel', u); b.addEventListener('pointerleave', u); };
  btn('bAtk', () => { if (over) startGame(); tch.atk = true; }, () => tch.atk = false);
  btn('bSpr', () => tch.spr = true, () => tch.spr = false);
  btn('bRel', reload); btn('bDash', dash); btn('bWpn', swap);
})();

function reload() { const it = cw(); if (!it || !WD[it.key].gun || pl.rl > 0 || it.dur <= 0) return; const e = eff(it); if (it.ammo >= e.mag || cnt(WD[it.key].ammo) <= 0) return; pl.rl = e.rl; pl.rlw = it; snd.reload(); }
function swap(n) { const o = pl.cur; if (n == null) for (let i = 1; i <= 3; i++) { const j = (o + i) % 3; if (pl.eq[j]) { n = j; break; } } if (n == null || !pl.eq[n] || n === o) return; pl.cur = n; pl.rl = 0; pl.cd = 0.25; }
function dash() { if (over || pl.dash > 0 || pl.st < 25) return; pl.st -= 25; pl.stDelay = 1;
  pl.dash = 0.18; snd.swing(); const a = pl.mv ? pl.mvA : pl.ang; pl.dvx = Math.cos(a); pl.dvy = Math.sin(a); }
function attack() {
  const it = cw(); if (!it || pl.cd > 0 || pl.rl > 0 || pl.dash > 0 || invOpen || bmode != null) return;
  const d = WD[it.key], e = eff(it), highGround = pl.onTower ? 1.5 : 1;
  if (it.dur <= 0) { msg('Senjata rusak!', '#e55'); pl.cd = 0.6; return; }
  if (d.gun) {
    if (it.ammo <= 0) { reload(); if (pl.rl <= 0) msg('Tidak ada peluru ' + d.ammo, '#e55'); pl.cd = 0.5; return; }
    it.ammo--; it.dur--; pl.cd = e.cd;
    for (let i = 0; i < (d.pel || 1); i++) { const a = pl.ang + (Math.random() - 0.5) * 2 * (e.sp + pl.rec + (pl.fat || 0) * 0.0004);
      bullets.push({ x: pl.x, y: pl.y, px: pl.x, py: pl.y, vx: Math.cos(a) * (d.spd || 24), vy: Math.sin(a) * (d.spd || 24), life: (e.range * highGround) / (d.spd || 24), dmg: e.dmg }); }
    pl.rec = Math.min(0.25, pl.rec + e.rec); noise(pl.x, pl.y, e.noise); snd.shot(e.noise / 30); if (it.ammo === 0) reload();
  } else {
    pl.cd = e.cd; it.dur--; noise(pl.x, pl.y, e.noise); pl.swing = 0.15; snd.swing();
    for (const z of zs.slice()) { const dx = z.x - pl.x, dy = z.y - pl.y, dd = Math.hypot(dx, dy); if (dd > e.range * highGround) continue;
      let da = Math.atan2(dy, dx) - pl.ang; da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) < 0.9 && los(pl.x, pl.y, z.x, z.y)) damageZ(z, e.dmg, dx / dd, dy / dd); }
  }
}
function damageZ(z, d, nx, ny, head) {
  const crit = Math.random() < 0.1 + pl.sk.c * 0.02, dm = Math.round(d * (1 + pl.sk.c * 0.05) * (head ? 2 : 1) * (crit ? 1.5 : 1) * (0.9 + Math.random() * 0.2));
  z.hp -= dm; z.hit = 0.6; snd.hit(z); if (z.t.sc < 1.3) move(z, nx * 0.25, ny * 0.25);
  fx.push({ k: 'num', x: z.x, y: z.y, t: 0.8, txt: (head ? 'HEADSHOT ' : crit ? 'CRIT ' : '') + dm, col: head ? '#ff5a3c' : crit ? '#ffd23c' : '#fff' });
  for (let i = 0; i < 5; i++) fx.push({ k: 'blood', x: z.x, y: z.y, vx: nx * 2 + (Math.random() - 0.5) * 3, vy: ny * 2 + (Math.random() - 0.5) * 3, t: 0.5 });
  if (z.s === 'idle' || z.s === 'patrol' || z.s === 'search') { z.s = 'chase'; z.lx = pl.x; z.ly = pl.y; z.lost = 0; }
  if (z.hp <= 0) killZ(z);
}
function addDecal(x, y, r) { decals.push({ x, y, r }); if (decals.length > 160) decals.shift(); }
function killZ(z) {
  zs.splice(zs.indexOf(z), 1); pl.kills++; onKill(z); corpses.push({ x: z.x, y: z.y, type: z.type, a: z.a, t: 0, col: z.t.col, v: z.vr || 0 }); if (corpses.length > 30) corpses.shift(); addDecal(z.x, z.y, 10 + Math.random() * 6);
  for (let i = 0; i < 10; i++) fx.push({ k: 'blood', x: z.x, y: z.y, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4, t: 0.6 });
  if (z.type === 'bloater') { gas.push({ x: z.x, y: z.y, r: 2.5, t: 7 }); fx.push({ k: 'ring', x: z.x, y: z.y, t: 0.6, T: 0.6, R: 2.5, col: '130,210,60' }); noise(z.x, z.y, 10); }
  dropLoot(z);
}
function alertAll(x, y, r) { for (const o of zs) if (Math.hypot(o.x - x, o.y - y) < r && o.s !== 'attack' && o.s !== 'lunge' && o.s !== 'scream') { o.s = 'chase'; o.lx = pl.x; o.ly = pl.y; o.lost = 0; } }
function rollRar(b) { const x = Math.random() * 100, k = 1 + b * 0.6; return x < k ? 4 : x < 5 * k ? 3 : x < 15 * k ? 2 : x < 40 * k ? 1 : 0; }
function dropLoot(z) {
  if (Math.random() > (z.type === 'brute' ? 1 : 0.75) * LM()) return;
  const n = (z.type === 'brute' ? 2 : 1) + (Math.random() < 0.25 ? 1 : 0), tb = LT[z.type];
  for (let i = 0; i < n; i++) { const [kind, name] = tb[(Math.random() * tb.length) | 0], rar = rollRar(LB[z.type] + zoneAt(z.x, z.y) * 0.5);
    const amt = kind === 'money' ? Math.round(5 + rar * 12 + Math.random() * 10) : kind === 'ammo' ? 4 + rar * 4 : kind === 'armor' ? 10 + rar * 6 : 1;
    loot.push({ x: z.x + (Math.random() - 0.5) * 0.9, y: z.y + (Math.random() - 0.5) * 0.9, kind, name, rar, amt }); }
  if (Math.random() < (z.type === 'brute' ? 0.3 : 0.07)) { const w = Math.random() < 0.55, keys = w ? WKEYS : Object.keys(AD), key = keys[(Math.random() * keys.length) | 0];
    loot.push({ x: z.x, y: z.y, kind: w ? 'weapon' : 'att', key, rar: rollRar(LB[z.type] + 1), name: key }); }
  if (loot.length > 120) loot.splice(0, loot.length - 120);
}
function msg(t, c) { const f = document.getElementById('feed'), d = document.createElement('div'); d.textContent = t; d.style.color = c; f.appendChild(d);
  setTimeout(() => d.remove(), 2600); while (f.children.length > 5) f.firstChild.remove(); }
// ================= TAHAP 3: SENJATA, AMUNISI, ATTACHMENT, INVENTORY =================
const CAP = 25;
const WD = {
  pistol: { n: 'Pistol 9mm', ic: 'P9', gun: 1, ammo: '9mm', dmg: 34, cd: 0.28, mag: 12, rl: 1.1, sp: 0.04, rec: 0.03, range: 14, dur: 150, w: 1.2, noise: 16, slots: ['optic', 'muzzle', 'mag', 'under'] },
  revolver: { n: 'Revolver', ic: 'RV', gun: 1, ammo: '.357', dmg: 58, cd: 0.65, mag: 6, rl: 2, sp: 0.025, rec: 0.06, range: 16, dur: 130, w: 1.4, noise: 20, slots: ['optic', 'muzzle', 'under'] },
  shotgun: { n: 'Pump Shotgun', ic: 'SG', gun: 1, ammo: '12g', dmg: 15, pel: 6, cd: 0.9, mag: 6, rl: 2.6, sp: 0.13, rec: 0.1, range: 8, dur: 110, w: 3.4, noise: 24, slots: ['optic', 'muzzle', 'under'] },
  ak: { n: 'AK-47', ic: 'AK', gun: 1, ammo: '7.62', dmg: 30, cd: 0.11, mag: 30, rl: 2.2, sp: 0.07, rec: 0.025, range: 18, dur: 220, w: 4.3, noise: 26, slots: ['optic', 'muzzle', 'mag', 'under'] },
  sniper: { n: 'Sniper Rifle', ic: 'SN', gun: 1, ammo: '7.62', dmg: 115, cd: 1.3, mag: 5, rl: 2.8, sp: 0.006, rec: 0.12, range: 32, dur: 120, w: 5.5, noise: 30, slots: ['optic', 'muzzle', 'mag'] },
  knife: { n: 'Pisau', ic: 'KN', dmg: 42, cd: 0.5, range: 1.5, dur: 200, w: 0.4, noise: 3 },
  axe: { n: 'Kapak', ic: 'AX', dmg: 70, cd: 0.85, range: 1.6, dur: 130, w: 2, noise: 4 },
  bat: { n: 'Tongkat Baseball', ic: 'BT', dmg: 55, cd: 0.7, range: 1.7, dur: 110, w: 1.5, noise: 4 } };
const AD = {
  scope: { n: 'Scope', ic: 'SC', slot: 'optic', range: 1.4, sp: 0.6, d: 'Jarak +40%, tembakan lebih akurat.' },
  reddot: { n: 'Red Dot', ic: 'RD', slot: 'optic', sp: 0.75, d: 'Penyebaran peluru -25%.' },
  silencer: { n: 'Silencer', ic: 'SL', slot: 'muzzle', noise: 0.25, dmg: 0.92, d: 'Suara tembakan -75%, damage -8%.' },
  extmag: { n: 'Extended Magazine', ic: 'EM', slot: 'mag', mag: 1.5, rl: 1.15, d: 'Magasin +50%, reload sedikit lebih lama.' },
  grip: { n: 'Grip', ic: 'GR', slot: 'under', rec: 0.6, sp: 0.92, d: 'Recoil -40%, akurasi sedikit naik.' },
  laser: { n: 'Laser Sight', ic: 'LS', slot: 'under', sp: 0.8, d: 'Penyebaran peluru -20%.' } };
const SN = { optic: 'Optik', muzzle: 'Moncong', mag: 'Magasin', under: 'Bawah' };
const IT = {
  '9mm': { n: 'Peluru 9mm', w: 0.02, st: 60, ic: '9', d: 'Amunisi pistol.' }, '.357': { n: 'Peluru .357', w: 0.03, st: 40, ic: '.357', d: 'Amunisi revolver.' },
  '12g': { n: 'Peluru 12 Gauge', w: 0.05, st: 30, ic: '12G', d: 'Amunisi shotgun.' }, '7.62': { n: 'Peluru 7.62', w: 0.03, st: 60, ic: '762', d: 'Amunisi AK-47 dan sniper.' },
  perban: { n: 'Perban', w: 0.1, st: 5, ic: '+', d: 'Pulihkan 15 HP dan hentikan pendarahan.', heal: 15 }, medkit: { n: 'Medkit', w: 0.8, st: 2, ic: 'MK', d: 'Pulihkan 50 HP, hentikan pendarahan, infeksi -10.', heal: 50 },
  kaleng: { n: 'Makanan Kaleng', w: 0.4, st: 5, ic: 'FD', d: 'Lapar +35, stamina +10.' },
  air: { n: 'Air Minum', w: 0.5, st: 5, ic: 'H2O', d: 'Haus +40.' }, busuk: { n: 'Makanan Busuk', w: 0.3, st: 5, ic: 'XX', d: 'Lapar +15 tapi infeksi +8.' },
  antibiotik: { n: 'Antibiotik', w: 0.1, st: 5, ic: 'AB', d: 'Infeksi -50.' }, repair: { n: 'Repair Kit', w: 0.6, st: 3, ic: 'RK', d: 'Pulihkan 60% durability senjata aktif.' },
  campfire: { n: 'Campfire', w: 2, st: 1, ic: 'CF', d: 'Letakkan: api hangat dan penerangan 3 menit.' }, trap: { n: 'Perangkap', w: 0.8, st: 3, ic: 'TR', d: 'Letakkan: 70 damage saat diinjak zombie.' },
  rompi: { n: 'Rompi Pelindung', w: 3, st: 1, ic: 'AR', d: 'Menyerap 50% damage sampai habis.' } };
let invOpen = false, sel = null, drag = null;
const gid = id => document.getElementById(id);
const cw = () => pl.eq[pl.cur];
const cnt = k => inv.g.reduce((a, s) => a + (s && s.type === 'ammo' && s.key === k ? s.qty : 0), 0);
function takeAmmo(k, n) { let t = 0; for (let i = 0; i < inv.g.length && t < n; i++) { const s = inv.g[i]; if (s && s.type === 'ammo' && s.key === k) { const m = Math.min(s.qty, n - t); s.qty -= m; t += m; if (!s.qty) inv.g[i] = null; } } return t; }
function info(it) {
  if (it.type === 'weapon') { const d = WD[it.key]; return { n: d.n, w: d.w, st: 1, ic: d.ic, d: d.gun ? 'Senjata api. Kaliber ' + d.ammo + '.' : 'Senjata jarak dekat.' }; }
  if (it.type === 'att') { const m = AD[it.key]; return { n: m.n, w: 0.3, st: 1, ic: m.ic, d: m.d }; }
  if (it.type === 'mat') return { n: it.key, w: 0.15, st: 30, ic: 'MT', d: 'Bahan crafting (dipakai di Tahap 4).' };
  return IT[it.key]; }
function mk(type, key, rar, qty) { const it = { type, key, rar, qty: qty || 1 };
  if (type === 'weapon') { const d = WD[key]; it.dur = d.dur; it.att = {}; if (d.gun) it.ammo = d.mag; }
  if (type === 'armor') it.val = 30 + rar * 10; return it; }
function eff(it) { const d = WD[it.key], e = Object.assign({}, d); e.dmg *= 1 + it.rar * 0.06;
  for (const s in it.att) { const m = AD[it.att[s].key]; for (const k of ['sp', 'rec', 'range', 'dmg', 'noise', 'mag', 'rl']) if (m[k] && e[k] != null) e[k] *= m[k]; }
  if (e.mag) e.mag = Math.round(e.mag); return e; }
function curWeight() { let t = 0; for (const it of inv.g) if (it) t += info(it).w * it.qty; for (const it of pl.eq) if (it) t += info(it).w * it.qty; return t; }
function addItem(it) { const st = info(it).st;
  if (st > 1) for (const s of inv.g) if (s && s.type === it.type && s.key === it.key && s.rar === it.rar && s.qty < st) { const n = Math.min(st - s.qty, it.qty); s.qty += n; it.qty -= n; if (!it.qty) return true; }
  const i = inv.g.indexOf(null); if (i < 0) return false; inv.g[i] = it; return true; }
function initKit() { pl.eq = [mk('weapon', 'pistol', 0), null, mk('weapon', 'knife', 0), null]; pl.cur = 0; pl.rec = 0; pl.rl = 0;
  addItem(mk('ammo', '9mm', 0, 36)); addItem(mk('med', 'perban', 0, 2)); addItem(mk('att', 'reddot', 0, 1)); addItem(mk('att', 'extmag', 0, 1)); addItem(mk('att', 'silencer', 0, 1)); addItem(mk('food', 'kaleng', 0, 1)); addItem(mk('food', 'air', 0, 1)); addItem(mk('mat', 'Kain', 0, 2)); addItem(mk('throw', 'molotov', 0, 1)); initSurv(); }
function collect(l) { const r = RAR[l.rar]; let it;
  if (l.item) it = l.item;
  else if (l.kind === 'money') { inv.money += l.amt; msg('+$' + l.amt, r[1]); snd.loot(); return true; }
  else if (l.kind === 'ammo') { const q = Math.random(); it = mk('ammo', q < 0.4 ? '9mm' : q < 0.55 ? '12g' : q < 0.7 ? '7.62' : q < 0.85 ? '5.56' : '.357', l.rar, l.amt); }
  else if (l.kind === 'med') it = mk('med', l.rar >= 3 ? 'antibiotik' : l.rar >= 2 ? 'medkit' : 'perban', l.rar, 1);
  else if (l.kind === 'food') it = mk('food', l.name === 'Air Minum' ? 'air' : l.name === 'Makanan Busuk' ? 'busuk' : 'kaleng', l.rar, 1);
  else if (l.kind === 'armor') it = mk('armor', 'rompi', l.rar, 1);
  else if (l.kind === 'throw') it = mk(l.key === 'landmine' ? 'place' : 'throw', l.key, l.rar, 1 + (Math.random() < 0.5 ? 1 : 0));
  else if (l.kind === 'weapon' || l.kind === 'att') it = mk(l.kind, l.key, l.rar, 1);
  else it = mk('mat', l.name, l.rar, 1);
  const n = it.qty, nm = info(it).n;
  if (!addItem(it)) { if (!pl.fullT || pl.fullT < performance.now()) { msg('Inventory penuh!', '#e55'); pl.fullT = performance.now() + 1500; } return false; }
  msg('+' + n + ' ' + nm + ' [' + r[0] + ']', r[1]); if (!l.item) qnote(it, n); snd.loot(); return true; }
const getRef = r => r.k === 'g' ? inv.g[r.i] : r.k === 's' ? stash[r.i] : pl.eq[r.i];
const setRef = (r, v) => { if (r.k === 'g') inv.g[r.i] = v; else if (r.k === 's') stash[r.i] = v; else pl.eq[r.i] = v; };
function fits(r, it) { if (!it || r.k !== 'e') return true; if (r.i === 3) return it.type === 'armor'; if (it.type !== 'weapon') return false; return r.i === 2 ? !WD[it.key].gun : !!WD[it.key].gun; }
function moveItem(a, b) { if (a.k === b.k && a.i === b.i) return; const A = getRef(a), B = getRef(b); if (!A) return;
  if (!fits(b, A) || !fits(a, B)) { msg('Tidak bisa dipasang di slot itu', '#e55'); return; }
  if (B && A.type === B.type && A.key === B.key && A.rar === B.rar && info(A).st > 1) { const n = Math.min(info(A).st - B.qty, A.qty); B.qty += n; A.qty -= n; if (!A.qty) setRef(a, null); }
  else { setRef(b, A); setRef(a, B); }
  if (a.k === 'e' || b.k === 'e') { pl.rl = 0; if (!pl.eq[pl.cur]) for (let j = 0; j < 3; j++) if (pl.eq[j]) { pl.cur = j; break; } }
  sel = b; }
function dec(r) { const it = getRef(r); if (--it.qty <= 0) setRef(r, null); }
function useItem(r) { const it = getRef(r); if (!it) return false; const K = it.key;
  if (K === 'perban') { pl.hp = Math.min(100, pl.hp + 15); pl.bleed = 0; msg('Perban: +15 HP, pendarahan berhenti', '#6c6'); }
  else if (K === 'medkit') { pl.hp = Math.min(100, pl.hp + 50); pl.bleed = 0; pl.inf = Math.max(0, pl.inf - 10); msg('Medkit: +50 HP', '#6c6'); }
  else if (K === 'antibiotik') { pl.inf = Math.max(0, pl.inf - 50); msg('Infeksi berkurang', '#6c6'); }
  else if (K === 'kaleng') { pl.hun = Math.min(100, pl.hun + 35); pl.st = Math.min(100, pl.st + 10); msg('Makan: lapar +35', '#6c6'); }
  else if (K === 'air') { pl.thr = Math.min(100, pl.thr + 40); msg('Minum: haus +40', '#6c6'); }
  else if (K === 'busuk') { pl.hun = Math.min(100, pl.hun + 15); pl.inf = Math.min(100, pl.inf + 8); msg('Makanan busuk: infeksi +8', '#e95'); }
  else if (K === 'repair') { const g = cw(); if (!g || g.dur >= WD[g.key].dur) { msg('Senjata aktif tidak perlu diperbaiki', '#e55'); return false; } g.dur = Math.min(WD[g.key].dur, g.dur + WD[g.key].dur * 0.6); msg('Senjata diperbaiki', '#6c6'); }
  else if (K === 'molotov' || K === 'grenade') { pl.thSel = K; msg('Lemparan dipilih: ' + IT[K].n + ' (tekan G / tombol LEMPAR)', '#ffd86b'); return false; }
  else if (K === 'landmine') { const px = pl.x + Math.cos(pl.ang), py = pl.y + Math.sin(pl.ang), ok = !blocked(px, py, 0.2); objs.push({ k: 'mine', x: ok ? px : pl.x, y: ok ? py : pl.y, t: 1e9 }); msg('Landmine dipasang (aktif untuk zombie)', '#6c6'); }
  else if (K === 'campfire' || K === 'trap') { const px = pl.x + Math.cos(pl.ang), py = pl.y + Math.sin(pl.ang), ok = !blocked(px, py, 0.2);
    objs.push({ k: K === 'trap' ? 'trap' : 'fire', x: ok ? px : pl.x, y: ok ? py : pl.y, t: K === 'trap' ? 1e9 : 180 }); msg(K === 'trap' ? 'Perangkap dipasang' : 'Api unggun menyala', '#6c6'); }
  else return false;
  dec(r); return true; }
function quickHeal() { if (over || invOpen) return; const i = inv.g.findIndex(s => s && s.type === 'med' && s.key !== 'antibiotik'); if (i < 0) msg('Tidak ada perban/medkit', '#e55'); else useItem({ k: 'g', i }); }
function attach(r) { const a = getRef(r), m = AD[a.key], gi = [pl.cur, 0, 1].find(i => pl.eq[i] && WD[pl.eq[i].key].gun);
  if (gi == null) { msg('Pasang senjata api dulu', '#e55'); return; } const g = pl.eq[gi];
  if (!WD[g.key].slots.includes(m.slot)) { msg(m.n + ' tidak cocok untuk ' + WD[g.key].n, '#e55'); return; }
  const old = g.att[m.slot]; g.att[m.slot] = { key: a.key, rar: a.rar }; setRef(r, null); if (old) addItem(mk('att', old.key, old.rar, 1)); fixMag(g); msg(m.n + ' dipasang ke ' + WD[g.key].n, '#6c6'); }
function fixMag(g) { const e = eff(g); if (g.ammo > e.mag) { addItem(mk('ammo', WD[g.key].ammo, 0, g.ammo - e.mag)); g.ammo = e.mag; } }
function detach(s) { const g = getRef(sel), a = g && g.att[s]; if (!a) return; if (inv.g.indexOf(null) < 0) { msg('Inventory penuh!', '#e55'); return; } delete g.att[s]; addItem(mk('att', a.key, a.rar, 1)); fixMag(g); }
function dropItem(r) { const it = getRef(r); if (!it) return; setRef(r, null);
  loot.push({ x: pl.x + Math.cos(pl.ang) * 1.1, y: pl.y + Math.sin(pl.ang) * 1.1, kind: 'item', item: it, rar: it.rar, name: info(it).n, ig: performance.now() + 2000 });
  if (r.k === 'e' && !pl.eq[pl.cur]) for (let j = 0; j < 3; j++) if (pl.eq[j]) { pl.cur = j; break; } }
function sortInv() { const out = [];
  for (const it of inv.g.filter(Boolean)) { const st = info(it).st; let m = false;
    if (st > 1) for (const o of out) if (o.type === it.type && o.key === it.key && o.rar === it.rar && o.qty < st) { const n = Math.min(st - o.qty, it.qty); o.qty += n; it.qty -= n; if (!it.qty) { m = true; break; } }
    if (!m) out.push(it); }
  const ord = { weapon: 0, att: 1, ammo: 2, armor: 3, med: 4, food: 5, mat: 6, tool: 7, place: 8 };
  out.sort((x, y) => ord[x.type] - ord[y.type] || y.rar - x.rar || info(x).n.localeCompare(info(y).n)); inv.g = out.concat(new Array(40 - out.length).fill(null)); }
// ---- UI inventory (drag & drop pointer: bisa mouse dan layar sentuh) ----
const st_ = document.createElement('style');
st_.textContent = `:root{--c:min(42px,10.2vw)}#ip{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.72);z-index:5;overflow:auto}
#ib{background:#15181c;border:1px solid #3a3f45;padding:10px;max-width:97vw;max-height:97vh;overflow:auto;color:#d9d4c7;font-size:13px}
#ih{display:flex;gap:10px;align-items:center;margin-bottom:8px}#ih b{letter-spacing:2px}#ih span{flex:1;font-size:12px;color:#aaa}
#ibody{display:flex;gap:12px;flex-wrap:wrap}#ig{display:grid;grid-template-columns:repeat(8,var(--c));gap:3px;touch-action:none}
.s{width:var(--c);height:var(--c);background:#202429;border:2px solid #2d3238;position:relative;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;touch-action:none}
.s.sel{outline:2px solid #fff}.s i{position:absolute;right:2px;bottom:0;font-size:10px;font-style:normal;color:#fff}.s u{position:absolute;left:2px;top:0;font-size:8px;opacity:.6;text-decoration:none;color:#ccc}
#ir{width:240px;max-width:92vw}#ie{display:grid;grid-template-columns:repeat(4,var(--c));gap:3px;margin-bottom:8px;touch-action:none}#id p{margin:5px 0}
#ib button{background:#2a2f36;color:#ddd;border:1px solid #444;padding:6px 9px;margin:2px 2px 0 0;font-size:12px}#bInv{right:112px;bottom:196px;width:52px;height:52px}`;
document.head.appendChild(st_);
document.body.insertAdjacentHTML('beforeend', '<div id="ip"><div id="ib"><div id="ih"><b>INVENTORY</b><span id="iw"></span><button id="isort">Sortir</button><button id="icl">✕</button></div><div id="ibody"><div id="ig"></div><div id="sg"></div><div id="ir"><div id="ie"></div><div id="id"></div><div id="cr"></div></div></div></div></div>');
{ const b = document.createElement('div'); b.className = 'b'; b.id = 'bInv'; b.textContent = 'TAS'; const t = gid('touch'); if (t) { t.appendChild(b); b.addEventListener('pointerdown', e => { e.preventDefault(); toggleInv(); }); } }
function toggleInv(f) { if (over) return; invOpen = f === undefined ? !invOpen : f; if (!invOpen) stashOpen = false; gid('ip').style.display = invOpen ? 'flex' : 'none'; if (invOpen) { mouse.down = false; tch.atk = false; sel = null; renderInv(); } }
function slotEl(r, it, label) { const d = document.createElement('div'); d.className = 's'; d.dataset.k = r.k; d.dataset.i = r.i;
  if (sel && sel.k === r.k && sel.i === r.i) d.classList.add('sel');
  if (label) { const u = document.createElement('u'); u.textContent = label; d.appendChild(u); }
  if (it) { d.style.borderColor = d.style.color = RAR[it.rar][1]; d.append(info(it).ic); if (it.qty > 1) { const i = document.createElement('i'); i.textContent = it.qty; d.appendChild(i); } }
  return d; }
function renderInv() { renderStash(); const g = gid('ig'), e = gid('ie'); g.textContent = ''; e.textContent = '';
  inv.g.forEach((it, i) => g.appendChild(slotEl({ k: 'g', i }, it)));
  ['Api 1', 'Api 2', 'Melee', 'Armor'].forEach((l, i) => e.appendChild(slotEl({ k: 'e', i }, pl.eq[i], l)));
  gid('iw').textContent = `Berat ${curWeight().toFixed(1)}/${CAP} kg  ·  Uang $${inv.money}`; renderDetail(); }
function renderDetail() { renderCraft(); const el = gid('id'), it = sel && getRef(sel);
  if (!it) { el.innerHTML = '<p>Ketuk item untuk detail. Seret untuk memindah atau memasang ke slot senjata/armor. Klik kosong di luar untuk menutup.</p>'; return; }
  const inf = info(it), c = RAR[it.rar]; let h = `<b style="color:${c[1]}">${inf.n}</b> <small>${c[0]}</small><p>${inf.d}</p><p>Berat ${(inf.w * it.qty).toFixed(2)} kg${it.qty > 1 ? ' (x' + it.qty + ')' : ''}</p>`;
  if (it.type === 'weapon') { const d = WD[it.key], e = eff(it);
    h += `<p>Damage ${Math.round(e.dmg)}${d.pel ? 'x' + d.pel : ''} · Laju ${(1 / e.cd).toFixed(1)}/dtk · Jarak ${Math.round(e.range * 10) / 10}`;
    if (d.gun) h += `<br>Magasin ${e.mag} · Reload ${e.rl.toFixed(1)}s · Akurasi ${Math.round(Math.max(0, 100 - e.sp * 500))}% · Recoil ${Math.round(e.rec * 100)} · Suara ${Math.round(e.noise)}`;
    h += `<br>Durability ${Math.max(0, it.dur | 0)}/${d.dur}</p>`;
    if (d.gun && sel.k === 'e') { h += '<p>Attachment (ketuk untuk lepas):</p>'; for (const s of d.slots) { const a = it.att[s]; h += `<button data-act="det" data-s="${s}">${SN[s]}: ${a ? AD[a.key].n + ' ✕' : '(kosong)'}</button>`; } h += '<br>'; } }
  const b = []; if (['med', 'food', 'tool', 'throw'].includes(it.type)) b.push(['use', 'Pakai']); if (it.type === 'place') b.push(['use', 'Letakkan']);
  if (sel.k === 'g' && (it.type === 'weapon' || it.type === 'armor')) b.push(['equip', 'Equip']);
  if (sel.k === 'e') b.push(['unequip', 'Lepas']); if (it.type === 'att' && sel.k === 'g') b.push(['att', 'Pasang ke senjata']); b.push(['drop', 'Buang']);
  el.innerHTML = h + b.map(x => `<button data-act="${x[0]}">${x[1]}</button>`).join(''); }
gid('id').addEventListener('click', e => { const b = e.target.closest('button'), it = sel && getRef(sel); if (!b || !it) return; const a = b.dataset.act;
  if (a === 'use') useItem(sel);
  else if (a === 'equip') { const slot = it.type === 'armor' ? 3 : WD[it.key].gun ? (pl.eq[0] ? (pl.eq[1] ? 0 : 1) : 0) : 2; moveItem(sel, { k: 'e', i: slot }); }
  else if (a === 'unequip') { const i = inv.g.indexOf(null); if (i < 0) { msg('Inventory penuh!', '#e55'); return; } moveItem(sel, { k: 'g', i }); }
  else if (a === 'att') attach(sel); else if (a === 'det') detach(b.dataset.s); else if (a === 'drop') { dropItem(sel); sel = null; }
  renderInv(); });
gid('isort').addEventListener('click', () => { sortInv(); sel = null; renderInv(); });
gid('icl').addEventListener('click', () => toggleInv(false));
gid('ip').addEventListener('pointerdown', e => { if (e.target.id === 'ip') { toggleInv(false); return; } const s = e.target.closest('.s'); if (!s) return;
  const r = { k: s.dataset.k, i: +s.dataset.i }; sel = r; document.querySelectorAll('.s.sel').forEach(x => x.classList.remove('sel')); s.classList.add('sel'); renderDetail();
  if (getRef(r)) drag = { r, x: e.clientX, y: e.clientY, g: null }; });
addEventListener('pointermove', e => { if (!drag) return;
  if (!drag.g && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 8) { const it = getRef(drag.r), g = document.createElement('div'); g.className = 's'; g.style.cssText = 'position:fixed;pointer-events:none;z-index:9;opacity:.85';
    g.style.borderColor = RAR[it.rar][1]; g.style.color = RAR[it.rar][1]; g.textContent = info(it).ic; document.body.appendChild(g); drag.g = g; }
  if (drag.g) { drag.g.style.left = (e.clientX - 20) + 'px'; drag.g.style.top = (e.clientY - 20) + 'px'; } });
const endDrag = e => { if (!drag) return; const d = drag; drag = null; if (!d.g) return; d.g.remove();
  const t = e.type === 'pointerup' ? document.elementFromPoint(e.clientX, e.clientY) : null, s = t && t.closest('.s');
  if (s && invOpen) moveItem(d.r, { k: s.dataset.k, i: +s.dataset.i }); renderInv(); };
addEventListener('pointerup', endDrag); addEventListener('pointercancel', endDrag);
// ================= TAHAP 4: SURVIVAL, WAKTU, CRAFTING, INTERAKSI =================
let DAY = cfg.day; // detik nyata untuk 24 jam game
let treeShake = null; // animasi getaran pohon saat ditebang
let gt = 0, objs = [], chops = {}, respawnQ = [];
const clockH = () => (8 + gt / DAY * 24) % 24;
function darkness() { const h = clockH(); return h >= 20 || h < 5 ? 1 : h >= 18 ? (h - 18) / 2 : h < 7 ? (7 - h) / 2 : 0; }
function initSurv() { for (const r of respawnQ) set(r.x, r.y, 3); respawnQ = []; chops = {}; objs = [{ k: 'fire', x: N / 2, y: N / 2, t: 1e12 }]; gt = 0; EG.fill(0); for (const c of crates) { c.open = false; c.t = 0; } for (const c of wcont) { c.open = false; c.t = 0; }
  Object.assign(pl, { hun: 100, thr: 100, inf: 0, tmp: 36.6, fat: 0, bleed: 0, craft: null, chopT: 0, sreg: 1, smul: 1, warn: {}, zone: -1 });
  gid('over').querySelector('p').textContent = 'Klik atau ketuk untuk mengulang'; initProg(); }
function die(why) { if (over) return; pl.hp = 0; over = true; const o = gid('over'); o.style.display = 'flex'; o.querySelector('p').textContent = why + ' — klik atau ketuk untuk mengulang'; }
function survive(dt) { if (over) return; gt += dt;
  const dk = darkness(); ZA = cfg.aggr * (1 + dk * 0.3 * cfg.night); ZS = (0.85 + 0.15 * cfg.aggr) * (1 + dk * 0.15 * cfg.night); const amb = 20 - 14 * dk, near = objs.some(o => o.k === 'fire' && Math.hypot(o.x - pl.x, o.y - pl.y) < 4);
  pl.hun = Math.max(0, pl.hun - (0.08 + (pl.spr ? 0.05 : 0)) * dt * (1 - pl.sk.s * 0.06)); pl.thr = Math.max(0, pl.thr - (0.12 + (pl.spr ? 0.08 : 0)) * dt * (1 - pl.sk.s * 0.06));
  pl.fat = clamp(pl.fat + (pl.mv ? 0.04 + (pl.spr ? 0.06 : 0) : -0.6) * dt, 0, 100);
  if (pl.inf > 10) pl.inf = Math.min(100, pl.inf + 0.05 * dt);
  const eq = 36.6 + (amb - 16) * 0.18 + pl.inf * 0.015 + (near ? 0.8 + 1.7 * dk : 0) + (pl.spr ? 0.5 : 0); pl.tmp += (eq - pl.tmp) * 0.03 * dt;
  let sreg = 1 - pl.fat / 200, smul = 1, drain = 0;
  if (pl.hun < 20) sreg *= 0.6; if (pl.thr < 20) smul = 0.85; if (pl.tmp < 35) sreg *= 0.5;
  if (pl.hun <= 0) drain += 0.5; if (pl.thr <= 0) drain += 0.7; if (pl.tmp < 34 || pl.tmp > 39) drain += 0.5; if (pl.inf >= 60) drain += 0.3;
  if (pl.bleed) { drain += 1.2; if (Math.random() < dt * 4) addDecal(pl.x, pl.y, 3 + Math.random() * 3); }
  pl.sreg = sreg * (1 + pl.sk.e * 0.06); pl.smul = smul;
  if (drain) { pl.hp -= drain * dt; if (pl.hp <= 0) die(pl.bleed ? 'Mati kehabisan darah' : pl.inf >= 60 ? 'Mati karena infeksi' : 'Mati karena kondisi tubuh'); }
  else if (pl.hun > 60 && pl.thr > 60 && pl.inf < 30 && pl.hp < 100) pl.hp = Math.min(100, pl.hp + 0.15 * dt);
  if (pl.inf >= 100) die('Mati terinfeksi');
  pl.chopT = Math.max(0, pl.chopT - dt);
  if (treeShake && (treeShake.t -= dt) <= 0) treeShake = null;
  for (let i = respawnQ.length - 1; i >= 0; i--) { const r = respawnQ[i]; if ((r.t -= dt) <= 0 && Math.hypot(r.x + 0.5 - pl.x, r.y + 0.5 - pl.y) > 3 && T(r.x, r.y) === 1) { set(r.x, r.y, 3); respawnQ.splice(i, 1); } }
  const w = pl.warn; [['hun', 'Lapar! Cari makanan'], ['thr', 'Haus! Cari air minum']].forEach(([k, m]) => { if (pl[k] < 20 && !w[k]) { w[k] = 1; msg(m, '#e95'); } if (pl[k] >= 20) w[k] = 0; });
  if (pl.bleed && !w.b) { w.b = 1; msg('Berdarah! Pakai perban (H)', '#e55'); } if (!pl.bleed) w.b = 0; }
function updObjs(dt) { for (let i = objs.length - 1; i >= 0; i--) { const o = objs[i]; o.t -= dt;
  if (o.k === 'trap') { for (const z of zs.slice()) if (Math.hypot(z.x - o.x, z.y - o.y) < 0.7) { damageZ(z, 70, 0, 0, false); noise(o.x, o.y, 8); fx.push({ k: 'ring', x: o.x, y: o.y, t: 0.4, T: 0.4, R: 1.2, col: '200,200,200' }); o.t = 0; break; } }
  if (o.k === 'mine') { for (const z of zs) if (Math.hypot(z.x - o.x, z.y - o.y) < 0.8) { boom(o.x, o.y, 2.6, 110); o.t = 0; break; } }
  if (o.t <= 0) objs.splice(i, 1); } }
function drawObj(o) { const s = toS(o.x, o.y), X = s[0] + ox(), Y = s[1] + oy(); shadow(o.x, o.y, 12);
  if (o.k === 'fire') { ctx.fillStyle = '#4a3320'; ctx.fillRect(X - 9, Y - 4, 18, 4); const f = Math.sin(performance.now() / 90) * 2;
    ctx.fillStyle = '#ff9a2e'; ctx.beginPath(); ctx.ellipse(X, Y - 10, 6, 10 + f, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#ffe27a'; ctx.beginPath(); ctx.ellipse(X, Y - 8, 3, 5, 0, 0, 7); ctx.fill(); }
  else { if (o.k === 'mine') { ctx.fillStyle = '#6a6a5a'; ctx.beginPath(); ctx.ellipse(X, Y - 2, 9, 4.5, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#d33'; ctx.fillRect(X - 1, Y - 4, 3, 2); return; } ctx.strokeStyle = '#aaa'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X, Y - 3, 8, 0, 7); ctx.moveTo(X - 6, Y - 3); ctx.lineTo(X + 6, Y - 3); ctx.stroke(); } }
function interact() { if (over || invOpen || mapOpen || pl.chopT > 0) return;
  if (pl.onTower) { const t = pl.onTower, exits = [[t.x + 1.2,t.y + 0.5],[t.x - 0.2,t.y + 0.5],[t.x + 0.5,t.y + 1.2],[t.x + 0.5,t.y - 0.2]]; const p = exits.find(q => !solid(T(Math.floor(q[0]), Math.floor(q[1])))); pl.onTower = null; if (p) { pl.x = p[0]; pl.y = p[1]; } msg('Turun dari menara', '#6cf'); return; } const cr = nearCrate(); if (cr) { pl.chopT = 0.5; if (cr.open) msg('Peti kosong (terisi lagi nanti)', '#aaa'); else openCrate(cr); return; } const sv2 = nearSurv(); if (sv2) { rescue(sv2); return; } const stt = nearStruct(); if (stt) { useStruct(stt); return; } let b = null, bd = 1.6;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const tx = (pl.x | 0) + dx, ty = (pl.y | 0) + dy; if (T(tx, ty) !== 3) continue; const d = Math.hypot(tx + 0.5 - pl.x, ty + 0.5 - pl.y); if (d < bd) { bd = d; b = [tx, ty]; } }
  if (!b) { msg('Tidak ada yang bisa diambil di dekat sini', '#aaa'); pl.chopT = 0.5; return; }
  if (b[0] === 0 || b[1] === 0 || b[0] === N - 1 || b[1] === N - 1) { msg('Pohon tepi peta tidak bisa ditebang', '#aaa'); pl.chopT = 0.5; return; }
  pl.chopT = 0.7; treeShake = { x: b[0], y: b[1], t: 0.58, phase: Math.random() * Math.PI * 2 }; noise(pl.x, pl.y, 6); const key = b[0] + ',' + b[1];
  if (!addItem(mk('mat', 'Kayu', 0, 1 + (Math.random() < 0.5 ? 1 : 0)))) { msg('Inventory penuh!', '#e55'); return; }
  msg('+ Kayu', '#c9a36a'); tut.chops++; chops[key] = (chops[key] || 0) + 1;
  if (chops[key] >= 3) { set(b[0], b[1], 1); respawnQ.push({ x: b[0], y: b[1], t: 150 / cfg.resp }); delete chops[key]; msg('Pohon tumbang (tumbuh lagi nanti)', '#c9a36a'); } }
// ---- crafting ----
const RC = [
  { n: 'Perban', t: 3, need: { Kain: 2 }, out: ['med', 'perban', 1] },
  { n: 'Medkit', t: 6, need: { perban: 3, 'Bahan Kimia': 1 }, out: ['med', 'medkit', 1] },
  { n: 'Antibiotik', t: 5, need: { 'Bahan Kimia': 2, 'Zat Infeksi': 1 }, out: ['med', 'antibiotik', 1] },
  { n: 'Peluru 9mm x12', t: 4, need: { 'Komponen Kecil': 1, 'Bahan Kimia': 1 }, out: ['ammo', '9mm', 12] },
  { n: 'Rompi Improvisasi', t: 8, need: { Kain: 4, Kayu: 2 }, out: ['armor', 'rompi', 1] },
  { n: 'Repair Kit', t: 5, need: { 'Komponen Kecil': 2, Kayu: 1 }, out: ['tool', 'repair', 1] },
  { n: 'Campfire', t: 4, need: { Kayu: 5, Kain: 1 }, out: ['place', 'campfire', 1] },
  { n: 'Perangkap', t: 5, need: { Kayu: 2, 'Komponen Kecil': 2 }, out: ['place', 'trap', 1] }];
function have(k) { let n = 0; for (const s of inv.g) if (s && s.key === k) n += s.qty; return n; }
function takeN(k, n) { for (let i = 0; i < inv.g.length && n > 0; i++) { const s = inv.g[i]; if (s && s.key === k) { const m = Math.min(s.qty, n); s.qty -= m; n -= m; if (!s.qty) inv.g[i] = null; } } }
const canCraft = r => Object.keys(r.need).every(k => have(k) >= r.need[k]) && (!r.st || nearStation());
function startCraft(i) { const r = RC[i]; if (pl.craft || !canCraft(r)) return; for (const k in r.need) takeN(k, r.need[k]); pl.craft = { r, t: 0 }; }
function craftTick(dt) { const c = pl.craft; if (!c || over) return; c.t += dt * (1 + pl.sk.k * 0.1); if (c.t < c.r.t) return; pl.craft = null;
  const o = c.r.out, it = mk(o[0], o[1], 0, o[2]), nm = c.r.n;
  if (!addItem(it)) loot.push({ x: pl.x, y: pl.y, kind: 'item', item: it, rar: 0, name: nm, ig: performance.now() + 1500 });
  msg('Selesai dibuat: ' + nm, '#6cf'); addXP(5); tut.crafts++; if (invOpen && !drag) renderInv(); }
function renderCraft() { const el = gid('cr'); let h = skillHTML() + questHTML() + '<hr><b>CRAFTING</b>' + (pl.craft ? `<p>Membuat ${pl.craft.r.n}... ${Math.round(pl.craft.t / pl.craft.r.t * 100)}%</p>` : '');
  RC.forEach((r, i) => { const ok = canCraft(r) && !pl.craft;
    h += `<p style="margin:4px 0;opacity:${canCraft(r) ? 1 : 0.55}"><button data-c="${i}"${ok ? '' : ' disabled'}>Buat</button> <b>${r.n}</b> <small>${r.t}s${r.st ? ' · perlu Crafting Station' : ''}</small><br><small>${Object.keys(r.need).map(k => k + ' ' + have(k) + '/' + r.need[k]).join(', ')}</small></p>`; });
  h += buildHTML(); el.innerHTML = h; }
gid('cr').addEventListener('click', e => { const b = e.target.closest('button[data-c]'); if (!b || b.disabled) return; startCraft(+b.dataset.c); renderInv(); });
// ---- HUD survival ----
gid('hud').insertAdjacentHTML('beforeend', '<div class="bar" id="hu"><i></i><b>LAPAR</b></div><div class="bar" id="ti"><i></i><b>HAUS</b></div><div class="bar" id="inf"><i></i><b>INFEKSI</b></div><div id="sv" style="font-size:12px;margin-top:2px"></div>');
const st4 = document.createElement('style');
st4.textContent = '#hu i{background:#c9803a}#ti i{background:#3a8fc9}#inf i{background:#8a4fc9}#inv{top:134px!important}#feed{top:156px!important}#bAct{right:212px;bottom:36px;width:56px;height:56px}#bHeal{right:258px;bottom:100px;width:50px;height:50px}';
document.head.appendChild(st4);
{ const t = gid('touch'); if (t) [['bAct', 'AMBIL', interact], ['bHeal', 'PERBAN', quickHeal]].forEach(([id, tx, fn]) => { const b = document.createElement('div'); b.className = 'b'; b.id = id; b.textContent = tx; t.appendChild(b); b.addEventListener('pointerdown', e => { e.preventDefault(); fn(); }); }); }

// ================= TAHAP 5: DUNIA LUAS, ZONA, EKSPLORASI, LOOT CONTAINER =================
let ZN = Math.round(80 * cfg.zpop); const GW = N / 4, EG = new Uint8Array(GW * GW), crates = [];
let mapOpen = false, zspT = 0, exT = 0;
function pickType(zn, r) { const Wt = [null, [['walker', 0.65], ['runner', 0.25], ['bloater', 0.1]], [['walker', 0.4], ['runner', 0.25], ['brute', 0.1], ['screamer', 0.1], ['bloater', 0.15]], [['walker', 0.25], ['runner', 0.25], ['brute', 0.2], ['screamer', 0.15], ['bloater', 0.15]]][zn];
  let a = 0; for (const [t, p] of Wt) { a += p; if (r < a) return t; } return Wt[0][0]; }
function spawnZ(x, y, type) { const t = ZT[type]; zs.push({ x, y, r: t.r, t, type, hp: t.hp, s: 'idle', tm: Math.random() * 3, px: x, py: y, lx: x, ly: y, lost: 0, cd: 0, wind: 0, a: 0, hit: 0, steer: 0, steerT: 0, stuck: 0, ox: x, oy: y }); }
const CT = {
  kayu: { n: 'Peti Kayu', c: ['#9a7a4a', '#6e5433', '#54402a'], roll: 3, tb: [['mat', 'Kain'], ['mat', 'Komponen Kecil'], ['food', 'Makanan Kaleng'], ['food', 'Air Minum'], ['ammo', 'Amunisi'], ['money', 'Uang']] },
  medis: { n: 'Kotak Medis', c: ['#e8e8e8', '#b9bcc0', '#8e9296'], roll: 3, tb: [['med', 'Perban'], ['med', 'Bahan Medis'], ['mat', 'Bahan Kimia'], ['mat', 'Kain'], ['food', 'Air Minum']] },
  ammo: { n: 'Peti Amunisi', c: ['#6b7a52', '#4f5c3b', '#3b4530'], roll: 3, tb: [['ammo', 'Amunisi'], ['ammo', 'Amunisi'], ['ammo', 'Amunisi'], ['mat', 'Komponen Kecil'], ['att', 'x']] },
  militer: { n: 'Peti Militer', c: ['#56683f', '#3c4a2d', '#2e381f'], roll: 4, tb: [['weapon', 'x'], ['att', 'x'], ['throw', 'x'], ['armor', 'Armor'], ['ammo', 'Amunisi'], ['med', 'Bahan Medis'], ['ammo', 'Amunisi']] } };
function pickCrate(zn, r) { const Wt = [[['kayu', 1]], [['kayu', 0.5], ['medis', 0.25], ['ammo', 0.25]], [['kayu', 0.25], ['medis', 0.25], ['ammo', 0.3], ['militer', 0.2]], [['medis', 0.25], ['ammo', 0.3], ['militer', 0.45]]][zn];
  let a = 0; for (const [t, p] of Wt) { a += p; if (r < a) return t; } return Wt[0][0]; }
for (const [zn, n] of [[0, 3], [1, 14], [2, 14], [3, 12]]) { let k = 0, tries = 0;
  while (k < n && tries++ < 4000) { const x = rnd() * N, y = rnd() * N;
    if (zoneAt(x, y) !== zn || blocked(x, y, 0.35) || (zn === 0 && Math.hypot(x - N / 2, y - N / 2) < 3) || crates.some(c => Math.hypot(c.x - x, c.y - y) < 6)) continue;
    crates.push({ x, y, k: pickCrate(zn, rnd()), open: false, t: 0 }); k++; } }
function openCrate(c) { tut.crates++; const d = CT[c.k], zn = zoneAt(c.x, c.y), n = Math.max(1, Math.round((d.roll + (Math.random() < 0.3 ? 1 : 0)) * LM())); c.open = true; c.t = 300 / cfg.resp; noise(c.x, c.y, 8);
  for (let i = 0; i < n; i++) { const [kind, name] = d.tb[(Math.random() * d.tb.length) | 0], rar = rollRar(zn * 0.8 + (c.k === 'militer' ? 2 : 0));
    const l = { kind, name, rar, amt: kind === 'money' ? Math.round(10 + rar * 12 + Math.random() * 15) : kind === 'ammo' ? 6 + rar * 5 : 1 };
    if (kind === 'weapon') l.key = WKEYS[(Math.random() * WKEYS.length) | 0]; else if (kind === 'att') l.key = Object.keys(AD)[(Math.random() * 6) | 0]; else if (kind === 'throw') l.key = ['molotov', 'grenade', 'landmine'][(Math.random() * 3) | 0];
    if (!collect(l)) loot.push(Object.assign(l, { x: c.x + (Math.random() - 0.5) * 1.2, y: c.y + (Math.random() - 0.5) * 1.2, ig: performance.now() + 500 })); } }
function nearCrate() { let b = null, bd = 1.5; for (const c of crates.concat(wcont)) { const d = c.wr ? wreckDist(c) : Math.hypot(c.x - pl.x, c.y - pl.y); if (d < bd) { bd = d; b = c; } } return b; }
function nearTree() { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const tx = (pl.x | 0) + dx, ty = (pl.y | 0) + dy;
  if (T(tx, ty) === 3 && tx > 0 && ty > 0 && tx < N - 1 && ty < N - 1 && Math.hypot(tx + 0.5 - pl.x, ty + 0.5 - pl.y) < 1.6) return true; } return false; }
function worldTick(dt) { for (let i = corpses.length - 1; i >= 0; i--) { corpses[i].t += dt; if (corpses[i].t > 6) corpses.splice(i, 1); } if (over) return;
  for (const z of zs) { if (Math.abs(z.x - pl.x) + Math.abs(z.y - pl.y) > 26) continue; z.gT = (z.gT == null ? 2 + Math.random() * 8 : z.gT) - dt; if (z.gT <= 0) { z.gT = z.s === 'chase' ? 2 + Math.random() * 2 : 7 + Math.random() * 8; snd.zombie(z); } }
  for (const L of [crates, wcont]) for (const c of L) if (c.open && (c.t -= dt) <= 0) c.open = false; // loot respawn
  if ((zspT -= dt) <= 0) { zspT = 12 / cfg.resp; if (zs.length < ZN) for (let i = 0; i < 12; i++) { const x = Math.random() * N, y = Math.random() * N, zn = zoneAt(x, y);
    if (zn === 0 || solid(T(x | 0, y | 0)) || Math.hypot(x - pl.x, y - pl.y) < 28) continue; spawnZ(x, y, pickType(zn, Math.random())); break; } }
  if ((exT -= dt) <= 0) { exT = 0.5; const cx = (pl.x / 4) | 0, cy = (pl.y / 4) | 0;
    for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) { const gx = cx + i, gy = cy + j; if (gx < 0 || gy < 0 || gx >= GW || gy >= GW) continue; if (Math.hypot((gx + 0.5) * 4 - pl.x, (gy + 0.5) * 4 - pl.y) < 13) EG[gy * GW + gx] = 1; } }
  const zn = zoneAt(pl.x, pl.y); if (zn !== pl.zone) { pl.zone = zn; msg('Memasuki: ' + ZNAME[zn], ['#6c6', '#cfc27a', '#e95', '#e55'][zn]); } }
function boxS(x, y, sz, h, c) { const X = ox(), Y = oy(), S = (a, b, hh) => [X + (a - b) * HW, Y + (a + b) * HH - hh];
  const A = S(x, y + sz, h), B = S(x + sz, y + sz, h), C = S(x + sz, y, h), D = S(x, y, h), Ab = S(x, y + sz, 0), Bb = S(x + sz, y + sz, 0), Cb = S(x + sz, y, 0);
  ctx.fillStyle = c[1]; ctx.beginPath(); ctx.moveTo(...A); ctx.lineTo(...B); ctx.lineTo(...Bb); ctx.lineTo(...Ab); ctx.fill();
  ctx.fillStyle = c[2]; ctx.beginPath(); ctx.moveTo(...B); ctx.lineTo(...C); ctx.lineTo(...Cb); ctx.lineTo(...Bb); ctx.fill();
  ctx.fillStyle = c[0]; ctx.beginPath(); ctx.moveTo(...D); ctx.lineTo(...C); ctx.lineTo(...B); ctx.lineTo(...A); ctx.fill(); }
function drawCrate(c) { const d = CT[c.k], s = toS(c.x, c.y), X = s[0] + ox(), Y = s[1] + oy(), h = c.open ? 10 : 16; shadow(c.x, c.y, 14); ctx.globalAlpha = c.open ? 0.55 : 1; boxS(c.x - 0.3, c.y - 0.3, 0.6, h, d.c);
  if (c.k === 'medis') { ctx.strokeStyle = '#d33'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(X - 5, Y - h + 1); ctx.lineTo(X + 5, Y - h + 1); ctx.moveTo(X, Y - h - 4); ctx.lineTo(X, Y - h + 6); ctx.stroke(); }
  ctx.globalAlpha = 1; if (!c.open) { const b = Math.sin(performance.now() / 300) * 2; ctx.fillStyle = '#ffd23c'; ctx.beginPath(); ctx.moveTo(X, Y - 30 + b); ctx.lineTo(X + 4, Y - 36 + b); ctx.lineTo(X - 4, Y - 36 + b); ctx.fill(); } }
// ---- minimap, kompas, peta penuh ----
const st5 = document.createElement('style');
st5.textContent = '#zn{position:fixed;right:14px;top:92px;text-align:right;font-size:12px;color:#cfc8b2;pointer-events:none;text-shadow:0 0 3px #000}#hint{position:fixed;left:50%;top:50px;transform:translateX(-50%);font-size:14px;color:#ffe9a8;text-shadow:0 0 4px #000;pointer-events:none;text-align:center}';
document.head.appendChild(st5);
document.body.insertAdjacentHTML('beforeend', '<div id="zn"></div><div id="hint"></div>');
const SQ = 1.4142;
function worldHud() { lvHud(); thHud(); tutHud(); const c = nearCrate(); let h = ''; if (c) h = c.open ? 'Peti kosong — terisi lagi nanti' : 'E: ' + (c.wr ? 'Geledah ' : 'Buka ') + CT[c.k].n; else if (nearSurv()) h = 'E: Selamatkan survivor'; else if (nearStruct()) h = 'E: ' + ({ 7: 'Buka/tutup pintu', 10: 'Buka/tutup pintu', 11: 'Tidur', 12: 'Buka storage', 14: 'Nyalakan generator' })[nearStruct().t]; else if (nearTree()) h = 'E: Tebang pohon';
  gid('hint').textContent = over || invOpen || mapOpen ? '' : (bmode != null ? 'Bangun: ' + BD[bmode].n : h);
  const du = ((N / 2 - pl.x) - (N / 2 - pl.y)) / SQ, dv = ((N / 2 - pl.x) + (N / 2 - pl.y)) / SQ, a = Math.atan2(dv, du), ar = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'][Math.round(a / (Math.PI / 4) + 8) % 8];
  gid('zn').innerHTML = ZNAME[zoneAt(pl.x, pl.y)] + '<br>Perkemahan ' + ar + ' ' + (Math.hypot(du, dv) | 0) + ' m'; }
// ================= TAHAP 6: BASE BUILDING, QUEST, XP, SKILL =================
const BD = [
  { n: 'Dinding Kayu', t: 6, hp: 150, cost: { Kayu: 3 }, d: 'Menahan zombie.' },
  { n: 'Pintu', t: 7, hp: 100, cost: { Kayu: 4, 'Komponen Kecil': 1 }, d: 'E: buka/tutup.' },
  { n: 'Barikade', t: 8, hp: 90, cost: { Kayu: 2, Kain: 1 }, d: 'Murah, bisa ditembak lewat.' },
  { n: 'Pagar', t: 9, hp: 60, cost: { Kayu: 2 }, d: 'Pagar pertahanan.' },
  { n: 'Tempat Tidur', t: 11, hp: 60, cost: { Kain: 4, Kayu: 3 }, d: 'E: tidur, kurangi lelah.' },
  { n: 'Storage', t: 12, hp: 80, cost: { Kayu: 5 }, d: 'E: simpan barang.' },
  { n: 'Crafting Station', t: 13, hp: 100, cost: { Kayu: 6, 'Komponen Kecil': 3 }, d: 'Syarat resep lanjutan.' },
  { n: 'Generator', t: 14, hp: 100, cost: { 'Komponen Kecil': 6, 'Komponen Elektronik': 1, 'Bahan Kimia': 2 }, d: 'E: nyalakan (bahan bakar 1 Bahan Kimia).' },
  { n: 'Menara Pemanah', t: 15, hp: 650, cost: { Kayu: 18, 'Komponen Kecil': 8, Kain: 4 }, d: 'E: naik/turun. Posisi tinggi, jangkauan tembak +50%; zombie tidak bisa menyerang dari bawah.' }];
const HIT = new Set([6, 7, 8, 9, 11, 12, 13, 14, 15]), sh = {}, gens = [], stash = new Array(24).fill(null), survivors = [];
let bmode = null, stashOpen = false, buildTarget = null, buildPointerId = null;
['Medkit', 'Antibiotik', 'Peluru 9mm x12', 'Rompi Improvisasi', 'Repair Kit', 'Perangkap'].forEach(n => { RC.find(r => r.n === n).st = 1; });
const EV = { x: N - 9.5, y: N - 9.5 };
for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) if (Math.hypot(dx, dy) < 4.6 && T((EV.x | 0) + dx, (EV.y | 0) + dy) === 3) set((EV.x | 0) + dx, (EV.y | 0) + dy, 1);
const needXP = lv => 60 + 40 * lv, costText = b => Object.keys(b.cost).map(k => k + ' ' + have(k) + '/' + b.cost[k]).join(', ');
const XPK = { walker: 8, runner: 12, brute: 40, screamer: 20, bloater: 20 };
function addXP(n) { pl.xp += n; while (pl.xp >= needXP(pl.lv)) { pl.xp -= needXP(pl.lv); pl.lv++; pl.sp++; msg('LEVEL ' + pl.lv + '! +1 poin skill (buka Tas)', '#ffd86b'); } }
function onKill(z) { addXP(XPK[z.type]); if (z.type === 'brute') pl.q.brute++; if (z.type === 'screamer') pl.q.screamer++; }
function qnote(it, n) { if (it.type === 'food') pl.q.food += n; else if (it.type === 'med') pl.q.med += n; else if (it.type === 'weapon' && it.key !== 'pistol' && it.key !== 'knife') pl.q.weapon++; }
const QS = [
  { n: 'Cari makanan', d: 'Kumpulkan 3 makanan/minuman', g: 3, p: () => pl.q.food, xp: 40, rw: () => mk('ammo', '9mm', 0, 12) },
  { n: 'Temukan obat', d: 'Kumpulkan 2 item medis', g: 2, p: () => pl.q.med, xp: 40, rw: () => mk('med', 'perban', 0, 2) },
  { n: 'Bersihkan area', d: 'Kalahkan 10 zombie', g: 10, p: () => pl.kills, xp: 80, rw: () => mk('ammo', '9mm', 0, 24) },
  { n: 'Buru zombie tertentu', d: 'Kalahkan 1 Brute dan 2 Screamer', g: 3, p: () => Math.min(1, pl.q.brute) + Math.min(2, pl.q.screamer), xp: 120, rw: () => mk('armor', 'rompi', 1, 1) },
  { n: 'Cari senjata', d: 'Temukan senjata baru', g: 1, p: () => pl.q.weapon, xp: 60, rw: () => mk('ammo', '7.62', 0, 20) },
  { n: 'Aktifkan generator', d: 'Bangun dan nyalakan generator', g: 1, p: () => pl.q.gen, xp: 100, rw: () => mk('mat', 'Komponen Kecil', 0, 3) },
  { n: 'Selamatkan survivor', d: 'Temukan survivor (tanda segitiga biru) di Tanah Tandus / Zona Merah', g: 1, p: () => pl.q.rescue, xp: 150, rw: () => mk('med', 'medkit', 2, 1) },
  { n: 'Temukan lokasi evakuasi', d: 'Capai lingkaran biru di sudut Zona Merah (arah ditunjukkan setelah menyelamatkan survivor)', g: 1, p: () => pl.q.evac, xp: 300, rw: null }];
function questTick() { if (Math.hypot(pl.x - EV.x, pl.y - EV.y) < 3) pl.q.evac = 1;
  for (const q of QS) if (!q.done && q.p() >= q.g) { q.done = true; addXP(q.xp); msg('MISI SELESAI: ' + q.n + ' (+' + q.xp + ' XP)', '#ffd86b');
    if (q.rw) { const it = q.rw(); if (!addItem(it)) loot.push({ x: pl.x, y: pl.y, kind: 'item', item: it, rar: it.rar, name: info(it).n, ig: performance.now() + 1500 }); }
    else msg('Anda menemukan jalan keluar! Mode Sandbox: tetap bisa bermain.', '#6cf'); } }
function progTick(dt) { tutTick(dt); snd.tick(dt); stepTick(dt); autoSave(dt); thrownTick(dt); if (over) return; for (const g of gens) if (g.t > 0) { g.t -= dt; if ((g.n = (g.n || 0) - dt) <= 0) { g.n = 5; noise(g.x + 0.5, g.y + 0.5, 12); } }
  for (let i = gens.length - 1; i >= 0; i--) if (T(gens[i].x, gens[i].y) !== 14) gens.splice(i, 1); questTick(); }
function initProg() { thrown.length = 0; burns.length = 0; corpses.length = 0; tut = newTut(); for (let i = 0; i < N * N; i++) if (map[i] >= 6) map[i] = 1; for (const k in sh) delete sh[k]; gens.length = 0; stash.fill(null); stashOpen = false; bmode = null; updBB();
  Object.assign(pl, { xp: 0, lv: 1, sp: 0, sk: { c: 0, s: 0, k: 0, t: 0, e: 0 }, q: { food: 0, med: 0, weapon: 0, brute: 0, screamer: 0, gen: 0, rescue: 0, evac: 0 } }); QS.forEach(q => { q.done = false; });
  survivors.length = 0; for (const zn of [2, 3]) for (let i = 0; i < 500; i++) { const x = rnd() * N, y = rnd() * N; if (zoneAt(x, y) !== zn || blocked(x, y, 0.35)) continue;
    survivors.push({ x, y, done: false, a: 0 }); for (let k = 0; k < 3; k++) { const zx = x + (Math.random() - 0.5) * 6, zy = y + (Math.random() - 0.5) * 6; if (!blocked(zx, zy, 0.3)) spawnZ(zx, zy, 'walker'); } break; } }
// ---- membangun ----
function targetTile() { let x, y;
  if (document.body.classList.contains('t') && buildTarget) { x = buildTarget[0] + 0.5; y = buildTarget[1] + 0.5; }
  else if (document.body.classList.contains('t')) { x = pl.x + Math.cos(pl.ang) * 1.7; y = pl.y + Math.sin(pl.ang) * 1.7; }
  else { x = mw[0]; y = mw[1]; }
  const d = Math.hypot(x - pl.x, y - pl.y); if (d > 6) { x = pl.x + (x - pl.x) * 6 / d; y = pl.y + (y - pl.y) * 6 / d; }
  return [Math.floor(x), Math.floor(y)]; }
function canBuild(tx, ty) { return T(tx, ty) === 1 && tx > 0 && ty > 0 && tx < N - 1 && ty < N - 1 && Math.hypot(tx + 0.5 - pl.x, ty + 0.5 - pl.y) > 0.9 && !zs.some(z => Math.hypot(z.x - tx - 0.5, z.y - ty - 0.5) < 0.9); }
function placeBuild() { if (bmode == null || over || invOpen || mapOpen) return; const b = BD[bmode], [tx, ty] = targetTile();
  if (!canBuild(tx, ty)) { msg('Tidak bisa dibangun di sini', '#e55'); return; }
  if (!Object.keys(b.cost).every(k => have(k) >= b.cost[k])) { msg('Bahan kurang: ' + costText(b), '#e55'); return; }
  for (const k in b.cost) takeN(k, b.cost[k]); set(tx, ty, b.t); sh[ty * N + tx] = b.hp; if (b.t === 14) gens.push({ x: tx, y: ty, t: 0 }); addXP(3); snd.knock(); tut.builds++; buildTarget = null; msg(b.n + ' dibangun', '#6c6'); }
function enterBuild(i) { bmode = i; buildTarget = null; buildPointerId = null; toggleInv(false); updBB(); msg(document.body.classList.contains('t') ? 'Mode bangun: ' + BD[i].n + ' — ketuk atau geser jari di tanah untuk memilih lokasi, lalu PASANG' : 'Mode bangun: ' + BD[i].n + ' (arahkan mouse lalu klik/F/PASANG)', '#6cf'); }
function cancelBuild() { bmode = null; buildTarget = null; buildPointerId = null; updBB(); }
function updBB() { const b = gid('bb'); if (b) b.style.display = bmode != null ? 'flex' : 'none'; }
function hitStruct(x, y, d) { const k = y * N + x, t = T(x, y), b = BD.find(q => q.t === t); if (!b) return; if (sh[k] == null) sh[k] = b.hp; sh[k] -= d; snd.knock();
  fx.push({ k: 'ring', x: x + 0.5, y: y + 0.5, t: 0.25, T: 0.25, R: 0.6, col: '200,160,100' });
  if (sh[k] <= 0) { set(x, y, 1); delete sh[k]; if (pl.onTower && pl.onTower.x === x && pl.onTower.y === y) { pl.onTower = null; pl.x = x + 0.5; pl.y = y + 0.5; msg('Menara hancur! Kamu jatuh ke tanah.', '#e55'); } else msg('Bangunan hancur: ' + b.n, '#e55'); } }
function nearStation() { for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (T((pl.x | 0) + dx, (pl.y | 0) + dy) === 13) return true; return false; }
function nearStruct() { let b = null, bd = 1.8; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const x = (pl.x | 0) + dx, y = (pl.y | 0) + dy, t = T(x, y);
  if (t === 7 || t === 10 || t === 11 || t === 12 || t === 14 || t === 15) { const d = Math.hypot(x + 0.5 - pl.x, y + 0.5 - pl.y); if (d < bd) { bd = d; b = { x, y, t }; } } } return b; }
const nearSurv = () => survivors.find(s => !s.done && Math.hypot(s.x - pl.x, s.y - pl.y) < 1.8);
function rescue(s) { s.done = true; pl.q.rescue = 1; pl.chopT = 0.5; msg('Survivor diselamatkan! Ia menunjukkan lokasi evakuasi (lihat daftar Misi di Tas).', '#6cf'); }
function useStruct(s) { pl.chopT = 0.4;
  if (s.t === 7 || s.t === 10) { if (s.t === 10 && Math.hypot(s.x + 0.5 - pl.x, s.y + 0.5 - pl.y) < 0.8) { msg('Menyingkir dulu dari pintu', '#aaa'); return; } set(s.x, s.y, s.t === 7 ? 10 : 7); }
  else if (s.t === 11) { if (zs.some(z => z.s === 'chase' && Math.hypot(z.x - pl.x, z.y - pl.y) < 22)) { msg('Tidak bisa tidur: ada zombie mengejar', '#e55'); return; }
    gt += DAY * 0.1; pl.fat = Math.max(0, pl.fat - 60); pl.hun = Math.max(5, pl.hun - 6); pl.thr = Math.max(5, pl.thr - 8); msg('Tidur 2,4 jam: kelelahan berkurang', '#6cf'); }
  else if (s.t === 12) { stashOpen = true; toggleInv(true); }
  else if (s.t === 15) { pl.x = s.x + 0.5; pl.y = s.y + 0.5; pl.onTower = { x: s.x, y: s.y }; msg('Naik ke Menara Pemanah — bidik zombie dari ketinggian! Tekan E untuk turun.', '#6cf'); }
  else if (s.t === 14) { const g = gens.find(q => q.x === s.x && q.y === s.y); if (!g) return; if (g.t > 0) { msg('Generator sudah menyala (' + Math.ceil(g.t) + ' dtk)', '#aaa'); return; }
    if (have('Bahan Kimia') < 1) { msg('Butuh 1 Bahan Kimia sebagai bahan bakar', '#e55'); return; } takeN('Bahan Kimia', 1); g.t = 240; pl.q.gen = 1; msg('Generator menyala 4 menit (suaranya menarik zombie!)', '#6c6'); } }
const lights = () => { const a = objs.filter(o => o.k === 'fire'); for (const g of gens) if (g.t > 0) a.push({ x: g.x + 0.5, y: g.y + 0.5 }); for (const b of burns) a.push({ x: b.x, y: b.y }); return a; };
function drawStruct(x, y, t) {
  if (t === 15) { const pts = [[x + 0.12,y + 0.12],[x + 0.88,y + 0.12],[x + 0.88,y + 0.88],[x + 0.12,y + 0.88]].map(p => toS(p[0],p[1])); const X = ox(), Y = oy(), h = 146;
    ctx.lineCap = 'round'; ctx.lineWidth = 7; ctx.strokeStyle = '#5b3b22'; for (const p of pts) { ctx.beginPath(); ctx.moveTo(p[0]+X,p[1]+Y); ctx.lineTo(p[0]+X,p[1]+Y-h); ctx.stroke(); }
    ctx.lineWidth = 3; ctx.strokeStyle = '#9b7040'; for (let i=0;i<4;i++) { const a=pts[i],b=pts[(i+1)%4]; ctx.beginPath(); ctx.moveTo(a[0]+X,a[1]+Y-h+10); ctx.lineTo(b[0]+X,b[1]+Y-h+10); ctx.stroke(); }
    ctx.lineWidth = 5; ctx.strokeStyle = '#6e4b2b'; ctx.beginPath(); ctx.moveTo(pts[3][0]+X,pts[3][1]+Y); ctx.lineTo(pts[3][0]+X,pts[3][1]+Y-h); ctx.stroke();
    diamond(x, y, h, '#b58a52'); ctx.fillStyle = '#8b6238'; ctx.fillRect(pts[3][0]+X-2,pts[3][1]+Y-h+15,4,h-15);
  } else if (t === 6) box(x, y, 56, '#a07848', '#7a5a34', '#5c4328'); else if (t === 7) box(x + 0.04, y + 0.04, 54, '#8a6a3a', '#6a4f2a', '#4f3a1f');
  else if (t === 10) { boxS(x, y, 0.14, 54, ['#8a6a3a', '#6a4f2a', '#4f3a1f']); boxS(x + 0.86, y + 0.86, 0.14, 54, ['#8a6a3a', '#6a4f2a', '#4f3a1f']); }
  else if (t === 8) box(x + 0.05, y + 0.05, 28, '#8b6a3c', '#6a4e2a', '#503a1f'); else if (t === 9) boxS(x + 0.35, y + 0.35, 0.3, 26, ['#a98a58', '#7c6340', '#5e4a30']);
  else if (t === 11) box(x + 0.1, y + 0.1, 14, '#c9d2e8', '#8e98b5', '#6d7692'); else if (t === 12) boxS(x + 0.1, y + 0.1, 0.8, 22, ['#7a6650', '#5a4a3a', '#43372b']);
  else if (t === 13) box(x + 0.05, y + 0.05, 26, '#7b8087', '#52565b', '#3d4044');
  else if (t === 14) { const g = gens.find(q => q.x === x && q.y === y); box(x + 0.1, y + 0.1, 24, '#d4aa30', '#977a1f', '#735c17'); if (g && g.t > 0) { const s = toS(x + 0.5, y + 0.5); ctx.fillStyle = '#6f6'; ctx.fillRect(s[0] + ox() - 3, s[1] + oy() - 28, 6, 4); } }
  const hp = sh[y * N + x], mx = (BD.find(q => q.t === t || (t === 10 && q.t === 7)) || {}).hp;
  if (hp != null && mx && hp < mx) { const s = toS(x + 0.5, y + 0.5); ctx.fillStyle = '#300'; ctx.fillRect(s[0] + ox() - 14, s[1] + oy() - 70, 28, 3); ctx.fillStyle = '#e44'; ctx.fillRect(s[0] + ox() - 14, s[1] + oy() - 70, 28 * hp / mx, 3); } }
function drawSurv(s) { person(s, '#4a90d9', '#e0c0a0', false); const p = toS(s.x, s.y), X = p[0] + ox(), Y = p[1] + oy() - 50 + Math.sin(performance.now() / 300) * 2; ctx.fillStyle = '#6cf'; ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X + 5, Y - 8); ctx.lineTo(X - 5, Y - 8); ctx.fill(); }
function drawGhost() { drawThrown(); drawTutMark(); if (bmode != null) { const [tx, ty] = targetTile(), valid = canBuild(tx, ty); ctx.save(); ctx.globalAlpha = 0.48; drawStruct(tx, ty, BD[bmode].t); ctx.restore(); diamond(tx, ty, 0, valid ? 'rgba(80,220,100,.55)' : 'rgba(230,70,70,.55)'); }
  if (pl.q.rescue || EG[((EV.y / 4) | 0) * GW + ((EV.x / 4) | 0)]) { const s = toS(EV.x, EV.y), X = s[0] + ox(), Y = s[1] + oy(), b = Math.sin(performance.now() / 400) * 3;
    ctx.strokeStyle = 'rgba(80,170,255,.85)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(X, Y, 3 * 1.414 * HW, 3 * 1.414 * HH, 0, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X, Y - 90 + b); ctx.stroke(); } }
// ---- UI: skill, bangun, storage, misi ----
const SKN = [['c', 'Combat', 'Damage +5%, crit +2%'], ['s', 'Survival', 'Lapar/haus turun -6%'], ['k', 'Crafting', 'Waktu craft -10%'], ['t', 'Stealth', 'Suara -8%, deteksi -5%'], ['e', 'Endurance', 'Stamina pulih +6%, sprint hemat 5%']];
function skillHTML() { let h = `<hr><b>KARAKTER</b> Lv ${pl.lv} · XP ${pl.xp}/${needXP(pl.lv)} · Poin: ${pl.sp}`; for (const [k, n, d] of SKN) h += `<p style="margin:3px 0"><button data-sk="${k}"${pl.sp > 0 && pl.sk[k] < 5 ? '' : ' disabled'}>+</button> <b>${n}</b> ${pl.sk[k]}/5 <small>${d}</small></p>`; return h; }
function buildHTML() { let h = '<hr><b>BANGUN</b> <small>(pilih, lalu klik/F untuk pasang)</small>'; BD.forEach((b, i) => { const ok = Object.keys(b.cost).every(k => have(k) >= b.cost[k]);
  h += `<p style="margin:4px 0;opacity:${ok ? 1 : 0.55}"><button data-b="${i}">Pilih</button> <b>${b.n}</b><br><small>${costText(b)} — ${b.d}</small></p>`; }); return h; }
gid('cr').addEventListener('click', e => { const sk = e.target.closest('button[data-sk]'), bd = e.target.closest('button[data-b]');
  if (sk && !sk.disabled) { const k = sk.dataset.sk; if (pl.sp > 0 && pl.sk[k] < 5) { pl.sk[k]++; pl.sp--; renderInv(); } } else if (bd) enterBuild(+bd.dataset.b); });
function renderStash() { const g = gid('sg'); g.style.display = stashOpen ? 'grid' : 'none'; g.innerHTML = '<div style="grid-column:1/-1;font-size:11px;color:#aaa">STORAGE</div>'; if (stashOpen) stash.forEach((it, i) => g.appendChild(slotEl({ k: 's', i }, it))); }
function dirTo(x, y) { const du = ((x - pl.x) - (y - pl.y)) / SQ, dv = ((x - pl.x) + (y - pl.y)) / SQ; return ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'][Math.round(Math.atan2(dv, du) / (Math.PI / 4) + 8) % 8] + ' ' + (Math.hypot(du, dv) | 0) + ' m'; }
function questHTML() { let h = '<hr>' + `<b>Misi opsional</b> · Lv ${pl.lv} · XP ${pl.xp}/${needXP(pl.lv)}<br>`;
  for (const q of QS) h += `${q.done ? '✔' : '○'} <b>${q.n}</b> — ${q.d} (${Math.min(q.g, q.p())}/${q.g})${q.done ? '' : ' +' + q.xp + ' XP'}<br>`;
  if (pl.q.rescue && !QS[7].done) h += 'Titik evakuasi: ' + dirTo(EV.x, EV.y) + '<br>'; const sv = survivors.filter(q => !q.done).sort((a, b) => Math.hypot(a.x - pl.x, a.y - pl.y) - Math.hypot(b.x - pl.x, b.y - pl.y))[0]; if (sv && !QS[6].done) h += 'Survivor terdekat: ' + dirTo(sv.x, sv.y) + '<br>'; return h; }
function lvHud() { gid('lv').textContent = 'Lv ' + pl.lv + '  XP ' + pl.xp + '/' + needXP(pl.lv) + (pl.sp ? '  ★ ' + pl.sp + ' poin skill' : ''); }
gid('hud').insertAdjacentHTML('beforeend', '<div id="lv" style="font-size:12px;color:#ffd86b"></div>');
document.body.insertAdjacentHTML('beforeend', '<div id="bb"><button id="bbp">PASANG</button><button id="bbc">BATAL</button></div>');
const st6 = document.createElement('style');
st6.textContent = '#sg{display:none;grid-template-columns:repeat(4,var(--c));gap:3px;touch-action:none;align-content:start}#inv{top:152px!important}#feed{top:174px!important}#bb{position:fixed;left:50%;bottom:80px;transform:translateX(-50%);display:none;gap:8px;z-index:3}#bb button{padding:10px 16px;font-size:13px;font-weight:700;background:rgba(40,120,60,.85);color:#fff;border:1px solid #8c8;border-radius:6px}#bb button+button{background:rgba(140,50,50,.85);border-color:#c88}';
document.head.appendChild(st6);
gid('bbp').addEventListener('pointerdown', e => { e.preventDefault(); placeBuild(); }); gid('bbc').addEventListener('pointerdown', e => { e.preventDefault(); cancelBuild(); });
// ================= TAHAP 7: SETTINGS, AUDIO, CUACA, SIMPAN OTOMATIS =================
function loadCfg() { const d = { vm: 0.7, vs: 1, vmu: 0.5, diff: 'normal', zpop: 1, loot: 1, resp: 1, day: 480, night: 1, aggr: 1 };
  try { return Object.assign(d, JSON.parse(localStorage.getItem('deadcity_cfg') || '{}')); } catch (e) { return d; } }
const saveCfg = () => { try { localStorage.setItem('deadcity_cfg', JSON.stringify(cfg)); } catch (e) { /* abaikan */ } };
const DM = { easy: 0.65, normal: 1, hard: 1.5 }, LM = () => cfg.loot * ({ easy: 1.25, normal: 1, hard: 0.8 })[cfg.diff];
let menuOpen = false;
function nightOverlay(dk) { const a = dk * 0.5; if (a <= 0.005) return;
  if (pl.fl) { const q = toS(pl.x, pl.y), gx = q[0] + ox(), gy = q[1] + oy() - 20, g2 = ctx.createRadialGradient(gx, gy, 40, gx, gy, 300);
    g2.addColorStop(0, 'rgba(4,8,30,' + a * 0.15 + ')'); g2.addColorStop(1, 'rgba(4,8,30,' + Math.min(0.92, a * 1.15) + ')'); ctx.fillStyle = g2; }
  else ctx.fillStyle = 'rgba(4,8,30,' + a + ')'; ctx.fillRect(0, 0, W, H); }
function toggleFlash() { if (over) return; pl.fl = !pl.fl; msg(pl.fl ? 'Senter menyala' : 'Senter mati', '#ffd86b'); }
// ---- audio: semua suara disintesis (tanpa file/aset eksternal) ----
const snd = (() => { let ac, mg, sg, mug, rg, nb, dl, st = 6, lastHurt = 0;
  const at = (x, y) => { const d = Math.hypot(x - pl.x, y - pl.y), v = Math.max(0, 1 - d / 26); return [v * v, Math.max(-1, Math.min(1, ((x - pl.x) - (y - pl.y)) / 1.4142 / 18))]; };
  const out = pan => { const g = ac.createGain(); if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(sg); } else g.connect(sg); return g; };
  const burst = (t, dur, f, q, v, pan, ft) => { const s = ac.createBufferSource(); s.buffer = nb; const fl = ac.createBiquadFilter(); fl.type = ft || 'bandpass'; fl.frequency.value = f; fl.Q.value = q;
    const e = ac.createGain(), T0 = ac.currentTime + t; e.gain.setValueAtTime(Math.max(0.002, v), T0); e.gain.exponentialRampToValueAtTime(0.001, T0 + dur); s.connect(fl); fl.connect(e); e.connect(out(pan)); s.start(T0, Math.random() * 0.5, dur + 0.05); };
  const tone = (t, dur, f0, f1, v, pan, type) => { const o = ac.createOscillator(); o.type = type || 'sine'; const T0 = ac.currentTime + t; o.frequency.setValueAtTime(f0, T0); if (f1) o.frequency.exponentialRampToValueAtTime(f1, T0 + dur);
    const e = ac.createGain(); e.gain.setValueAtTime(Math.max(0.002, v), T0); e.gain.exponentialRampToValueAtTime(0.001, T0 + dur); o.connect(e); e.connect(out(pan)); o.start(T0); o.stop(T0 + dur + 0.05); };
  const A = {
    init() { if (ac) { if (ac.state === 'suspended') ac.resume(); return; } const C = window.AudioContext || window.webkitAudioContext; if (!C) return; try { ac = new C(); } catch (e) { return; }
      mg = ac.createGain(); mg.connect(ac.destination); sg = ac.createGain(); sg.connect(mg); mug = ac.createGain(); mug.connect(mg); rg = ac.createGain(); rg.gain.value = 0; rg.connect(mg);
      nb = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
            const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240; lp.connect(mug); // musik horor: drone rendah
      for (const [f, ty] of [[55, 'sawtooth'], [58.3, 'sawtooth'], [110.5, 'sine']]) { const o = ac.createOscillator(); o.type = ty; o.frequency.value = f; const g = ac.createGain(); g.gain.value = ty === 'sine' ? 0.25 : 0.4; o.connect(g); g.connect(lp); o.start(); }
      const lf = ac.createOscillator(); lf.frequency.value = 0.07; const lg = ac.createGain(); lg.gain.value = 90; lf.connect(lg); lg.connect(lp.frequency); lf.start();
      dl = ac.createDelay(1); dl.delayTime.value = 0.4; const fb = ac.createGain(); fb.gain.value = 0.5; dl.connect(fb); fb.connect(dl); dl.connect(mug); A.apply(); },
    apply() { if (!ac) return; mg.gain.value = cfg.vm; sg.gain.value = cfg.vs; mug.gain.value = cfg.vmu * 0.35; },
    tick(dt) { if (!ac) return;
      if ((st -= dt) <= 0) { st = 9 + Math.random() * 14; const o = ac.createOscillator(), g = ac.createGain(), T0 = ac.currentTime; o.frequency.value = [196, 233, 277, 311, 415][(Math.random() * 5) | 0]; g.gain.setValueAtTime(0.0001, T0); g.gain.linearRampToValueAtTime(0.12 + darkness() * 0.1, T0 + 0.6); g.gain.exponentialRampToValueAtTime(0.0005, T0 + 4); o.connect(g); g.connect(mug); g.connect(dl); o.start(T0); o.stop(T0 + 4.2); } },
    shot(p) { if (!ac) return; burst(0, 0.14, 1800, 0.7, 0.9 * p + 0.1, 0); tone(0, 0.12, 140, 50, 0.8 * p + 0.1, 0); },
    reload() { if (!ac) return; burst(0, 0.05, 2500, 3, 0.4, 0); burst(0.4, 0.06, 1800, 3, 0.5, 0); },
    swing() { if (!ac) return; burst(0, 0.18, 900, 0.8, 0.3, 0, 'lowpass'); },
    loot() { if (!ac) return; tone(0, 0.09, 660, 880, 0.2, 0); tone(0.09, 0.12, 880, 1175, 0.2, 0); },
    step() { if (!ac) return; burst(0, 0.07, 180, 1, 0.16, 0, 'lowpass'); },
    knock() { if (!ac) return; burst(0, 0.09, 250, 1.5, 0.4, 0, 'lowpass'); },
    hurt() { if (!ac || performance.now() - lastHurt < 250) return; lastHurt = performance.now(); burst(0, 0.12, 200, 1, 0.6, 0, 'lowpass'); tone(0, 0.15, 180, 90, 0.3, 0); },
    hit(z) { if (!ac) return; const [v, p] = at(z.x, z.y); if (v > 0.02) burst(0, 0.08, 300, 1, 0.5 * v, p, 'lowpass'); },
    zombie(z) { if (!ac) return; const [v, p] = at(z.x, z.y); if (v < 0.03) return; const P = { walker: [95, 70, 0.7, 0.2], runner: [170, 110, 0.5, 0.18], brute: [55, 38, 1, 0.32], screamer: [320, 250, 0.6, 0.2], bloater: [70, 50, 0.8, 0.22] }[z.type]; tone(0, P[2], P[0], P[1], P[3] * v, p, z.type === 'bloater' ? 'square' : 'sawtooth'); },
    scream(z) { if (!ac) return; const [v, p] = at(z.x, z.y); tone(0, 1.1, 500, 1400, 0.3 * Math.max(0.3, v), p, 'sawtooth'); },
    
    boom() { if (!ac) return; burst(0, 1.4, 160, 0.5, 1, 0, 'lowpass'); burst(0, 0.3, 2500, 0.7, 0.6, 0); tone(0, 0.9, 90, 30, 0.7, 0); },
    shatter() { if (!ac) return; burst(0, 0.25, 4500, 2, 0.5, 0); burst(0.05, 0.4, 700, 1, 0.3, 0, 'lowpass'); } };
  return A; })();
const stepTick = dt => { if (pl.mv && pl.dash <= 0 && !over) { pl.stp = (pl.stp || 0) - dt; if (pl.stp <= 0) { pl.stp = pl.spr ? 0.27 : 0.42; snd.step(); } } };
addEventListener('pointerdown', () => snd.init()); addEventListener('keydown', () => snd.init());
// ---- Cloud Save per akun + LocalStorage fallback untuk pemain tanpa login ----
const SKEY = 'deadcity_save_v1'; let saveT = 20;
const ZOMBIE_API = 'https://vexel-games-uploader.vexelkang.workers.dev';
const ZOMBIE_TOKEN_KEY = 'vexel_player_session';
let cloudBusy = false, cloudPending = null, cloudLoading = true, lastCloudSnapshot = '', lastCloudErrorAt = 0;
const playerToken = () => { try { return localStorage.getItem(ZOMBIE_TOKEN_KEY) || ''; } catch (_) { return ''; } };
const clearSave = () => { try { localStorage.removeItem(SKEY); } catch (e) { /* abaikan */ } };
function b64(u8) { let t = ''; for (let i = 0; i < u8.length; i += 4096) t += String.fromCharCode.apply(null, u8.subarray(i, i + 4096)); return btoa(t); }
function unb64(str, arr) { const t = atob(str); for (let i = 0; i < t.length && i < arr.length; i++) arr[i] = t.charCodeAt(i); }
async function zombieRequest(path, options = {}) {
  const token = playerToken();
  if (!token) throw new Error('Silakan login menggunakan akun siswa untuk Cloud Save.');
  const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {}, { Authorization: 'Bearer ' + token });
  const res = await fetch(ZOMBIE_API + path, Object.assign({ cache: 'no-store' }, options, { headers }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Cloud Save gagal (' + res.status + ').');
  return data;
}
function snapshotSave() {
  return { v: 1, map: b64(map), eg: b64(EG), gt, sh, gens, stash, inv, objs,
    loot: loot.map(l => Object.assign({}, l, { ig: 0 })), survivors, tut, qd: QS.map(q => q.done),
    cr: crates.map(c => [c.open, c.t]), wc: wcont.map(c => [c.open, c.t]), rq: respawnQ, ch: chops,
    zs: zs.map(z => [z.x, z.y, z.type, z.hp]), dead: !!over,
    pl: { x: pl.x, y: pl.y, onTower: pl.onTower || null, hp: pl.hp, st: pl.st, hun: pl.hun, thr: pl.thr, inf: pl.inf, tmp: pl.tmp, fat: pl.fat, bleed: pl.bleed, xp: pl.xp, lv: pl.lv, sp: pl.sp, sk: pl.sk, q: pl.q, kills: pl.kills, eq: pl.eq, cur: pl.cur, fl: pl.fl } };
}
function applySave(o) {
  if (!o || o.v !== 1 || o.newWorld) return false;
  try {
    unb64(o.map, map); unb64(o.eg, EG); gt = o.gt;
    for (const k in sh) delete sh[k]; Object.assign(sh, o.sh);
    gens.length = 0; gens.push(...o.gens);
    o.stash.forEach((it, i) => { stash[i] = it; });
    inv.g = o.inv.g; inv.money = o.inv.money; objs = o.objs; loot = o.loot;
    survivors.length = 0; survivors.push(...o.survivors);
    QS.forEach((q, i) => { q.done = !!o.qd[i]; });
    o.cr.forEach((c, i) => { if (crates[i]) { crates[i].open = c[0]; crates[i].t = c[1]; } });
    (o.wc || []).forEach((c, i) => { if (wcont[i]) { wcont[i].open = c[0]; wcont[i].t = c[1]; } });
    respawnQ = o.rq || []; chops = o.ch || {};
    tut = o.tut || { step: 99, done: true, crates: 0, chops: 0, crafts: 0, builds: 0, mv: 0, px: 0, py: 0, tgt: null, tT: 0 };
    zs.length = 0;
    for (const z of (o.zs || [])) { spawnZ(z[0], z[1], z[2]); zs[zs.length - 1].hp = z[3]; }
    Object.assign(pl, o.pl); pl.onTower = o.pl.onTower || null;
    if (o.dead) { over = true; gid('over').style.display = 'flex'; }
    msg('Dunia berhasil dipulihkan dari server', '#6cf');
    return true;
  } catch (e) { console.error('Cloud save restore failed:', e); return false; }
}
function loadSave() {
  try { const o = JSON.parse(localStorage.getItem(SKEY)); if (o) applySave(o); }
  catch (e) { console.warn('Local save tidak dapat dibaca:', e); }
}
async function cloudSave(o, keepalive, show) {
  if (!playerToken()) return;
  const json = JSON.stringify(o);
  if (json === lastCloudSnapshot) return;
  if (cloudBusy) { cloudPending = o; return; }
  cloudBusy = true;
  try {
    await zombieRequest('/zombie/save', { method: 'POST', body: json === '' ? '{}' : JSON.stringify({ save: o }), keepalive: !!keepalive });
    lastCloudSnapshot = json;
    if (show) msg('Progress tersimpan di server', '#6cf');
  } catch (e) {
    console.warn('Cloud Save:', e);
    if (show || (!keepalive && Date.now() - lastCloudErrorAt > 60000)) { msg('Cloud Save tertunda: ' + e.message, '#e9b45b'); lastCloudErrorAt = Date.now(); }
  } finally {
    cloudBusy = false;
    if (cloudPending) { const next = cloudPending; cloudPending = null; cloudSave(next, false, false); }
  }
}
function save(show, keepalive) {
  if (!pl) return;
  try {
    const o = snapshotSave();
    try { localStorage.setItem(SKEY, JSON.stringify(o)); } catch (_) {}
    cloudSave(o, !!keepalive, !!show);
    if (show && !playerToken()) msg('Progress disimpan di perangkat ini', '#6cf');
  } catch (e) { if (show) msg('Gagal menyimpan: ' + e.message, '#e55'); }
}
async function initializeCloudSave() {
  const token = playerToken();
  if (!token) {
    loadSave();
    cloudLoading = false;
    return;
  }
  try {
    const data = await zombieRequest('/zombie/save');
    if (data.save && !data.save.newWorld) {
      applySave(data.save);
      lastCloudSnapshot = JSON.stringify(data.save);
    } else {
      // LocalStorage lama tidak dipindahkan otomatis ke akun baru agar data antarsiswa tidak tercampur.
      clearSave();
      lastCloudSnapshot = '';
      msg('Dunia baru siap. Progres akan tersimpan ke akun ini.', '#6cf');
    }
  } catch (e) {
    console.warn('Cloud Save load failed:', e);
    loadSave();
    msg('Server belum terjangkau; memakai penyimpanan lokal sementara.', '#e9b45b');
  } finally {
    cloudLoading = false;
  }
}
async function createNewCloudWorld() {
  if (!playerToken()) {
    clearSave(); startGame(); save(false);
    msg('Dunia baru dimulai (penyimpanan lokal). Login untuk Cloud Save.', '#e9b45b');
    return;
  }
  try {
    await zombieRequest('/zombie/new-world', { method: 'POST', body: '{}' });
    clearSave(); lastCloudSnapshot = '';
    startGame();
    save(false);
    msg('Dunia baru dibuat. Dunia lama tetap tersimpan di arsip server.', '#6cf');
  } catch (e) {
    msg('Dunia baru tidak dibuat: ' + e.message, '#e55');
  }
}
const autoSave = dt => { if ((saveT -= dt) <= 0) { saveT = 20; save(false); } };
addEventListener('pagehide', () => save(false, true));
if (document.addEventListener) document.addEventListener('visibilitychange', () => {
  if (document.hidden) save(false, true);
});
// ---- menu pengaturan ----
function applyCfg() { ZN = Math.round(80 * cfg.zpop); const od = DAY; DAY = cfg.day; if (od !== DAY) gt = gt / od * DAY; while (zs.length > ZN) zs.pop(); snd.apply(); }
const SET = [['vm', 'Volume utama', 0, 1, 0.05], ['vs', 'Volume efek', 0, 1, 0.05], ['vmu', 'Volume musik', 0, 1, 0.05], ['zpop', 'Populasi zombie', 0.3, 2, 0.1], ['loot', 'Kelimpahan loot', 0.3, 2, 0.1], ['resp', 'Respawn sumber daya', 0.3, 3, 0.1], ['day', 'Panjang hari (detik)', 120, 1200, 30], ['night', 'Kesulitan malam', 0.3, 2, 0.1], ['aggr', 'Agresi zombie', 0.5, 2, 0.1]];
let newSure = false;
function menuHTML() { let h = '<b>PENGATURAN</b><div style="margin:6px 0">Kesulitan: ' + ['easy', 'normal', 'hard'].map(d => `<button data-d="${d}"${cfg.diff === d ? ' class="on"' : ''}>${{ easy: 'Mudah', normal: 'Normal', hard: 'Sulit' }[d]}</button>`).join('') + '</div>';
  for (const [k, n, mi, ma, stp] of SET) h += `<div class="sr"><label>${n}: <span id="v_${k}">${cfg[k]}</span></label><input type="range" data-k="${k}" min="${mi}" max="${ma}" step="${stp}" value="${cfg[k]}"></div>`;
  return h + `<div style="margin-top:8px"><button data-act="save">Simpan sekarang</button><button data-act="new">${newSure ? 'Yakin? Klik lagi' : 'Mulai baru'}</button><button data-act="tut">Panduan awal</button><button data-act="close">Tutup</button></div><p style="font-size:11px;color:#999">PC: WASD gerak · mouse bidik · klik kiri tembak · R reload · E interaksi · I tas (karakter, misi, crafting) · B bangun · F senter · Shift lari · Spasi dodge · Q atau 1-3 ganti senjata · H perban · G lempar · Molotov/Granat · Esc menu. Cloud Save otomatis tiap 20 detik saat bermain.</p>`; }
function toggleMenu(f) { if (over) return; menuOpen = f === undefined ? !menuOpen : f; gid('sp').style.display = menuOpen ? 'flex' : 'none';
  if (menuOpen) { mouse.down = false; tch.atk = false; newSure = false; gid('spb').innerHTML = menuHTML(); } else save(false); }
document.body.insertAdjacentHTML('beforeend', '<div id="bset">⚙</div><div id="sp"><div id="spb"></div></div>');
gid('sp').addEventListener('input', e => { const k = e.target.dataset && e.target.dataset.k; if (!k) return; cfg[k] = +e.target.value; gid('v_' + k).textContent = cfg[k]; applyCfg(); saveCfg(); });
gid('sp').addEventListener('click', e => { const b = e.target.closest && e.target.closest('button'); if (!b) { if (e.target.id === 'sp') toggleMenu(false); return; }
  if (b.dataset.d) { cfg.diff = b.dataset.d; saveCfg(); gid('spb').innerHTML = menuHTML(); }
  else if (b.dataset.act === 'save') save(true); else if (b.dataset.act === 'close') toggleMenu(false); else if (b.dataset.act === 'tut') { tut = newTut(); toggleMenu(false); }
  else if (b.dataset.act === 'new') { if (!newSure) { newSure = true; gid('spb').innerHTML = menuHTML(); return; } toggleMenu(false); createNewCloudWorld(); } });
const st7 = document.createElement('style');
st7.textContent = '#sp{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.78);z-index:7}#spb{background:#15181c;border:1px solid #444;padding:14px;max-width:94vw;max-height:94vh;overflow:auto;color:#d9d4c7;font-size:13px;width:380px}.sr{margin:6px 0}.sr input{width:100%}#spb button{background:#2a2f36;color:#ddd;border:1px solid #444;padding:7px 11px;margin:2px 3px 0 0;font-size:12px}#spb button.on{background:#7a3a2a}#bset{position:fixed;top:8px;left:50%;transform:translateX(-50%);width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.3);color:#fff;font-size:18px;display:flex;align-items:center;justify-content:center;z-index:3}#bFl{right:258px;bottom:160px;width:50px;height:50px}';
document.head.appendChild(st7);
gid('bset').addEventListener('pointerdown', e => { e.preventDefault(); toggleMenu(); });
{ const t = gid('touch'); if (t) { const b = document.createElement('div'); b.className = 'b'; b.id = 'bFl'; b.textContent = 'SENTER'; t.appendChild(b); b.addEventListener('pointerdown', e => { e.preventDefault(); toggleFlash(); }); } }
// ================= TAMBAHAN: SENJATA LEMPAR, LANDMINE, CROSSBOW, SENJATA BARU =================
const ALL4 = ['optic', 'muzzle', 'mag', 'under'];
Object.assign(WD, {
  deagle: { n: 'Desert Eagle', ic: 'DE', gun: 1, ammo: '.357', dmg: 78, cd: 0.55, mag: 7, rl: 1.9, sp: 0.03, rec: 0.09, range: 17, dur: 120, w: 2, noise: 24, slots: ['optic', 'muzzle', 'under'] },
  doublebarrel: { n: 'Double Barrel', ic: 'DB', gun: 1, ammo: '12g', dmg: 17, pel: 8, cd: 0.5, mag: 2, rl: 2.2, sp: 0.16, rec: 0.14, range: 7, dur: 100, w: 3, noise: 26, slots: ['muzzle', 'under'] },
  tacshotgun: { n: 'Tactical Shotgun', ic: 'TS', gun: 1, ammo: '12g', dmg: 13, pel: 6, cd: 0.45, mag: 8, rl: 2.8, sp: 0.11, rec: 0.07, range: 9, dur: 140, w: 3.6, noise: 24, slots: ALL4 },
  m4a1: { n: 'M4A1', ic: 'M4', gun: 1, ammo: '5.56', dmg: 27, cd: 0.09, mag: 30, rl: 2, sp: 0.045, rec: 0.02, range: 20, dur: 220, w: 3.4, noise: 24, slots: ALL4 },
  assault: { n: 'Assault Rifle', ic: 'AR', gun: 1, ammo: '5.56', dmg: 33, cd: 0.13, mag: 25, rl: 2.2, sp: 0.05, rec: 0.03, range: 21, dur: 200, w: 4, noise: 26, slots: ALL4 },
  crossbow: { n: 'Crossbow', ic: 'XB', gun: 1, ammo: 'baut', dmg: 95, cd: 1.2, mag: 1, rl: 1.6, sp: 0.01, rec: 0.04, range: 20, dur: 160, w: 2.5, noise: 2, spd: 16, slots: ['optic', 'under'] },
  parang: { n: 'Parang', ic: 'PR', dmg: 60, cd: 0.6, range: 1.7, dur: 140, w: 1.2, noise: 3 },
  palu: { n: 'Palu', ic: 'PL', dmg: 66, cd: 0.8, range: 1.5, dur: 170, w: 2, noise: 4 },
  pedang: { n: 'Pedang', ic: 'PD', dmg: 82, cd: 0.55, range: 1.9, dur: 150, w: 1.6, noise: 3 } });
const WKEYS = Object.keys(WD).filter(k => k !== 'knife');
Object.assign(IT, {
  '5.56': { n: 'Peluru 5.56', w: 0.03, st: 60, ic: '556', d: 'Amunisi M4A1 dan Assault Rifle.' }, baut: { n: 'Baut Panah', w: 0.05, st: 20, ic: 'BP', d: 'Amunisi Crossbow (senyap).' },
  molotov: { n: 'Molotov', w: 0.5, st: 5, ic: 'MV', d: 'Lempar: api membakar area 7 detik. Pilih lalu tekan G.' },
  grenade: { n: 'Granat', w: 0.5, st: 5, ic: 'GN', d: 'Lempar: meledak setelah 1,7 detik, radius 3. Pilih lalu tekan G.' },
  landmine: { n: 'Landmine', w: 1, st: 3, ic: 'LM', d: 'Letakkan: meledak saat zombie mendekat.' } });
RC.push({ n: 'Molotov', t: 3, need: { Kain: 1, 'Bahan Kimia': 1 }, out: ['throw', 'molotov', 1] },
  { n: 'Granat', t: 6, st: 1, need: { 'Komponen Kecil': 3, 'Bahan Kimia': 2 }, out: ['throw', 'grenade', 1] },
  { n: 'Landmine', t: 7, st: 1, need: { 'Komponen Kecil': 3, 'Bahan Kimia': 2, 'Komponen Elektronik': 1 }, out: ['place', 'landmine', 1] },
  { n: 'Baut Panah x4', t: 3, need: { Kayu: 1, 'Komponen Kecil': 1 }, out: ['ammo', 'baut', 4] },
  { n: 'Peluru 5.56 x10', t: 4, st: 1, need: { 'Komponen Kecil': 2, 'Bahan Kimia': 1 }, out: ['ammo', '5.56', 10] });
const thrown = [], burns = [];
function boom(x, y, r, dmg) {
  for (const z of zs.slice()) { const dx = z.x - x, dy = z.y - y, d = Math.hypot(dx, dy); if (d < r) damageZ(z, dmg * (1 - d / r * 0.6), dx / (d || 1), dy / (d || 1), false); }
  const pd = Math.hypot(pl.x - x, pl.y - y); if (pd < r) hurtPlayer(dmg * 0.6 * (1 - pd / r * 0.6));
  for (let ty = Math.floor(y - r); ty <= Math.floor(y + r); ty++) for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) if (HIT.has(T(tx, ty)) && Math.hypot(tx + 0.5 - x, ty + 0.5 - y) < r) hitStruct(tx, ty, dmg * 0.8);
  fx.push({ k: 'ring', x, y, t: 0.5, T: 0.5, R: r, col: '255,180,80' }); fx.push({ k: 'ring', x, y, t: 0.3, T: 0.3, R: r * 0.6, col: '255,240,200' }); noise(x, y, 30); snd.boom(); }
function throwNow() { if (over || invOpen || mapOpen || menuOpen || bmode != null || (pl.thCd || 0) > 0) return;
  let K = pl.thSel; if (!K || have(K) < 1) K = have('molotov') > 0 ? 'molotov' : have('grenade') > 0 ? 'grenade' : null;
  if (!K) { msg('Tidak ada Molotov/Granat', '#e55'); pl.thCd = 0.5; return; }
  pl.thSel = K; takeN(K, 1); pl.thCd = 0.7; const a = pl.ang; let dist = document.body.classList.contains('t') ? 7 : Math.min(9, Math.hypot(mw[0] - pl.x, mw[1] - pl.y));
  for (let d = 0.5; d <= dist; d += 0.25) if (solid(T(Math.floor(pl.x + Math.cos(a) * d), Math.floor(pl.y + Math.sin(a) * d)))) { dist = Math.max(0.3, d - 0.3); break; }
  thrown.push({ k: K, sx: pl.x, sy: pl.y, tx: pl.x + Math.cos(a) * dist, ty: pl.y + Math.sin(a) * dist, t: 0, T: 0.55, fuse: 1.7 }); snd.swing(); noise(pl.x, pl.y, 6); }
function thrownTick(dt) { pl.thCd = Math.max(0, (pl.thCd || 0) - dt);
  for (let i = thrown.length - 1; i >= 0; i--) { const o = thrown[i]; o.t += dt;
    if (o.k === 'molotov' && o.t >= o.T) { burns.push({ x: o.tx, y: o.ty, t: 7, r: 1.8 }); snd.shatter(); noise(o.tx, o.ty, 10); thrown.splice(i, 1); }
    else if (o.k === 'grenade' && o.t >= o.T + o.fuse) { boom(o.tx, o.ty, 3, 120); thrown.splice(i, 1); } }
  for (let i = burns.length - 1; i >= 0; i--) { const b = burns[i]; b.t -= dt;
    for (const z of zs.slice()) if (Math.hypot(z.x - b.x, z.y - b.y) < b.r) { z.hp -= 12 * dt; z.hit = Math.max(z.hit, 0.2); if (z.hp <= 0) killZ(z); }
    if (!over && Math.hypot(pl.x - b.x, pl.y - b.y) < b.r * 0.8) hurtPlayer(6 * dt);
    if (b.t <= 0) burns.splice(i, 1); } }
function drawThrown() { const now = performance.now();
  for (const b of burns) { const s = toS(b.x, b.y), X = s[0] + ox(), Y = s[1] + oy(), f = Math.sin(now / 80 + b.x * 5) * 0.12 + 1, a = Math.min(1, b.t / 2);
    ctx.fillStyle = 'rgba(255,120,30,' + 0.35 * a + ')'; ctx.beginPath(); ctx.ellipse(X, Y, b.r * 1.414 * HW * f, b.r * 1.414 * HH * f, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,220,90,' + 0.5 * a + ')'; for (let i = 0; i < 5; i++) { const g = i * 1.3 + now / 300, rr = b.r * (i % 2 ? 0.6 : 0.3); ctx.beginPath(); ctx.ellipse(X + Math.cos(g) * rr * HW, Y + Math.sin(g) * rr * HH - 6, 5, 9 + 3 * Math.sin(now / 70 + i), 0, 0, 7); ctx.fill(); } }
  for (const o of thrown) { const f = Math.min(1, o.t / o.T), s = toS(o.sx + (o.tx - o.sx) * f, o.sy + (o.ty - o.sy) * f), X = s[0] + ox(), Y = s[1] + oy(), h = Math.sin(f * Math.PI) * 40;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(X, Y, 5, 2.5, 0, 0, 7); ctx.fill(); ctx.fillStyle = o.k === 'molotov' ? '#5aa05a' : '#4a5a3a'; ctx.beginPath(); ctx.arc(X, Y - h - 4, 4, 0, 7); ctx.fill();
    if (o.k === 'grenade' && f >= 1 && Math.sin(now / 90) > 0) { ctx.fillStyle = '#f33'; ctx.fillRect(X - 1, Y - 9, 3, 3); } } }
function thHud() { const K = pl.thSel && have(pl.thSel) > 0 ? pl.thSel : have('molotov') > 0 ? 'molotov' : have('grenade') > 0 ? 'grenade' : null; gid('th').textContent = 'Lempar (G): ' + (K ? IT[K].n + ' x' + have(K) : '—'); }
document.body.insertAdjacentHTML('beforeend', '<div id="th"></div>');
const st8 = document.createElement('style');
st8.textContent = '#th{position:fixed;right:14px;top:74px;font-size:11px;color:#cfc8b2;pointer-events:none;text-shadow:0 0 3px #000}#bGr{right:258px;bottom:220px;width:50px;height:50px}';
document.head.appendChild(st8);
{ const t = gid('touch'); if (t) { const b = document.createElement('div'); b.className = 'b'; b.id = 'bGr'; b.textContent = 'LEMPAR'; t.appendChild(b); b.addEventListener('pointerdown', e => { e.preventDefault(); throwNow(); }); } }
// ================= KENDARAAN RUSAK + ANIMASI ZOMBIE PER JENIS =================
const corpses = [], wrecks = [], wcont = [], wreckAt = new Map();
CT.mobil = { n: 'Mobil Rusak', c: ['#888', '#666', '#444'], roll: 3, tb: [['mat', 'Komponen Kecil'], ['mat', 'Bahan Kimia'], ['mat', 'Kain'], ['mat', 'Komponen Elektronik'], ['food', 'Air Minum'], ['food', 'Makanan Kaleng'], ['med', 'Perban'], ['ammo', 'Amunisi'], ['money', 'Uang']] };
const WKIND = { sedan: 2, van: 2, truck: 3, bus: 3 };
const WCOL = [['#8a3a2e', '#64291f', '#4a1e17'], ['#3b5873', '#2a4156', '#1f3140'], ['#8a8d90', '#64676a', '#4d5052'], ['#c9c5b8', '#9a968a', '#767268'], ['#5d6b3a', '#434e2a', '#323a1f'], ['#2c2c2e', '#1f1f20', '#161617']];
function placeWreck(x, y, kind, ori, zn) { const w = WKIND[kind], tiles = [];
  for (let i = 0; i < w; i++) { const tx = ori === 'x' ? x + i : x, ty = ori === 'y' ? y + i : y;
    if (T(tx, ty) !== 1 || zoneAt(tx, ty) === 0 || Math.hypot(tx - EV.x, ty - EV.y) < 6) return false; tiles.push([tx, ty]); }
  if (crates.some(c => Math.hypot(c.x - x, c.y - y) < 3)) return false;
  const ci = rnd() < 0.2 ? 5 : (rnd() * 5) | 0, wr = { x, y, w, kind, ori, col: WCOL[ci], sd: (rnd() * 1000) | 0 };
  tiles.forEach(([tx, ty], i) => { set(tx, ty, 5); wreckAt.set(ty * N + tx, { wr, seg: i }); }); wrecks.push(wr);
  wr.cont = { x: ori === 'x' ? x + w / 2 : x + 0.5, y: ori === 'y' ? y + w / 2 : y + 0.5, k: 'mobil', open: false, t: 0, wr }; wcont.push(wr.cont); return true; }
(function genWrecks() { const kinds = ['sedan', 'sedan', 'van', 'truck', 'bus'], quota = { 1: 8, 2: 14, 3: 12 };
  for (const zn of [1, 2, 3]) { let n = 0, tries = 0;
    while (n < quota[zn] && tries++ < 3000) { const x = (rnd() * N) | 0, y = (rnd() * N) | 0; if (zoneAt(x, y) !== zn) continue;
      if (placeWreck(x, y, kinds[(rnd() * 5) | 0], rnd() < 0.5 ? 'x' : 'y', zn)) { n++;
        if (rnd() < 0.35 && n < quota[zn]) { const l = wrecks[wrecks.length - 1]; if (placeWreck(l.x + (l.ori === 'y' ? 2 + ((rnd() * 2) | 0) : ((rnd() * 3) | 0) - 1), l.y + (l.ori === 'x' ? 2 + ((rnd() * 2) | 0) : ((rnd() * 3) | 0) - 1), kinds[(rnd() * 5) | 0], l.ori, zn)) n++; } } } } })();
function wreckDist(c) { let m = 9; for (let i = 0; i < c.wr.w; i++) { const tx = c.wr.ori === 'x' ? c.wr.x + i : c.wr.x, ty = c.wr.ori === 'y' ? c.wr.y + i : c.wr.y; m = Math.min(m, Math.hypot(tx + 0.5 - pl.x, ty + 0.5 - pl.y)); } return m; }
function boxWin(x, y, sz, h, c, w0, w1, crack) { boxS(x, y, sz, h, c); const X = ox(), Y = oy(), S = (a, b, hh) => [X + (a - b) * HW, Y + (a + b) * HH - hh], L = (p, q, u) => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
  for (const [P, Q] of [[S(x, y + sz, h), S(x + sz, y + sz, h)], [S(x + sz, y + sz, h), S(x + sz, y, h)]]) { const a = L(P, Q, 0.12), b = L(P, Q, 0.88);
    ctx.fillStyle = '#141a20'; ctx.beginPath(); ctx.moveTo(a[0], a[1] + w0); ctx.lineTo(b[0], b[1] + w0); ctx.lineTo(b[0], b[1] + w1); ctx.lineTo(a[0], a[1] + w1); ctx.fill();
    if (crack) { ctx.strokeStyle = 'rgba(200,220,230,.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a[0] + (b[0] - a[0]) * 0.3, a[1] + w0 + 1); ctx.lineTo(a[0] + (b[0] - a[0]) * 0.6, a[1] + w1 - 1); ctx.stroke(); } } }
function drawWreckSeg(x, y) { const e = wreckAt.get(y * N + x); if (!e) { box(x + 0.1, y + 0.1, 24, '#7d3b34', '#59302b', '#442420'); return; }
  const { wr, seg } = e, c = wr.col, k = wr.kind, cr = wr.sd & 1, s = toS(x + 0.5, y + 0.5), X = s[0] + ox(), Y = s[1] + oy();
  for (const g of [-1, 1]) { if (k !== 'bus' && (wr.sd >> (seg * 2 + (g > 0 ? 1 : 0)) & 1) && seg === 0) continue; ctx.fillStyle = '#0d0d0d'; ctx.beginPath(); ctx.ellipse(X + g * 13, Y + 5, 5, 3.5, 0, 0, 7); ctx.fill(); } // roda (ada yang hilang)
  if (k === 'sedan') { box(x + 0.08, y + 0.08, 15, c[0], c[1], c[2]); if (seg === 1) boxWin(x + 0.18, y + 0.18, 0.64, 31, c, 3, 11, cr); }
  else if (k === 'van') { if (seg === 0) { box(x + 0.06, y + 0.06, 18, c[0], c[1], c[2]); boxWin(x + 0.1, y + 0.1, 0.8, 38, c, 3, 12, cr); } else box(x + 0.05, y + 0.05, 38, c[0], c[1], c[2]); }
  else if (k === 'truck') { if (seg === 0) { box(x + 0.06, y + 0.06, 18, c[0], c[1], c[2]); boxWin(x + 0.1, y + 0.1, 0.8, 40, c, 3, 12, cr); } else box(x + 0.08, y + 0.08, 22, c[1], c[1], c[2]); }
  else boxWin(x + 0.04, y + 0.04, 0.92, 46, c, 4, 13, cr && seg === 1);
  if (seg === 0 && !wr.cont.open) { const b = Math.sin(performance.now() / 300) * 2; ctx.fillStyle = '#ffd23c'; ctx.beginPath(); ctx.moveTo(X, Y - 58 + b); ctx.lineTo(X + 4, Y - 64 + b); ctx.lineTo(X - 4, Y - 64 + b); ctx.fill(); } }
// ---- animasi zombie per jenis ----
const ANI = { walker: { cyc: 0.9, str: 7, lean: 3, arm: 'reach', bob: 1.2, w: 4, drag: 1 }, runner: { cyc: 1.6, str: 11, lean: 8, arm: 'pump', bob: 2.2, w: 3.5 },
  brute: { cyc: 1.4, str: 8, lean: 2, arm: 'hang', bob: 2.4, w: 7 }, screamer: { cyc: 0.8, str: 7, lean: 1, arm: 'up', bob: 1, w: 3.5, jit: 1 }, bloater: { cyc: 0.8, str: 6, lean: 0, arm: 'out', bob: 1.2, w: 6, wad: 1 } };
const PANTS = ['#2a2d33', '#3a3226', '#232a3a', '#33262a'], SKIN = ['#8fa37a', '#9aa985', '#86987f', '#a0a589'];
function drawZombie(z) { const A = ANI[z.type], k = z.t.sc, s = toS(z.x, z.y), X = s[0] + ox(), Y = s[1] + oy(), now = performance.now() / 1000;
  if (z.ax == null) { z.ax = z.x; z.ay = z.y; z.ph = Math.random() * 6; z.vr = (Math.random() * 4) | 0; z.mv = 0; }
  const dm = Math.hypot(z.x - z.ax, z.y - z.ay); z.ax = z.x; z.ay = z.y; z.ph += dm * 6.2832 / A.cyc; z.mv += ((dm > 0.0008 ? 1 : 0) - z.mv) * 0.2;
  const mv = z.mv, ph = z.ph, f = toS(Math.cos(z.a), Math.sin(z.a)), fl = Math.hypot(f[0], f[1]) || 1, fx = f[0] / fl, fy = f[1] / fl, px = -fy, py = fx;
  const stt = z.s, p = stt === 'attack' ? 1 - Math.max(0, z.wind) / z.t.windup : 0, lunge = stt === 'lunge', scr = stt === 'scream', rec = z.hit > 0 ? z.hit / 0.6 : 0, hot = stt === 'chase' || stt === 'attack' || lunge || scr;
  const lean = (A.lean + (lunge ? 8 : 0) + p * 3) * k - rec * 5 * k, bob = (Math.abs(Math.sin(ph)) * A.bob * mv + Math.sin(now * 2 + z.x * 3) * 0.6 * (1 - mv)) * k;
  const sway = (A.wad ? Math.sin(ph) * 3 * mv * k : 0) + (A.jit ? (Math.random() - 0.5) * (scr ? 3.2 : 1.4) * k : 0);
  const body = z.hit > 0 ? '#c66' : z.t.col, pants = PANTS[z.vr], skin = SKIN[z.vr], hx = X + sway, hy = Y - 9 * k - bob;
  const ln = (a, b, c, d, w, col) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke(); };
  shadow(z.x, z.y, 11 * k + (A.w > 5 ? 3 : 0));
  for (const g of [1, -1]) { const ps = ph + (g > 0 ? 0 : Math.PI), sp = Math.sin(ps), dr = A.drag && g > 0, lift = Math.max(0, Math.cos(ps)) * 3.5 * k * mv * (dr ? 0.25 : 1), amp = A.str * k * mv * (dr ? 0.5 : 1);
    ln(hx + px * A.w * g * 0.3 * k, hy, X + px * A.w * g * 0.5 * k + fx * sp * amp, Y + py * A.w * g * 0.25 * k + fy * sp * amp * 0.5 - lift, (A.w > 5 ? 6 : 4) * k, pants); }
  const shx = hx + fx * lean, shy = hy - 12 * k + fy * lean * 0.5, hdx = shx + fx * 1.5 * k + (A.arm === 'reach' ? px * 2 * k : 0) - (scr ? fx * 4 * k : 0), hdy = shy - 7 * k + (scr ? 2 * k : 0);
  const arms = () => { for (const g of [1, -1]) { const sx = shx + px * (A.w * 0.5 + 2) * g * k, sy = shy + k, op = ph + (g > 0 ? 0 : Math.PI); let hxp, hyp;
      if (lunge) { hxp = sx + fx * 12 * k; hyp = sy + fy * 6 * k - 2 * k; }
      else if (stt === 'attack') { const q = Math.max(0, (p - 0.5) * 2); if (A.arm === 'hang') { hxp = sx + fx * q * 10 * k; hyp = p < 0.7 ? sy - 14 * k * (p / 0.7) : sy + 12 * k; } else { hxp = sx + fx * (4 + 12 * q) * k; hyp = sy + (-8 + 16 * q) * k; } }
      else if (A.arm === 'reach') { hxp = sx + fx * 9 * k + px * g * 2 * k; hyp = sy + fy * 4.5 * k - 2 * k + Math.sin(now * 3 + g) * 1.2 * k; }
      else if (A.arm === 'pump') { hxp = sx + fx * Math.sin(op) * 7 * k + px * g * 3 * k; hyp = sy + (5 - 3 * Math.cos(op)) * k; }
      else if (A.arm === 'hang') { hxp = sx + px * g * 4 * k + fx * Math.sin(op) * 3 * k; hyp = sy + 11 * k; }
      else if (A.arm === 'up') { hxp = hdx + px * g * 7 * k; hyp = hdy + 2 * k + (Math.random() - 0.5) * 1.5 * k; }
      else { hxp = sx + px * g * 10 * k + fx * 5 * k; hyp = sy + 3 * k + Math.sin(ph) * 1.5 * k; }
      const mx = (sx + hxp) / 2, my = (sy + hyp) / 2 + 1.5 * k; ln(sx, sy, mx, my, 3.4 * k, body); ln(mx, my, hxp, hyp, 3 * k, skin); } };
  if (fy < 0) arms();
  if (z.type === 'bloater') { const pu = 1 + 0.07 * Math.sin(now * 6), cx = (hx + shx) / 2, cy = (hy + shy) / 2; ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(cx, cy - k, 10.5 * k * pu, 11.5 * k * pu, 0, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(180,200,80,.35)'; ctx.beginPath(); ctx.ellipse(cx - 2 * k, cy - 3 * k, 4 * k, 3 * k, 0, 0, 7); ctx.fill(); }
  else { ln(hx, hy, shx, shy, (A.w > 5 ? 13 : A.w * 0.5 + 5) * k, body); if (z.type === 'brute') ln(shx - px * 7 * k, shy, shx + px * 7 * k, shy, 6 * k, body); }
  if ((z.vr & 1) && z.type !== 'bloater') { ctx.fillStyle = 'rgba(110,15,15,.7)'; ctx.beginPath(); ctx.ellipse((hx + shx) / 2 + px * 2 * k, (hy + shy) / 2, 2.5 * k, 3.5 * k, 0, 0, 7); ctx.fill(); }
  ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(hdx, hdy, (z.type === 'brute' ? 4.6 : z.type === 'screamer' ? 6 : 5.5) * k, 0, 7); ctx.fill();
  ctx.fillStyle = hot ? '#ff4030' : '#222'; for (const g of [1, -1]) ctx.fillRect(hdx + fx * 2.6 * k + px * g * 2 * k - 0.8, hdy + fy * 1.3 * k - 0.8, 1.7, 1.7);
  if (scr) { ctx.fillStyle = '#300'; ctx.beginPath(); ctx.ellipse(hdx + fx * 2.5 * k, hdy + 2.5 * k, 2 * k, 3 * k, 0, 0, 7); ctx.fill(); }
  if (fy >= 0) arms(); }
function drawCorpse(c) { const s = toS(c.x, c.y), X = s[0] + ox(), Y = s[1] + oy(), t = Math.min(1, c.t / 0.35), k = ZT[c.type].sc, f = toS(Math.cos(c.a), Math.sin(c.a)), fl = Math.hypot(f[0], f[1]) || 1, fx = f[0] / fl, fy = f[1] / fl;
  ctx.globalAlpha = c.t > 4 ? Math.max(0, 1 - (c.t - 4) / 2) : 1; ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(X, Y, 12 * k, 6 * k, 0, 0, 7); ctx.fill();
  const cy = Y - (16 - 12 * t) * k; ctx.strokeStyle = PANTS[c.v]; ctx.lineWidth = 3.5 * k; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(X - fx * 4 * t * k, cy); ctx.lineTo(X - fx * 15 * t * k + 3 * k, cy + (2 + 4 * t) * k); ctx.stroke();
  ctx.fillStyle = c.col; ctx.beginPath(); ctx.ellipse(X - fx * 4 * t * k, cy, (7 + 6 * t) * k, (14 - 9 * t) * k, Math.atan2(fy, fx) * t * 0.5, 0, 7); ctx.fill();
  ctx.fillStyle = SKIN[c.v]; ctx.beginPath(); ctx.arc(X + fx * 12 * t * k, cy - 6 * k * (1 - t) + fy * 3 * t * k, 5 * k, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
// ================= TATA LETAK TOMBOL SENTUH (bulat, busur ibu jari) + JOYSTICK MELAYANG =================
(function arcButtons() { const t = gid('touch'); if (!t) return;
  const A = { r: 60, b: 66 }; // pusat tombol SERANG dari sudut kanan-bawah (px)
  const spec = [['bAtk', 84, 0, 0], ['bDash', 52, 92, 0], ['bSpr', 52, 92, 45], ['bRel', 52, 92, 90], ['bAct', 44, 150, 8], ['bWpn', 44, 150, 28], ['bGr', 44, 150, 48], ['bHeal', 44, 150, 68]];
  const css = [];
  for (const [id, sz, R, a] of spec) { const rad = a * Math.PI / 180, cr = A.r + R * Math.sin(rad), cb = A.b + R * Math.cos(rad);
    css.push('#' + id + '{width:' + sz + 'px!important;height:' + sz + 'px!important;right:calc(' + Math.round(cr - sz / 2) + 'px + env(safe-area-inset-right))!important;bottom:calc(' + Math.round(cb - sz / 2) + 'px + env(safe-area-inset-bottom))!important}'); }
  css.push('body.t .b{z-index:3;border-radius:50%!important;font-size:10px;font-weight:700;letter-spacing:.3px;border:1.5px solid rgba(255,255,255,.35);background:rgba(24,28,34,.55);color:#fff;touch-action:none}'
    + '#bAtk{font-size:14px!important;background:radial-gradient(circle at 35% 30%,rgba(255,120,100,.75),rgba(180,40,30,.7))!important;border-color:rgba(255,170,160,.7)!important}'
    + '#bDash,#bSpr,#bRel{background:rgba(40,70,110,.62)!important}.b.on{filter:brightness(1.5);transform:scale(.94)}'
    + '#bInv,#bFl{top:8px!important;bottom:auto!important;right:auto!important;width:38px!important;height:38px!important;font-size:9px!important}#bInv{left:calc(50% + 28px)!important}#bFl{left:calc(50% - 66px)!important}'
    + '#hint{top:54px!important}#bb{top:88px!important;bottom:auto!important}'
    + '#jz{position:fixed;left:0;top:0;width:46%;height:100%;touch-action:none;z-index:1}#joy{z-index:2;pointer-events:none!important;width:130px!important;height:130px!important;transition:opacity .12s}#knob{left:40px!important;top:40px!important}');
  const st = document.createElement('style'); st.textContent = css.join(''); document.head.appendChild(st);
  // joystick melayang: muncul di titik sentuhan pertama dan ikut bergeser mengikuti jari
  const z = document.createElement('div'); z.id = 'jz'; t.appendChild(z); const jb = gid('joy'), kn = gid('knob'); const R = 55; let pid = null, cx = 0, cy = 0;
  const idle = () => { jb.style.left = '16px'; jb.style.top = 'auto'; jb.style.bottom = '28px'; jb.style.opacity = '0.2'; kn.style.transform = ''; };
  const base = () => { jb.style.left = (cx - 65) + 'px'; jb.style.top = (cy - 65) + 'px'; jb.style.bottom = 'auto'; };
  const aim = (dx, dy) => { const m = Math.hypot(dx, dy) || 1, k = Math.min(1, m / R); joy.x = dx / m * k; joy.y = dy / m * k; kn.style.transform = 'translate(' + (dx / m * k * R * 0.75) + 'px,' + (dy / m * k * R * 0.75) + 'px)'; };
  idle();
  z.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' || pid != null) return; pid = e.pointerId; if (z.setPointerCapture) z.setPointerCapture(pid);
    cx = Math.max(65, Math.min(innerWidth - 65, e.clientX)); cy = Math.max(65, Math.min(innerHeight - 65, e.clientY)); base(); jb.style.opacity = '1'; joy.on = true; aim(0, 0); });
  z.addEventListener('pointermove', e => { if (e.pointerId !== pid) return; let dx = e.clientX - cx, dy = e.clientY - cy; const m = Math.hypot(dx, dy);
    if (m > R) { cx += dx / m * (m - R); cy += dy / m * (m - R); base(); dx = e.clientX - cx; dy = e.clientY - cy; } aim(dx, dy); });
  const end = e => { if (e.pointerId !== pid) return; pid = null; joy.on = false; joy.x = joy.y = 0; idle(); };
  z.addEventListener('pointerup', end); z.addEventListener('pointercancel', end); })();
// ================= PANDUAN AWAL TERARAH =================
const newTut = () => ({ step: 0, done: false, crates: 0, chops: 0, crafts: 0, builds: 0, mv: 0, px: pl.x, py: pl.y, tgt: null, tT: 0 });
let tut = { step: 99, done: true, crates: 0, chops: 0, crafts: 0, builds: 0, mv: 0, px: 0, py: 0, tgt: null, tT: 0 };
const isTouch = () => document.body.classList.contains('t');
function tutInfo() { const t = isTouch(), s = tut.step;
  return [['Bergerak', t ? 'Sentuh sisi kiri layar lalu geser jari untuk berjalan. Tombol SPRINT untuk berlari.' : 'Tekan W A S D untuk berjalan, Shift untuk berlari, Spasi untuk dodge.', Math.min(8, tut.mv | 0) + '/8 langkah'],
    ['Geledah peti', 'Dekati peti kayu bertanda ▼ kuning di sekitar Perkemahan, lalu ' + (t ? 'tekan tombol AMBIL.' : 'tekan E.') + ' Isinya masuk ke Tas.', Math.min(1, tut.crates) + '/1 peti'],
    ['Tebang pohon', 'Dekati pohon yang ditandai, lalu ' + (t ? 'tekan AMBIL' : 'tekan E') + ' berulang kali. Tiap tebangan memberi Kayu untuk membangun.', Math.min(3, tut.chops) + '/3 tebangan'],
    ['Crafting', 'Buka Tas (' + (t ? 'tombol TAS di atas' : 'tekan I') + '), cari bagian CRAFTING, lalu buat Perban (butuh 2 Kain). Tutup Tas agar waktu pengerjaan berjalan.', Math.min(1, tut.crafts) + '/1 item'],
    ['Lawan zombie', 'Zombie ada di luar Perkemahan (tanda hijau menunjukkan yang terdekat). ' + (t ? 'Tahan tombol SERANG, bidik otomatis.' : 'Arahkan mouse, klik kiri untuk menembak.') + ' Tekan ' + (t ? 'RELOAD' : 'R') + ' jika peluru habis.', Math.min(1, pl.kills) + '/1 zombie'],
    ['Bangun', 'Buka Tas, bagian BANGUN, pilih Dinding Kayu (3 Kayu), lalu ' + (t ? 'sentuh tombol PASANG.' : 'klik atau tekan F untuk memasangnya.'), Math.min(1, tut.builds) + '/1 bangunan']][s]; }
function tutTarget() { const s = tut.step; let b = null, bd = 1e9;
  if (s === 1) { for (const c of crates) if (!c.open) { const d = Math.hypot(c.x - pl.x, c.y - pl.y) + (zoneAt(c.x, c.y) === 0 ? 0 : 100); if (d < bd) { bd = d; b = { x: c.x, y: c.y }; } } }
  else if (s === 2) { for (let dy = -14; dy <= 14; dy++) for (let dx = -14; dx <= 14; dx++) { const tx = (pl.x | 0) + dx, ty = (pl.y | 0) + dy; if (T(tx, ty) === 3 && tx > 0 && ty > 0 && tx < N - 1 && ty < N - 1) { const d = Math.hypot(tx + 0.5 - pl.x, ty + 0.5 - pl.y); if (d < bd) { bd = d; b = { x: tx + 0.5, y: ty + 0.5 }; } } } }
  else if (s === 4) { for (const z of zs) { const d = Math.hypot(z.x - pl.x, z.y - pl.y); if (d < bd) { bd = d; b = { x: z.x, y: z.y }; } } }
  return b; }
function tutNext(skip) { if (!skip) { addXP(10); snd.loot(); msg('Panduan: langkah ' + (tut.step + 1) + ' selesai ✔ (+10 XP)', '#7dff9a'); } tut.step++; tut.tT = 0; tut.tgt = null;
  if (tut.step >= 6) { tut.done = true; for (const it of [mk('ammo', '9mm', 0, 24), mk('med', 'medkit', 1, 1), mk('mat', 'Kayu', 0, 4)]) if (!addItem(it)) loot.push({ x: pl.x, y: pl.y, kind: 'item', item: it, rar: it.rar, name: info(it).n, ig: performance.now() + 1500 });
    addXP(40); msg('Panduan selesai! Hadiah: 24 peluru 9mm, Medkit, 4 Kayu (+40 XP)', '#ffd86b'); } }
function tutTick(dt) { if (tut.done || over) return; tut.mv += Math.hypot(pl.x - tut.px, pl.y - tut.py); tut.px = pl.x; tut.py = pl.y;
  if ((tut.tT -= dt) <= 0) { tut.tT = 0.4; tut.tgt = tutTarget(); }
  const s = tut.step, ok = s === 0 ? tut.mv >= 8 : s === 1 ? tut.crates >= 1 : s === 2 ? tut.chops >= 3 : s === 3 ? tut.crafts >= 1 : s === 4 ? pl.kills >= 1 : tut.builds >= 1; if (ok) tutNext(false); }
function drawTutMark() { if (tut.done || !tut.tgt) return; const s = toS(tut.tgt.x, tut.tgt.y), X = s[0] + ox(), Y = s[1] + oy(), b = Math.sin(performance.now() / 250) * 4;
  if (X > 30 && X < W - 30 && Y > 130 && Y < H - 30) { ctx.fillStyle = '#7dff9a'; ctx.beginPath(); ctx.moveTo(X, Y - 54 + b); ctx.lineTo(X + 8, Y - 68 + b); ctx.lineTo(X - 8, Y - 68 + b); ctx.fill(); ctx.strokeStyle = 'rgba(125,255,154,.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(X, Y, 22, 11, 0, 0, 7); ctx.stroke(); }
  else { const cx = W / 2, cy = H / 2 + 20, a = Math.atan2(Y - cy, X - cx), mx = W / 2 - 40, my = H / 2 - 80, k = Math.min(Math.abs(mx / (Math.cos(a) || 1e-6)), Math.abs(my / (Math.sin(a) || 1e-6)));
    ctx.save(); ctx.translate(cx + Math.cos(a) * k, cy + Math.sin(a) * k); ctx.rotate(a); ctx.fillStyle = '#7dff9a'; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, 9); ctx.lineTo(-8, -9); ctx.fill(); ctx.restore(); } }
document.body.insertAdjacentHTML('beforeend', '<div id="tut"><b id="tt"></b><div id="tx"></div><div id="tg"></div><div><button id="tsk">Lewati langkah</button><button id="tof">Tutup panduan</button></div></div>');
const stT = document.createElement('style');
stT.textContent = '#tut{position:fixed;top:84px;left:50%;transform:translateX(-50%);width:min(88vw,340px);background:rgba(10,14,18,.84);border:1px solid #5a8a62;border-radius:8px;padding:8px 10px;font-size:12px;color:#e6e1d0;z-index:4;display:none;line-height:1.4}#tut b{color:#7dff9a}#tg{color:#ffd86b;margin-top:2px}#tut button{background:#2a2f36;color:#ddd;border:1px solid #555;border-radius:5px;padding:4px 8px;margin:5px 5px 0 0;font-size:11px}body.tuton #bb{top:190px!important}';
document.head.appendChild(stT);
gid('tsk').addEventListener('pointerdown', e => { e.preventDefault(); if (!tut.done) tutNext(true); });
gid('tof').addEventListener('pointerdown', e => { e.preventDefault(); tut.done = true; });
function tutHud() { const el = gid('tut'); if (!el) return; const on = !tut.done && !over && !invOpen && !menuOpen; el.style.display = on ? 'block' : 'none'; if (on) document.body.classList.add('tuton'); else document.body.classList.remove('tuton'); if (!on) return;
  const [ti, tx, pg] = tutInfo(); gid('tt').textContent = 'PANDUAN ' + (tut.step + 1) + '/6 · ' + ti; gid('tx').textContent = tx; gid('tg').textContent = pg + (tut.tgt ? '  ·  Target: ' + dirTo(tut.tgt.x, tut.tgt.y) : ''); }
function svHud() { gid('hu').firstChild.style.width = pl.hun + '%'; gid('ti').firstChild.style.width = pl.thr + '%'; gid('inf').firstChild.style.width = pl.inf + '%';
  const h = clockH(), hh = String(h | 0).padStart(2, '0'), mm = String(((h % 1) * 60) | 0).padStart(2, '0');
  gid('sv').textContent = `${hh}:${mm}  ${pl.tmp.toFixed(1)}°C  Lelah ${pl.fat | 0}%` + (pl.bleed ? '  BERDARAH!' : '') + (pl.craft ? `  Membuat ${pl.craft.r.n} ${Math.round(pl.craft.t / pl.craft.r.t * 100)}%` : ''); }

function updFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t -= dt;
    if (f.k === 'blood') { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.9; f.vy *= 0.9; if (f.t <= 0 && Math.random() < 0.4) addDecal(f.x, f.y, 3 + Math.random() * 4); }
    if (f.t <= 0) fx.splice(i, 1); }
  for (let i = gas.length - 1; i >= 0; i--) { const g = gas[i]; g.t -= dt; if (!over && Math.hypot(pl.x - g.x, pl.y - g.y) < g.r) { hurtPlayer(7 * dt); pl.inf = Math.min(100, pl.inf + 4 * dt); } if (g.t <= 0) gas.splice(i, 1); }
  for (let i = loot.length - 1; i >= 0; i--) { const l = loot[i]; if (!over && performance.now() > (l.ig || 0) && Math.hypot(pl.x - l.x, pl.y - l.y) < 0.8 && collect(l)) loot.splice(i, 1); }
}
function drawLoot(l) { const s = toS(l.x, l.y), X = s[0] + ox(), Y = s[1] + oy(), b = Math.sin(performance.now() / 300 + l.x * 3) * 2, c = RAR[l.rar][1]; shadow(l.x, l.y, 8);
  ctx.save(); ctx.shadowColor = c; ctx.shadowBlur = 12; ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(X, Y - 16 + b); ctx.lineTo(X + 7, Y - 9 + b); ctx.lineTo(X, Y - 2 + b); ctx.lineTo(X - 7, Y - 9 + b); ctx.fill(); ctx.restore(); }
function drawFx() {
  for (const f of fx) { const s = toS(f.x, f.y), X = s[0] + ox(), Y = s[1] + oy();
    if (f.k === 'blood') { ctx.fillStyle = '#a01515'; ctx.fillRect(X - 1.5, Y - 10 + (0.5 - f.t) * 30, 3, 3); }
    else if (f.k === 'num') { ctx.globalAlpha = Math.min(1, f.t * 2); ctx.fillStyle = f.col; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(f.txt, X, Y - 44 - (0.8 - f.t) * 40); ctx.globalAlpha = 1; ctx.textAlign = 'left'; }
    else if (f.k === 'ring') { const r = f.R * (1 - f.t / f.T) * 1.414; ctx.strokeStyle = 'rgba(' + f.col + ',' + (f.t / f.T) + ')'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(X, Y, r * HW, r * HH, 0, 0, 7); ctx.stroke(); } }
}

// ---------- update ----------
const cam = { x: 0, y: 0 }; { const s = toS(N / 2 + 2, N / 2 + 2); cam.x = s[0]; cam.y = s[1]; }
let mw = [0, 0], moveSmooth = { x: 0, y: 0 };
function update(dt) {
  mw = toW(mouse.x - W / 2 + cam.x, mouse.y - H / 2 + cam.y); // posisi mouse di dunia
  pl.cd = Math.max(0, pl.cd - dt); pl.hurt = Math.max(0, pl.hurt - dt); pl.swing = Math.max(0, (pl.swing || 0) - dt); pl.rec = Math.max(0, (pl.rec || 0) - 0.35 * dt);
  if (pl.rl > 0 && (pl.rl -= dt) <= 0) { pl.rl = 0; const it = pl.rlw; if (it && cw() === it) it.ammo += takeAmmo(WD[it.key].ammo, eff(it).mag - it.ammo); }
  if (!over) {
    let sx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0), sy = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
    if (pl.onTower) { pl.x = pl.onTower.x + 0.5; pl.y = pl.onTower.y + 0.5; sx = 0; sy = 0; }
    if (joy.on) { sx = joy.x; sy = joy.y; }
    const response = document.body.classList.contains('t') ? 1 - Math.exp(-dt * 18) : 1;
    moveSmooth.x += (sx - moveSmooth.x) * response; moveSmooth.y += (sy - moveSmooth.y) * response;
    sx = moveSmooth.x; sy = moveSmooth.y;
    const m = Math.min(1, Math.hypot(sx, sy)); pl.mv = m > 0.12 ? 1 : 0;
    let vx = 0, vy = 0, sp = 3.2 * (curWeight() > CAP ? 0.75 : 1) * (pl.smul || 1);
    if (pl.mv) { const w = toW(sx, sy), l = Math.hypot(w[0], w[1]); pl.mvA = Math.atan2(w[1], w[0]); vx = w[0] / l * m; vy = w[1] / l * m; }
    const spr = (keys.shift || tch.spr) && pl.mv && pl.st > 0 && pl.dash <= 0; pl.spr = spr;
    if (spr) { sp = 5.2 * (curWeight() > CAP ? 0.75 : 1) * (pl.smul || 1); pl.st -= 22 * dt * (1 - pl.sk.e * 0.05); pl.stDelay = 0.8; noise(pl.x, pl.y, 4); }
    else if ((pl.stDelay -= dt) <= 0) pl.st = Math.min(100, pl.st + 16 * dt * (pl.sreg || 1));
    pl.st = clamp(pl.st, 0, 100);
    if (pl.dash > 0) { pl.dash -= dt; move(pl, pl.dvx * 12 * dt, pl.dvy * 12 * dt); }
    else move(pl, vx * sp * dt, vy * sp * dt);
    // bidik: mouse di PC; auto-aim ke zombie terdekat di layar sentuh
    if (tch.atk || joy.on || document.body.classList.contains('t')) {
      let best = null, bd = 9; for (const z of zs) { const d = Math.hypot(z.x - pl.x, z.y - pl.y); if (d < bd && los(pl.x, pl.y, z.x, z.y)) { bd = d; best = z; } }
      if (best) pl.ang = Math.atan2(best.y - pl.y, best.x - pl.x); else if (pl.mv) pl.ang = pl.mvA;
    } else pl.ang = Math.atan2(mw[1] - pl.y, mw[0] - pl.x);
    if (mouse.down || tch.atk || keys['j']) attack();
  }
  for (const z of zs) { if (Math.abs(z.x - pl.x) + Math.abs(z.y - pl.y) > 50) { if ((z.sk = !z.sk)) continue; updZ(z, dt * 2); } else updZ(z, dt); } updFx(dt); survive(dt); updObjs(dt); worldTick(dt); progTick(dt);
  for (let i = bullets.length - 1; i >= 0; i--) { const b = bullets[i]; let dead = false;
    for (let s = 0; s < 4 && !dead; s++) { b.px = b.x; b.py = b.y; b.x += b.vx * dt / 4; b.y += b.vy * dt / 4;
      const t = T(Math.floor(b.x), Math.floor(b.y)); if (t === 2 || t === 3 || t === 6 || t === 7) { dead = true; break; }
      for (const z of zs.slice()) if (Math.hypot(z.x - b.x, z.y - b.y) < z.r + 0.08) { const l = Math.hypot(b.vx, b.vy), ux = b.vx / l, uy = b.vy / l, off = Math.abs((z.x - b.x) * uy - (z.y - b.y) * ux); damageZ(z, b.dmg, ux, uy, off < 0.1 * z.t.sc); dead = true; break; } }
    if ((b.life -= dt) <= 0 || dead) bullets.splice(i, 1); }
  const t = toS(pl.x, pl.y), k = 1 - Math.exp(-8 * dt); cam.x += (t[0] - cam.x) * k; cam.y += (t[1] - cam.y) * k;
  const x0 = -N * HW + W / 2, x1 = N * HW - W / 2, y0 = H / 2, y1 = N * TH - H / 2; // batas peta
  cam.x = x0 > x1 ? 0 : clamp(cam.x, x0, x1); cam.y = y0 > y1 ? N * TH / 2 : clamp(cam.y, y0, y1);
}

// ---------- render ----------
const ox = () => W / 2 - cam.x, oy = () => H / 2 - cam.y;
function diamond(x, y, h, fill) { // tile (x,y) pada ketinggian h px
  const X = ox(), Y = oy() - h; ctx.beginPath();
  ctx.moveTo(X + (x - y) * HW, Y + (x + y) * HH); ctx.lineTo(X + (x + 1 - y) * HW, Y + (x + 1 + y) * HH);
  ctx.lineTo(X + (x - y) * HW, Y + (x + y + 2) * HH); ctx.lineTo(X + (x - y - 1) * HW, Y + (x + y + 1) * HH);
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
}
function box(x, y, h, top, left, right) {
  const X = ox(), Y = oy(), S = (a, b, hh) => [X + (a - b) * HW, Y + (a + b) * HH - hh];
  const W_ = S(x, y + 1, h), S_ = S(x + 1, y + 1, h), E = S(x + 1, y, h), Wb = S(x, y + 1, 0), Sb = S(x + 1, y + 1, 0), Eb = S(x + 1, y, 0);
  ctx.fillStyle = left; ctx.beginPath(); ctx.moveTo(...W_); ctx.lineTo(...S_); ctx.lineTo(...Sb); ctx.lineTo(...Wb); ctx.fill();
  ctx.fillStyle = right; ctx.beginPath(); ctx.moveTo(...S_); ctx.lineTo(...E); ctx.lineTo(...Eb); ctx.lineTo(...Sb); ctx.fill();
  diamond(x, y, h, top);
}
function shadow(x, y, rx) { const s = toS(x, y); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath();
  ctx.ellipse(s[0] + ox(), s[1] + oy(), rx, rx / 2, 0, 0, 7); ctx.fill(); }
function person(e, body, head, isP) {
  const s = toS(e.x, e.y), X = s[0] + ox(), Y = s[1] + oy() - (isP && pl.onTower ? 138 : 0); const k = e.t ? e.t.sc : 1; shadow(e.x, e.y, 11 * k);
  const bob = Math.sin((e.x + e.y) * 6) * (isP ? (pl.mv ? 1.5 : 0) : 1.5);
  ctx.fillStyle = body; if (e.type === 'bloater') { ctx.beginPath(); ctx.ellipse(X, Y - 17 * k + bob, 10 * k, 11 * k, 0, 0, 7); ctx.fill(); } else ctx.fillRect(X - 6 * k, Y - 26 * k + bob, 12 * k, 20 * k);
  ctx.fillStyle = head; ctx.beginPath(); ctx.arc(X, Y - 32 * k + bob, 6 * k, 0, 7); ctx.fill();
  const a = isP ? pl.ang : e.a, g = toS(Math.cos(a) * 0.6, Math.sin(a) * 0.6);
  ctx.strokeStyle = isP ? (cw() && WD[cw().key].gun ? '#222' : '#ccd') : body; ctx.lineWidth = isP ? 3 : 4; ctx.beginPath();
  ctx.moveTo(X, Y - 18 * k + bob); ctx.lineTo(X + g[0] * k, Y - 18 * k + g[1] * k + bob); ctx.stroke();
}
function draw(dt) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#0b0d10'; ctx.fillRect(0, 0, W, H);
  const cs = [toW(cam.x - W / 2, cam.y - H / 2 - 110), toW(cam.x + W / 2, cam.y - H / 2 - 110), toW(cam.x - W / 2, cam.y + H / 2 + 30), toW(cam.x + W / 2, cam.y + H / 2 + 30)];
  const x0 = Math.max(0, Math.floor(Math.min(...cs.map(c => c[0]))) - 1), x1 = Math.min(N - 1, Math.ceil(Math.max(...cs.map(c => c[0]))) + 1);
  const y0 = Math.max(0, Math.floor(Math.min(...cs.map(c => c[1]))) - 1), y1 = Math.min(N - 1, Math.ceil(Math.max(...cs.map(c => c[1]))) + 1);
  const items = [], FB = {};
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const t = T(x, y), chk = (x + y) & 1;
    const col = t === 4 || t === 2 ? (chk ? '#5a5046' : '#625749') : ZC[zoneAt(x, y)][chk ? 0 : 1]; (FB[col] || (FB[col] = [])).push(x, y);
    if (t === 2 || t === 3 || t >= 5) items.push([x + y + 1, 1, x, y, t]); }
  { const OX = ox(), OY = oy(); for (const col in FB) { const a = FB[col]; ctx.fillStyle = col; ctx.beginPath(); // lantai digambar per warna (1 fill per warna)
    for (let i = 0; i < a.length; i += 2) { const x = a[i], y = a[i + 1]; ctx.moveTo(OX + (x - y) * HW, OY + (x + y) * HH); ctx.lineTo(OX + (x + 1 - y) * HW, OY + (x + 1 + y) * HH); ctx.lineTo(OX + (x - y) * HW, OY + (x + y + 2) * HH); ctx.lineTo(OX + (x - y - 1) * HW, OY + (x + y + 1) * HH); ctx.closePath(); }
    ctx.fill(); } }
  for (const d of decals) { const q = toS(d.x, d.y); ctx.fillStyle = 'rgba(90,10,10,.5)'; ctx.beginPath(); ctx.ellipse(q[0] + ox(), q[1] + oy(), d.r, d.r / 2, 0, 0, 7); ctx.fill(); }
  for (const g of gas) { const q = toS(g.x, g.y), a = Math.min(1, g.t / 2) * (0.22 + 0.06 * Math.sin(performance.now() / 250));
    ctx.fillStyle = 'rgba(130,210,60,' + a + ')'; ctx.beginPath(); ctx.ellipse(q[0] + ox(), q[1] + oy(), g.r * 1.414 * HW, g.r * 1.414 * HH, 0, 0, 7); ctx.fill(); }
  const px = pl.x + pl.y; items.push([px + (pl.onTower ? 2 : 0), 2, pl]); for (const z of zs) if (z.x > x0 - 2 && z.x < x1 + 3 && z.y > y0 - 2 && z.y < y1 + 3) items.push([z.x + z.y, 3, z]); for (const l of loot) items.push([l.x + l.y, 4, l]); for (const o of objs) items.push([o.x + o.y, 5, o]); for (const c of crates) if (c.x > x0 - 1 && c.x < x1 + 2 && c.y > y0 - 1 && c.y < y1 + 2) items.push([c.x + c.y, 6, c]); for (const sv of survivors) if (!sv.done) items.push([sv.x + sv.y, 7, sv]); for (const cp of corpses) if (cp.x > x0 - 2 && cp.x < x1 + 3 && cp.y > y0 - 2 && cp.y < y1 + 3) items.push([cp.x + cp.y - 0.3, 9, cp]);
  items.sort((a, b) => a[0] - b[0]);
  const ps = toS(pl.x, pl.y);
  for (const it of items) {
    if (it[1] === 1) { const [d, , x, y, t] = it, ws = toS(x + 0.5, y + 0.5);
      const occl = d > px + 0.5 && ws[1] > ps[1] && ws[1] - ps[1] < 120 && Math.abs(ws[0] - ps[0]) < 90; // occlusion: bangunan jadi transparan
      ctx.globalAlpha = occl ? 0.28 : 1;
      if (t === 2) box(x, y, 78, '#8c8173', '#5e554b', '#463e36');
      else if (t === 5) drawWreckSeg(x, y);
      else if (t >= 6) drawStruct(x, y, t);
      else { const X = ws[0] + ox(), Y = ws[1] + oy(); shadow(x + 0.5, y + 0.5, 22);
        const shaking = treeShake && treeShake.x === x && treeShake.y === y ? treeShake : null;
        ctx.save();
        if (shaking) { const elapsed = 0.58 - shaking.t, fade = Math.max(0, shaking.t / 0.58);
          const sway = Math.sin(elapsed * 54 + shaking.phase) * 2.4 * fade;
          const tilt = Math.sin(elapsed * 42 + shaking.phase) * 0.14 * fade;
          ctx.translate(X + sway, Y); ctx.rotate(tilt); ctx.translate(-(X + sway), -Y);
        }
        ctx.fillStyle = '#4a3a2a'; ctx.fillRect(X - 3, Y - 30, 6, 30);
        ctx.fillStyle = '#25402a'; ctx.beginPath(); ctx.arc(X, Y - 46, 24, 0, 7); ctx.fill(); ctx.fillStyle = '#2f5233'; ctx.beginPath(); ctx.arc(X - 5, Y - 51, 15, 0, 7); ctx.fill();
        ctx.restore(); }
      ctx.globalAlpha = 1;
    } else if (it[1] === 2) { person(pl, pl.hurt > 0 ? '#e66' : '#3d5a80', '#d9b99b', true); } else if (it[1] === 4) { drawLoot(it[2]); } else if (it[1] === 5) { drawObj(it[2]); } else if (it[1] === 6) { drawCrate(it[2]); } else if (it[1] === 7) { drawSurv(it[2]); } else if (it[1] === 9) { drawCorpse(it[2]); }
    else { const z = it[2]; drawZombie(z);
      if (z.s === 'attack' || z.s === 'scream' || z.s === 'lunge') { const s = toS(z.x, z.y); ctx.fillStyle = '#ff4030'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('!', s[0] + ox(), s[1] + oy() - 40 * z.t.sc - 6); ctx.textAlign = 'left'; }
      if (z.hit > 0) { const s = toS(z.x, z.y); ctx.fillStyle = '#300'; ctx.fillRect(s[0] + ox() - 12, s[1] + oy() - 46 * z.t.sc, 24, 3);
        ctx.fillStyle = '#d33'; ctx.fillRect(s[0] + ox() - 12, s[1] + oy() - 46 * z.t.sc, 24 * z.hp / z.t.hp, 3); } }
  }
  drawFx(); drawGhost();
  ctx.strokeStyle = '#ffd86b'; ctx.lineWidth = 2; // proyektil dengan lintasan visual
  for (const b of bullets) { const a = toS(b.px - b.vx * 0.02, b.py - b.vy * 0.02), c = toS(b.x, b.y);
    ctx.beginPath(); ctx.moveTo(a[0] + ox(), a[1] + oy() - 18); ctx.lineTo(c[0] + ox(), c[1] + oy() - 18); ctx.stroke(); }
  if (pl.swing > 0) { const g = toS(Math.cos(pl.ang) * 1.1, Math.sin(pl.ang) * 1.1); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(ps[0] + ox(), ps[1] + oy() - 18); ctx.lineTo(ps[0] + ox() + g[0], ps[1] + oy() - 18 + g[1]); ctx.stroke(); }
  const sx = ps[0] + ox(), sy = ps[1] + oy() - 20, dkLight = darkness(), g = ctx.createRadialGradient(sx, sy, 90, sx, sy, Math.max(W, H) * 0.7);
  // Vignette tipis saat siang; bertambah bertahap saat senja dan malam.
  g.addColorStop(0, `rgba(8,10,22,${0.015 + dkLight * 0.075})`); g.addColorStop(1, `rgba(4,6,12,${0.10 + dkLight * 0.32})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const dk = darkness(); nightOverlay(dk); // malam
  ctx.globalCompositeOperation = 'lighter';
  for (const o of lights()) { const q = toS(o.x, o.y), gx = q[0] + ox(), gy = q[1] + oy() - 8; if (gx < -150 || gx > W + 150 || gy < -150 || gy > H + 150) continue; const rg = ctx.createRadialGradient(gx, gy, 5, gx, gy, 150);
    rg.addColorStop(0, 'rgba(255,150,50,' + (0.25 + dk * 0.25) + ')'); rg.addColorStop(1, 'rgba(255,150,50,0)'); ctx.fillStyle = rg; ctx.fillRect(gx - 150, gy - 150, 300, 300); }
  ctx.globalCompositeOperation = 'source-over';
  if (!document.body.classList.contains('t')) { ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1; ctx.beginPath(); // crosshair
    ctx.arc(mouse.x, mouse.y, 8, 0, 7); ctx.moveTo(mouse.x - 13, mouse.y); ctx.lineTo(mouse.x - 4, mouse.y); ctx.moveTo(mouse.x + 4, mouse.y); ctx.lineTo(mouse.x + 13, mouse.y); ctx.stroke(); }
}

// ---------- HUD + loop ----------
const $ = id => document.getElementById(id); let fps = 60, last = performance.now(), hudT = 0;
function hud() { svHud(); worldHud();
  $('hp').firstChild.style.width = pl.hp + '%'; $('st').firstChild.style.width = pl.st + '%';
  const it = cw(), w = it && WD[it.key]; $('wn').textContent = it ? w.n + '  ·  Dur ' + Math.max(0, it.dur | 0) + '  [' + (pl.cur + 1) + ']' : 'Tangan kosong';
  $('inv').textContent = `Armor ${pl.eq[3] ? Math.ceil(pl.eq[3].val) : 0}  Uang $${inv.money}  Berat ${curWeight().toFixed(1)}/${CAP}  Kill ${pl.kills}`;
  $('ammo').textContent = it && w.gun ? (pl.rl > 0 ? 'RELOAD...' : it.ammo + ' / ' + cnt(w.ammo)) : '—';
  $('dbg').textContent = `FPS ${fps | 0}  Zombie ${zs.length}\nPosisi dunia ${pl.x.toFixed(1)}, ${pl.y.toFixed(1)}\nWASD gerak | Mouse bidik+klik kiri tembak | Klik kanan/Q ganti senjata\nR reload | Shift lari | Space dodge\nI inventory | 1-3 slot senjata | H pakai perban/medkit | E tebang pohon`;
}
startGame();
applyCfg();
initializeCloudSave();
function loop(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; fps += (1 / Math.max(dt, 0.001) - fps) * 0.05;
  try { if (!document.hidden && !cloudLoading) { craftTick(dt); if (!invOpen && !mapOpen && !menuOpen) update(dt); } draw(dt); } catch (err) { if (!window.__err) { window.__err = 1; console.error(err); msg('Error: ' + err.message, '#e55'); } } if ((hudT -= dt) <= 0) { hud(); hudT = 0.1; } requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
})();
