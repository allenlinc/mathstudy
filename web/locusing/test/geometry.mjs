import { enumerateNets, computeTransforms, worldCorners, corners3, FACE_KEYS, Y0 } from '../src/engine.mjs';

/* 几何断言：对 11 种折法逐一验证
   1) 全折（θ=0）严格还原成盒 —— 每面世界角点集合 == 规范化角点集合
   2) 全开（θ=90）六面严格共面于展开平面
   3) 展开图两两不重叠（真实尺寸矩形）
   4) 任意中间态保持刚性（四边长度不变） */

const pats = enumerateNets();
console.log('有效展开分类数:', pats.length);
const counts = {};
pats.forEach(p => (counts[p.sig] = (counts[p.sig] || 0) + 1));
console.log('类型分布:', JSON.stringify(counts));

let fail = 0;
for (const pat of pats) {
  const T0 = computeTransforms(pat, { F: 0, K: 0, L: 0, R: 0, U: 0 });
  for (const f of FACE_KEYS) {
    const w = worldCorners(pat, f, T0).map(c => c.map(v => +v.toFixed(4)).join(',')).sort();
    const c3 = corners3(f).map(c => c.map(v => +v.toFixed(4)).join(',')).sort();
    if (!(w.length === 4 && w.every((s, i) => s === c3[i]))) {
      fail++;
      console.log('盒还原失败:', pat.name, f, '\n  world:', w, '\n  canon :', c3);
    }
  }
  const T9 = computeTransforms(pat, { F: 90, K: 90, L: 90, R: 90, U: 90 });
  for (const f of FACE_KEYS)
    for (const c of worldCorners(pat, f, T9))
      if (Math.abs(c[1] - Y0) > 1e-6) { fail++; console.log('共面失败:', pat.name, f, c); }
  const rects = FACE_KEYS.map(f => {
    const cs = worldCorners(pat, f, T9);
    return [Math.min(...cs.map(c => c[0])), Math.min(...cs.map(c => c[2])),
            Math.max(...cs.map(c => c[0])), Math.max(...cs.map(c => c[2]))];
  });
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) {
    const A = rects[i], B = rects[j];
    if (Math.min(A[2], B[2]) - Math.max(A[0], B[0]) > 1e-6 &&
        Math.min(A[3], B[3]) - Math.max(A[1], B[1]) > 1e-6) {
      fail++; console.log('展开重叠失败:', pat.name, FACE_KEYS[i], FACE_KEYS[j]);
    }
  }
  const th = { F: 23, K: 67, L: 41, R: 88, U: 12 };
  const Tm = computeTransforms(pat, th);
  for (const f of FACE_KEYS) {
    const cs = worldCorners(pat, f, Tm);
    const lens = [0, 1, 2, 3].map(k => Math.hypot(
      cs[(k + 1) % 4][0] - cs[k][0], cs[(k + 1) % 4][1] - cs[k][1], cs[(k + 1) % 4][2] - cs[k][2]));
    const c3 = corners3(f);
    const expect = [0, 1, 2, 3].map(k => Math.hypot(
      c3[(k + 1) % 4][0] - c3[k][0], c3[(k + 1) % 4][1] - c3[k][1], c3[(k + 1) % 4][2] - c3[k][2]));
    if (lens.some((l, k) => Math.abs(l - expect[k]) > 1e-5)) {
      fail++; console.log('刚性失败:', pat.name, f, lens, expect);
    }
  }
}
console.log(fail === 0 ? 'ALL OK' : `FAILS: ${fail}`);
process.exitCode = fail === 0 ? 0 : 1;
