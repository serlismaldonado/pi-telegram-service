import winston from "winston";
import path from "path";
import fs from "fs";

const logDir = process.env.LOG_DIR ?? "./logs";
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? " " + JSON.stringify(meta) : "";
      return `[${timestamp}] ${level.toUpperCase().padEnd(5)} ${message}${metaStr}`;
    })
  ),
  transports: [
    // Console — always on
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? " " + JSON.stringify(meta) : "";
          return `[${timestamp}] ${level} ${message}${metaStr}`;
        })
      ),
    }),
    // File — rotates daily
    new winston.transports.File({
      filename: path.join(logDir, "service.log"),
      maxsize: 10 * 1024 * 1024, // 10 MB
      maxFiles: 7,
    }),
  ],
});
