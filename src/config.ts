import dotenv from "dotenv";
import path from "path";

dotenv.config();

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  telegram: {
    token: required("TELEGRAM_BOT_TOKEN"),
  },
  llm: {
    anthropicKey: process.env.ANTHROPIC_API_KEY,
    openaiKey: process.env.OPENAI_API_KEY,
    googleKey: process.env.GOOGLE_API_KEY,
    minimaxKey: process.env.MINIMAX_API_KEY,
  },
  agent: {
    modelProvider: process.env.AGENT_MODEL_PROVIDER,
    modelId: process.env.AGENT_MODEL_ID,
    systemPrompt: optional(
      "AGENT_SYSTEM_PROMPT",
      "You are a helpful assistant. Be concise and clear."
    ),
  },
  sessions: {
    dir: path.resolve(optional("SESSIONS_DIR", "./sessions")),
    idleTimeoutMs:
      parseInt(optional("SESSION_IDLE_TIMEOUT_MINUTES", "30")) * 60 * 1000,
  },
  log: {
    level: optional("LOG_LEVEL", "info"),
    dir: optional("LOG_DIR", "./logs"),
  },
} as const;
