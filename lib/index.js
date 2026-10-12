/**
 * dsh-token-usage-panel · Host 侧
 * =================================
 * 在本机 DSH 的会话日志里统计 token 用量，并通过 DSH 自带的 Web 服务器
 * 暴露一个只读接口给浏览器界面：
 *
 *     GET /token-usage/data     聚合后的用量数据（默认 5 秒缓存）
 *     GET /token-usage/health   健康检查
 *
 * 数据来源：$DSH_HOME/sessions/<工作区>/<会话>/session.v4.jsonl.zstd
 * 每条 assistant/message 事件里的 usage 就是一次模型调用的用量。
 *
 * 这个模块运行在 DSH Host 进程里，除了读日志以外不做任何事；
 * 任何异常都会被吞掉并转成 JSON 错误，不会影响应用本身。
 */

import { closeSync, openSync, readSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import zlib from 'node:zlib';

const PACKAGE_NAME = 'dsh-token-usage-panel';
const ROUTE = '/token-usage';
const CACHE_TTL_MS = 5000;
const BUCKET_KEYS = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'totalTokens'];
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh');
}

function emptyBucket() {
  const bucket = {};
  for (const key of BUCKET_KEYS) bucket[key] = 0;
  return bucket;
}

function addBucket(target, source) {
  if (!source) return target;
  for (const key of BUCKET_KEYS) {
    const value = Number(source[key]);
    if (Number.isFinite(value)) target[key] += value;
  }
  return target;
}

function dayOf(ms) {
  const date = new Date(Number(ms) || 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function timeText(ms) {
  if (!ms) return '';
  const d = new Date(Number(ms));
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ---------------------------------------------------------------------------
// zstd：会话日志是「多个 zstd 帧拼接」的增长型文件（每追加一次一个帧），
// Node 的 zstdDecompress 只解第一个帧，所以这里按魔数切帧后逐帧解压。
// ---------------------------------------------------------------------------

function readWhole(path) {
  const fd = openSync(path, 'r');
  try {
    const size = statSync(path).size;
    const buffer = Buffer.allocUnsafe(size);
    let read = 0;
    while (read < size) {
      const n = readSync(fd, buffer, read, size - read, read);
      if (n <= 0) break;
      read += n;
    }
    return read === size ? buffer : buffer.subarray(0, read);
  } finally {
    closeSync(fd);
  }
}

function decodeSessionLog(path) {
  const raw = readWhole(path);
  const starts = [];
  let cursor = 0;
  while (cursor < raw.length) {
    const at = raw.indexOf(ZSTD_MAGIC, cursor);
    if (at < 0) break;
    starts.push(at);
    cursor = at + 4;
  }
  if (starts.length === 0) return '';
  if (starts[0] !== 0) return '';

  const parts = [];
  let index = 0;
  while (index < starts.length) {
    let next = index + 1;
    let decoded = null;
    while (next <= starts.length) {
      const end = next < starts.length ? starts[next] : raw.length;
      try {
        const text = zlib.zstdDecompressSync(raw.subarray(starts[index], end)).toString('utf8');
        // 一个完整帧一定以换行结束；否则说明切点落在了帧内部，继续往后并帧
        if (text.endsWith('\n') || end === raw.length) {
          decoded = text;
          break;
        }
      } catch {
        /* 截断或误切，合并下一段再试 */
      }
      next += 1;
    }
    if (decoded === null) break;
    parts.push(decoded);
    index = next;
  }
  return parts.join('');
}

// ---------------------------------------------------------------------------
// 单个会话日志 → 统计
// ---------------------------------------------------------------------------

function parseSessionFile(path) {
  const meta = {
    file: path,
    id: path.split('/').slice(-2)[0] || path,
    cwd: '',
    createdAt: 0,
    lastTime: 0,
    title: '',
    delegationDepth: 0,
    turns: 0,
    steps: 0,
    models: {},
    days: {},
  };
  let firstUserText = '';
  const pending = new Map(); // "turn/step" → 最后一次 usage（重试会覆盖）

  const text = decodeSessionLog(path);
  if (text) {
    for (const line of text.split('\n')) {
      if (!line) continue;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      const type = event.type;
      const data = event.data || {};
      const time = Number(event.time) || 0;

      if (type === 'session') {
        if (event.id) meta.id = event.id;
        if (event.cwd) meta.cwd = event.cwd;
        meta.createdAt = Number(event.createdAt) || 0;
        meta.delegationDepth = Number(event.delegationDepth) || 0;
      } else if (type === 'turn/start') {
        meta.turns += 1;
        if (time > meta.lastTime) meta.lastTime = time;
      } else if (type === 'user/message') {
        if (time > meta.lastTime) meta.lastTime = time;
        if (!firstUserText && Array.isArray(data.content)) {
          for (const block of data.content) {
            if (block && block.type === 'text' && block.text) {
              firstUserText = String(block.text).trim();
              break;
            }
          }
        }
      } else if (type === 'session/title') {
        const title = String(data.title || '').trim();
        if (title) meta.title = title;
      } else if (type === 'assistant/message') {
        meta.steps += 1;
        if (time > meta.lastTime) meta.lastTime = time;
        const usage = data.usage;
        if (usage && BUCKET_KEYS.some((key) => usage[key])) {
          const model = (data.message && data.message.source && data.message.source.model) || 'unknown';
          pending.set(`${data.turn}/${data.step}`, { time, model, usage });
        }
      }
    }
  }

  for (const { time, model, usage } of pending.values()) {
    const day = dayOf(time);
    if (!meta.days[day]) meta.days[day] = emptyBucket();
    addBucket(meta.days[day], usage);

    if (!meta.models[model]) meta.models[model] = { steps: 0, bucket: emptyBucket() };
    meta.models[model].steps += 1;
    addBucket(meta.models[model].bucket, usage);

    if (time > meta.lastTime) meta.lastTime = time;
  }

  if (!meta.title) meta.title = firstUserText ? firstUserText.slice(0, 40) : '未命名会话';
  return meta;
}

// ---------------------------------------------------------------------------
// 扫描全部会话
// ---------------------------------------------------------------------------

function listSessionFiles(root) {
  const found = [];
  const walk = (dir, depth) => {
    if (depth > 4) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (entry.isFile() && /^session.*\.jsonl\.zstd$/.test(entry.name)) found.push(full);
    }
  };
  walk(join(root, 'sessions'), 0);
  return found.sort();
}

function collect() {
  const started = Date.now();
  const root = dshHome();

  // 会话日志用 zstd 压缩；zlib 的 zstd 支持需要 Node 22.15+ / 23.8+（DSH 自带 24）。
  // 早期版本在这里给出明确提示，而不是抛一个看不懂的 TypeError。
  if (typeof zlib.zstdDecompressSync !== 'function') {
    throw new Error(
      'node:zlib 不支持 zstd（需要 Node 22.15+ / 24+）。' +
        `当前 Node ${process.versions.node}；请用 DSH 自带的 Node 运行本插件。`
    );
  }

  const files = listSessionFiles(root);

  const totals = emptyBucket();
  const days = {};
  const daySessions = {};
  const byModel = {};
  const byWorkspace = {};
  const sessions = [];
  let parsedFiles = 0;

  for (const file of files) {
    let meta;
    try {
      meta = parseSessionFile(file);
      parsedFiles += 1;
    } catch {
      continue;
    }

    const sessionTotal = emptyBucket();
    let steps = 0;
    for (const [day, bucket] of Object.entries(meta.days)) {
      if (!days[day]) days[day] = emptyBucket();
      addBucket(days[day], bucket);
      addBucket(sessionTotal, bucket);
      (daySessions[day] = daySessions[day] || []).push(meta.id);
    }
    for (const [model, entry] of Object.entries(meta.models)) {
      if (!byModel[model]) byModel[model] = { steps: 0, bucket: emptyBucket() };
      byModel[model].steps += entry.steps;
      addBucket(byModel[model].bucket, entry.bucket);
      steps += entry.steps;
    }
    addBucket(totals, sessionTotal);

    const workspace = meta.cwd || '(未知工作区)';
    if (!byWorkspace[workspace]) byWorkspace[workspace] = { sessions: 0, steps: 0, bucket: emptyBucket() };
    byWorkspace[workspace].sessions += 1;
    byWorkspace[workspace].steps += steps;
    addBucket(byWorkspace[workspace].bucket, sessionTotal);

    sessions.push({
      id: meta.id,
      shortId: String(meta.id).replace(/^session-/, '').slice(0, 8),
      title: meta.title,
      cwd: meta.cwd,
      workspace: String(meta.cwd || '').replace(/\/+$/, '').split('/').pop() || '(未知)',
      createdAt: meta.createdAt,
      createdAtText: timeText(meta.createdAt),
      lastTime: meta.lastTime,
      lastTimeText: timeText(meta.lastTime),
      turns: meta.turns,
      steps,
      delegationDepth: meta.delegationDepth,
      totals: sessionTotal,
      days: meta.days,
      models: Object.keys(meta.models),
    });
  }

  sessions.sort((a, b) => b.lastTime - a.lastTime);

  // 连续使用天数：从今天（或昨天）往前数
  const activeDays = Object.keys(days).sort();
  const dayKey = (d) => dayOf(d.getTime());
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  if (!days[dayKey(cursor)]) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days[dayKey(cursor)]) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  for (const key of Object.keys(daySessions)) daySessions[key] = [...new Set(daySessions[key])];

  return {
    generatedAt: Date.now(),
    generatedAtText: timeText(Date.now()),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '本地时区',
    dshHome: root,
    scanMs: Date.now() - started,
    cache: { files: files.length, parsed: parsedFiles },
    totals,
    streak,
    firstDay: activeDays[0] || null,
    lastDay: activeDays[activeDays.length - 1] || null,
    days,
    daySessions,
    byModel,
    byWorkspace,
    sessions,
  };
}

// ---------------------------------------------------------------------------
// 插件
// ---------------------------------------------------------------------------

/** 模块级缓存：短时间内多次刷新复用一份结果。 */
const cache = { at: 0, data: null };

function snapshot(force) {
  const now = Date.now();
  if (!force && cache.data && now - cache.at < CACHE_TTL_MS) return cache.data;
  const data = collect();
  cache.at = now;
  cache.data = data;
  return data;
}

/**
 * 浏览器侧有没有注册成功（用于「装了但设置里没出现」时自查）。
 * 通过 client-modules 的播放图判断本包是否在其中。
 * @param ctx - Host 插件上下文。
 * @returns 注册状态；拿不到服务时返回 error 字段。
 */
function clientStatus(ctx) {
  try {
    const modules = typeof ctx.get === 'function' ? ctx.get('clientModules') : undefined;
    if (!modules || typeof modules.graph !== 'function') return { available: false };
    const graph = modules.graph();
    const entries = graph && Array.isArray(graph.entries) ? graph.entries : [];
    const mine = entries.find((entry) => entry && entry.id === PACKAGE_NAME);
    return {
      available: true,
      registered: Boolean(mine),
      revision: mine ? mine.rev : null,
      bundleEntries: entries.length,
      clientPath: typeof modules.clientPath === 'function' ? modules.clientPath(PACKAGE_NAME) || null : null,
    };
  } catch (error) {
    return { available: false, error: String((error && error.message) || error) };
  }
}

/**
 * 注册只读路由。没有 webServer（例如桌面 Electron 直接读 dist）时什么也不做。
 * @param ctx - Host 插件上下文。
 */
export function apply(ctx) {
  const route = {
    kind: 'prefix',
    path: ROUTE,
    handler: (req, res) => {
      let pathname = ROUTE;
      let force = false;
      try {
        const url = new URL(req.url || '/', 'http://127.0.0.1');
        pathname = url.pathname;
        force = url.searchParams.get('refresh') === '1';
      } catch {
        /* 忽略无法解析的 URL */
      }

      const send = (status, body, type) => {
        try {
          res.writeHead(status, {
            'content-type': type || 'application/json; charset=utf-8',
            'cache-control': 'no-store, max-age=0',
          });
          res.end(req.method === 'HEAD' ? undefined : body);
        } catch {
          /* 客户端断开 */
        }
      };

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        send(405, JSON.stringify({ error: 'method not allowed' }));
        return;
      }

      try {
        if (pathname === `${ROUTE}/health`) {
          send(200, JSON.stringify({ ok: true, plugin: PACKAGE_NAME, version: '1.0.0', home: dshHome(), at: Date.now(), client: clientStatus(ctx) }));
          return;
        }
        const data = snapshot(force);
        send(200, JSON.stringify(data));
      } catch (error) {
        send(500, JSON.stringify({ error: String((error && error.message) || error) }));
      }
    },
  };

  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register(route), 'token-usage-panel: /token-usage route');
  });
}

export const name = 'token-usage-panel';

/** 供离线检查/测试使用（Host 运行时不需要）。 */
export { collect, decodeSessionLog };

if (import.meta.main) {
  const data = collect();
  const mb = (n) => `${(Number(n || 0) / 1e6).toFixed(2)}M`;
  process.stdout.write(`会话 ${data.sessions.length} 个，日志 ${data.cache.files} 个，扫描 ${data.scanMs}ms\n`);
  process.stdout.write(`累计 ${mb(data.totals.totalTokens)} tokens（未缓存输入 ${mb(data.totals.inputTokens)} / 输出 ${mb(data.totals.outputTokens)} / 缓存命中 ${mb(data.totals.cacheReadTokens)}）\n`);
  process.stdout.write(`天数 ${Object.keys(data.days).length}，连续 ${data.streak} 天，时区 ${data.timezone}\n`);
}
