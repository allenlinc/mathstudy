/* ============================================================
   长方体展开图引擎（纯数学，无 DOM）
   - 盒面邻接图共 12 条棱；枚举全部 5 棱连通子集（生成树）
   - 每棵树按真实尺寸展平，剔除平面重叠的树
   - 按多连方形状（8 个二面对称像归一化）分类 → 经典 11 种
   - 铰链链：每面绕与父面的公共棱折动，θ∈[0°,90°]
     θ=90° 摊平（共面），θ=0° 折起成盒
   ============================================================ */

export const BW = 340, BH = 210, BD = 260;      // 盒尺寸：宽 × 高 × 深
export const Y0 = -BH / 2;                       // 展开平面高度

export const FACE_KEYS = ['DN', 'U', 'F', 'K', 'L', 'R'];
export const NAME = { DN: '下', U: '上', F: '前', K: '后', L: '左', R: '右' };
export const MOVABLE = ['F', 'K', 'L', 'R', 'U']; // DN 为基准面，固定

/* 面规范化定义：org = (a=0,b=0) 角的 3D 坐标；e1/e2 = 规范化轴（3D 单位向量） */
export const FACE_DEF = {
  DN: { d1: BW, d2: BD, org: [-BW / 2, -BH / 2, -BD / 2], e1: [1, 0, 0], e2: [0, 0, 1] },
  U:  { d1: BW, d2: BD, org: [-BW / 2,  BH / 2, -BD / 2], e1: [1, 0, 0], e2: [0, 0, 1] },
  F:  { d1: BW, d2: BH, org: [-BW / 2, -BH / 2,  BD / 2], e1: [1, 0, 0], e2: [0, 1, 0] },
  K:  { d1: BW, d2: BH, org: [-BW / 2, -BH / 2, -BD / 2], e1: [1, 0, 0], e2: [0, 1, 0] },
  R:  { d1: BD, d2: BH, org: [ BW / 2, -BH / 2, -BD / 2], e1: [0, 0, 1], e2: [0, 1, 0] },
  L:  { d1: BD, d2: BH, org: [-BW / 2, -BH / 2, -BD / 2], e1: [0, 0, 1], e2: [0, 1, 0] },
};

export function corner3(f, a, b) {
  const d = FACE_DEF[f];
  return [
    d.org[0] + d.e1[0] * a + d.e2[0] * b,
    d.org[1] + d.e1[1] * a + d.e2[1] * b,
    d.org[2] + d.e1[2] * a + d.e2[2] * b,
  ];
}
export function corners3(f) {
  const d = FACE_DEF[f];
  return [corner3(f, 0, 0), corner3(f, d.d1, 0), corner3(f, d.d1, d.d2), corner3(f, 0, d.d2)];
}
function abOf(f, q) {   // 3D 点在该面规范化坐标中的 (a,b)
  const d = FACE_DEF[f];
  const rel = [q[0] - d.org[0], q[1] - d.org[1], q[2] - d.org[2]];
  return [
    rel[0] * d.e1[0] + rel[1] * d.e1[1] + rel[2] * d.e1[2],
    rel[0] * d.e2[0] + rel[1] * d.e2[1] + rel[2] * d.e2[2],
  ];
}
function samePoint(a, b) { return Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7 && Math.abs(a[2] - b[2]) < 1e-7; }
export function sharedCorners(f1, f2) {
  const s1 = corners3(f1), s2 = corners3(f2), out = [];
  for (const c of s1) if (s2.some(d => samePoint(c, d))) out.push(c);
  return out;
}

/* ---------- 邻接图与生成树枚举 ---------- */
const ADJ_EDGES = (() => {
  const e = [];
  for (let i = 0; i < FACE_KEYS.length; i++)
    for (let j = i + 1; j < FACE_KEYS.length; j++)
      if (sharedCorners(FACE_KEYS[i], FACE_KEYS[j]).length === 2)
        e.push([FACE_KEYS[i], FACE_KEYS[j]]);
  return e;   // 12 条
})();

function* combos5(n) {
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++) yield [a, b, c, d, e];
}

function spanningTrees() {
  const out = [];
  for (const idx of combos5(ADJ_EDGES.length)) {
    const parent = {};   // union-find
    const find = x => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    FACE_KEYS.forEach(f => (parent[f] = f));
    let ok = true;
    for (const i of idx) {
      const [a, b] = ADJ_EDGES[i];
      const ra = find(a), rb = find(b);
      if (ra === rb) { ok = false; break; }
      parent[ra] = rb;
    }
    if (ok && new Set(FACE_KEYS.map(find)).size === 1) out.push(idx.map(i => ADJ_EDGES[i]));
  }
  return out;   // 384 棵
}

/* ---------- 平面位姿（摊平态）：{o:[x,z], m1, m2}，规范化 (a,b) → 平面 ---------- */
function posePos(pose, f, a, b) {
  return [pose.o[0] + a * pose.m1[0] + b * pose.m2[0], pose.o[1] + a * pose.m1[1] + b * pose.m2[1]];
}
const ROOT_POSE = { o: [-BW / 2, -BD / 2], m1: [1, 0], m2: [0, 1] };

function solveChildPose(ppose, pf, cf) {
  const shared = sharedCorners(pf, cf);
  if (shared.length !== 2) return null;
  const w = shared.map(q => {
    const [a, b] = abOf(pf, q);
    return posePos(ppose, pf, a, b);
  });
  const cc = shared.map(q => abOf(cf, q));
  const AXES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const sols = [];
  for (const m1 of AXES) for (const m2 of AXES) {
    if (m1[0] * m2[0] + m1[1] * m2[1] !== 0) continue;
    const o = [
      w[0][0] - cc[0][0] * m1[0] - cc[0][1] * m2[0],
      w[0][1] - cc[0][0] * m1[1] - cc[0][1] * m2[1],
    ];
    const chk = [
      o[0] + cc[1][0] * m1[0] + cc[1][1] * m2[0],
      o[1] + cc[1][0] * m1[1] + cc[1][1] * m2[1],
    ];
    if (Math.abs(chk[0] - w[1][0]) < 1e-6 && Math.abs(chk[1] - w[1][1]) < 1e-6) sols.push({ o, m1, m2 });
  }
  /* 两侧解：取与父面矩形不重叠的一侧（正确展开侧） */
  const pr = poseRect(ppose, pf);
  for (const s of sols) {
    const r = poseRect(s, cf);
    if (!(Math.min(pr[2], r[2]) - Math.max(pr[0], r[0]) > 1e-6 &&
          Math.min(pr[3], r[3]) - Math.max(pr[1], r[1]) > 1e-6)) return s;
  }
  return null;
}
function poseRect(pose, f) {
  const d = FACE_DEF[f];
  const ps = [posePos(pose, f, 0, 0), posePos(pose, f, d.d1, 0), posePos(pose, f, d.d1, d.d2), posePos(pose, f, 0, d.d2)];
  return [Math.min(...ps.map(p => p[0])), Math.min(...ps.map(p => p[1])),
          Math.max(...ps.map(p => p[0])), Math.max(...ps.map(p => p[1]))];
}

/* ---------- 分类：多连方形状（8 个二面对称像的规范化最小表示） ---------- */
function canonShape(cells) {
  const pts = Object.values(cells);
  const norm = arr => {
    const mx = Math.min(...arr.map(p => p[0])), mz = Math.min(...arr.map(p => p[1]));
    return arr.map(p => [p[0] - mx, p[1] - mz]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  };
  const imgs = [];
  const Ts = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  const swap = [false, false, false, false, true, true, true, true];
  for (let i = 0; i < 8; i++) {
    const mapped = pts.map(([x, z]) => swap[i] ? [x * Ts[i][0], z * Ts[i][1]].reverse() : [x * Ts[i][0], z * Ts[i][1]]);
    imgs.push(JSON.stringify(norm(mapped)));
  }
  return imgs.sort()[0];
}
function rowSignature(cells) {
  let pts = Object.values(cells);
  for (let k = 0; k < 4; k++) {
    const rows = {};
    for (const [x, z] of pts) rows[z] = (rows[z] || 0) + 1;
    let seq = Object.keys(rows).sort((a, b) => a - b).map(k2 => rows[k2]);
    if (seq[0] < seq[seq.length - 1]) seq = [...seq].reverse();
    const s = seq.join('-');
    if (s === '1-4-1' || s === '2-3-1' || s === '2-2-2' || s === '3-3') return s;
    pts = pts.map(([x, z]) => [-z, x]);   // 旋转 90° 再试
  }
  const rows = {};
  for (const [x, z] of Object.values(cells)) rows[z] = (rows[z] || 0) + 1;
  let seq = Object.keys(rows).sort((a, b) => a - b).map(k2 => rows[k2]);
  if (seq[0] < seq[seq.length - 1]) seq = [...seq].reverse();
  return seq.join('-');
}
const SIG_ORDER = { '1-4-1': 0, '2-3-1': 1, '2-2-2': 2, '3-3': 3 };

/* ---------- 3x3 矩阵工具 ---------- */
export function mul3(A, B) {
  const O = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
    O[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
  return O;
}
export function apply3(R, v) {
  return [
    R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2],
    R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2],
    R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2],
  ];
}
const trans3 = R => [
  [R[0][0], R[1][0], R[2][0]],
  [R[0][1], R[1][1], R[2][1]],
  [R[0][2], R[1][2], R[2][2]],
];
const rotX = rho => {
  const c = Math.cos(rho), s = Math.sin(rho);
  return [[1, 0, 0], [0, c, -s], [0, s, c]];
};

/* ---------- 枚举全部有效展开 → 分类 ---------- */
export function enumerateNets() {
  const groups = new Map();
  for (const edges of spanningTrees()) {
    const adj = {}; FACE_KEYS.forEach(f => (adj[f] = []));
    for (const [a, b] of edges) { adj[a].push(b); adj[b].push(a); }
    /* BFS 生成树 → 父子关系 + 平面位姿 */
    const parentOf = {}, pose = { DN: ROOT_POSE };
    const order = ['DN'];
    const queue = ['DN'];
    const seen = new Set(['DN']);
    while (queue.length) {
      const f = queue.shift();
      for (const c of adj[f]) {
        if (seen.has(c)) continue;
        seen.add(c);
        parentOf[c] = f;
        pose[c] = solveChildPose(pose[f], f, c);
        if (!pose[c]) { order.length = 0; break; }
        queue.push(c); order.push(c);
      }
      if (!order.length) break;
    }
    if (!order.length || seen.size !== 6) continue;

    /* 真实尺寸重叠检验 */
    const rects = {};
    FACE_KEYS.forEach(f => (rects[f] = poseRect(pose[f], f)));
    let overlap = false;
    for (let i = 0; i < FACE_KEYS.length && !overlap; i++)
      for (let j = i + 1; j < FACE_KEYS.length; j++) {
        const A = rects[FACE_KEYS[i]], B = rects[FACE_KEYS[j]];
        if (Math.min(A[2], B[2]) - Math.max(A[0], B[0]) > 1e-6 &&
            Math.min(A[3], B[3]) - Math.max(A[1], B[1]) > 1e-6) { overlap = true; break; }
      }
    if (overlap) continue;

    /* 多连方格子（树相对步进） */
    const cells = { DN: [0, 0] };
    for (const f of order.slice(1)) {
      const p = parentOf[f];
      const pr = rects[p], cr = rects[f];
      const dx = Math.abs(cr[0] - pr[2]) < 1e-6 ? 1 : Math.abs(cr[2] - pr[0]) < 1e-6 ? -1 : 0;
      const dz = Math.abs(cr[1] - pr[3]) < 1e-6 ? 1 : Math.abs(cr[3] - pr[1]) < 1e-6 ? -1 : 0;
      cells[f] = [cells[p][0] + dx, cells[p][1] + dz];
    }
    const key = canonShape(cells);
    if (!groups.has(key)) groups.set(key, { edges, parentOf, pose, rects, cells });
  }

  /* 整理：按经典类型排序命名，并预计算铰链链数据 */
  const list = [...groups.values()].map(g => ({ ...g, sig: rowSignature(g.cells) }));
  list.sort((a, b) => (SIG_ORDER[a.sig] ?? 9) - (SIG_ORDER[b.sig] ?? 9));
  const counter = {};
  const patterns = list.map((g, i) => {
    counter[g.sig] = (counter[g.sig] || 0) + 1;
    const seq = counter[g.sig];
    const local = { DN: [[0, 0], [BW, 0], [BW, BD], [0, BD]] };
    /* 平坦世界变换（链基） + 每面相对父面的铰链数据 */
    const RFlat = { DN: [[1, 0, 0], [0, 0, 1], [0, -1, 0]] };
    const tFlat = { DN: [-BW / 2, Y0, BD / 2] };
    const rel = {}, hingeLen = {};
    const bfs = ['DN'];
    while (bfs.length) {
      const f = bfs.shift();
      for (const c of FACE_KEYS) {
        if (g.parentOf[c] !== f) continue;
        const axis = flatAxis(g.pose[f], g.pose[c], f, c);   // {S,E,ax,in}
        const Rcf = [
          [axis.ax[0], axis.in[0], 0],
          [0, 0, 1],
          [axis.ax[1], axis.in[1], 0],
        ];
        const RT = trans3(RFlat[f]);
        rel[c] = {
          R: mul3(RT, Rcf),
          t: apply3(RT, [axis.S[0] - tFlat[f][0], Y0 - tFlat[f][1], axis.S[1] - tFlat[f][2]]),
        };
        RFlat[c] = mul3(RFlat[f], rel[c].R);
        tFlat[c] = [
          tFlat[f][0] + apply3(RFlat[f], rel[c].t)[0],
          Y0,
          tFlat[f][2] + apply3(RFlat[f], rel[c].t)[2],
        ];
        /* 面局部角点（u 沿铰链，v 沿内部） */
        const d = FACE_DEF[c];
        local[c] = [0, d.d1, d.d1, 0].map((a, k) => {
          const b = [0, 0, d.d2, d.d2][k];
          const p = posePos(g.pose[c], c, a, b);
          const dx = p[0] - axis.S[0], dz = p[1] - axis.S[1];
          return [dx * axis.ax[0] + dz * axis.ax[1], dx * axis.in[0] + dz * axis.in[1]];
        });
        hingeLen[c] = Math.hypot(axis.E[0] - axis.S[0], axis.E[1] - axis.S[1]);
        bfs.push(c);
      }
    }
    return {
      id: i, sig: g.sig, seq, name: `${g.sig} · 第${['一','二','三','四','五','六','七','八','九','十','十一'][seq - 1]}种`,
      parentOf: g.parentOf, rects: g.rects, cells: g.cells, rel, local, hingeLen,
    };
  });
  return patterns;
}

/* 铰链几何：父面平坦系下，求子面铰链线（起点、方向、内部方向） */
function flatAxis(ppose, cpose, pf, cf) {
  const shared = sharedCorners(pf, cf);
  const pw = shared.map(q => { const [a, b] = abOf(pf, q); return posePos(ppose, pf, a, b); });
  const d = FACE_DEF[cf];
  const cCenter = posePos(cpose, cf, d.d1 / 2, d.d2 / 2);
  const mid = [(pw[0][0] + pw[1][0]) / 2, (pw[0][1] + pw[1][1]) / 2];
  let inx = cCenter[0] - mid[0], inz = cCenter[1] - mid[1];
  const il = Math.hypot(inx, inz); inx /= il; inz /= il;
  let ax = [pw[1][0] - pw[0][0], pw[1][1] - pw[0][1]];
  const al = Math.hypot(ax[0], ax[1]); ax = [ax[0] / al, ax[1] / al];
  /* 选轴方向使 ax × in 的 y 分量 = axz*inx − axx*inz 为正 */
  const cy = ax[1] * inx - ax[0] * inz;
  if (cy < 0) { ax = [-ax[0], -ax[1]]; const t = pw[0]; pw[0] = pw[1]; pw[1] = t; }
  return { S: [pw[0][0], pw[0][1]], E: [pw[1][0], pw[1][1]], ax, in: [inx, inz] };
}

/* ---------- 运行时：给定各面 θ，求每面的世界变换（局部 (u,v,0) → 世界） ---------- */
export function computeTransforms(pat, th) {
  const out = { DN: { R: [[1, 0, 0], [0, 0, 1], [0, -1, 0]], t: [-BW / 2, Y0, BD / 2] } };
  const bfs = ['DN'];
  while (bfs.length) {
    const f = bfs.shift();
    for (const c of FACE_KEYS) {
      if (pat.parentOf[c] !== f) continue;
      const rho = ((90 - (th[c] ?? 90)) * Math.PI) / 180;
      const F = rotX(rho);
      out[c] = {
        R: mul3(out[f].R, mul3(pat.rel[c].R, F)),
        t: [
          out[f].t[0] + apply3(out[f].R, pat.rel[c].t)[0],
          out[f].t[1] + apply3(out[f].R, pat.rel[c].t)[1],
          out[f].t[2] + apply3(out[f].R, pat.rel[c].t)[2],
        ],
      };
      bfs.push(c);
    }
  }
  return out;
}
export function worldCorners(pat, f, T) {
  const lc = pat.local[f];
  return lc.map(([u, v]) => {
    const p = apply3(T[f].R, [u, v, 0]);
    return [T[f].t[0] + p[0], T[f].t[1] + p[1], T[f].t[2] + p[2]];
  });
}
/* 自由边（与铰链相对的边）中点 */
export function freeMidWorld(pat, f, T) {
  const lc = pat.local[f];
  const m = [(lc[0][0] + lc[1][0]) / 2, lc[2][1]];
  const p = apply3(T[f].R, [m[0], m[1], 0]);
  return [T[f].t[0] + p[0], T[f].t[1] + p[1], T[f].t[2] + p[2]];
}
