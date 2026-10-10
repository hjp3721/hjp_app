'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createServer } = require('../server');
const { validateData } = require('../data-store');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modules-'));

// 构造一份覆盖全部 7 个模块的完整示例数据
function fullData() {
  return {
    meta: { version: 1, createdAt: '2026-10-09T00:00:00.000Z', updatedAt: null },
    quickNotes: [{ id: 'n1', content: '周会要点', createdAt: '2026-10-09T08:00:00.000Z' }],
    plans: {
      '2026-10-09': [
        { id: 'p1', text: '写周报', done: true, priority: '高', createdAt: '2026-10-09T08:00:00.000Z' },
        { id: 'p2', text: '健身房', done: false, priority: '中', createdAt: '2026-10-09T09:00:00.000Z' },
      ],
    },
    fitness: {
      workouts: [{ id: 'w1', date: '2026-10-09', item: '跑步', durationMin: 30, sets: 0, reps: 0, weight: 0, note: '' }],
      metrics: [{ id: 'm1', date: '2026-10-09', weight: 68, bodyFat: 18 }],
      goals: [{ id: 'g1', name: '每周锻炼3次', type: '', targetValue: 3, currentValue: 1, unit: '次', createdAt: '2026-10-09T00:00:00.000Z' }],
    },
    reading: {
      books: [{ id: 'b1', title: '原则', status: '在读', progressPct: 30, pageCurrent: 120, pageTotal: 400, createdAt: '2026-10-09T00:00:00.000Z' }],
      notes: [{ id: 'r1', bookId: 'b1', type: '摘录', content: '痛苦+反思=进步', createdAt: '2026-10-09T10:00:00.000Z' }],
      focus: [{ id: 'f1', date: '2026-10-09', minutes: 45, bookId: 'b1', note: '' }],
    },
    business: {
      customers: [{ id: 'c1', name: '张老板', status: '跟进中', phone: '1380000', remark: '' }],
      orders: [{ id: 'o1', customerId: 'c1', product: '铝合金', amount: 500, cost: 300, status: '已完成', date: '2026-10-09', note: '' }],
      payments: [{ id: 'pay1', customerId: 'c1', orderId: 'o1', type: '应收', amount: 500, date: '2026-10-09', note: '' }],
    },
    schedules: [{ id: 's1', date: '2026-10-09', time: '15:00', title: '客户回访', note: '', done: false }],
    settings: { reminderOn: true },
  };
}

async function boot(name) {
  const server = createServer({ dataFile: path.join(tmpDir, name + '.json') });
  await server.init();
  await new Promise((resolve) => server.listen(0, resolve));
  return { baseUrl: `http://127.0.0.1:${server.address().port}`, server };
}

test('7 个模块的完整数据可通过 API 保存并读回一致', async () => {
  const { baseUrl, server } = await boot('full');
  try {
    const d = fullData();
    assert.strictEqual(validateData(d), true);
    const post = await fetch(baseUrl + '/api/data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) });
    assert.strictEqual(post.status, 200);
    const got = await (await fetch(baseUrl + '/api/data')).json();
    // 服务端原子写会填充 updatedAt（预期行为），其余字段应完全一致
    assert.ok(got.meta.updatedAt, 'updatedAt 应被服务端写入时间戳');
    const expected = { ...d, meta: { ...d.meta, updatedAt: got.meta.updatedAt } };
    assert.deepStrictEqual(got, expected, '保存后读回应与提交一致');
  } finally {
    server.close();
  }
});

test('各模块核心计算与 API 数据结合验证（模拟前端渲染输入）', async () => {
  const core = require('../public/core');
  const d = fullData();
  // 今日计划完成率
  const ps = core.planStats(d.plans, '2026-10-09');
  assert.deepStrictEqual(ps, { total: 2, done: 1, rate: 50 });
  // 本周锻炼
  const fw = core.workoutStats(d.fitness.workouts, '2026-10-09', 'week');
  assert.deepStrictEqual([fw.count, fw.totalMin], [1, 30]);
  // 读书统计
  const rs = core.readingStats(d.reading.books, d.reading.focus);
  assert.strictEqual(rs.reading, 1);
  assert.strictEqual(rs.totalFocusMin, 45);
  // 业务统计：今日销售额 500、毛利 200
  const bs = core.businessStats(d.business.orders, d.business.payments, '2026-10-09', 'day');
  assert.deepStrictEqual([bs.totalSales, bs.totalProfit], [500, 200]);
  // 到期日程：15:00 之前 10:30 判断 -> 过期/到期
  const due = core.dueSchedules(d.schedules, '2026-10-09', '10:30');
  assert.strictEqual(due.length, 0);
  const dueLater = core.dueSchedules(d.schedules, '2026-10-09', '16:00');
  assert.strictEqual(dueLater.length, 1);
});

test('清空后保存默认结构（模拟数据设置清空）', async () => {
  const { baseUrl, server } = await boot('clear');
  try {
    // 先写满
    await fetch(baseUrl + '/api/data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fullData()) });
    // 清空 = 提交空默认结构
    const empty = {
      meta: { version: 1, createdAt: '', updatedAt: null },
      quickNotes: [], plans: {},
      fitness: { workouts: [], metrics: [], goals: [] },
      reading: { books: [], notes: [], focus: [] },
      business: { customers: [], orders: [], payments: [] },
      schedules: [], settings: { reminderOn: true },
    };
    const res = await fetch(baseUrl + '/api/data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(empty) });
    assert.strictEqual(res.status, 200);
    const got = await (await fetch(baseUrl + '/api/data')).json();
    assert.strictEqual(got.quickNotes.length, 0);
    assert.strictEqual(got.schedules.length, 0);
  } finally {
    server.close();
  }
});
