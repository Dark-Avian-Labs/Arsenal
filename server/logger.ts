export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Minimal structured JSON logger shared by the Dark Avian Labs apps.
 * One line per event so log shippers and `jq` can parse output directly.
 */
export function log(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
  const line = JSON.stringify({
    ...fields,
    ts: new Date().toISOString(),
    level,
    msg: message,
  });
  switch (level) {
    case 'error':
      console.error(line);
      break;
    case 'warn':
      console.warn(line);
      break;
    default:
      console.log(line);
  }
}
