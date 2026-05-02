type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  [key: string]: unknown;
}

const isDev = process.env.NODE_ENV !== "production";

function formatLog(level: LogLevel, message: string, context?: LogContext): string {
  const timestamp = new Date().toISOString();
  const data = {
    timestamp,
    level,
    message,
    ...context,
  };

  if (isDev) {
    const contextStr = context ? ` ${JSON.stringify(context)}` : "";
    return `[${level.toUpperCase()}] ${message}${contextStr}`;
  }

  return JSON.stringify(data);
}

function log(level: LogLevel, message: string, context?: LogContext): void {
  const output = formatLog(level, message, context);
  if (level === "error") {
    console.error(output);
  } else if (level === "warn") {
    console.warn(output);
  } else {
    console.log(output);
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => log("debug", message, context),
  info: (message: string, context?: LogContext) => log("info", message, context),
  warn: (message: string, context?: LogContext) => log("warn", message, context),
  error: (message: string, context?: LogContext) => log("error", message, context),
};
