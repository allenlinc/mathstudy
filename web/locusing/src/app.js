import { polygon, line, text, combine, renderToSVG, rate_functions } from 'locusing';
import {
  BW, BH, BD, Y0, FACE_KEYS, NAME, MOVABLE,
  enumerateNets, computeTransforms, worldCorners, freeMidWorld,
} from './engine.mjs';

/* ================= 常量 ================= */
const SVG_W = 860, SVG_H = 620;
const CX = SVG_W / 2, CY = SVG_H / 2 + 14;
const FOCAL = 1600;
const COL = { DN: '#b39ddb', U: '#ff8a65', F: '#4fc3f7', K: '#81c784', L: '#e57373', R: '#ffd54f' };
const EDGE = 'rgba(255,255,255,.80)', HINGE = '#ff862f', GRID = '#1d2430', TXT = '#10131a', DIM_DARK = '#141922', DIM_LIGHT = '#d5deea';
const LIGHT = norm3([-0.35, 0.55, 0.85]);

/* ================= 状态 ================= */
const patterns = enumerateNets();
const cam = { yaw: 32, pitch: 38 };
const th = { F: 0, K: 0, L: 0, R: 0, U: 0 };   // 0°=折起(盒) 90°=摊平
let zoom = 0.72;
const pan = { x: 0, y: 0 };   // 取景平移（随内容重心收敛）
let curPat = 0;
let pullFace = null;
let explored = new Set();
try {
  const s = localStorage.getItem('lz-explored');
  if (s) explored = new Set(JSON.parse(s).filter(i => i >= 0 && i < patterns.length));
  const l = localStorage.getItem('lz-last');
  if (l !== null && patterns[+l]) curPat = +l;
} catch (e) { /* file:// 下个别环境禁用，忽略 */ }

/* ================= 工具 ================= */
function norm3(v) { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }
function cross3(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
const rad = d => (d * Math.PI) / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const clamp01 = v => clamp(v, 0, 1);
function shade(hex, k, a) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16 & 255, n >> 8 & 255, n & 255].map(x =>
    Math.round(clamp(x * (0.55 + 0.5 * k), 16, 255)));
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}
function project(p) {
  const cy = Math.cos(rad(cam.yaw)), sy = Math.sin(rad(cam.yaw));
  const cp = Math.cos(rad(cam.pitch)), sp = Math.sin(rad(cam.pitch));
  const x1 = p[0] * cy + p[2] * sy;
  const z1 = -p[0] * sy + p[2] * cy;
  const y2 = p[1] * cp - z1 * sp;
  const z2 = p[1] * sp + z1 * cp;
  const s = FOCAL / (FOCAL - z2 * zoom);
  return [CX + x1 * s * zoom + pan.x, CY - y2 * s * zoom + pan.y, z2];
}
function rotOnly(p) {
  const cy = Math.cos(rad(cam.yaw)), sy = Math.sin(rad(cam.yaw));
  const cp = Math.cos(rad(cam.pitch)), sp = Math.sin(rad(cam.pitch));
  const x1 = p[0] * cy + p[2] * sy;
  const z1 = -p[0] * sy + p[2] * cy;
  return [x1, p[1] * cp - z1 * sp, p[1] * sp + z1 * cp];
}
function areaQ(q) {
  let a = 0;
  for (let i = 0; i < 4; i++) { const p = q[i], r = q[(i + 1) % 4]; a += p[0] * r[1] - r[0] * p[1]; }
  return Math.abs(a) / 2;
}
function centroidQ(q) {
  return [(q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4];
}
function inQuad(pt, q) {
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4];
    const cr = (b[0] - a[0]) * (pt[1] - a[1]) - (b[1] - a[1]) * (pt[0] - a[0]);
    if (Math.abs(cr) < 1e-9) continue;
    const sg = cr > 0 ? 1 : -1;
    if (s === 0) s = sg; else if (sg !== s) return false;
  }
  return true;
}

/* ================= 渲染 ================= */
const svgEl = document.getElementById('scene');
const $ = id => document.getElementById(id);

function render() {
  const pat = patterns[curPat];
  const T = computeTransforms(pat, th);
  const W3 = {}, P = {};
  for (const f of FACE_KEYS) { W3[f] = worldCorners(pat, f, T); P[f] = W3[f].map(project); }
  const order = FACE_KEYS.map(f => ({
    f, z: (P[f][0][2] + P[f][1][2] + P[f][2][2] + P[f][3][2]) / 4,
  })).sort((a, b) => a.z - b.z);

  const parts = [];

  /* 地面网格 */
  const gx = 540, gz = 580, step = 70, yg = Y0 - 0.6;
  for (let x = -gx; x <= gx + 1; x += step)
    parts.push(line(project([x, yg, -gz]).slice(0, 2), project([x, yg, gz]).slice(0, 2)).stroke(GRID).strokeWidth(1));
  for (let z = -gz; z <= gz + 1; z += step)
    parts.push(line(project([-gx, yg, z]).slice(0, 2), project([gx, yg, z]).slice(0, 2)).stroke(GRID).strokeWidth(1));

  /* 六个面 */
  for (const { f } of order) {
    const q2 = P[f].map(p => [p[0], p[1]]);
    let nv = rotOnly(norm3(cross3(
      [P[f][1][0] - P[f][0][0], P[f][1][1] - P[f][0][1], P[f][1][2] - P[f][0][2]],
      [P[f][3][0] - P[f][0][0], P[f][3][1] - P[f][0][1], P[f][3][2] - P[f][0][2]],
    )));
    if (nv[2] < 0) nv = [-nv[0], -nv[1], -nv[2]];
    const b = clamp01(0.62 + 0.38 * Math.max(0, nv[0] * LIGHT[0] + nv[1] * LIGHT[1] + nv[2] * LIGHT[2]));
    parts.push(polygon(q2).fill(shade(COL[f], b, 1)).stroke(EDGE).strokeWidth(2));

    if (pullFace === f) {
      parts.push(polygon(q2).fill('none').stroke(HINGE).strokeWidth(4));
      parts.push(line([P[f][0][0], P[f][0][1]], [P[f][1][0], P[f][1][1]]).stroke(HINGE).strokeWidth(3.5));
    }
    if (areaQ(q2) > 1500) {
      const c = centroidQ(q2);
      parts.push(text(NAME[f], { fontSize: 17, fontWeight: 700 }).fill(TXT).strokeWidth(0).position(c[0], c[1]));
    }
  }

  /* 包围盒（自动取景 + 标注外推参考） */
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const f of FACE_KEYS) for (const p of P[f]) {
    if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
  }
  const bcx = (minX + maxX) / 2, bcy = (minY + maxY) / 2;

  /* 尺寸标注：贴对应棱、向图形外侧垂直推出 */
  const dimLab = (str, A, B) => {
    const pa = project(A), pb = project(B);
    const mx = (pa[0] + pb[0]) / 2, my = (pa[1] + pb[1]) / 2;
    let ex = pb[0] - pa[0], ey = pb[1] - pa[1];
    const el = Math.hypot(ex, ey) || 1;
    ex /= el; ey /= el;
    let nx = -ey, ny = ex;
    if (nx * (mx - bcx) + ny * (my - bcy) < 0) { nx = -nx; ny = -ny; }
    const lx = mx + nx * 30, ly = my + ny * 30;
    /* 落在彩色面上用深色字，落在深色背景上用浅色字 */
    let over = false;
    for (const f of FACE_KEYS) if (inQuad([lx, ly], P[f])) { over = true; break; }
    parts.push(text(str, { fontSize: 14, anchor: 'middle' })
      .fill(over ? DIM_DARK : DIM_LIGHT).strokeWidth(0).position(lx, ly));
  };
  dimLab(`w = ${BW}`, W3.DN[0], W3.DN[1]);
  dimLab(`d = ${BD}`, W3.DN[1], W3.DN[2]);
  { /* h 标在「前」面长度为 BH 的那条侧棱上（不同折法下棱向不同） */
    const lcF = pat.local.F;
    const e12 = Math.hypot(lcF[2][0] - lcF[1][0], lcF[2][1] - lcF[1][1]);
    const e01 = Math.hypot(lcF[1][0] - lcF[0][0], lcF[1][1] - lcF[0][1]);
    if (Math.abs(e12 - BH) <= Math.abs(e01 - BH)) dimLab(`h = ${BH}`, W3.F[1], W3.F[2]);
    else dimLab(`h = ${BH}`, W3.F[0], W3.F[1]);
  }


  while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
  renderToSVG(combine(...parts), svgEl, { width: SVG_W, height: SVG_H, background: 'transparent' });

  const bw = Math.max(60, maxX - minX), bh2 = Math.max(60, maxY - minY);
  const target = clamp(Math.min((SVG_W * 0.72) / bw, (SVG_H * 0.66) / bh2), 0.30, 1.12);
  zoom += (target - zoom) * 0.08;
  pan.x += (CX - bcx) * 0.08;   // 内容重心向画布中心收敛，避免平铺时单侧被裁
  pan.y += (CY - bcy) * 0.08;

  updateProgress();
}

function updateProgress() {
  const n = MOVABLE.filter(k => th[k] > 89.5).length;
  $('pN').textContent = String(n);
  $('pBar').style.width = (n / 5 * 100) + '%';
  const done = $('done');
  if (n === 5) {
    if (!explored.has(curPat)) {
      explored.add(curPat);
      try { localStorage.setItem('lz-explored', JSON.stringify([...explored])); } catch (e) {}
      if (chipEls[curPat]) chipEls[curPat].classList.add('done');
      $('xN').textContent = String(explored.size);
    }
    done.textContent = `拼成平面啦！这就是「${patterns[curPat].name}」展开图`;
    done.classList.add('show');
  } else {
    done.classList.remove('show');
  }
}

/* ================= 补间 ================= */
const RF = rate_functions || {};
const easeIO = RF.smooth || RF.ease_in_out_sine || (x => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2));
const tweens = new Map();
function tweenFace(key, to, dur = 600, delay = 0) {
  tweens.set(key, { from: th[key], to, t0: performance.now() + delay, dur });
}
function tick(now) {
  for (const [k, tw] of [...tweens]) {
    if (now < tw.t0) continue;
    const u = clamp01((now - tw.t0) / tw.dur);
    th[k] = tw.from + (tw.to - tw.from) * easeIO(u);
    if (u >= 1) { th[k] = tw.to; tweens.delete(k); }
  }
}

/* ================= 动作 ================= */
function expandAll() {
  ['F', 'K', 'L', 'R', 'U'].forEach((k, i) => tweenFace(k, 90, 650, i * 130));
}
function closeAll() {
  ['F', 'K', 'L', 'R', 'U'].forEach((k, i) => tweenFace(k, 0, 600, i * 120));
}
function toggleFace(k) { tweenFace(k, th[k] > 45 ? 0 : 90, 520); }
function selectPattern(i) {
  if (i === curPat || i < 0 || i >= patterns.length) return;
  curPat = i;
  try { localStorage.setItem('lz-last', String(i)); } catch (e) {}
  for (const k of MOVABLE) { tweens.delete(k); th[k] = 0; }
  pullFace = null;
  chipEls.forEach((el, j) => el.classList.toggle('sel', j === curPat));
  $('curName').textContent = patterns[i].name;
  $('done').classList.remove('show');
}

/* ================= 指针交互 ================= */
let mode = null, lastP = null, moved = 0, pressTimer = null, pressKey = null, pressT = 0;

function svgPoint(e) {
  const r = svgEl.getBoundingClientRect();
  return [(e.clientX - r.left) * (SVG_W / r.width), (e.clientY - r.top) * (SVG_H / r.height)];
}
function pickFace(pt) {
  const pat = patterns[curPat];
  const T = computeTransforms(pat, th);
  const list = FACE_KEYS.map(f => {
    const Pk = worldCorners(pat, f, T).map(project);
    return { f, z: (Pk[0][2] + Pk[1][2] + Pk[2][2] + Pk[3][2]) / 4, Pk };
  }).sort((a, b) => b.z - a.z);
  for (const { f, Pk } of list)
    if (inQuad([pt[0], pt[1]], Pk.map(p => [p[0], p[1]]))) return f;
  return null;
}

svgEl.addEventListener('contextmenu', e => e.preventDefault());
svgEl.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  svgEl.setPointerCapture(e.pointerId);
  lastP = [e.clientX, e.clientY];
  moved = 0;
  if (e.button === 2 || e.button === 1) { mode = 'orbit'; svgEl.classList.add('grabbing'); return; }
  if (e.button !== 0) return;
  const key = pickFace(svgPoint(e));
  if (key && key !== 'DN') {
    mode = 'press';
    pressKey = key;
    pressT = performance.now();
    pressTimer = setTimeout(() => {
      if (mode === 'press' && moved < 10) {
        mode = 'pull';
        pullFace = pressKey;
        svgEl.classList.add('grabbing');
      }
    }, 300);
  } else {
    mode = 'orbit';
    svgEl.classList.add('grabbing');
  }
});
svgEl.addEventListener('pointermove', (e) => {
  if (!lastP || !mode) return;
  const dx = e.clientX - lastP[0], dy = e.clientY - lastP[1];
  lastP = [e.clientX, e.clientY];
  moved += Math.hypot(dx, dy);
  if (mode === 'orbit') {
    cam.yaw = (cam.yaw + dx * 0.35 + 360) % 360;
    cam.pitch = clamp(cam.pitch + dy * 0.3, 8, 88);
  } else if (mode === 'press' && moved > 10) {
    clearTimeout(pressTimer);
    mode = null;
  } else if (mode === 'pull' && pullFace) {
    const freeMidAt = (deg) => {
      const T2 = computeTransforms(patterns[curPat], { ...th, [pullFace]: deg });
      return freeMidWorld(patterns[curPat], pullFace, T2);
    };
    const m0 = project(freeMidAt(th[pullFace]));
    const m1 = project(freeMidAt(Math.min(90, th[pullFace] + 0.6)));
    const gx = m1[0] - m0[0], gy = m1[1] - m0[1];
    const len2 = gx * gx + gy * gy;
    if (len2 > 0.5) {
      const dDeg = 0.6 * (dx * gx + dy * gy) / len2;
      tweens.delete(pullFace);
      th[pullFace] = clamp(th[pullFace] + dDeg, 0, 90);
    }
  }
});
function endPointer() {
  if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
  svgEl.classList.remove('grabbing');
  if (mode === 'pull' && pullFace) tweenFace(pullFace, th[pullFace] > 40 ? 90 : 0, 480);
  else if (mode === 'press' && pressKey && moved < 10 && performance.now() - pressT < 350) toggleFace(pressKey);
  mode = null; pullFace = null; pressKey = null; lastP = null;
}
svgEl.addEventListener('pointerup', endPointer);
svgEl.addEventListener('pointercancel', endPointer);

/* ================= 折法选择芯片 ================= */
let chipEls = [];
function miniSVG(p) {
  const rs = FACE_KEYS.map(f => ({ f, r: p.rects[f] }));
  const minX = Math.min(...rs.map(o => o.r[0])) - 8, maxX = Math.max(...rs.map(o => o.r[2])) + 8;
  const minZ = Math.min(...rs.map(o => o.r[1])) - 8, maxZ = Math.max(...rs.map(o => o.r[3])) + 8;
  const rects = rs.map(o =>
    `<rect x="${o.r[0].toFixed(1)}" y="${o.r[1].toFixed(1)}" width="${(o.r[2] - o.r[0]).toFixed(1)}" height="${(o.r[3] - o.r[1]).toFixed(1)}" fill="${COL[o.f]}" stroke="rgba(20,24,32,.9)" stroke-width="7"/>`
  ).join('');
  return `<svg viewBox="${minX} ${minZ} ${maxX - minX} ${maxZ - minZ}" preserveAspectRatio="xMidYMid meet">${rects}</svg>`;
}
function buildChips() {
  const wrap = $('patterns');
  wrap.innerHTML = '';
  chipEls = patterns.map((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pat' + (i === curPat ? ' sel' : '') + (explored.has(i) ? ' done' : '');
    b.title = p.name;
    b.innerHTML = miniSVG(p) + `<span>${p.sig}·${p.seq}</span>`;
    b.addEventListener('click', () => selectPattern(i));
    wrap.appendChild(b);
    return b;
  });
}

/* ================= 按钮 / 键盘 ================= */
$('btnAll').addEventListener('click', expandAll);
$('btnBox').addEventListener('click', closeAll);
$('btnView').addEventListener('click', () => { cam.yaw = 32; cam.pitch = 38; });
window.addEventListener('keydown', (e) => {
  if (/INPUT|BUTTON|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (MOVABLE.some(k => th[k] < 45)) expandAll(); else closeAll();
  } else if (e.key === 'r' || e.key === 'R') {
    cam.yaw = 32; cam.pitch = 38;
  }
});

/* ================= 主循环 ================= */
buildChips();
$('curName').textContent = patterns[curPat].name;
$('xN').textContent = String(explored.size);

let lastT = performance.now();
function pump(now) {
  now = now ?? performance.now();
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  tick(now);
  render();
}
function rafLoop(now) { pump(now); requestAnimationFrame(rafLoop); }
requestAnimationFrame(rafLoop);
/* 兕底泵：rAF 被节流/无头虚拟时间下帧不足时，定时器独立泵帧（rAF 链只自挂一次，不会累积） */
setInterval(() => pump(performance.now()), 80);

/* 截图测试钩子：#flat 全展开；#last 切到最后一种折法并展开 */
if (location.hash === '#flat') setTimeout(expandAll, 80);
if (location.hash === '#last') setTimeout(() => { selectPattern(patterns.length - 1); expandAll(); }, 80);
