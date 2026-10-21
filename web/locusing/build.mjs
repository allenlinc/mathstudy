import fs from 'node:fs';

/* 把 src 打包成单文件 HTML：
   1) esbuild 先产出 dist/bundle.js（见 package.json 的 build 脚本）
   2) 本脚本把 bundle 内联进 src/shell.html 的占位注释处 */
const html = fs.readFileSync('src/shell.html', 'utf8');
let js = fs.readFileSync('dist/bundle.js', 'utf8');
js = js.replace(/<\/script/gi, '<\\/script');
const out = html.replace('/*__BUNDLE__*/', () => js);
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/cuboid-nets-11.html', out);
console.log('dist/cuboid-nets-11.html', Buffer.byteLength(out), 'bytes');
