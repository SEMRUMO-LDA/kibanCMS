/**
 * Structured Logger
 * Replaces console.log/error with structured JSON output for production.
 * In development, outputs human-readable format.
 */

const IS_PROD = process.env.NODE_ENV === 'production';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  level: LogLevel;
  msg: string;
  timestamp: string;
  [key: string]: any;
}

function formatLog(level: LogLevel, msg: string, meta?: Record<string, any>): LogEntry {
  return {
    level,
    msg,
    timestamp: new Date().toISOString(),
    ...meta,
  };
}

function output(entry: LogEntry): void {
  if (IS_PROD) {
    // Structured JSON for log aggregators (Railway, Datadog, etc.)
    const stream = entry.level === 'error' ? process.stderr : process.stdout;
    stream.write(JSON.stringify(entry) + '\n');
  } else {
    // Human-readable for development
    const prefix = `[${entry.level.toUpperCase()}]`;
    const meta = Object.keys(entry).filter(k => !['level', 'msg', 'timestamp'].includes(k));
    const metaStr = meta.length > 0
      ? ' ' + meta.map(k => `${k}=${JSON.stringify(entry[k])}`).join(' ')
      : '';
    const stream = entry.level === 'error' ? console.error : console.log;
    stream(`${prefix} ${entry.msg}${metaStr}`);
  }
}

export const logger = {
  info(msg: string, meta?: Record<string, any>): void {
    output(formatLog('info', msg, meta));
  },

  warn(msg: string, meta?: Record<string, any>): void {
    output(formatLog('warn', msg, meta));
  },

  error(msg: string, meta?: Record<string, any>): void {
    output(formatLog('error', msg, meta));
  },

  debug(msg: string, meta?: Record<string, any>): void {
    if (!IS_PROD) {
      output(formatLog('debug', msg, meta));
    }
  },

  /** Log an HTTP request (for middleware use) */
  request(method: string, path: string, status: number, durationMs: number, meta?: Record<string, any>): void {
    output(formatLog('info', `${method} ${path} ${status}`, { durationMs, ...meta }));
  },
};
