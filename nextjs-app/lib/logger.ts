// Leveled logger for the backend. Level comes from LOG_LEVEL (error, warn,
// info, debug); default info. Output is one line per entry so docker logs
// stay grep-able:
//   2026-08-06T17:01:02.345Z ERROR [api/auth/register] Registration error ...
type Level = 'error' | 'warn' | 'info' | 'debug';

const LEVEL_ORDER: Record<Level, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

function configuredLevel(): number {
  const raw = (process.env.LOG_LEVEL || 'info').toLowerCase() as Level;
  return LEVEL_ORDER[raw] ?? LEVEL_ORDER.info;
}

function serialize(value: unknown): string {
  if (value instanceof Error) {
    return value.stack || `${value.name}: ${value.message}`;
  }
  if (typeof value === 'object' && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function write(level: Level, scope: string, message: string, extras: unknown[]): void {
  if (LEVEL_ORDER[level] > configuredLevel()) {
    return;
  }
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${message}`;
  const rest = extras.map(serialize).join(' ');
  const method = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  method(rest ? `${line} ${rest}` : line);
}

export interface Logger {
  error: (message: string, ...extras: unknown[]) => void;
  warn: (message: string, ...extras: unknown[]) => void;
  info: (message: string, ...extras: unknown[]) => void;
  debug: (message: string, ...extras: unknown[]) => void;
}

export function getLogger(scope: string): Logger {
  return {
    error: (message, ...extras) => write('error', scope, message, extras),
    warn: (message, ...extras) => write('warn', scope, message, extras),
    info: (message, ...extras) => write('info', scope, message, extras),
    debug: (message, ...extras) => write('debug', scope, message, extras)
  };
}
