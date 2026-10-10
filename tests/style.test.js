'use strict';
// 样式改进测试：读取 style.css，验证外观改进规则确实落地。
// 纯 CSS 无运行时可测逻辑，故用静态规则断言（保证改进写入样式文件），
// 实际渲染颜色由浏览器冒烟（getComputedStyle）验证。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('界面为覆盖全屏的动漫风格背景', () => {
  // body 使用动漫明快天空：radial 光晕 + linear 天空渐变（淡蓝→青绿→浅绿）
  assert.match(css, /radial-gradient\s*\(/, '背景应含径向光晕（动漫光感）');
  assert.match(css, /linear-gradient\(180deg,\s*#cde8ff\s*/, '天空渐变应从淡蓝开始');
  assert.match(css, /#cbeeda\s*100%\)/, '天空渐变末端为浅绿地面');
  // 覆盖全屏的固定背景层 + 装饰元素
  assert.match(css, /\.anime-bg\s*\{\s*position:\s*fixed;\s*inset:\s*0;/, '背景层应为固定全屏');
  assert.match(css, /\.anime-bg\s*\.cloud\s*\{/, '应定义漂浮云朵');
  assert.match(css, /\.anime-bg\s*\.glow\s*\{/, '应定义柔和光斑');
  assert.match(css, /\.anime-bg\s*\.hills\s*\{/, '应定义远景山丘');
  // 云朵漂移动画
  assert.match(css, /@keyframes\s+cloud-drift\s*\{/, '应有云朵漂移动画');
  assert.match(css, /\.anime-bg\s*\.cloud\s*\{[^}]*animation:\s*cloud-drift/, '云朵应应用漂移动画');
  // 内容浮于背景之上
  assert.match(css, /\.layout\s*\{\s*position:\s*relative;\s*z-index:\s*1;\s*\}/, '内容应浮于背景之上');
  // 主强调色仍为绿色系（呼应清新绿）
  assert.match(css, /--accent\s*:\s*#2e7d32\s*;/, '主强调色应为绿色 #2e7d32');
  // index.html 应包含动漫背景层容器（云朵/光斑/山丘）
  assert.ok(html.includes('class="anime-bg"'), 'index.html 应包含 anime-bg 背景层');
  assert.ok(html.includes('class="cloud c1"') && html.includes('class="hills"'), '应含云朵与山丘元素');
});

test('7 个模块按钮采用不同颜色的透明按钮', () => {
  // 每个模块用 rgba 半透明背景（透明按钮）
  const routes = {
    home: '16,185,129', plan: '46,125,50', fitness: '234,88,12',
    reading: '37,99,235', business: '180,83,9', schedule: '220,38,38', settings: '71,85,105',
  };
  for (const [route, rgba] of Object.entries(routes)) {
    // 基准透明背景
    assert.ok(css.includes(`[data-route="${route}"] { background: rgba(${rgba},.16); }`),
      `模块 ${route} 应有 rgba(${rgba},.16) 透明背景`);
    // hover 加深、active 更明显
    assert.ok(css.includes(`[data-route="${route}"]:hover { background: rgba(${rgba},.26); }`),
      `模块 ${route} hover 应加深为 .26`);
    assert.ok(css.includes(`[data-route="${route}"].active { background: rgba(${rgba},.32);`),
      `模块 ${route} active 应加深为 .32`);
  }
  // 7 个路由颜色各不相同
  const values = Object.values(routes);
  assert.strictEqual(new Set(values).size, 7, '7 个模块颜色应各不相同');
});
