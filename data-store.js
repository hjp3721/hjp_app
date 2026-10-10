'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------- 默认数据结构（对应 PRD 数据模型） ----------
function defaultData() {
  return {
    meta: { version: 1, createdAt: null, updatedAt: null },
    quickNotes: [],
    plans: {},            // { "YYYY-MM-DD": [plan, ...] }
    fitness: {
      workouts: [],       // {id,date,item,durationMin,sets,reps,weight,note}
      metrics: [],        // {id,date,weight,bodyFat}
      goals: [],          // {id,name,type,targetValue,currentValue,unit,createdAt}
    },
    reading: {
      books: [],          // {id,title,status,progressPct,pageCurrent,pageTotal,createdAt}
      notes: [],          // {id,bookId,type,content,createdAt}
      focus: [],          // {id,date,minutes,bookId,note}
    },
    business: {
      customers: [],      // {id,name,status,phone,remark}
      orders: [],         // {id,customerId,product,amount,cost,status,date,note,platform}
      payments: [],       // {id,customerId,orderId,type,amount,date,note}
    },
    schedules: [],        // {id,date,time,title,note,done,type:日常/重要}
    settings: { reminderOn: true },
  };
}

// 生成短唯一 id
function genId() {
  return crypto.randomBytes(6).toString('hex');
}

// ---------- 结构校验 ----------
// 只校验顶层骨架是否齐全且类型正确，返回 true/false
function validateData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const has = (k, t) =>
    Object.prototype.hasOwnProperty.call(data, k) && typeof data[k] === t;
  if (!has('meta', 'object') || !has('quickNotes', 'object') || !has('plans', 'object')) return false;
  if (!data.fitness || typeof data.fitness !== 'object' || Array.isArray(data.fitness)) return false;
  if (!data.reading || typeof data.reading !== 'object' || Array.isArray(data.reading)) return false;
  if (!data.business || typeof data.business !== 'object' || Array.isArray(data.business)) return false;
  if (!has('schedules', 'object') || !has('settings', 'object')) return false;
  for (const key of ['workouts', 'metrics', 'goals']) {
    if (!Array.isArray(data.fitness[key])) return false;
  }
  for (const key of ['books', 'notes', 'focus']) {
    if (!Array.isArray(data.reading[key])) return false;
  }
  for (const key of ['customers', 'orders', 'payments']) {
    if (!Array.isArray(data.business[key])) return false;
  }
  if (!Array.isArray(data.schedules) || !Array.isArray(data.quickNotes)) return false;
  return true;
}

// ---------- 原子写盘 ----------
// 先写同目录临时文件，再 rename 覆盖，防断电/崩溃损坏
async function saveData(filePath, data) {
  if (!validateData(data)) {
    throw new Error('数据校验失败，拒绝写入');
  }
  data.meta.updatedAt = new Date().toISOString();
  const tmpPath = filePath + '.tmp';
  const json = JSON.stringify(data, null, 2);
  await fs.promises.writeFile(tmpPath, json, 'utf8');
  await fs.promises.rename(tmpPath, filePath);
  return data;
}

// ---------- 读取（含损坏兜底） ----------
// 文件不存在 -> 返回默认；文件损坏 -> 把损坏文件改名 .corrupt.时间戳 保留，返回默认
async function loadData(filePath) {
  let raw;
  try {
    raw = await fs.promises.readFile(filePath, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') {
      return defaultData();
    }
    throw e;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    // 损坏：保留现场，返回默认
    const backup = filePath + '.corrupt.' + Date.now();
    await fs.promises.writeFile(backup, raw, 'utf8').catch(() => {});
    return defaultData();
  }
  if (!validateData(parsed)) {
    const backup = filePath + '.corrupt.' + Date.now();
    await fs.promises.writeFile(backup, raw, 'utf8').catch(() => {});
    return defaultData();
  }
  return parsed;
}

// 深拷贝（防止外部引用污染内存态）
function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

module.exports = { defaultData, validateData, saveData, loadData, genId, clone };
