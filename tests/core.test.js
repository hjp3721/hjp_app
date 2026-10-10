'use strict';
const test = require('node:test');
const assert = require('node:assert');
const core = require('../public/core');

test('日期工具：todayStr / addDays / weekRange / monthRange', () => {
  const t = core.todayStr();
  assert.match(t, /^\d{4}-\d{2}-\d{2}$/);
  assert.strictEqual(core.addDays('2026-10-09', 1), '2026-10-10');
  assert.strictEqual(core.addDays('2026-10-09', -1), '2026-10-08');
  // 2026-10-09 是周五，本周周一=2026-10-05，周日=2026-10-11
  const w = core.weekRange('2026-10-09');
  assert.deepStrictEqual(w, { start: '2026-10-05', end: '2026-10-11' });
  const m = core.monthRange('2026-10-09');
  assert.deepStrictEqual(m, { start: '2026-10-01', end: '2026-10-31' });
});

test('planStats 计算今日计划完成度', () => {
  const plans = { '2026-10-09': [
    { done: true }, { done: true }, { done: false }, { done: false },
  ] };
  const s = core.planStats(plans, '2026-10-09');
  assert.deepStrictEqual(s, { total: 4, done: 2, rate: 50 });
  // 无该日期任务
  const empty = core.planStats(plans, '2026-10-10');
  assert.deepStrictEqual(empty, { total: 0, done: 0, rate: 0 });
});

test('prioritySort 按 高>中>低 排序，同级按创建时间', () => {
  const list = [
    { id: 'a', priority: '低', createdAt: '1' },
    { id: 'b', priority: '高', createdAt: '3' },
    { id: 'c', priority: '中', createdAt: '2' },
    { id: 'd', priority: '中', createdAt: '1' },
    { id: 'e', priority: '高', createdAt: '1' },
  ];
  const sorted = core.prioritySort(list);
  assert.strictEqual(sorted[0].id, 'e');
  assert.strictEqual(sorted[1].id, 'b');
  assert.strictEqual(sorted[2].id, 'd');
  assert.strictEqual(sorted[3].id, 'c');
  assert.strictEqual(sorted[4].id, 'a');
});

test('workoutStats 本周与本月统计', () => {
  const workouts = [
    { date: '2026-10-05', durationMin: 30 }, // 周一（本周）
    { date: '2026-10-08', durationMin: 45 }, // 本周
    { date: '2026-10-02', durationMin: 20 }, // 上周（不在本周，但在本月）
    { date: '2026-11-05', durationMin: 60 }, // 下月（不在本月）
  ];
  const w = core.workoutStats(workouts, '2026-10-09', 'week');
  assert.strictEqual(w.count, 2);
  assert.strictEqual(w.totalMin, 75);
  const m = core.workoutStats(workouts, '2026-10-09', 'month');
  assert.strictEqual(m.count, 3);
  assert.strictEqual(m.totalMin, 95);
});

test('latestMetric 返回最新一条身体指标', () => {
  const metrics = [
    { date: '2026-10-01', weight: 70 },
    { date: '2026-10-08', weight: 69 },
  ];
  assert.strictEqual(core.latestMetric(metrics).weight, 69);
  assert.strictEqual(core.latestMetric([]), null);
});

test('readingStats 统计书单与专注时长', () => {
  const books = [
    { status: '在读' }, { status: '在读' }, { status: '读完' }, { status: '想读' },
  ];
  const focus = [{ minutes: 30 }, { minutes: 45 }];
  const s = core.readingStats(books, focus);
  assert.deepStrictEqual(s, { reading: 2, finished: 1, wanted: 1, totalFocusMin: 75 });
});

test('focusByDate 统计某日专注时长', () => {
  const focus = [
    { date: '2026-10-09', minutes: 20 },
    { date: '2026-10-09', minutes: 15 },
    { date: '2026-10-08', minutes: 99 },
  ];
  assert.strictEqual(core.focusByDate(focus, '2026-10-09'), 35);
});

test('businessStats 销售额/毛利/款项（按日周月）', () => {
  const orders = [
    { date: '2026-10-09', amount: 100, cost: 60, status: '已完成' },
    { date: '2026-10-09', amount: 50, cost: 20, status: '已取消' }, // 取消不计
    { date: '2026-10-08', amount: 200, cost: 100, status: '已完成' },
  ];
  const payments = [
    { type: '应收', amount: 100, date: '2026-10-09' },
    { type: '实收', amount: 60, date: '2026-10-09' },
  ];
  const day = core.businessStats(orders, payments, '2026-10-09', 'day');
  assert.strictEqual(day.orderCount, 1); // 取消不计
  assert.strictEqual(day.totalSales, 100);
  assert.strictEqual(day.totalProfit, 40);
  assert.strictEqual(day.receivable, 100);
  assert.strictEqual(day.received, 60);
  assert.strictEqual(day.unpaid, 40);

  const week = core.businessStats(orders, payments, '2026-10-09', 'week');
  assert.strictEqual(week.orderCount, 2);
  assert.strictEqual(week.totalSales, 300);
  assert.strictEqual(week.totalProfit, 140);
});

test('platformBreakdown 按业务平台聚合订单（日/周/月）', () => {
  const orders = [
    { platform: '亚马逊', amount: 100, cost: 60, status: '已完成', date: '2026-10-09' },
    { platform: '亚马逊', amount: 50, cost: 20, status: '已完成', date: '2026-10-09' },
    { platform: '速卖通', amount: 200, cost: 100, status: '已完成', date: '2026-10-08' },
    { platform: '亚马逊', amount: 999, cost: 800, status: '已取消', date: '2026-10-09' }, // 取消不计
    { amount: 30, cost: 10, status: '已完成', date: '2026-10-09' }, // 无平台 -> 其他
  ];
  const day = core.platformBreakdown(orders, '2026-10-09', 'day');
  assert.deepStrictEqual(day['亚马逊'], { orderCount: 2, totalSales: 150, totalProfit: 70 });
  assert.deepStrictEqual(day['其他'], { orderCount: 1, totalSales: 30, totalProfit: 20 });
  assert.strictEqual(day['速卖通'], undefined); // 10-08 不在 day 范围
  const week = core.platformBreakdown(orders, '2026-10-09', 'week');
  assert.deepStrictEqual(week['速卖通'], { orderCount: 1, totalSales: 200, totalProfit: 100 });
  // 空订单
  assert.deepStrictEqual(core.platformBreakdown([], '2026-10-09', 'week'), {});
});

test('dueSchedules 识别到期与过期日程', () => {
  const schedules = [
    { id: 'a', date: '2026-10-09', time: '09:00', done: false }, // 今日已到点
    { id: 'b', date: '2026-10-09', time: '12:00', done: false }, // 今日未到点
    { id: 'c', date: '2026-10-08', time: '10:00', done: false }, // 昨日过期
    { id: 'd', date: '2026-10-08', time: '10:00', done: true },  // 已完成，忽略
    { id: 'e', date: '2026-10-10', time: '08:00', done: false }, // 未来，忽略
  ];
  const due = core.dueSchedules(schedules, '2026-10-09', '10:30');
  const ids = due.map((s) => s.id).sort();
  assert.deepStrictEqual(ids, ['a', 'c']);
});

test('todaySchedules 返回今日未完成日程', () => {
  const schedules = [
    { id: 'x', date: '2026-10-09', done: false },
    { id: 'y', date: '2026-10-09', done: true },
    { id: 'z', date: '2026-10-10', done: false },
  ];
  const t = core.todaySchedules(schedules, '2026-10-09');
  assert.deepStrictEqual(t.map((s) => s.id), ['x']);
});

test('planCalendar 生成当月每日计划完成情况', () => {
  const plans = {
    '2026-10-05': [{ done: true }, { done: false }],             // 2 项，1 完成 -> 50%
    '2026-10-09': [{ done: true }],                              // 1 项，1 完成 -> 100%
    '2026-11-01': [{ done: false }],                             // 下月，不计入
  };
  const cal = core.planCalendar(plans, '2026-10-09');
  assert.strictEqual(cal.range.start, '2026-10-01');
  assert.strictEqual(cal.range.end, '2026-10-31');
  assert.deepStrictEqual(cal.days['2026-10-05'], { total: 2, done: 1, rate: 50 });
  assert.deepStrictEqual(cal.days['2026-10-09'], { total: 1, done: 1, rate: 100 });
  assert.deepStrictEqual(cal.days['2026-10-03'], { total: 0, done: 0, rate: 0 }); // 无任务日
  // 下月数据不计入当月
  assert.strictEqual(cal.days['2026-11-01'], undefined);
  // 当月汇总
  assert.strictEqual(cal.monthTotal, 3);
  assert.strictEqual(cal.monthDone, 2);
  assert.strictEqual(cal.monthRate, Math.round((2 / 3) * 100));
});

test('planCalendar 空数据返回全零当月', () => {
  const cal = core.planCalendar({}, '2026-10-09');
  assert.strictEqual(cal.monthTotal, 0);
  assert.strictEqual(cal.monthDone, 0);
  assert.strictEqual(cal.monthRate, 0);
  // 覆盖整个月（10月有31天）
  assert.strictEqual(Object.keys(cal.days).length, 31);
});

test('sortSchedules 重要事项优先，同级按时序', () => {
  const list = [
    { id: 'a', type: '日常', time: '09:00' },
    { id: 'b', type: '重要', time: '18:00' },
    { id: 'c', type: '日常', time: '10:00' },
    { id: 'd', time: '07:00' }, // 无 type -> 视为日常
    { id: 'e', type: '重要', time: '08:00' },
  ];
  const s = core.sortSchedules(list);
  // 重要：e(08) 先于 b(18)；日常按字符串时序 d('07:00')<a('09:00')<c('10:00')
  assert.deepStrictEqual(s.map((x) => x.id), ['e', 'b', 'd', 'a', 'c']);
  // 空/空安全
  assert.deepStrictEqual(core.sortSchedules([]), []);
  assert.deepStrictEqual(core.sortSchedules(null), []);
});

test('importantScheduleCount 统计到期中的重要事项数量', () => {
  const schedules = [
    { id: 'a', date: '2026-10-09', time: '09:00', type: '重要', done: false }, // 今日已到点-重要
    { id: 'b', date: '2026-10-09', time: '12:00', type: '日常', done: false }, // 今日未到点
    { id: 'c', date: '2026-10-08', time: '10:00', type: '重要', done: false }, // 昨日过期-重要
    { id: 'd', date: '2026-10-08', time: '10:00', type: '日常', done: false }, // 昨日过期-日常
    { id: 'e', date: '2026-10-08', time: '10:00', type: '重要', done: true },  // 已完成-忽略
  ];
  // 10:30 时：到期 a(重要)、c(重要)、d(日常) -> 重要 2 个
  assert.strictEqual(core.importantScheduleCount(schedules, '2026-10-09', '10:30'), 2);
});

test('dueSchedules 兼容带 type 的日程（重要/日常）', () => {
  const schedules = [
    { id: 'a', date: '2026-10-09', time: '09:00', type: '重要', done: false },
    { id: 'b', date: '2026-10-09', time: '12:00', type: '日常', done: false },
  ];
  const due = core.dueSchedules(schedules, '2026-10-09', '10:30');
  assert.deepStrictEqual(due.map((s) => s.id), ['a']);
});

test('genClientId 生成非空唯一 id', () => {
  const a = core.genClientId();
  const b = core.genClientId();
  assert.ok(a && b && a !== b);
});
