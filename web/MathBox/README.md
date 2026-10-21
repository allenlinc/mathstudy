# 长方体展开 · MathBox 交互实验

**打开这个：`cuboid-unfold-collapse-interactive.html`** —— 单文件已内联全部运行库（MathBox 2.3.1 + three.js r139），双击即可，无需联网、无需本地服务器。

操作：右键拖拽旋转视角 · 按住彩色面拖动展开/折回 · 滚轮缩放 · 右上角切换 11 种展开图连接方式 · 空格键全部展开/合拢。

## 文件
- `cuboid-unfold-collapse-interactive.html` 成品（自包含）
- `cuboid-app.html` 源码（引用 `libs/`，改代码用这个，改完可重新内联）
- `libs/mathbox.bundle.js` MathBox + three + OrbitControls 打包库（IIFE，全局 `MBX`）
- `libs/mathbox.css` MathBox 标签/加载样式

## 深链参数
`?pattern=1..11`（展开图编号）· `open=1`（初始全展开）· `a/b/c`（长宽高，如 `a=2&b=1.4&c=1`）
