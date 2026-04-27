# Pi Telegram Service

A 24/7 Telegram bot that wraps the [Pi coding agent](https://github.com/badlogic/pi-mono) SDK.
Each user gets their own isolated agent instance with persistent memory.

```
User (Telegram mobile) ──► Bot ──► Pi Agent (your VPS) ──► LLM API
```

---

## Requirements

- Node.js 20+
- A VPS or cloud server (Hetzner, Railway, Fly.io, DigitalOcean, etc.)
- A Telegram bot token (from [@BotFather](https://t.me/BotFather))
- An API key de Minimax, Anthropic, OpenAI, or Google

---

## Quick start (local dev)

```bash
# 1. Clone / copy this project
cd pi-telegram-service

# 2. Install dependencies
npm install

# 3. Configure
cp .env.example .env
# Edit .env — fill in TELEGRAM_BOT_TOKEN and MINIMAX_API_KEY

# 4. Run in dev mode (hot reload)
npm run dev
```

---

## Production deploy (VPS with PM2)

```bash
# On your server:

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install PM2 globally
npm install -g pm2

# Clone your project
git clone https://github.com/youruser/pi-telegram-service.git
cd pi-telegram-service

npm install
cp .env.example .env
nano .env          # Fill in your tokens

npm run build      # Compile TypeScript → dist/

# Start with PM2
pm2 start ecosystem.config.cjs --env production

# Save PM2 process list (survives server reboots)
pm2 save
pm2 startup        # Follow the printed command to enable autostart
```

### Useful PM2 commands

```bash
pm2 status         # See if the bot is running
pm2 logs pi-telegram        # Tail live logs
pm2 restart pi-telegram     # Restart after config change
pm2 stop pi-telegram        # Stop
pm2 monit          # Live dashboard
```

---

## Configuration

All config lives in `.env`. Key settings:

| Variable | Description | Default |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | From @BotFather | required |
| `MINIMAX_API_KEY` | Minimax API key | required (if using Minimax) |
| `ANTHROPIC_API_KEY` | Anthropic API key | optional |
| `OPENAI_API_KEY` | OpenAI API key | optional |
| `GOOGLE_API_KEY` | Google Gemini API key | optional |
| `AGENT_MODEL_PROVIDER` | `minimax`, `anthropic`, `openai`, `google` | `minimax` |
| `AGENT_MODEL_ID` | Model name | `MiniMax-M2.7` |
| `AGENT_SYSTEM_PROMPT` | What role/personality the agent has | generic assistant |
| `SESSIONS_DIR` | Where per-user sessions are stored | `./sessions` |
| `SESSION_IDLE_TIMEOUT_MINUTES` | Minutes before evicting from RAM | `30` |

---

## Project structure

```
src/
  index.ts          ← Entry point, graceful shutdown
  config.ts         ← Env var validation
  logger.ts         ← Winston logger
  bot.ts            ← Telegram bot, commands, message handler
  agent-bridge.ts   ← Converts Pi SDK events → single response string
  session-manager.ts← Per-user Pi agent instances, idle eviction
  formatter.ts      ← Splits long messages, tool activity summary

sessions/           ← Per-user JSONL session files (auto-created)
logs/               ← Application and PM2 logs
ecosystem.config.cjs ← PM2 production config
```

---

## Customizing the agent

### Change the system prompt

Edit `AGENT_SYSTEM_PROMPT` in `.env`. Examples:

```
# Customer support bot
AGENT_SYSTEM_PROMPT=You are a support agent for Acme Corp. Be professional and helpful. Only answer questions related to our products.

# Personal assistant
AGENT_SYSTEM_PROMPT=You are my personal assistant. Help me stay organized, draft messages, and answer questions. Be concise.

# Code reviewer
AGENT_SYSTEM_PROMPT=You are a senior engineer. When shown code, review it for bugs, style issues, and improvements. Be specific.
```

### Add custom tools

In `src/session-manager.ts`, add a `customTools` array to `createAgentSession()`:

```typescript
import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";

const weatherTool: ToolDefinition = {
  name: "get_weather",
  label: "Weather",
  description: "Get current weather for a city",
  parameters: Type.Object({
    city: Type.String({ description: "City name" }),
  }),
  execute: async (_id, params) => {
    const data = await fetchWeather(params.city); // your implementation
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      details: {},
    };
  },
};

// In createAgentSession():
const { session } = await createAgentSession({
  // ...existing options...
  customTools: [weatherTool],
});
```

### Restrict which built-in tools are available

```typescript
import { readOnlyTools } from "@mariozechner/pi-coding-agent";

const { session } = await createAgentSession({
  tools: readOnlyTools, // read, grep, find, ls — no bash, no write
});
```

---

## How sessions work

- Each Telegram `chat_id` gets its own Pi agent instance.
- Sessions persist to `sessions/<chat_id>/` as JSONL files.
- If the server restarts, sessions reload from disk automatically (`continueRecent`).
- After `SESSION_IDLE_TIMEOUT_MINUTES` of inactivity, the session is evicted from RAM but stays on disk.
- `/new` command starts a fresh conversation (old history is not deleted, just a new session file is created).

---

## Persistent memory (SQLite)

The bot has a semantic memory system backed by SQLite (`sessions/memory.db`). Memories survive `/new` and server restarts.

### Schema

```sql
memories (id, chat_id, content, created_at)
```

### How it works

1. On each session start, the user's memories are injected into the system prompt automatically.
2. The agent has two built-in tools:
   - `save_memory(content)` — saves a fact about the user
   - `delete_memory(id)` — removes an outdated or incorrect memory

### Example

Tell the bot:
> _"Remember that my company is called Heskala and my main stack is TypeScript"_

The agent will call `save_memory` and those facts will appear in every future session:

```
## Recuerdos del usuario
- [1] Company: Heskala
- [2] Main stack: TypeScript
```

---

## Estimated costs (Anthropic Claude Sonnet)

| Users | Messages/day | LLM cost/month |
|---|---|---|
| 10 | 20 each | ~$6 |
| 50 | 20 each | ~$30 |
| 200 | 20 each | ~$120 |

VPS cost (Hetzner CX21, 4GB RAM): ~€5/month.

---

## macOS menu bar widget (xbar)

Para controlar el bot desde la barra de menú del Mac sin abrir la terminal:

### Requisitos

- [xbar](https://xbarapp.com) — `brew install --cask xbar`

### Instalación del plugin

```bash
# Copia el plugin a la carpeta de xbar
cp scripts/pi-telegram.5s.sh "$HOME/Library/Application Support/xbar/plugins/"
chmod +x "$HOME/Library/Application Support/xbar/plugins/pi-telegram.5s.sh"
```

Luego haz clic en **xbar → Refresh all**.

### What it shows

```
🟢 Pi Bot  ▾
├── Status: online
├── RAM: 176 MB
├── Restarts: 0
├── 🔄 Restart
├── ⏹ Stop
├── ▶️ Start
└── 📋 View logs
```

Updates automatically every 5 seconds.
