import pino from "pino";

const shouldUsePretty =
  process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport: shouldUsePretty
    ? {
        target: "pino-pretty",
        options: {
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      }
    : undefined,
});
