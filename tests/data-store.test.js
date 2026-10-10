'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  defaultData, validateData, saveData, loadData, genId, clone,
} = require('../data-store');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dstore-'));

function tmpFile(name) {
  return path.join(tmpDir, name);
}

test('defaultData 返回完整骨架', () => {
  const d = defaultData();
  assert.ok(d.meta && d.meta.version === 1);
  assert.ok(Array.isArray(d.quickNotes));
  assert.deepStrictEqual(d.plans, {});
  assert.ok(d.fitness && Array.isArray(d.fitness.workouts));
  assert.ok(d.fitness && Array.isArray(d.fitness.metrics));
  assert.ok(d.fitness && Array.isArray(d.fitness.goals));
  assert.ok(d.reading && Array.isArray(d.reading.books));
  assert.ok(d.reading && Array.isArray(d.reading.notes));
  assert.ok(d.reading && Array.isArray(d.reading.focus));
  assert.ok(d.business && Array.isArray(d.business.customers));
  assert.ok(d.business && Array.isArray(d.business.orders));
  assert.ok(d.business && Array.isArray(d.business.payments));
  assert.ok(Array.isArray(d.schedules));
  assert.deepStrictEqual(d.settings, { reminderOn: true, theme: 'dark' });
});

test('validateData 接受合法数据', () => {
  assert.strictEqual(validateData(defaultData()), true);
  const d = defaultData();
  d.quickNotes.push({ id: 'a', content: 'x', createdAt: '' });
  d.plans['2026-10-09'] = [{ id: 'b', text: 't', done: false, priority: '中', createdAt: '' }];
  assert.strictEqual(validateData(d), true);
});

test('validateData 拒绝非法数据', () => {
  assert.strictEqual(validateData(null), false);
  assert.strictEqual(validateData([]), false);
  assert.strictEqual(validateData({}), false);
  const d = defaultData();
  delete d.fitness; // 缺 fitness
  assert.strictEqual(validateData(d), false);
  const d2 = defaultData();
  d2.fitness.workouts = {}; // workouts 应为数组
  assert.strictEqual(validateData(d2), false);
  const d3 = defaultData();
  d3.business.orders = null;
  assert.strictEqual(validateData(d3), false);
});

test('saveData 原子写入并清理临时文件', async () => {
  const file = tmpFile('atomic.json');
  const d = defaultData();
  d.quickNotes.push({ id: 'n1', content: 'hi', createdAt: '2026-10-09' });
  await saveData(file, d);
  const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepStrictEqual(onDisk.quickNotes, d.quickNotes);
  assert.ok(onDisk.meta.updatedAt);
  assert.ok(!fs.existsSync(file + '.tmp'), '不应残留临时文件');
});

test('saveData 拒绝非法数据且不写盘', async () => {
  const file = tmpFile('invalid.json');
  const bad = { meta: {} };
  await assert.rejects(() => saveData(file, bad));
  assert.ok(!fs.existsSync(file), '非法数据不应写入文件');
});

test('loadData 文件不存在时返回默认', async () => {
  const d = await loadData(tmpFile('nope.json'));
  assert.strictEqual(validateData(d), true);
  assert.deepStrictEqual(d.quickNotes, []);
});

test('loadData 损坏 JSON 返回默认并保留现场', async () => {
  const file = tmpFile('corrupt.json');
  fs.writeFileSync(file, '{ not valid json !!', 'utf8');
  const d = await loadData(file);
  assert.strictEqual(validateData(d), true);
  assert.deepStrictEqual(d.quickNotes, []);
  const corrupts = fs.readdirSync(tmpDir).filter((n) => n.startsWith('corrupt.json.corrupt.'));
  assert.ok(corrupts.length === 1, '应生成损坏备份文件');
});

test('loadData 结构不合法返回默认并保留现场', async () => {
  const file = tmpFile('badstruct.json');
  fs.writeFileSync(file, JSON.stringify({ meta: {} }), 'utf8');
  const d = await loadData(file);
  assert.strictEqual(validateData(d), true);
  const corrupts = fs.readdirSync(tmpDir).filter((n) => n.startsWith('badstruct.json.corrupt.'));
  assert.ok(corrupts.length === 1, '应生成损坏备份文件');
});

test('save/load 往返：写入后重新加载数据保留（模拟重启）', async () => {
  const file = tmpFile('persist.json');
  const d = defaultData();
  d.quickNotes.push({ id: 'p1', content: 'keep me', createdAt: 'x' });
  d.fitness.workouts.push({ id: 'w1', date: '2026-10-09', item: '跑步', durationMin: 30, sets: 0, reps: 0, weight: 0, note: '' });
  d.schedules.push({ id: 's1', date: '2026-10-10', time: '09:00', title: '会面', note: '', done: false });
  await saveData(file, d);
  // 模拟重启：全新 load
  const reloaded = await loadData(file);
  assert.strictEqual(reloaded.quickNotes[0].content, 'keep me');
  assert.strictEqual(reloaded.fitness.workouts[0].item, '跑步');
  assert.strictEqual(reloaded.schedules[0].title, '会面');
});

test('genId 生成非空唯一 id', () => {
  const a = genId();
  const b = genId();
  assert.ok(a && b && a !== b);
  assert.ok(/^[0-9a-f]{12}$/.test(a));
});

test('clone 深拷贝不共享引用', () => {
  const d = defaultData();
  d.quickNotes.push({ id: 'q', content: 'x', createdAt: '' });
  const c = clone(d);
  assert.notStrictEqual(c, d);
  assert.notStrictEqual(c.quickNotes, d.quickNotes);
  c.quickNotes[0].content = 'changed';
  assert.strictEqual(d.quickNotes[0].content, 'x', '修改副本不应影响原数据');
});
