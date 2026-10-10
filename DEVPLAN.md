# 个人专属 App — 第一版开发计划

> 依据：`PRD.md`（v1.0 定稿）
> 版本：v1.0
> 状态：已确认存档，作为开发执行的依据
> 创建日期：2026-10-09

---

## 1. 总体架构

- **形态**：单目录项目，Node 原生 `http` 服务 + 前端静态文件 + JSON 数据文件，零第三方依赖。
- **目录结构**（落在 `G:\doubao\hjp_app`）

```
hjp_app/
├── PRD.md            # 需求文档（已有）
├── DEVPLAN.md        # 本开发计划
├── server.js         # Node 服务：静态托管 + API + 原子写
├── data/             # 数据文件目录
│   └── appdata.json  # 全量数据落盘
├── public/           # 前端
│   ├── index.html    # SPA 单页
│   ├── style.css     # 全局样式
│   └── app.js        # 前端逻辑（hash 路由 + 模块渲染）
└── 启动.bat          # 双击启动，拉起服务并开浏览器
```

---

## 2. 数据模型（JSON Schema，开发骨架）

服务端内存维护一份全量对象，所有增删改后**整体原子写盘**（先写临时文件再改名），个人数据量小，此方案最简单可靠。

```jsonc
{
  "meta": { "version": 1, "createdAt": "", "updatedAt": "" },
  "quickNotes": [{ "id": "", "content": "", "createdAt": "" }],
  "plans": {
    "2026-10-09": [ { "id": "", "text": "", "done": false,
                      "priority": "中", "createdAt": "" } ]
  },
  "fitness": {
    "workouts": [{ "id": "", "date": "", "item": "", "durationMin": 0,
                   "sets": 0, "reps": 0, "weight": 0, "note": "" }],
    "metrics": [{ "id": "", "date": "", "weight": 0, "bodyFat": 0 }],
    "goals":   [{ "id": "", "name": "", "type": "", "targetValue": 0,
                   "currentValue": 0, "unit": "", "createdAt": "" }]
  },
  "reading": {
    "books": [{ "id": "", "title": "", "status": "在读", "progressPct": 0,
                 "pageCurrent": 0, "pageTotal": 0, "createdAt": "" }],
    "notes": [{ "id": "", "bookId": "", "type": "摘录", "content": "", "createdAt": "" }],
    "focus": [{ "id": "", "date": "", "minutes": 0, "bookId": "", "note": "" }]
  },
  "business": {
    "customers": [{ "id": "", "name": "", "status": "", "phone": "", "remark": "" }],
    "orders": [{ "id": "", "customerId": "", "product": "", "amount": 0,
                 "status": "进行中", "date": "", "note": "" }],
    "payments": [{ "id": "", "customerId": "", "orderId": "", "type": "应收",
                   "amount": 0, "date": "", "note": "" }]
  },
  "schedules": [{ "id": "", "date": "", "time": "", "title": "", "note": "", "done": false }],
  "settings": { "reminderOn": true }
}
```

---

## 3. 后端 API 设计（Node 原生 http，端口本地固定/可配）

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/` | 返回 `public/index.html` |
| GET | `/api/data` | 读取全量数据（启动时载入） |
| POST | `/api/data` | 全量保存（前端提交内存态，服务端原子写盘） |
| GET | `/api/export` | 导出备份：以 JSON 附件形式下载 |
| POST | `/api/import` | 导入备份：校验并覆盖数据 |
| 静态 | `/public/...` | 托管样式与脚本 |

> 前端 CRUD 全部在浏览器内存完成，操作后 POST 全量保存——对本地单用户最务实，也天然满足"实时落盘"。

---

## 4. 前端框架（SPA + hash 路由）

- **路由**：`#/home` `#/plan` `#/fitness` `#/reading` `#/business` `#/schedule` `#/settings`，切换不刷新。
- **通用组件**（一次性封装复用）：居中弹窗、二次确认框、顶部 toast、空状态、摘要卡片、数据表格。
- **风格**：简洁本地桌面感，明确**不用紫色系主色**。

---

## 5. 开发阶段与任务拆解

### M0 项目初始化（约 0.5 天）
- 创建目录结构、`server.js` 骨架、静态托管、端口监听
- 空 `appdata.json` 初始化与版本字段
- **验收**：`node server.js` 可启动，浏览器打开 `/` 返回页面

### M1 数据层与 API（约 1 天）
- GET/POST `/api/data`，原子写盘（临时文件+改名）
- 导出 `/api/export`、导入 `/api/import`（含格式校验、损坏兜底）
- **验收**：页面增删改后刷新数据仍在；重启服务数据保留

### M2 前端框架与通用组件（约 1 天）
- 三段式布局（顶栏/导航/内容区）、hash 路由、导航高亮
- 弹窗、确认框、toast、空状态、摘要卡片封装
- **验收**：7 个路由可切换，组件可复用

### M3 功能模块（核心，约 4~5 天，可并行开发）

| 模块 | 任务 |
|---|---|
| 首页总览 | 今日完成度环形图、快捷备忘、各模块摘要卡片（点击跳转）、到期日程高亮 |
| 今日计划 | 日期切换、任务增删改、勾选、优先级排序、完成率进度条 |
| 运动健身 | 训练记录表单+历史列表、身体指标+趋势折线、目标进度条、周/月统计 |
| 读书学习 | 书单卡片+进度更新、读书笔记按书归类、专注计时（开始/暂停/结束自动累加）、统计 |
| 业务开展 | 客户增改、订单记录、款项台账(应收/实收/未收)、销售额/毛利按日周月统计 |
| 日程提醒 | 月历翻页、选中日期看当日日程、新建编辑删除、到期页面内弹提醒 |
| 数据设置 | 导出下载、导入恢复、数据条数统计、提醒开关、清空（二次确认+输入确认） |

### M4 启动脚本与联调（约 0.5 天）
- `启动.bat`：`node server.js` 启动 + 自动 `start http://localhost:<端口>`
- 全模块联调、数据互通、UI 一致性检查
- **验收**：双击 .bat 一次到位，开机后数据完好

### M5 测试与验收（约 1 天）
- 对照 PRD 验收清单逐项核对
- 各模块功能冒烟测试、删除确认、清空输入确认、导出/导入往返验证
- 关机/重启模拟验证数据持久

---

## 6. 风险与注意

- **数据安全**：原子写盘保证断电不损坏；导入前校验格式，损坏备份提示不覆盖现有数据。
- **提醒边界**：第一版仅页面内提醒，浏览器关闭不弹（PRD 已明确）。
- **端口冲突**：端口可配，冲突时自动换端口并在启动窗口提示。

---

## 7. 进度预估

- 总计约 **8~9 天**（含测试验收）。
- 里程碑顺序：M0 → M1 → M2 → M3（模块可并行）→ M4 → M5。
