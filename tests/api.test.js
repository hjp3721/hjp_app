'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createServer } = require('../server');
const { defaultData } = require('../data-store');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-'));

function dataFile(name) {
  return path.join(tmpDir, name + '.json');
}

// 在随机端口起一个服务（用独立临时数据文件），返回 { baseUrl, server }
async function boot(name) {
  const file = dataFile(name);
  const server = createServer({ dataFile: file });
  await server.init();
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  return { baseUrl: `http://127.0.0.1:${port}`, server };
}

test('GET / 返回首页 HTML', async () => {
  const { baseUrl, server } = await boot('root');
  try {
    const res = await fetch(baseUrl + '/');
    assert.strictEqual(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('<html') || text.includes('DOCTYPE'));
  } finally {
    server.close();
  }
});

test('GET /api/data 返回默认数据', async () => {
  const { baseUrl, server } = await boot('getdefault');
  try {
    const res = await fetch(baseUrl + '/api/data');
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.quickNotes));
    assert.deepStrictEqual(data.settings, { reminderOn: true, theme: 'dark' });
  } finally {
    server.close();
  }
});

test('POST /api/data 保存后可 GET 读回', async () => {
  const { baseUrl, server } = await boot('postread');
  try {
    const d = defaultData();
    d.quickNotes.push({ id: 'q1', content: '备忘内容', createdAt: '2026-10-09' });
    const postRes = await fetch(baseUrl + '/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(d),
    });
    assert.strictEqual(postRes.status, 200);
    const getRes = await fetch(baseUrl + '/api/data');
    const got = await getRes.json();
    assert.strictEqual(got.quickNotes[0].content, '备忘内容');
  } finally {
    server.close();
  }
});

test('POST /api/data 保存主题 theme 后可 GET 读回', async () => {
  const { baseUrl, server } = await boot('themesave');
  try {
    const d = defaultData();
    d.settings.theme = 'light'; // 切到浅色主题
    await fetch(baseUrl + '/api/data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) });
    const got = await (await fetch(baseUrl + '/api/data')).json();
    assert.strictEqual(got.settings.theme, 'light', '浅色主题应被持久化');
  } finally {
    server.close();
  }
});

test('POST /api/data 非法结构返回 400 且不覆盖', async () => {
  const { baseUrl, server } = await boot('postbad');
  try {
    const d = defaultData();
    d.quickNotes.push({ id: 'keep', content: '原始', createdAt: '' });
    await fetch(baseUrl + '/api/data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) });

    const bad = { meta: {} }; // 非法
    const res = await fetch(baseUrl + '/api/data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bad) });
    assert.strictEqual(res.status, 400);

    const got = await (await fetch(baseUrl + '/api/data')).json();
    assert.strictEqual(got.quickNotes[0].content, '原始', '非法保存不应覆盖现有数据');
  } finally {
    server.close();
  }
});

test('POST /api/data 非 JSON 请求体返回 400', async () => {
  const { baseUrl, server } = await boot('postnotjson');
  try {
    const res = await fetch(baseUrl + '/api/data', { method: 'POST', body: 'not json' });
    assert.strictEqual(res.status, 400);
  } finally {
    server.close();
  }
});

test('GET /api/export 返回可下载备份', async () => {
  const { baseUrl, server } = await boot('export');
  try {
    const d = defaultData();
    d.schedules.push({ id: 's1', date: '2026-10-10', time: '09:00', title: '会面', note: '', done: false });
    await fetch(baseUrl + '/api/data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) });

    const res = await fetch(baseUrl + '/api/export');
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('content-disposition').includes('attachment'));
    const body = await res.json();
    assert.strictEqual(body.schedules[0].title, '会面');
  } finally {
    server.close();
  }
});

test('POST /api/import 合法备份覆盖数据', async () => {
  const { baseUrl, server } = await boot('importok');
  try {
    const backup = defaultData();
    backup.quickNotes.push({ id: 'imp', content: '导入的备忘', createdAt: '' });
    const res = await fetch(baseUrl + '/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(backup) });
    assert.strictEqual(res.status, 200);
    const got = await (await fetch(baseUrl + '/api/data')).json();
    assert.strictEqual(got.quickNotes[0].content, '导入的备忘');
  } finally {
    server.close();
  }
});

test('POST /api/import 非法备份返回 400 且不覆盖现有数据', async () => {
  const { baseUrl, server } = await boot('importbad');
  try {
    const d = defaultData();
    d.quickNotes.push({ id: 'orig', content: '原始数据', createdAt: '' });
    await fetch(baseUrl + '/api/data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) });

    const res = await fetch(baseUrl + '/api/import', { method: 'POST', body: JSON.stringify({ broken: true }) });
    assert.strictEqual(res.status, 400);

    const got = await (await fetch(baseUrl + '/api/data')).json();
    assert.strictEqual(got.quickNotes[0].content, '原始数据', '非法导入不应覆盖现有数据');
  } finally {
    server.close();
  }
});

test('重启服务后数据保留（模拟关机重启）', async () => {
  const file = dataFile('restart');
  // 第一次启动写入
  let s1 = createServer({ dataFile: file });
  await s1.init();
  await new Promise((resolve) => s1.listen(0, resolve));
  const base1 = `http://127.0.0.1:${s1.address().port}`;
  const d = defaultData();
  d.plans['2026-10-09'] = [{ id: 't', text: '坚持', done: true, priority: '高', createdAt: '' }];
  await fetch(base1 + '/api/data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) });
  s1.close();

  // 第二次启动（模拟重启），重新从磁盘加载
  let s2 = createServer({ dataFile: file });
  await s2.init();
  await new Promise((resolve) => s2.listen(0, resolve));
  const base2 = `http://127.0.0.1:${s2.address().port}`;
  try {
    const got = await (await fetch(base2 + '/api/data')).json();
    assert.strictEqual(got.plans['2026-10-09'][0].text, '坚持');
  } finally {
    s2.close();
  }
});
