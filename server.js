'use strict';
const http = require('http');
const path = require('path');
const fs = require('fs');
const { loadData, saveData, validateData } = require('./data-store');

const DATA_FILE = path.join(__dirname, 'data', 'appdata.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      chunks.push(c);
      size += c.length;
      if (size > 50 * 1024 * 1024) {
        reject(new Error('请求体过大'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// 安全静态文件服务：防止目录穿越
function serveStatic(res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const resolved = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!resolved.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: 'forbidden' });
    return;
  }
  const ext = path.extname(resolved).toLowerCase();
  fs.readFile(resolved, (err, buf) => {
    if (err) {
      sendJson(res, 404, { error: 'not found' });
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': buf.length,
      'Cache-Control': 'no-store',
    });
    res.end(buf);
  });
}

// 创建服务。opts.dataFile 可指定数据文件（供测试使用独立文件），默认用项目 data/appdata.json
function createServer(opts = {}) {
  const dataFile = opts.dataFile || DATA_FILE;
  let data = null;

  async function init() {
    data = await loadData(dataFile);
    return data;
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    const method = req.method;

    try {
      if (method === 'GET' && p === '/api/data') {
        sendJson(res, 200, data);
        return;
      }

      if (method === 'POST' && p === '/api/data') {
        let parsed;
        try {
          parsed = JSON.parse(await readBody(req));
        } catch {
          sendJson(res, 400, { error: '请求体不是合法 JSON' });
          return;
        }
        if (!validateData(parsed)) {
          sendJson(res, 400, { error: '数据结构非法，拒绝保存' });
          return;
        }
        await saveData(dataFile, parsed);
        data = parsed;
        sendJson(res, 200, { ok: true });
        return;
      }

      if (method === 'GET' && p === '/api/export') {
        const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const body = JSON.stringify(data, null, 2);
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="appdata_backup_${stamp}.json"`,
          'Content-Length': Buffer.byteLength(body),
        });
        res.end(body);
        return;
      }

      if (method === 'POST' && p === '/api/import') {
        let parsed;
        try {
          parsed = JSON.parse(await readBody(req));
        } catch {
          sendJson(res, 400, { error: '备份不是合法 JSON' });
          return;
        }
        if (!validateData(parsed)) {
          sendJson(res, 400, { error: '备份结构非法，未覆盖现有数据' });
          return;
        }
        await saveData(dataFile, parsed);
        data = parsed;
        sendJson(res, 200, { ok: true, imported: true });
        return;
      }

      if (method === 'GET') {
        serveStatic(res, p);
        return;
      }

      sendJson(res, 405, { error: 'method not allowed' });
    } catch (e) {
      sendJson(res, 500, { error: 'server error', detail: String(e && e.message) });
    }
  });

  server.init = init;
  return server;
}

// 直接运行时启动
if (require.main === module) {
  (async () => {
    const server = createServer();
    await server.init();
    server.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        console.error(`错误：端口 ${PORT} 已被占用。`);
        console.error('请关闭占用该端口的程序，或设置环境变量 PORT 指定其他端口后重试。');
      } else {
        console.error('服务器错误：', e.message);
      }
      process.exit(1);
    });
    server.listen(PORT, () => {
      const url = `http://localhost:${PORT}`;
      console.log(`个人专属App 已启动: ${url}`);
      console.log(`数据文件: ${DATA_FILE}`);
    });
  })();
}

module.exports = { createServer, DATA_FILE, PUBLIC_DIR };
