import "dotenv/config";
import { logger } from "./logger.js";
import { config } from "./config.js";
import { createBot } from "./bot.js";
import { disposeAll } from "./session-manager.js";

async function main() {
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  logger.info(" Pi Telegram Service starting");
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  logger.info(`Model:    ${config.agent.modelProvider}/${config.agent.modelId}`);
  logger.info(`Sessions: ${config.sessions.dir}`);
  logger.info(`Idle TTL: ${config.sessions.idleTimeoutMs / 60000} minutes`);

  const bot = createBot();
  logger.info("Telegram bot started — polling for messages");

  // ─── Graceful shutdown ─────────────────────────────────────
  async function shutdown(signal: string) {
    logger.info(`Received ${signal}, shutting down...`);
    bot.stopPolling();
    await disposeAll();
    logger.info("Shutdown complete");
    process.exit(0);
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Catch unhandled errors — log and keep running
  process.on("uncaughtException", (err) => {
    logger.error("Uncaught exception", { error: err.message, stack: err.stack });
  });

  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled rejection", { reason: String(reason) });
  });
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
