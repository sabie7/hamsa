const os = require('os');

// ── Structured logger (Phase 8) ─────────────────────────────────────────────
// Extends the plain console logger with:
//   * log levels (error < warn < info < debug), controlled by LOG_LEVEL
//   * two output formats, controlled by LOG_FORMAT:
//       - "text" (default): human-readable console lines (backwards compatible)
//       - "json": one JSON object per line — ready for Loki/Datadog/etc.
//   * static metadata merged into every record (service, hostname, pid, env)
// All existing call sites keep the `logger.info(tag, msg, data)` shape.
// ────────────────────────────────────────────────────────────────────────────

const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const levelNames = Object.keys(levels);

const currentLevel = levels[String(process.env.LOG_LEVEL).toLowerCase()] !== undefined
  ? levels[String(process.env.LOG_LEVEL).toLowerCase()]
  : 2; // default: info

const format = String(process.env.LOG_FORMAT || 'text').toLowerCase() === 'json' ? 'json' : 'text';

let extraMeta = {};
try {
  if (process.env.LOG_META) extraMeta = JSON.parse(process.env.LOG_META);
} catch (e) { /* invalid LOG_META ignored */ }

const baseMeta = Object.assign(
  { service: 'hi-master', hostname: os.hostname(), pid: process.pid, env: process.env.NODE_ENV || 'development' },
  extraMeta
);

function ts() { return new Date().toISOString(); }

function writeStream(level) {
  return level === 'error' || level === 'warn' ? process.stderr : process.stdout;
}

// One line per level entry. `msg` and `data` are optional positional args so
// old callers (`logger.info(tag, msg, data)`) keep working unchanged.
function emit(level, levelIndex, args) {
  if (levelIndex > currentLevel) return;
  const tag = typeof args[0] === 'string' ? args[0] : '';
  const msg = typeof args[1] === 'string' ? args[1] : '';
  const data = args[2] && typeof args[2] === 'object' ? args[2] : undefined;

  if (format === 'json') {
    const record = Object.assign({}, baseMeta, {
      ts: ts(),
      level: level,
      tag: tag,
      msg: msg,
    });
    if (data !== undefined && Object.keys(data).length > 0) record.data = data;
    writeStream(level).write(JSON.stringify(record) + '\n');
    return;
  }

  const line = `[${ts()}] [${level.toUpperCase().padEnd(5)}] [${tag}] ${msg}`;
  if (data !== undefined && Object.keys(data).length > 0) {
    const json = safeJson(data);
    if (json) writeStream(level).write(line + ' ' + json + '\n');
    else writeStream(level).write(line + '\n');
  } else {
    writeStream(level).write(line + '\n');
  }
}

function safeJson(obj) {
  try { return JSON.stringify(obj); } catch (e) { return null; }
}

module.exports = {
  levels,
  level: levelNames[currentLevel] || 'info',
  format,
  error: (...args) => emit('error', 0, args),
  warn: (...args) => emit('warn', 1, args),
  info: (...args) => emit('info', 2, args),
  debug: (...args) => emit('debug', 3, args),
};
