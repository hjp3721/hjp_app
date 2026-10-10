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

  // ---------- 每日迎接语 ----------
  const GREETINGS = [
    '新的一天，新的开始，加油！',
    '把今天的计划，一项项点亮。',
    '先完成重要的事，再谈其他。',
    '运动一下，精神一整天。',
    '读几页书，遇见更好的自己。',
    '生意往来，诚信先行。',
    '日程安排妥当，从容过好今天。',
    '此刻起，专注手头的一件事。',
    '小小的进步，也值得喝彩。',
    '今天的汗水，是明天的底气。',
    '订单不是终点，服务才是。',
    '给自己一个清爽的开始。',
    '目标明确，步履从容。',
    '保持节奏，比一时冲劲更重要。',
    '客户满意，是最大的口碑。',
    '一页书、一次训练，都算数。',
    '把想做的事，变成在做的事。',
    '记得留点时间给自己。',
    '今天也要元气满满。',
    '梳理优先级，再开始行动。',
  ];
  let _lastGreeting = null;
  // 从池中取一句，保证相邻两次显示不同（"每次打开话语都不一样"）
  function greeting() {
    if (!GREETINGS.length) return '欢迎回来';
    let idx = Math.floor(Math.random() * GREETINGS.length);
    if (_lastGreeting != null && GREETINGS[idx] === _lastGreeting) {
      idx = (idx + 1) % GREETINGS.length;
    }
    _lastGreeting = GREETINGS[idx];
    return _lastGreeting;
  }

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

  // ---------- 日程重要性 ----------
  const IMPORTANCE = { '重要': 0, '日常': 1 };
  // 重要事项优先，同级按时序排序
  function sortSchedules(list) {
    return (list || []).slice().sort((a, b) => {
      const ia = IMPORTANCE[a.type] !== undefined ? IMPORTANCE[a.type] : 1;
      const ib = IMPORTANCE[b.type] !== undefined ? IMPORTANCE[b.type] : 1;
      if (ia !== ib) return ia - ib;
      return String(a.time || '').localeCompare(String(b.time || ''));
    });
  }
  // 到期/今日未完成中，重要事项数量
  function importantScheduleCount(schedules, dateStr, timeStr) {
    return sortSchedules(dueSchedules(schedules, dateStr, timeStr)).filter((s) => (s.type || '日常') === '重要').length;
  }

  // ---------- 客户端 id（浏览器无 randomBytes） ----------
  function genClientId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  return {
    dateToStr, todayStr, nowTime, strToDate, addDays, weekRange, monthRange, inRange,
    planStats, prioritySort, planCalendar, workoutStats, latestMetric,
    readingStats, focusByDate, businessStats, platformBreakdown,
    dueSchedules, todaySchedules, sortSchedules, importantScheduleCount, genClientId,
    PRIORITIES, GREETINGS, greeting,
  };
});
