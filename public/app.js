'use strict';
(function () {
  const Core = window.AppCore;
  const view = document.getElementById('view');
  const modalRoot = document.getElementById('modalRoot');
  const toastContainer = document.getElementById('toastContainer');
  const remindBtn = document.getElementById('remindBtn');
  const todayLabel = document.getElementById('todayLabel');

  let state = null;        // 全量内存数据
  let currentPlanDate = Core.todayStr();   // 今日计划当前日期
  let planMonth = Core.todayStr();         // 今日计划日历图表当前月份
  let scheduleCursor = null;               // 日程当前选中日期
  let fitnessTab = 'workouts';
  let readingTab = 'books';
  let businessTab = 'customers';
  let focusTimer = null, focusStart = 0, focusElapsed = 0, focusRunning = false;
  let lastRoute = null;        // 记录上次路由，检测进入首页
  let homeGreeting = null;     // 本次进入首页的迎接语

  // ---------- HTML 转义（防 XSS） ----------
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ---------- 数据 API ----------
  async function loadData() {
    const r = await fetch('/api/data');
    if (!r.ok) throw new Error('数据加载失败');
    state = await r.json();
  }
  async function save() {
    const r = await fetch('/api/data', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
    if (!r.ok) throw new Error('保存失败');
  }
  function freshData() {
    return {
      meta: { version: 1, createdAt: new Date().toISOString(), updatedAt: null },
      quickNotes: [], plans: {},
      fitness: { workouts: [], metrics: [], goals: [] },
      reading: { books: [], notes: [], focus: [] },
      business: { customers: [], orders: [], payments: [] },
      schedules: [], settings: { reminderOn: true },
    };
  }

  // ---------- 通用组件 ----------
  function toast(msg, type) {
    const t = document.createElement('div');
    t.className = 'toast' + (type ? ' ' + type : '');
    t.textContent = msg;
    toastContainer.appendChild(t);
    setTimeout(() => t.remove(), 2400);
  }
  function closeModal() { modalRoot.innerHTML = ''; }
  function openModal({ title, sub, body, okText = '确定', onOk, danger = false }) {
    modalRoot.innerHTML = `
      <div class="modal-mask" data-action="close-modal">
        <div class="modal">
          <h3>${esc(title)}</h3>
          ${sub ? `<div class="sub">${esc(sub)}</div>` : ''}
          ${body}
          <div class="form-actions">
            <button class="btn" data-action="close-modal">取消</button>
            <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-action="modal-ok">${esc(okText)}</button>
          </div>
        </div>
      </div>`;
    modalRoot.querySelector('.modal-mask').addEventListener('click', (e) => {
      if (e.target === modalRoot.querySelector('.modal-mask')) closeModal();
    });
    // 弹窗按钮在 modalRoot 内，不在 view 的事件委托范围内，需显式绑定
    const okBtn = modalRoot.querySelector('.form-actions .btn-primary, .form-actions .btn-danger');
    const cancelBtn = modalRoot.querySelector('.form-actions .btn:not(.btn-primary):not(.btn-danger)');
    if (okBtn) okBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cb = window._modalOk;
      window._modalOk = null;
      cb && cb();
    });
    if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.stopPropagation(); closeModal(); });
    window._modalOk = onOk || (() => {});
  }
  function confirmModal(msg, onOk, danger = true) {
    openModal({
      title: '请确认', body: `<p>${esc(msg)}</p>`,
      okText: '确认', danger,
      onOk: () => { closeModal(); onOk && onOk(); },
    });
  }
  function empty(msg) { return `<div class="empty">${esc(msg)}</div>`; }

  // ---------- 路由 ----------
  function currentRoute() {
    const h = location.hash.replace(/^#\//, '');
    return ['home', 'plan', 'fitness', 'reading', 'business', 'schedule', 'settings'].includes(h) ? h : 'home';
  }
  function render() {
    const route = currentRoute();
    // 进入首页（含初始、从其他模块切回）时换一句迎接语；停留期间保持不变
    if (route === 'home' && lastRoute !== 'home') homeGreeting = Core.greeting();
    lastRoute = route;
    document.querySelectorAll('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.route === route));
    try {
      view.innerHTML = ({ home, plan, fitness, reading, business, schedule, settings })[route]();
    } catch (e) {
      view.innerHTML = `<div class="card">渲染出错：${esc(e.message)}</div>`;
    }
    updateTopbar();
  }
  function updateTopbar() {
    todayLabel.textContent = '今天是 ' + Core.todayStr();
    const due = Core.dueSchedules(state.schedules, Core.todayStr(), Core.nowTime());
    remindBtn.classList.toggle('hidden', !(state.settings.reminderOn && due.length));
    const imp = Core.importantScheduleCount(state.schedules, Core.todayStr(), Core.nowTime());
    remindBtn.textContent = `🔔 ${due.length} 条到期${imp ? `（${imp} 重要）` : ''}`;
  }

  // ---------- 首页总览 ----------
  function home() {
    const date = Core.todayStr();
    const plan = Core.planStats(state.plans, date);
    const fw = Core.workoutStats(state.fitness.workouts, date, 'week');
    const bw = Core.workoutStats(state.fitness.workouts, date, 'month');
    const rd = Core.readingStats(state.reading.books, state.reading.focus);
    const bs = Core.businessStats(state.business.orders, state.business.payments, date, 'week');
    const due = Core.dueSchedules(state.schedules, date, Core.nowTime());
    const importantDue = Core.importantScheduleCount(state.schedules, date, Core.nowTime());
    const notes = state.quickNotes.slice().reverse();

    const ring = ` <div class="home-ring"><svg width="110" height="110" viewBox="0 0 110 110">
      <circle cx="55" cy="55" r="46" fill="none" stroke="#eef1f3" stroke-width="12"/>
      <circle cx="55" cy="55" r="46" fill="none" stroke="#0f766e" stroke-width="12"
        stroke-dasharray="${(plan.rate / 100) * 289}" stroke-dashoffset="0"
        stroke-linecap="round" transform="rotate(-90 55 55)"/>
      <text x="55" y="52" text-anchor="middle" font-size="22" font-weight="700" fill="#1f2937">${plan.rate}%</text>
      <text x="55" y="72" text-anchor="middle" font-size="11" fill="#6b7280">今日完成</text></svg>
      <div><div class="muted">今日计划</div><div>已完成 ${plan.done} / ${plan.total} 项</div></div></div>`;

    const cards = `
      <a class="home-card" href="#/plan"><div class="t">今日计划</div><div class="v">${plan.rate}%</div><div class="s">${plan.done}/${plan.total} 已完成</div></a>
      <a class="home-card" href="#/fitness"><div class="t">本周锻炼</div><div class="v">${fw.count} 次</div><div class="s">共 ${fw.totalMin} 分钟</div></a>
      <a class="home-card" href="#/fitness"><div class="t">本月锻炼</div><div class="v">${bw.count} 次</div><div class="s">共 ${bw.totalMin} 分钟</div></a>
      <a class="home-card" href="#/reading"><div class="t">读书学习</div><div class="v">${rd.reading} 在读</div><div class="s">读完 ${rd.finished} 本 · 专注 ${rd.totalFocusMin} 分</div></a>
      <a class="home-card" href="#/business"><div class="t">本周销售</div><div class="v">¥${bs.totalSales}</div><div class="s">毛利 ¥${bs.totalProfit} · 未收 ¥${bs.unpaid}</div></a>
      <a class="home-card" href="#/schedule"><div class="t">日程提醒</div><div class="v">${due.length} 条到期</div><div class="s">${state.schedules.length} 条日程</div></a>`;

    const dueHtml = due.length ? `<div class="card" style="border-color:var(--danger);background:var(--danger-soft)">
      <div class="card-title">⚠️ 到期/过期日程${importantDue ? `（含 ${importantDue} 条重要）` : ''}</div>
      ${due.map((s) => `<div class="row"><span class="row-text">${s.type === '重要' ? '<span class="pill pill-hi">重要</span> ' : ''}<b>${esc(s.title)}</b> · ${esc(s.date)} ${esc(s.time || '')}</span>
        <button class="btn btn-sm btn-primary" data-action="schedule-done" data-id="${esc(s.id)}">完成</button></div>`).join('')}
    </div>` : '';

    const notesHtml = `<div class="card"><div class="card-title">快捷备忘</div>
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <input id="noteInput" placeholder="记一条备忘，回车保存">
        <button class="btn btn-primary" data-action="note-add">保存</button></div>
      ${notes.length ? notes.map((n) => `<div class="row"><span class="row-text">${esc(n.content)}</span>
        <button class="btn btn-sm" data-action="note-del" data-id="${esc(n.id)}">删除</button></div>`).join('')
        : empty('还没有备忘')}</div>`;

    return `
      <div class="greet">✨ ${esc(homeGreeting || Core.greeting())}</div>
      <div class="card">${ring}</div>
      ${dueHtml}
      ${notesHtml}
      <div class="section-head"><h2>模块摘要</h2></div>
      <div class="home-cards">${cards}</div>`;
  }

  // ---------- 今日计划 ----------
  function planCalHtml() {
    const today = Core.todayStr();
    const [y, m] = planMonth.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const lead = (first.getDay() + 6) % 7; // 周一开头
    const daysInMonth = new Date(y, m, 0).getDate();
    const cal = Core.planCalendar(state.plans, planMonth);
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push('<div class="cal-cell other"></div>');
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const info = cal.days[ds] || { total: 0, done: 0, rate: 0 };
      let cls = 'cal-cell';
      if (ds === today) cls += ' today';
      if (ds === currentPlanDate) cls += ' selected';
      let marker = '';
      if (info.total > 0) {
        const rateCls = info.rate === 100 ? 'full' : (info.rate > 0 ? 'part' : 'none');
        marker = `<span class="pcal-dot ${rateCls}" title="${info.done}/${info.total} 完成"></span>`;
      }
      cells.push(`<div class="${cls}" data-action="plan-cal-select" data-date="${ds}">
        <span class="d">${d}</span>${marker}</div>`);
    }
    return `
      <div class="section-head"><h2>历史计划</h2>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn btn-sm" data-action="plan-cal-month" data-n="-1">‹ 上月</button>
          <b>${y}年${String(m).padStart(2, '0')}月</b>
          <button class="btn btn-sm" data-action="plan-cal-month" data-n="1">下月 ›</button>
        </div></div>
      <div class="card">
        <div class="cal-head" style="display:grid;grid-template-columns:repeat(7,1fr)">
          ${['一', '二', '三', '四', '五', '六', '日'].map((d) => `<div>${d}</div>`).join('')}</div>
        <div class="calendar">${cells.join('')}</div>
        <div class="muted" style="margin-top:8px">当月共 ${cal.monthTotal} 项计划，完成 ${cal.monthDone} 项（${cal.monthRate}%）。点击某天查看该日计划。</div>
      </div>`;
  }

  function plan() {
    const list = (state.plans[currentPlanDate] || []).slice();
    const sorted = Core.prioritySort(list);
    const stat = Core.planStats(state.plans, currentPlanDate);
    const rows = sorted.length ? sorted.map((p) => `
      <div class="row ${p.done ? 'done' : ''}">
        <input type="checkbox" data-action="plan-toggle" data-id="${esc(p.id)}" ${p.done ? 'checked' : ''}>
        <span class="row-text" data-action="plan-edit" data-id="${esc(p.id)}" style="cursor:pointer">${esc(p.text)}</span>
        <span class="pill ${p.priority === '高' ? 'pill-hi' : p.priority === '中' ? 'pill-mid' : 'pill-lo'}">${esc(p.priority)}</span>
        <button class="btn btn-sm" data-action="plan-del" data-id="${esc(p.id)}">删除</button>
      </div>`).join('') : empty('这一天还没有任务，添加一个吧');

    return `
      <div class="section-head"><h2>今日计划</h2>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn btn-sm" data-action="plan-date" data-n="-1">‹ 前一天</button>
          <b>${esc(currentPlanDate)}</b>
          <button class="btn btn-sm" data-action="plan-date" data-n="1">后一天 ›</button>
        </div></div>
      ${planCalHtml()}
      <div class="card">
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <input id="planInput" placeholder="新增任务">
          <select id="planPriority" style="width:80px"><option>高</option><option selected>中</option><option>低</option></select>
          <button class="btn btn-primary" data-action="plan-add">添加</button></div>
        <div class="progress" style="margin-bottom:6px"><i style="width:${stat.rate}%"></i></div>
        <div class="muted">完成率 ${stat.rate}%（${stat.done}/${stat.total}）</div>
        <div style="margin-top:8px">${rows}</div>
      </div>`;
  }

  // ---------- 运动健身 ----------
  function fitness() {
    const tabs = [['workouts', '训练记录'], ['metrics', '身体指标'], ['goals', '目标进度'], ['stats', '统计']]
      .map(([k, t]) => `<button class="tab ${fitnessTab === k ? 'active' : ''}" data-action="fitness-tab" data-tab="${k}">${t}</button>`).join('');
    let body = '';
    if (fitnessTab === 'workouts') {
      const list = state.fitness.workouts.slice().sort((a, b) => b.date.localeCompare(a.date));
      body = `<div class="card">
        <div class="card-title">记录一次训练</div>
        <div class="form-row">
          <div><label>日期</label><input type="date" id="wDate" value="${Core.todayStr()}"></div>
          <div><label>项目</label><input id="wItem" placeholder="如：跑步 / 卧推"></div>
          <div><label>时长(分)</label><input type="number" id="wDur" min="0" value="30"></div>
          <div><label>组数</label><input type="number" id="wSets" min="0" value="0"></div>
          <div><label>次数</label><input type="number" id="wReps" min="0" value="0"></div>
          <div><label>重量(kg)</label><input type="number" id="wWeight" min="0" value="0"></div>
        </div>
        <div class="form-actions"><button class="btn btn-primary" data-action="workout-add">保存记录</button></div>
      </div>
      <div class="card"><div class="card-title">训练记录</div>
        ${list.length ? list.map((w) => `<div class="row"><span class="row-text">${esc(w.date)} · ${esc(w.item)} · ${esc(w.durationMin)}分钟</span>
          <span class="muted">${w.sets ? `组${esc(w.sets)}` : ''}${w.reps ? ` 次${esc(w.reps)}` : ''}${w.weight ? ` ${esc(w.weight)}kg` : ''}</span>
          <button class="btn btn-sm" data-action="workout-del" data-id="${esc(w.id)}">删除</button></div>`).join('')
          : empty('还没有训练记录')}
      </div>`;
    } else if (fitnessTab === 'metrics') {
      const list = state.fitness.metrics.slice().sort((a, b) => a.date.localeCompare(b.date));
      const latest = Core.latestMetric(state.fitness.metrics);
      const points = list.map((m) => `(${m.date},${m.weight})`).join(';');
      body = `<div class="card">
        <div class="card-title">记录身体指标${latest ? ` · 当前体重 ${latest.weight}kg${latest.bodyFat ? ' / 体脂 ' + latest.bodyFat + '%' : ''}` : ''}</div>
        <div class="form-row">
          <div><label>日期</label><input type="date" id="mDate" value="${Core.todayStr()}"></div>
          <div><label>体重(kg)</label><input type="number" id="mWeight" step="0.1" min="0"></div>
          <div><label>体脂(%)</label><input type="number" id="mFat" step="0.1" min="0"></div>
        </div>
        <div class="form-actions"><button class="btn btn-primary" data-action="metric-add">保存</button></div>
      </div>
      <div class="card"><div class="card-title">体重趋势</div>
        ${points ? `<div id="metricChart">${chartSvg(list.map((m) => m.weight))}</div>` : empty('记录体重后显示趋势')}</div>
      <div class="card"><div class="card-title">指标历史</div>
        ${list.length ? list.map((m) => `<div class="row"><span class="row-text">${esc(m.date)}</span>
          <span class="muted">体重 ${esc(m.weight)}kg${m.bodyFat ? ` · 体脂 ${esc(m.bodyFat)}%` : ''}</span>
          <button class="btn btn-sm" data-action="metric-del" data-id="${esc(m.id)}">删除</button></div>`).join('')
          : empty('还没有指标记录')}</div>`;
    } else if (fitnessTab === 'goals') {
      body = `<div class="card">
        <div class="card-title">设定目标</div>
        <div class="form-row">
          <div style="flex:2"><label>目标名称</label><input id="gName" placeholder="如：每周锻炼 3 次 / 体重到 68kg"></div>
          <div><label>单位</label><input id="gUnit" placeholder="次/kg"></div>
          <div><label>目标值</label><input type="number" id="gTarget" min="0"></div>
        </div>
        <div class="form-actions"><button class="btn btn-primary" data-action="goal-add">保存</button></div>
      </div>
      <div class="card"><div class="card-title">目标进度</div>
        ${state.fitness.goals.length ? state.fitness.goals.map((g) => {
          const pct = g.targetValue ? Math.min(100, Math.round((g.currentValue / g.targetValue) * 100)) : 0;
          return `<div class="row"><div class="row-text"><b>${esc(g.name)}</b>
            <div class="progress" style="margin-top:6px"><i style="width:${pct}%"></i></div>
            <div class="muted">${esc(g.currentValue)} / ${esc(g.targetValue)} ${esc(g.unit)}（${pct}%）</div></div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-sm" data-action="goal-update" data-id="${esc(g.id)}">更新</button>
              <button class="btn btn-sm" data-action="goal-del" data-id="${esc(g.id)}">删除</button></div></div>`;
        }).join('') : empty('还没有目标')}</div>`;
    } else {
      const w = Core.workoutStats(state.fitness.workouts, Core.todayStr(), 'week');
      const m = Core.workoutStats(state.fitness.workouts, Core.todayStr(), 'month');
      const latest = Core.latestMetric(state.fitness.metrics);
      body = `<div class="card"><div class="stat-grid">
        <div class="stat-box"><div class="num">${w.count}</div><div class="lbl">本周锻炼次数</div></div>
        <div class="stat-box"><div class="num">${w.totalMin}</div><div class="lbl">本周时长(分)</div></div>
        <div class="stat-box"><div class="num">${m.count}</div><div class="lbl">本月锻炼次数</div></div>
        <div class="stat-box"><div class="num">${m.totalMin}</div><div class="lbl">本月时长(分)</div></div>
        <div class="stat-box"><div class="num">${latest ? latest.weight : '—'}</div><div class="lbl">当前体重(kg)</div></div>
      </div></div>`;
    }
    return `<div class="tabs">${tabs}</div>${body}`;
  }

  // SVG 折线图（简单）
  function chartSvg(values) {
    if (!values || values.length < 2) return '<div class="empty">数据点不足</div>';
    const W = 520, H = 160, pad = 28;
    const min = Math.min(...values), max = Math.max(...values);
    const span = (max - min) || 1;
    const x = (i) => pad + (i * (W - pad * 2)) / (values.length - 1);
    const y = (v) => H - pad - ((v - min) / span) * (H - pad * 2);
    const pts = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">
      <polyline points="${pts}" fill="none" stroke="#0f766e" stroke-width="2"/>
      ${values.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="#0f766e"/>`).join('')}
      ${values.map((v, i) => `<text x="${x(i)}" y="${y(v) - 8}" text-anchor="middle" font-size="10" fill="#6b7280">${v}</text>`).join('')}
    </svg>`;
  }

  // ---------- 读书学习 ----------
  function reading() {
    const tabs = [['books', '书单'], ['notes', '读书笔记'], ['focus', '专注计时'], ['stats', '统计']]
      .map(([k, t]) => `<button class="tab ${readingTab === k ? 'active' : ''}" data-action="reading-tab" data-tab="${k}">${t}</button>`).join('');
    let body = '';
    if (readingTab === 'books') {
      body = `<div class="card">
        <div class="card-title">添加一本书</div>
        <div class="form-row">
          <div style="flex:2"><label>书名</label><input id="bTitle" placeholder="书名"></div>
          <div><label>状态</label><select id="bStatus"><option value="想读">想读</option><option value="在读" selected>在读</option><option value="读完">读完</option></select></div>
          <div><label>总页数</label><input type="number" id="bTotal" min="0"></div>
        </div>
        <div class="form-actions"><button class="btn btn-primary" data-action="book-add">保存</button></div>
      </div>
      <div class="card"><div class="card-title">我的书单</div>
        ${state.reading.books.length ? state.reading.books.map((b) => {
          const pct = b.status === '读完' ? 100 : (b.progressPct || 0);
          return `<div class="row"><div class="row-text"><b>${esc(b.title)}</b>
            <span class="pill ${b.status === '读完' ? 'pill-ok' : b.status === '在读' ? 'pill-accent' : 'pill-lo'}" style="margin-left:6px">${esc(b.status)}</span>
            <div class="progress" style="margin-top:6px"><i style="width:${pct}%"></i></div>
            <div class="muted">进度 ${pct}%${b.pageTotal ? `（${esc(b.pageCurrent)}/${esc(b.pageTotal)} 页）` : ''}</div></div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-sm" data-action="book-progress" data-id="${esc(b.id)}">更新进度</button>
              <button class="btn btn-sm" data-action="book-del" data-id="${esc(b.id)}">删除</button></div></div>`;
        }).join('') : empty('书单还是空的')}</div>`;
    } else if (readingTab === 'notes') {
      const bookOpts = state.reading.books.map((b) => `<option value="${esc(b.id)}">${esc(b.title)}</option>`).join('');
      const grouped = {};
      state.reading.notes.forEach((n) => {
        const book = state.reading.books.find((b) => b.id === n.bookId);
        const key = book ? book.title : '未归类';
        (grouped[key] = grouped[key] || []).push(n);
      });
      body = `<div class="card">
        <div class="card-title">记一条笔记</div>
        <div class="form-row">
          <div><label>书籍</label><select id="nBook">${bookOpts || '<option value="">（先添加书籍）</option>'}</select></div>
          <div><label>类型</label><select id="nType"><option value="摘录">摘录</option><option value="心得">心得</option></select></div>
        </div>
        <label>内容</label><textarea id="nContent" rows="3" placeholder="摘录或心得…"></textarea>
        <div class="form-actions"><button class="btn btn-primary" data-action="note-book-add">保存</button></div>
      </div>
      <div class="card"><div class="card-title">读书笔记</div>
        ${Object.keys(grouped).length ? Object.keys(grouped).map((k) => `
          <div style="margin-bottom:8px"><b>${esc(k)}</b></div>
          ${grouped[k].map((n) => `<div class="row"><span class="row-text"><span class="pill ${n.type === '摘录' ? 'pill-mid' : 'pill-accent'}">${esc(n.type)}</span> ${esc(n.content)}</span>
            <button class="btn btn-sm" data-action="booknote-del" data-id="${esc(n.id)}">删除</button></div>`).join('')}
        `).join('') : empty('还没有笔记')}</div>`;
    } else if (readingTab === 'focus') {
      const todayMin = Core.focusByDate(state.reading.focus, Core.todayStr());
      body = `<div class="card"><div class="card-title">专注计时</div>
        <div style="text-align:center;padding:20px">
          <div id="focusClock" style="font-size:42px;font-weight:700;color:var(--accent)">00:00</div>
          <div class="muted" style="margin:6px 0 12px">今日已专注 ${todayMin} 分钟</div>
          <div style="display:flex;gap:8px;justify-content:center">
            <button class="btn btn-primary" data-action="focus-start">开始</button>
            <button class="btn" data-action="focus-pause">暂停</button>
            <button class="btn btn-danger" data-action="focus-end">结束并记录</button>
          </div>
          <div style="margin-top:12px"><input id="focusBook" placeholder="本次专注的书（可留空）"></div>
        </div></div>
        <div class="card"><div class="card-title">专注记录</div>
          ${state.reading.focus.slice().reverse().length ? state.reading.focus.slice().reverse().map((f) => `
            <div class="row"><span class="row-text">${esc(f.date)} · ${esc(f.minutes)} 分钟${f.bookId ? ' · ' + esc((state.reading.books.find((b) => b.id === f.bookId) || {}).title || '') : ''}</span>
            <button class="btn btn-sm" data-action="focus-del" data-id="${esc(f.id)}">删除</button></div>`).join('')
            : empty('还没有专注记录')}</div>`;
    } else {
      const s = Core.readingStats(state.reading.books, state.reading.focus);
      const todayMin = Core.focusByDate(state.reading.focus, Core.todayStr());
      body = `<div class="card"><div class="stat-grid">
        <div class="stat-box"><div class="num">${s.reading}</div><div class="lbl">在读</div></div>
        <div class="stat-box"><div class="num">${s.finished}</div><div class="lbl">读完</div></div>
        <div class="stat-box"><div class="num">${s.wanted}</div><div class="lbl">想读</div></div>
        <div class="stat-box"><div class="num">${s.totalFocusMin}</div><div class="lbl">累计专注(分)</div></div>
        <div class="stat-box"><div class="num">${todayMin}</div><div class="lbl">今日专注(分)</div></div>
      </div></div>`;
    }
    return `<div class="tabs">${tabs}</div>${body}`;
  }

  // ---------- 业务开展 ----------
  function business() {
    const tabs = [['customers', '客户管理'], ['orders', '订单销售'], ['payments', '款项台账'], ['stats', '销售统计']]
      .map(([k, t]) => `<button class="tab ${businessTab === k ? 'active' : ''}" data-action="business-tab" data-tab="${k}">${t}</button>`).join('');
    const custName = (id) => (state.business.customers.find((c) => c.id === id) || {}).name || '—';
    let body = '';
    if (businessTab === 'customers') {
      body = `<div class="card">
        <div class="card-title">新增客户</div>
        <div class="form-row">
          <div style="flex:2"><label>名称</label><input id="cName" placeholder="客户/公司名"></div>
          <div><label>状态</label><select id="cStatus"><option>潜在</option><option selected>跟进中</option><option>已成交</option><option>流失</option></select></div>
          <div><label>电话</label><input id="cPhone"></div>
        </div>
        <label>备注</label><input id="cRemark" placeholder="备注（可选）">
        <div class="form-actions"><button class="btn btn-primary" data-action="customer-add">保存</button></div>
      </div>
      <div class="card"><div class="card-title">客户列表</div>
        ${state.business.customers.length ? state.business.customers.map((c) => `
          <div class="row"><div class="row-text"><b>${esc(c.name)}</b>
            <span class="pill ${c.status === '已成交' ? 'pill-ok' : c.status === '跟进中' ? 'pill-accent' : 'pill-lo'}" style="margin-left:6px">${esc(c.status)}</span>
            <div class="muted">${esc(c.phone || '')}${c.remark ? ' · ' + esc(c.remark) : ''}</div></div>
            <button class="btn btn-sm" data-action="customer-edit" data-id="${esc(c.id)}">编辑</button>
            <button class="btn btn-sm" data-action="customer-del" data-id="${esc(c.id)}">删除</button></div>`).join('')
          : empty('还没有客户')}</div>`;
    } else if (businessTab === 'orders') {
      const custOpts = state.business.customers.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
      const platformOpts = ['亚马逊', '速卖通', 'Shopee', 'Lazada', 'eBay', '淘宝/天猫', '京东', '拼多多', '抖音小店', '其他']
        .map((p) => `<option>${esc(p)}</option>`).join('');
      body = `<div class="card">
        <div class="card-title">新增订单</div>
        <div class="form-row">
          <div><label>客户</label><select id="oCustomer">${custOpts || '<option value="">（先添加客户）</option>'}</select></div>
          <div><label>平台</label><select id="oPlatform">${platformOpts}</select></div>
          <div style="flex:2"><label>商品</label><input id="oProduct" placeholder="商品/服务"></div>
          <div><label>金额</label><input type="number" id="oAmount" min="0"></div>
          <div><label>成本</label><input type="number" id="oCost" min="0"></div>
          <div><label>状态</label><select id="oStatus"><option selected>进行中</option><option>已完成</option><option>已取消</option></select></div>
          <div><label>日期</label><input type="date" id="oDate" value="${Core.todayStr()}"></div>
        </div>
        <div class="form-actions"><button class="btn btn-primary" data-action="order-add">保存</button></div>
      </div>
      <div class="card"><div class="card-title">订单列表</div>
        ${state.business.orders.length ? state.business.orders.slice().sort((a, b) => b.date.localeCompare(a.date)).map((o) => `
          <div class="row"><div class="row-text">${esc(o.date)} · ${esc(custName(o.customerId))} · <b>${esc(o.product)}</b> ¥${esc(o.amount)}
            <span class="pill pill-lo" style="margin-left:6px">${esc(o.platform || '其他')}</span>
            <span class="pill ${o.status === '已完成' ? 'pill-ok' : o.status === '已取消' ? 'pill-lo' : 'pill-accent'}" style="margin-left:6px">${esc(o.status)}</span></div>
            <button class="btn btn-sm" data-action="order-del" data-id="${esc(o.id)}">删除</button></div>`).join('')
          : empty('还没有订单')}</div>`;
    } else if (businessTab === 'payments') {
      const custOpts = state.business.customers.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
      body = `<div class="card">
        <div class="card-title">记录款项</div>
        <div class="form-row">
          <div><label>客户</label><select id="pCustomer">${custOpts || '<option value="">（先添加客户）</option>'}</select></div>
          <div><label>类型</label><select id="pType"><option value="应收">应收</option><option value="实收">实收</option></select></div>
          <div><label>金额</label><input type="number" id="pAmount" min="0"></div>
          <div><label>日期</label><input type="date" id="pDate" value="${Core.todayStr()}"></div>
        </div>
        <label>备注</label><input id="pNote">
        <div class="form-actions"><button class="btn btn-primary" data-action="payment-add">保存</button></div>
      </div>
      <div class="card"><div class="card-title">款项台账</div>
        ${state.business.payments.length ? state.business.payments.slice().sort((a, b) => b.date.localeCompare(a.date)).map((p) => `
          <div class="row"><div class="row-text">${esc(p.date)} · ${esc(custName(p.customerId))} · <b>${esc(p.type)}</b> ¥${esc(p.amount)}${p.note ? ' · ' + esc(p.note) : ''}</div>
            <button class="btn btn-sm" data-action="payment-del" data-id="${esc(p.id)}">删除</button></div>`).join('')
          : empty('还没有款项记录')}</div>`;
    } else {
      const sel = ['day', 'week', 'month'];
      const wk = Core.businessStats(state.business.orders, state.business.payments, Core.todayStr(), 'week');
      body = `<div class="card">
        <div class="section-head"><h2>销售统计</h2>
          <select data-action="biz-period" style="width:90px"><option value="day">按日</option><option value="week" selected>按周</option><option value="month">按月</option></select></div>
        <div class="stat-grid">
          <div class="stat-box"><div class="num">${statsFor(Core.businessStats(state.business.orders, state.business.payments, Core.todayStr(), 'day')).totalSales}</div><div class="lbl">今日销售额</div></div>
          <div class="stat-box"><div class="num">${statsFor(Core.businessStats(state.business.orders, state.business.payments, Core.todayStr(), 'week')).totalSales}</div><div class="lbl">本周销售额</div></div>
          <div class="stat-box"><div class="num">${statsFor(Core.businessStats(state.business.orders, state.business.payments, Core.todayStr(), 'month')).totalSales}</div><div class="lbl">本月销售额</div></div>
        </div>
        <div class="stat-grid" style="margin-top:12px">
          <div class="stat-box"><div class="num">${wk.totalProfit}</div><div class="lbl">本周毛利</div></div>
          <div class="stat-box"><div class="num">${wk.receivable}</div><div class="lbl">本周应收</div></div>
          <div class="stat-box"><div class="num">${wk.received}</div><div class="lbl">本周实收</div></div>
          <div class="stat-box"><div class="num">${wk.unpaid}</div><div class="lbl">未收款</div></div>
        </div></div>
      ${platformStatHtml()}`;
    }
    return `<div class="tabs">${tabs}</div>${body}`;
  }
  function statsFor(x) { return x || { totalSales: 0, totalProfit: 0, receivable: 0, received: 0, unpaid: 0 }; }

  // 平台分布（本周）：横向条形图 + 明细
  function platformStatHtml() {
    const bd = Core.platformBreakdown(state.business.orders, Core.todayStr(), 'week');
    const rows = Object.keys(bd);
    if (!rows.length) return '<div class="card"><div class="card-title">平台分布（本周）</div>' + empty('本周还没有订单') + '</div>';
    const max = Math.max(...rows.map((k) => bd[k].totalSales), 1);
    return `<div class="card"><div class="card-title">平台分布（本周）</div>
      <table><thead><tr><th>平台</th><th>订单数</th><th>销售额</th><th>毛利</th></tr></thead><tbody>
        ${rows.map((k) => `<tr><td><b>${esc(k)}</b></td><td>${bd[k].orderCount}</td><td>¥${bd[k].totalSales}</td><td>¥${bd[k].totalProfit}</td></tr>`).join('')}
      </tbody></table>
      <div style="margin-top:12px">${rows.map((k) => `
        <div style="margin-bottom:6px"><div class="muted" style="display:flex;justify-content:space-between"><span>${esc(k)}</span><span>¥${bd[k].totalSales}</span></div>
          <div class="progress"><i style="width:${Math.round((bd[k].totalSales / max) * 100)}%;background:var(--accent)"></i></div></div>`).join('')}
      </div></div>`;
  }

  // ---------- 日程提醒 ----------
  function schedule() {
    const today = Core.todayStr();
    const cur = scheduleCursor || today;
    const [y, m] = cur.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const lead = (first.getDay() + 6) % 7; // 周一开头
    const daysInMonth = new Date(y, m, 0).getDate();
    const monthStart = Core.dateToStr(new Date(y, m - 1, 1));
    const monthEnd = Core.dateToStr(new Date(y, m, 0));
    const withDay = new Set(state.schedules.filter((s) => s.date >= monthStart && s.date <= monthEnd).map((s) => s.date));
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(`<div class="cal-cell other"></div>`);
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push(`<div class="cal-cell ${ds === today ? 'today' : ''} ${ds === cur ? 'selected' : ''}" data-action="schedule-select" data-date="${ds}">
        <span class="d">${d}</span>${withDay.has(ds) ? '<span class="dot"></span>' : ''}</div>`);
    }
    const dayList = Core.sortSchedules(state.schedules.filter((s) => s.date === cur));
    return `
      <div class="section-head"><h2>日程提醒</h2>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn btn-sm" data-action="schedule-month" data-n="-1">‹ 上月</button>
          <b>${y}年${String(m).padStart(2, '0')}月</b>
          <button class="btn btn-sm" data-action="schedule-month" data-n="1">下月 ›</button>
        </div></div>
      <div class="card"><div class="cal-head" style="display:grid;grid-template-columns:repeat(7,1fr);grid-column:1/-1">
        ${['一', '二', '三', '四', '五', '六', '日'].map((d) => `<div>${d}</div>`).join('')}</div>
        <div class="calendar" style="grid-column:1/-1">${cells.join('')}</div></div>
      <div class="card"><div class="section-head"><h2>${esc(cur)} 日程</h2>
        <button class="btn btn-primary" data-action="schedule-new">新增日程</button></div>
        ${dayList.length ? dayList.map((s) => `
          <div class="row ${s.done ? 'done' : ''}">
            <input type="checkbox" data-action="schedule-done" data-id="${esc(s.id)}" ${s.done ? 'checked' : ''}>
            <span class="row-text">${s.type === '重要' ? '<span class="pill pill-hi">重要</span> ' : ''}<b>${esc(s.title)}</b> · ${esc(s.time || '全天')}${s.note ? ' · ' + esc(s.note) : ''}</span>
            <button class="btn btn-sm" data-action="schedule-edit" data-id="${esc(s.id)}">编辑</button>
            <button class="btn btn-sm" data-action="schedule-del" data-id="${esc(s.id)}">删除</button>
          </div>`).join('') : empty('这一天没有日程')}
      </div>`;
  }

  // ---------- 数据设置 ----------
  function settings() {
    const counts = [
      ['快捷备忘', state.quickNotes.length],
      ['今日计划任务', Object.values(state.plans).reduce((s, a) => s + a.length, 0)],
      ['训练记录', state.fitness.workouts.length],
      ['身体指标', state.fitness.metrics.length],
      ['健身目标', state.fitness.goals.length],
      ['书单', state.reading.books.length],
      ['读书笔记', state.reading.notes.length],
      ['专注记录', state.reading.focus.length],
      ['客户', state.business.customers.length],
      ['订单', state.business.orders.length],
      ['款项', state.business.payments.length],
      ['日程', state.schedules.length],
    ];
    return `<div class="card"><div class="card-title">数据备份</div>
      <div style="display:flex;gap:10px">
        <button class="btn btn-primary" data-action="backup-export">导出备份</button>
        <label class="btn" style="cursor:pointer">导入恢复<input type="file" id="backupFile" accept=".json" style="display:none" data-action="backup-import"></label>
      </div>
      <div class="muted" style="margin-top:8px">导出为本地 JSON 文件保存；导入会覆盖当前数据。</div></div>
    <div class="card"><div class="card-title">数据统计</div>
      <table><thead><tr><th>模块</th><th>记录数</th></tr></thead><tbody>
        ${counts.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}
      </tbody></table></div>
    <div class="card"><div class="card-title">提醒</div>
      <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" data-action="remind-toggle" ${state.settings.reminderOn ? 'checked' : ''} style="width:auto"> 开启到期日程提醒</label></div>
    <div class="card" style="border-color:var(--danger)"><div class="card-title" style="color:var(--danger)">危险操作</div>
      <button class="btn btn-danger" data-action="data-clear">清空全部数据</button></div>`;
  }

  // ---------- 全局事件委托 ----------
  function bindView() {
    view.addEventListener('click', onClick);
    view.addEventListener('change', onChange);
    view.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target && e.target.id === 'noteInput') { doNoteAdd(); }
      if (e.key === 'Enter' && e.target && e.target.id === 'planInput') { doPlanAdd(); }
    });
  }

  // ---------- 动作分发 ----------
  function act(action, el) {
    const id = el.dataset.id;
    const n = Number(el.dataset.n);
    switch (action) {
      case 'close-modal': closeModal(); break;
      case 'modal-ok': window._modalOk && window._modalOk(); window._modalOk = null; break;

      // 备忘
      case 'note-add': doNoteAdd(); break;
      case 'note-del': confirmModal('删除这条备忘？', () => { state.quickNotes = state.quickNotes.filter((x) => x.id !== id); saveThen(); }, false); break;

      // 今日计划
      case 'plan-date': currentPlanDate = Core.addDays(currentPlanDate, n); render(); break;
      case 'plan-cal-select': currentPlanDate = el.dataset.date; render(); break;
      case 'plan-cal-month': {
        const [yy, mm] = planMonth.split('-').map(Number);
        const dt = new Date(yy, mm - 1 + n, 1);
        planMonth = Core.dateToStr(dt);
        render(); break;
      }
      case 'plan-add': doPlanAdd(); break;
      case 'plan-toggle': {
        const p = (state.plans[currentPlanDate] || []).find((x) => x.id === id);
        if (p) { p.done = el.checked; saveThen(); render(); }
        break;
      }
      case 'plan-edit': planEdit(id); break;
      case 'plan-del': confirmModal('删除这个任务？', () => {
        state.plans[currentPlanDate] = (state.plans[currentPlanDate] || []).filter((x) => x.id !== id);
        saveThen(); render();
      }, false); break;

      // 健身
      case 'fitness-tab': fitnessTab = el.dataset.tab; render(); break;
      case 'workout-add': workoutAdd(); break;
      case 'workout-del': confirmModal('删除这条训练记录？', () => { state.fitness.workouts = state.fitness.workouts.filter((x) => x.id !== id); saveThen(); render(); }, false); break;
      case 'metric-add': metricAdd(); break;
      case 'metric-del': confirmModal('删除这条指标记录？', () => { state.fitness.metrics = state.fitness.metrics.filter((x) => x.id !== id); saveThen(); render(); }, false); break;
      case 'goal-add': goalAdd(); break;
      case 'goal-update': goalUpdate(id); break;
      case 'goal-del': confirmModal('删除这个目标？', () => { state.fitness.goals = state.fitness.goals.filter((x) => x.id !== id); saveThen(); render(); }, false); break;

      // 读书
      case 'reading-tab': readingTab = el.dataset.tab; render(); break;
      case 'book-add': bookAdd(); break;
      case 'book-progress': bookProgress(id); break;
      case 'book-del': confirmModal('删除这本书？', () => { state.reading.books = state.reading.books.filter((x) => x.id !== id); saveThen(); render(); }, false); break;
      case 'note-book-add': bookNoteAdd(); break;
      case 'booknote-del': confirmModal('删除这条笔记？', () => { state.reading.notes = state.reading.notes.filter((x) => x.id !== id); saveThen(); render(); }, false); break;
      case 'focus-start': focusStartTimer(); break;
      case 'focus-pause': focusPauseTimer(); break;
      case 'focus-end': focusEndTimer(); break;
      case 'focus-del': confirmModal('删除这条专注记录？', () => { state.reading.focus = state.reading.focus.filter((x) => x.id !== id); saveThen(); render(); }, false); break;

      // 业务
      case 'business-tab': businessTab = el.dataset.tab; render(); break;
      case 'customer-add': customerAdd(); break;
      case 'customer-edit': customerEdit(id); break;
      case 'customer-del': confirmModal('删除这个客户？', () => { state.business.customers = state.business.customers.filter((x) => x.id !== id); saveThen(); render(); }, false); break;
      case 'order-add': orderAdd(); break;
      case 'order-del': confirmModal('删除这个订单？', () => { state.business.orders = state.business.orders.filter((x) => x.id !== id); saveThen(); render(); }, false); break;
      case 'payment-add': paymentAdd(); break;
      case 'payment-del': confirmModal('删除这条款项记录？', () => { state.business.payments = state.business.payments.filter((x) => x.id !== id); saveThen(); render(); }, false); break;

      // 日程
      case 'schedule-select': scheduleCursor = el.dataset.date; render(); break;
      case 'schedule-month': {
        const [yy, mm] = scheduleCursor.split('-').map(Number);
        const dt = new Date(yy, mm - 1 + n, 1);
        scheduleCursor = Core.dateToStr(dt);
        render(); break;
      }
      case 'schedule-new': scheduleEdit(null); break;
      case 'schedule-edit': scheduleEdit(id); break;
      case 'schedule-done': {
        const s = state.schedules.find((x) => x.id === id);
        if (s) { s.done = el.checked; saveThen(); render(); }
        break;
      }
      case 'schedule-del': confirmModal('删除这条日程？', () => { state.schedules = state.schedules.filter((x) => x.id !== id); saveThen(); render(); }, false); break;

      // 设置
      case 'backup-export': backupExport(); break;
      case 'data-clear': dataClear(); break;
      default: break;
    }
  }

  // ---------- 保存封装 ----------
  function saveThen() {
    save().then(() => toast('已保存', 'ok')).catch((err) => toast(err.message, 'err'));
  }

  // ---------- 各操作实现 ----------
  function doNoteAdd() {
    const v = document.getElementById('noteInput').value.trim();
    if (!v) return toast('内容不能为空', 'err');
    state.quickNotes.push({ id: Core.genClientId(), content: v, createdAt: new Date().toISOString() });
    saveThen(); render();
  }
  function doPlanAdd() {
    const text = document.getElementById('planInput').value.trim();
    if (!text) return toast('任务不能为空', 'err');
    const pri = document.getElementById('planPriority').value;
    if (!state.plans[currentPlanDate]) state.plans[currentPlanDate] = [];
    state.plans[currentPlanDate].push({ id: Core.genClientId(), text, done: false, priority: pri, createdAt: new Date().toISOString() });
    saveThen(); render();
  }
  function planEdit(id) {
    const p = (state.plans[currentPlanDate] || []).find((x) => x.id === id);
    if (!p) return;
    openModal({
      title: '编辑任务', body: `<label>内容</label><input id="peText" value="${esc(p.text)}"><label>优先级</label>
        <select id="pePri"><option ${p.priority === '高' ? 'selected' : ''}>高</option><option ${p.priority === '中' ? 'selected' : ''}>中</option><option ${p.priority === '低' ? 'selected' : ''}>低</option></select>`,
      onOk: () => {
        p.text = document.getElementById('peText').value.trim() || p.text;
        p.priority = document.getElementById('pePri').value;
        closeModal(); saveThen(); render();
      },
    });
  }

  function workoutAdd() {
    const w = {
      id: Core.genClientId(), date: val('wDate'), item: val('wItem').trim(),
      durationMin: Number(val('wDur')) || 0, sets: Number(val('wSets')) || 0,
      reps: Number(val('wReps')) || 0, weight: Number(val('wWeight')) || 0, note: '',
    };
    if (!w.item) return toast('请填写项目', 'err');
    state.fitness.workouts.push(w); saveThen(); render();
  }
  function metricAdd() {
    const m = { id: Core.genClientId(), date: val('mDate'), weight: Number(val('mWeight')), bodyFat: Number(val('mFat')) || 0 };
    if (!m.weight) return toast('请填写体重', 'err');
    state.fitness.metrics.push(m); saveThen(); render();
  }
  function goalAdd() {
    const g = { id: Core.genClientId(), name: val('gName').trim(), type: '', targetValue: Number(val('gTarget')) || 0, currentValue: 0, unit: val('gUnit').trim(), createdAt: new Date().toISOString() };
    if (!g.name) return toast('请填写目标名称', 'err');
    state.fitness.goals.push(g); saveThen(); render();
  }
  function goalUpdate(id) {
    const g = state.fitness.goals.find((x) => x.id === id); if (!g) return;
    openModal({
      title: '更新目标进度', body: `<label>当前值（${esc(g.unit)}）</label><input type="number" id="gCur" value="${esc(g.currentValue)}">`,
      onOk: () => { g.currentValue = Number(document.getElementById('gCur').value) || 0; closeModal(); saveThen(); render(); },
    });
  }

  function bookAdd() {
    const b = { id: Core.genClientId(), title: val('bTitle').trim(), status: val('bStatus'), progressPct: 0, pageCurrent: 0, pageTotal: Number(val('bTotal')) || 0, createdAt: new Date().toISOString() };
    if (!b.title) return toast('请填写书名', 'err');
    if (b.status === '读完') b.progressPct = 100;
    state.reading.books.push(b); saveThen(); render();
  }
  function bookProgress(id) {
    const b = state.reading.books.find((x) => x.id === id); if (!b) return;
    openModal({
      title: '更新阅读进度', sub: esc(b.title),
      body: `<label>当前进度（%）</label><input type="number" id="bpPct" min="0" max="100" value="${esc(b.progressPct)}">`,
      onOk: () => {
        let pct = Number(document.getElementById('bpPct').value);
        if (pct >= 100 || b.status === '读完') { b.progressPct = 100; b.status = '读完'; }
        else { b.progressPct = Math.min(100, Math.max(0, pct)); }
        closeModal(); saveThen(); render();
      },
    });
  }
  function bookNoteAdd() {
    const content = val('nContent').trim(); if (!content) return toast('笔记内容不能为空', 'err');
    state.reading.notes.push({ id: Core.genClientId(), bookId: val('nBook'), type: val('nType'), content, createdAt: new Date().toISOString() });
    saveThen(); render();
  }

  function focusStartTimer() {
    if (focusRunning) return;
    if (focusTimer == null) { focusStart = Date.now(); focusElapsed = 0; }
    else { focusStart = Date.now(); }
    focusRunning = true;
    if (!focusTimer) focusTimer = setInterval(tick, 1000);
    tick();
  }
  function focusPauseTimer() {
    if (!focusRunning) return;
    focusElapsed += Math.floor((Date.now() - focusStart) / 1000);
    focusRunning = false;
    if (focusTimer) { clearInterval(focusTimer); focusTimer = null; }
    tick();
  }
  function tick() {
    const el = document.getElementById('focusClock'); if (!el) return;
    const total = focusElapsed + (focusRunning ? Math.floor((Date.now() - focusStart) / 1000) : 0);
    el.textContent = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }
  function focusEndTimer() {
    focusPauseTimer();
    const minutes = Math.max(1, Math.round(focusElapsed / 60));
    if (minutes < 1) return toast('本次专注不足 1 分钟，未记录', 'err');
    const bookId = document.getElementById('focusBook') ? document.getElementById('focusBook').value.trim() : '';
    const book = state.reading.books.find((b) => b.id === bookId);
    state.reading.focus.push({ id: Core.genClientId(), date: Core.todayStr(), minutes, bookId: book ? book.id : '', note: '' });
    focusElapsed = 0; focusRunning = false;
    if (focusTimer) { clearInterval(focusTimer); focusTimer = null; }
    toast(`已记录 ${minutes} 分钟专注`, 'ok'); saveThen(); render();
  }

  function customerAdd() {
    const c = { id: Core.genClientId(), name: val('cName').trim(), status: val('cStatus'), phone: val('cPhone').trim(), remark: val('cRemark').trim() };
    if (!c.name) return toast('请填写客户名称', 'err');
    state.business.customers.push(c); saveThen(); render();
  }
  function customerEdit(id) {
    const c = state.business.customers.find((x) => x.id === id); if (!c) return;
    openModal({
      title: '编辑客户', body: `<label>名称</label><input id="ceName" value="${esc(c.name)}"><label>状态</label>
        <select id="ceStatus">${['潜在', '跟进中', '已成交', '流失'].map((s) => `<option ${c.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
        <label>电话</label><input id="cePhone" value="${esc(c.phone || '')}"><label>备注</label><input id="ceRemark" value="${esc(c.remark || '')}">`,
      onOk: () => {
        c.name = document.getElementById('ceName').value.trim() || c.name;
        c.status = document.getElementById('ceStatus').value;
        c.phone = document.getElementById('cePhone').value.trim();
        c.remark = document.getElementById('ceRemark').value.trim();
        closeModal(); saveThen(); render();
      },
    });
  }
  function orderAdd() {
    const o = { id: Core.genClientId(), customerId: val('oCustomer'), product: val('oProduct').trim(), amount: Number(val('oAmount')) || 0, cost: Number(val('oCost')) || 0, status: val('oStatus'), date: val('oDate'), note: '', platform: val('oPlatform') || '其他' };
    if (!o.product) return toast('请填写商品', 'err');
    state.business.orders.push(o); saveThen(); render();
  }
  function paymentAdd() {
    const p = { id: Core.genClientId(), customerId: val('pCustomer'), orderId: '', type: val('pType'), amount: Number(val('pAmount')) || 0, date: val('pDate'), note: val('pNote').trim() };
    if (!p.amount) return toast('请填写金额', 'err');
    state.business.payments.push(p); saveThen(); render();
  }

  function scheduleEdit(id) {
    const s = id ? state.schedules.find((x) => x.id === id) : null;
    const base = scheduleCursor || Core.todayStr();
    const stype = s ? (s.type === '重要' ? '重要' : '日常') : '日常';
    openModal({
      title: s ? '编辑日程' : '新增日程',
      body: `<label>日期</label><input type="date" id="sDate" value="${esc(s ? s.date : base)}">
        <label>时间（可留空为全天）</label><input type="time" id="sTime" value="${esc(s ? s.time || '' : '09:00')}">
        <label>类型</label><select id="sType"><option ${stype === '日常' ? 'selected' : ''}>日常</option><option ${stype === '重要' ? 'selected' : ''}>重要</option></select>
        <label>标题</label><input id="sTitle" value="${esc(s ? s.title : '')}"><label>备注</label><input id="sNote" value="${esc(s ? s.note || '' : '')}">`,
      onOk: () => {
        const title = document.getElementById('sTitle').value.trim(); if (!title) return toast('请填写标题', 'err');
        const date = document.getElementById('sDate').value;
        const time = document.getElementById('sTime').value || '';
        const type = document.getElementById('sType').value || '日常';
        if (s) { s.title = title; s.date = date; s.time = time; s.type = type; s.note = document.getElementById('sNote').value.trim(); }
        else { state.schedules.push({ id: Core.genClientId(), date, time, title, note: document.getElementById('sNote').value.trim(), done: false, type }); }
        scheduleCursor = date;
        closeModal(); saveThen(); render();
      },
    });
  }

  // 备份导出
  async function backupExport() {
    try {
      const r = await fetch('/api/export');
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = r.headers.get('content-disposition').match(/filename="(.+)"/)[1];
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
      toast('备份已下载', 'ok');
    } catch { toast('导出失败', 'err'); }
  }
  // 备份导入
  function backupImport(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const r = await fetch('/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: reader.result });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || '导入失败');
        await loadData();
        render(); updateTopbar();
        toast('导入成功', 'ok');
      } catch (e) { toast(e.message, 'err'); }
    };
    reader.readAsText(file);
  }
  function dataClear() {
    openModal({
      title: '清空全部数据', danger: true, okText: '永久清空',
      body: `<p style="color:var(--danger)">此操作将删除所有模块的全部数据，且不可恢复。</p><label>请输入「清空」以确认</label><input id="clearConfirm">`,
      onOk: () => {
        if (document.getElementById('clearConfirm').value.trim() !== '清空') { toast('未输入「清空」，已取消', 'err'); return; }
        state = freshData();
        closeModal(); saveThen(); render();
        toast('全部数据已清空', 'ok');
      },
    });
  }

  function val(id) { const el = document.getElementById(id); return el ? el.value : ''; }

  // ---------- 点击委托分发 ----------
  function onClick(e) {
    const t = e.target;
    const el = t.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    if (action === 'backup-import') return; // 由 change 处理
    if (action === 'close-modal' && t.classList.contains('modal-mask')) { closeModal(); return; }
    act(action, el);
  }
  function onChange(e) {
    const el = e.target;
    if (el.dataset && el.dataset.action === 'backup-import') { backupImport(el.files && el.files[0]); el.value = ''; return; }
    if (el.matches('[data-action="remind-toggle"]')) {
      state.settings.reminderOn = el.checked; saveThen(); updateTopbar();
    }
  }

  // ---------- 启动 ----------
  window.addEventListener('hashchange', render);
  bindView();
  loadData().then(() => { render(); updateTopbar(); }).catch((e) => { view.innerHTML = `<div class="card">加载失败：${esc(e.message)}</div>`; });
})();
