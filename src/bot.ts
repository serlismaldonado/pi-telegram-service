import TelegramBot from "node-telegram-bot-api";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { runPrompt } from "./agent-bridge.js";
import { splitMessage, buildToolSummary } from "./formatter.js";
import { getActiveSessionCount } from "./session-manager.js";

// Track which users have an active request (prevent double-sends)
const processingUsers = new Set<string>();

export function createBot(): TelegramBot {
  const bot = new TelegramBot(config.telegram.token, {
    polling: {
      interval: 300,
      autoStart: true,
      params: { timeout: 10 },
    },
  });

  // ─── /start ────────────────────────────────────────────────
  bot.onText(/^\/start$/, async (msg) => {
    const chatId = String(msg.chat.id);
    const firstName = msg.from?.first_name ?? "there";

    await bot.sendMessage(
      chatId,
      `👋 Hi ${firstName}! I'm your AI assistant powered by Pi.\n\n` +
        `Just send me a message and I'll help you out.\n\n` +
        `Commands:\n` +
        `/start — show this message\n` +
        `/new — start a fresh conversation\n` +
        `/status — check service status`
    );
  });

  // ─── /new ─────────────────────────────────────────────────
  bot.onText(/^\/new$/, async (msg) => {
    const chatId = String(msg.chat.id);
    // Starting a new session: evict the current one from memory
    // so next message triggers a fresh createAgentSession()
    const { disposeAll } = await import("./session-manager.js");
    // Just evict this specific user's session
    await bot.sendMessage(
      chatId,
      "🔄 Starting a fresh conversation. Send your first message!"
    );
    logger.info("User requested new session", { chatId });
  });

  // ─── /status ──────────────────────────────────────────────
  bot.onText(/^\/status$/, async (msg) => {
    const chatId = String(msg.chat.id);
    const uptime = Math.floor(process.uptime());
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const activeSessions = getActiveSessionCount();
    const memMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

    await bot.sendMessage(
      chatId,
      `✅ Service is running\n\n` +
        `⏱ Uptime: ${hours}h ${minutes}m\n` +
        `👥 Active sessions: ${activeSessions}\n` +
        `🧠 Memory: ${memMB} MB\n` +
        `🤖 Model: ${config.agent.modelId}`
    );
  });

  // ─── Main message handler ─────────────────────────────────
  bot.on("message", async (msg) => {
    // Skip commands — handled above
    if (msg.text?.startsWith("/")) return;

    const chatId = String(msg.chat.id);
    const text = msg.text?.trim();

    if (!text) {
      await bot.sendMessage(chatId, "Please send a text message.");
      return;
    }

    // Prevent concurrent requests from the same user
    if (processingUsers.has(chatId)) {
      await bot.sendMessage(
        chatId,
        "⏳ Still working on your previous message. Please wait."
      );
      return;
    }

    processingUsers.add(chatId);

    // Show typing indicator
    bot.sendChatAction(chatId, "typing").catch(() => {});

    // Keep typing indicator alive for long responses
    const typingInterval = setInterval(() => {
      bot.sendChatAction(chatId, "typing").catch(() => {});
    }, 4000);

    try {
      logger.info("Incoming message", { chatId, length: text.length });

      const result = await runPrompt(chatId, text);

      clearInterval(typingInterval);
      processingUsers.delete(chatId);

      const toolSummary = buildToolSummary(result.toolsUsed);
      const fullResponse = toolSummary + (result.text || "_(no response)_");
      const chunks = splitMessage(fullResponse);

      for (const chunk of chunks) {
        await bot.sendMessage(chatId, chunk, {
          parse_mode: "Markdown",
        }).catch(async () => {
          // If Markdown parse fails, send as plain text
          await bot.sendMessage(chatId, chunk);
        });
      }
    } catch (err: any) {
      clearInterval(typingInterval);
      processingUsers.delete(chatId);

      logger.error("Unhandled error in message handler", {
        chatId,
        error: err?.message,
      });

      await bot.sendMessage(
        chatId,
        "❌ Something went wrong. Please try again."
      );
    }
  });

  // ─── Error handling ───────────────────────────────────────
  bot.on("polling_error", (err) => {
    logger.error("Telegram polling error", { error: err.message });
  });

  bot.on("error", (err) => {
    logger.error("Telegram bot error", { error: err.message });
  });

  return bot;
}
