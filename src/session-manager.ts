import path from "path";
import fs from "fs";
import { Type, type Static } from "typebox";
import {
  createAgentSession,
  SessionManager,
  AuthStorage,
  ModelRegistry,
  DefaultResourceLoader,
  getAgentDir,
  type ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { initDb, saveMemory, deleteMemory, formatMemoriesForPrompt } from "./memory-db.js";

// Initialize SQLite DB once at startup
initDb(config.sessions.dir);

interface SessionEntry {
  session: any;
  lastUsed: number;
  chatId: string;
}

// In-memory registry: chatId → session entry
const registry = new Map<string, SessionEntry>();

// Evict idle sessions from memory (they stay on disk)
setInterval(() => {
  const now = Date.now();
  for (const [chatId, entry] of registry.entries()) {
    if (now - entry.lastUsed > config.sessions.idleTimeoutMs) {
      entry.session.dispose();
      registry.delete(chatId);
      logger.info("Session evicted from memory (idle)", { chatId });
    }
  }
}, 5 * 60 * 1000);

function getUserSessionDir(chatId: string): string {
  const dir = path.join(config.sessions.dir, chatId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function buildSystemPrompt(chatId: string): string {
  const base = config.agent.systemPrompt;
  const memories = formatMemoriesForPrompt(chatId);

  const instructions = `

## Memoria persistente
Tienes herramientas para recordar información del usuario entre conversaciones:
- Usa \`save_memory\` cuando el usuario comparta algo importante (nombre, preferencias, proyectos, contexto).
- Usa \`delete_memory\` para eliminar recuerdos obsoletos o incorrectos (usa el id que aparece entre corchetes).
- Los recuerdos se inyectan automáticamente en cada sesión nueva.`;

  if (!memories) return base + instructions;

  return `${base}${instructions}

## Recuerdos del usuario
${memories}`;
}

function buildAuthStorage(): AuthStorage {
  const authStorage = AuthStorage.create();
  if (config.llm.minimaxKey) authStorage.setRuntimeApiKey("minimax", config.llm.minimaxKey);
  if (config.llm.anthropicKey) authStorage.setRuntimeApiKey("anthropic", config.llm.anthropicKey);
  if (config.llm.openaiKey) authStorage.setRuntimeApiKey("openai", config.llm.openaiKey);
  if (config.llm.googleKey) authStorage.setRuntimeApiKey("google", config.llm.googleKey);
  return authStorage;
}

function buildMemoryTools(chatId: string): ToolDefinition[] {
  const saveParams = Type.Object({ content: Type.String({ description: "The fact or information to remember" }) });
  const deleteParams = Type.Object({ id: Type.Number({ description: "The id of the memory to delete" }) });

  const saveMemoryTool: ToolDefinition<typeof saveParams> = {
    name: "save_memory",
    label: "Save memory",
    description: "Save an important fact or piece of information about the user to persistent memory.",
    promptSnippet: "save_memory(content) — persist a fact about the user",
    parameters: saveParams,
    execute: async (_id, params: Static<typeof saveParams>) => {
      const id = saveMemory(chatId, params.content);
      logger.info("Memory saved", { chatId, id, content: params.content });
      return {
        content: [{ type: "text", text: `Memory saved with id ${id}.` }],
        details: {},
      };
    },
  };

  const deleteMemoryTool: ToolDefinition<typeof deleteParams> = {
    name: "delete_memory",
    label: "Delete memory",
    description: "Delete a memory entry by its id (shown in brackets in the memories list).",
    promptSnippet: "delete_memory(id) — remove an outdated or incorrect memory",
    parameters: deleteParams,
    execute: async (_id, params: Static<typeof deleteParams>) => {
      const deleted = deleteMemory(chatId, params.id);
      logger.info("Memory delete attempted", { chatId, memId: params.id, deleted });
      const text = deleted ? `Memory ${params.id} deleted.` : `No memory found with id ${params.id}.`;
      return {
        content: [{ type: "text", text }],
        details: {},
      };
    },
  };

  return [saveMemoryTool, deleteMemoryTool];
}

export async function getOrCreateSession(chatId: string): Promise<any> {
  if (registry.has(chatId)) {
    const entry = registry.get(chatId)!;
    entry.lastUsed = Date.now();
    return entry.session;
  }

  logger.info("Creating new session", { chatId });

  const authStorage = buildAuthStorage();
  const modelRegistry = ModelRegistry.inMemory(authStorage);

  const model = modelRegistry.find(config.agent.modelProvider, config.agent.modelId);
  if (!model) {
    throw new Error(`Model not found: ${config.agent.modelProvider}/${config.agent.modelId}`);
  }

  const sessionDir = getUserSessionDir(chatId);

  const loader = new DefaultResourceLoader({
    cwd: sessionDir,
    agentDir: getAgentDir(),
    systemPromptOverride: () => buildSystemPrompt(chatId),
  });
  await loader.reload();

  const { session } = await createAgentSession({
    cwd: sessionDir,
    model,
    thinkingLevel: "off",
    authStorage,
    modelRegistry,
    resourceLoader: loader,
    sessionManager: SessionManager.continueRecent(sessionDir, sessionDir),
    customTools: buildMemoryTools(chatId),
  });

  registry.set(chatId, { session, lastUsed: Date.now(), chatId });
  logger.info("Session ready", { chatId, model: config.agent.modelId });

  return session;
}

export function getActiveSessionCount(): number {
  return registry.size;
}

export async function disposeAll(): Promise<void> {
  logger.info("Disposing all sessions", { count: registry.size });
  for (const entry of registry.values()) {
    try {
      entry.session.dispose();
    } catch {
      // Best effort
    }
  }
  registry.clear();
}
