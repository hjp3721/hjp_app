'use strict';
// 样式改进测试：读取 style.css，验证外观改进规则确实落地。
// 纯 CSS 无运行时可测逻辑，故用静态规则断言（保证改进写入样式文件），
// 实际渲染颜色由浏览器冒烟（getComputedStyle）验证。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');

test('界面背景为清新绿色风格', () => {
  // 主背景变量为浅绿
  assert.match(css, /--bg\s*:\s*#ecf7ee\s*;/, '背景变量应为清新浅绿 #ecf7ee');
  // body 使用绿色渐变背景
  assert.match(css, /--bg-grad\s*:\s*linear-gradient\s*\(/, '应定义绿色渐变背景变量');
  assert.match(css, /background\s*:\s*var\(--bg-grad\)/, 'body 应使用绿色渐变背景');
  // 主强调色为绿色系
  assert.match(css, /--accent\s*:\s*#2e7d32\s*;/, '主强调色应为绿色 #2e7d32');
  // 边框带绿色倾向
  assert.match(css, /--border\s*:\s*#dce9df\s*;/, '边框应为柔和绿色 #dce9df');
});
