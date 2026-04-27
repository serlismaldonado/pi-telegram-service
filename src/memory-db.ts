import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

let db: Database.Database;

export function initDb(dbDir: string): void {
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  db = new Database(path.join(dbDir, "memory.db"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT    NOT NULL,
      content TEXT    NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_memories_chat_id ON memories(chat_id);
  `);
}

export function saveMemory(chatId: string, content: string): number {
  const stmt = db.prepare("INSERT INTO memories (chat_id, content) VALUES (?, ?)");
  const result = stmt.run(chatId, content);
  return result.lastInsertRowid as number;
}

export function getMemories(chatId: string): { id: number; content: string; created_at: string }[] {
  return db
    .prepare("SELECT id, content, created_at FROM memories WHERE chat_id = ? ORDER BY created_at ASC")
    .all(chatId) as { id: number; content: string; created_at: string }[];
}

export function deleteMemory(chatId: string, id: number): boolean {
  const result = db.prepare("DELETE FROM memories WHERE id = ? AND chat_id = ?").run(id, chatId);
  return result.changes > 0;
}

export function formatMemoriesForPrompt(chatId: string): string {
  const memories = getMemories(chatId);
  if (memories.length === 0) return "";
  return memories.map((m) => `- [${m.id}] ${m.content}`).join("\n");
}
