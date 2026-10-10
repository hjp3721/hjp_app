'use strict';
// 样式测试：读取 style.css / index.html，验证界面风格规则确实落地。
// 纯 CSS 无运行时可测逻辑，故用静态规则断言（保证改进写入样式文件），
// 实际渲染由浏览器冒烟（getComputedStyle）验证。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('界面为苹果天气风格：深蓝渐变 + 毛玻璃 + 大圆角', () => {
  // 深蓝渐变背景
  assert.match(css, /linear-gradient\(180deg,\s*#0b1a3a\s*/, '背景应为深蓝渐变起始 #0b1a3a');
  assert.match(css, /radial-gradient\s*\(/, '应含柔和光晕（苹果远景光）');
  // 卡片毛玻璃
  assert.match(css, /\.card\s*\{[^}]*backdrop-filter:\s*blur\(24px\)/, '卡片应用毛玻璃模糊');
  assert.match(css, /\.card\s*\{[^}]*background:\s*var\(--card\)/, '卡片用半透明背景');
  assert.match(css, /--card:\s*rgba\(255,\s*255,\s*255,\s*0\.08\)/, '卡片背景为半透明白');
  assert.match(css, /--radius:\s*18px/, '大圆角 18px（苹果风）');
  // 主强调色为苹果浅蓝
  assert.match(css, /--accent:\s*#4db8ff/, '主强调色应为苹果浅蓝 #4db8ff');
  // 顶栏/侧栏毛玻璃
  assert.match(css, /\.topbar\s*\{[^}]*backdrop-filter:\s*blur\(24px\)/, '顶栏毛玻璃');
  assert.match(css, /\.sidebar\s*\{[^}]*backdrop-filter:\s*blur\(24px\)/, '侧栏毛玻璃');
  // 背景层（固定全屏光效）
  assert.match(css, /\.anime-bg\s*\{\s*position:\s*fixed;\s*inset:\s*0;/, '背景层应为固定全屏');
  assert.match(css, /\.anime-bg\s*\.glow\s*\{/, '应定义柔和光晕');
  // index.html 含背景层（光晕+山丘，无云朵）
  assert.ok(html.includes('class="anime-bg"'), 'index.html 应包含背景层');
  assert.ok(html.includes('class="glow g1"') && html.includes('class="hills"'), '应含光晕与山丘元素');
  assert.ok(!html.includes('class="cloud'), '不应再含动漫云朵元素');
});

test('7 个模块按钮采用不同颜色的透明按钮（适配深色毛玻璃）', () => {
  // 每个模块用不同 rgba 半透明背景（允许 CSS 中的空格，用正则匹配）
  const routes = {
    home: '77,184,255', plan: '50,215,75', fitness: '255,159,10',
    reading: '10,132,255', business: '255,138,0', schedule: '255,69,58', settings: '174,174,178',
  };
  const re = (rgba) => new RegExp(`rgba\\(${rgba.replace(/,/g, ',\\s*')},`);
  for (const [route, rgba] of Object.entries(routes)) {
    assert.ok(re(rgba).test(css), `模块 ${route} 应有 rgba(${rgba},…) 透明背景`);
    // 有 hover 加深与 active 加深规则
    assert.ok(new RegExp(`\\[data-route="${route}"\\]:hover \\{ background: rgba\\(${rgba.replace(/,/g, ',\\s*')},`).test(css),
      `模块 ${route} 应有 hover 加深`);
    assert.ok(new RegExp(`\\[data-route="${route}"\\]\\.active \\{ background: rgba\\(${rgba.replace(/,/g, ',\\s*')},`).test(css),
      `模块 ${route} 应有 active 加深`);
  }
  // 7 个路由颜色各不相同
  assert.strictEqual(new Set(Object.values(routes)).size, 7, '7 个模块颜色应各不相同');
});
