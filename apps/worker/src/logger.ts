import { redactObject, redactText } from '@leadfinder/security';

/**
 * Structured JSON logger with mandatory redaction. Correlation context
 * (org id, run id, job id) travels with every line.
 */

export interface LogContext {
  orgId?: string | null;
  runId?: string | null;
  jobId?: string | null;
  jobKind?: string | null;
  [key: string]: unknown;
}

type Level = 'debug' | 'info' | 'warn' | 'error';

function emit(level: Level, message: string, context: LogContext = {}): void {
  const line = {
    ts: new Date().toISOString(),
    level,
    msg: redactText(message),
    ...redactObject(context),
  };
  const serialized = JSON.stringify(line);
  if (level === 'error') console.error(serialized);
  else if (level === 'warn') console.warn(serialized);
  else console.log(serialized);
}

export const log = {
  debug: (msg: string, ctx?: LogContext) => emit('debug', msg, ctx),
  info: (msg: string, ctx?: LogContext) => emit('info', msg, ctx),
  warn: (msg: string, ctx?: LogContext) => emit('warn', msg, ctx),
  error: (msg: string, ctx?: LogContext) => emit('error', msg, ctx),
};

export function errorSummary(error: unknown): string {
  if (error instanceof Error) return redactText(`${error.name}: ${error.message}`);
  return redactText(String(error));
}
