'use strict';
// 纯计算逻辑（无 DOM 依赖），浏览器与 Node 测试共用（UMD）。
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.AppCore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const PRIORITIES = { '高': 0, '中': 1, '低': 2 };

  // ---------- 日期工具（本地时区） ----------
  function dateToStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function todayStr() {
    return dateToStr(new Date());
  }
  function nowTime() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  function strToDate(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function addDays(s, n) {
    const d = strToDate(s);
    d.setDate(d.getDate() + n);
    return dateToStr(d);
  }
  // 本周周一~周日
  function weekRange(s) {
    const d = strToDate(s);
    const dow = (d.getDay() + 6) % 7; // 周一=0
    const monday = new Date(d);
    monday.setDate(d.getDate() - dow);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { start: dateToStr(monday), end: dateToStr(sunday) };
  }
  // 本月 1 号 ~ 月末
  function monthRange(s) {
    const d = strToDate(s);
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { start: dateToStr(first), end: dateToStr(last) };
  }
  function inRange(dateStr, { start, end }) {
    return dateStr >= start && dateStr <= end;
  }

  // ---------- 今日计划统计 ----------
  // plans: { "YYYY-MM-DD": [...] }  -> { total, done, rate }
  function planStats(plans, dateStr) {
    const arr = (plans && plans[dateStr]) || [];
    const total = arr.length;
    const done = arr.filter((p) => p.done).length;
    return { total, done, rate: total ? Math.round((done / total) * 100) : 0 };
  }

  function prioritySort(list) {
    return list.slice().sort((a, b) => {
      const pa = PRIORITIES[a.priority] !== undefined ? PRIORITIES[a.priority] : 1;
      const pb = PRIORITIES[b.priority] !== undefined ? PRIORITIES[b.priority] : 1;
      if (pa !== pb) return pa - pb;
      return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    });
  }

  // 当月每日计划完成情况（用于日历图表记录历史计划）
  // plans: { "YYYY-MM-DD": [...] } -> { days: {date:{total,done,rate}}, monthTotal, monthDone, monthRate, range }
  function planCalendar(plans, dateStr) {
    const { start, end } = monthRange(dateStr);
    const days = {};
    let monthTotal = 0, monthDone = 0;
    for (let d = start; d <= end; d = addDays(d, 1)) {
      const arr = (plans && plans[d]) || [];
      const done = arr.filter((p) => p.done).length;
      days[d] = { total: arr.length, done, rate: arr.length ? Math.round((done / arr.length) * 100) : 0 };
      monthTotal += arr.length;
      monthDone += done;
    }
    return {
      days,
      monthTotal,
      monthDone,
      monthRate: monthTotal ? Math.round((monthDone / monthTotal) * 100) : 0,
      range: { start, end },
    };
  }

  // ---------- 运动健身统计 ----------
  // workouts: [{date, durationMin, sets, reps}]
  function workoutStats(workouts, dateStr, period) {
    const range = period === 'week' ? weekRange(dateStr) : monthRange(dateStr);
    const list = (workouts || []).filter((w) => inRange(w.date, range));
    return {
      count: list.length,
      totalMin: list.reduce((s, w) => s + (Number(w.durationMin) || 0), 0),
      range,
    };
  }

  // 身体指标最新一条（用于展示当前体重）
  function latestMetric(metrics) {
    if (!metrics || !metrics.length) return null;
    return metrics.slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  }

  // ---------- 读书学习统计 ----------
  function readingStats(books, focus) {
    const b = books || [];
    return {
      reading: b.filter((x) => x.status === '在读').length,
      finished: b.filter((x) => x.status === '读完').length,
      wanted: b.filter((x) => x.status === '想读').length,
      totalFocusMin: (focus || []).reduce((s, f) => s + (Number(f.minutes) || 0), 0),
    };
  }
  function focusByDate(focus, dateStr) {
    return (focus || []).filter((f) => f.date === dateStr).reduce((s, f) => s + (Number(f.minutes) || 0), 0);
  }

  // ---------- 业务开展统计 ----------
  // orders: [{amount, cost, status, date}]  payments: [{type:应收/实收, amount, date}]
  function businessStats(orders, payments, dateStr, period) {
    const range = period === 'day' ? { start: dateStr, end: dateStr } : (period === 'week' ? weekRange(dateStr) : monthRange(dateStr));
    const os = (orders || []).filter((o) => inRange(o.date, range) && o.status !== '已取消');
    const ps = (payments || []).filter((p) => inRange(p.date, range));
    const totalSales = os.reduce((s, o) => s + (Number(o.amount) || 0), 0);
    const totalProfit = os.reduce((s, o) => s + ((Number(o.amount) || 0) - (Number(o.cost) || 0)), 0);
    const receivable = ps.filter((p) => p.type === '应收').reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const received = ps.filter((p) => p.type === '实收').reduce((s, p) => s + (Number(p.amount) || 0), 0);
    return {
      orderCount: os.length,
      totalSales,
      totalProfit,
      receivable,
      received,
      unpaid: Math.max(0, receivable - received),
    };
  }

  // 按业务平台聚合订单（用于平台分布展示）
  // orders: [{platform, amount, cost, status, date}] -> { 平台名: {orderCount, totalSales, totalProfit} }
  function platformBreakdown(orders, dateStr, period) {
    const range = period === 'day' ? { start: dateStr, end: dateStr } : (period === 'week' ? weekRange(dateStr) : monthRange(dateStr));
    const map = {};
    for (const o of orders || []) {
      if (!inRange(o.date, range) || o.status === '已取消') continue;
      const p = o.platform || '其他';
      map[p] = map[p] || { orderCount: 0, totalSales: 0, totalProfit: 0 };
      map[p].orderCount++;
      map[p].totalSales += Number(o.amount) || 0;
      map[p].totalProfit += (Number(o.amount) || 0) - (Number(o.cost) || 0);
    }
    return map;
  }

  // ---------- 日程到期判断 ----------
  // 返回今日已到期/已过期的未完成日程
  function dueSchedules(schedules, dateStr, timeStr) {
    const list = [];
    for (const s of schedules || []) {
      if (s.done) continue;
      if (s.date < dateStr) { list.push(s); continue; } // 过期未完成
      if (s.date === dateStr && (s.time || '') <= timeStr) { list.push(s); } // 今日已到点
    }
    return list;
  }

  // 供当日列表使用：今天所有未完成日程（含未来的）
  function todaySchedules(schedules, dateStr) {
    return (schedules || []).filter((s) => s.date === dateStr && !s.done);
  }

  // ---------- 客户端 id（浏览器无 randomBytes） ----------
  function genClientId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  return {
    dateToStr, todayStr, nowTime, strToDate, addDays, weekRange, monthRange, inRange,
    planStats, prioritySort, planCalendar, workoutStats, latestMetric,
    readingStats, focusByDate, businessStats, platformBreakdown,
    dueSchedules, todaySchedules, genClientId,
    PRIORITIES,
  };
});
