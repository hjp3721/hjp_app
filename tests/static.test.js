'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createServer } = require('../server');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'static-'));

async function boot() {
  const server = createServer({ dataFile: path.join(tmpDir, 'data.json') });
  await server.init();
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  return { baseUrl, server };
}

test('静态资源 index/style/core/app 均可访问且类型正确', async () => {
  const { baseUrl, server } = await boot();
  try {
    const checks = [
      ['/', 'text/html'],
      ['/style.css', 'text/css'],
      ['/core.js', 'javascript'],
      ['/app.js', 'javascript'],
    ];
    for (const [p, ct] of checks) {
      const res = await fetch(baseUrl + p);
      assert.strictEqual(res.status, 200, `GET ${p} 应 200`);
      const type = res.headers.get('content-type') || '';
      assert.ok(type.includes(ct), `GET ${p} content-type 应含 ${ct}`);
    }
    // index.html 应引用 app.js/core.js
    const html = await (await fetch(baseUrl + '/')).text();
    assert.ok(html.includes('app.js') && html.includes('core.js'));
    assert.ok(html.includes('style.css'));
  } finally {
    server.close();
  }
});

test('未知路径返回 404', async () => {
  const { baseUrl, server } = await boot();
  try {
    const res = await fetch(baseUrl + '/no-such-file.xyz');
    assert.strictEqual(res.status, 404);
  } finally {
    server.close();
  }
});

test('目录穿越被拒绝（403）', async () => {
  const { baseUrl, server } = await boot();
  try {
    const res = await fetch(baseUrl + '/../data-store.js');
    assert.ok(res.status === 403 || res.status === 404, '不应返回文件内容');
  } finally {
    server.close();
  }
});
