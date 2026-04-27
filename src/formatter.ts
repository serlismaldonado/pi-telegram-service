// Telegram has a 4096 char limit per message
const MAX_LENGTH = 4096;

/**
 * Splits a long string into chunks that fit Telegram's message limit.
 * Tries to split on paragraph breaks to keep formatting clean.
 */
export function splitMessage(text: string): string[] {
  if (text.length <= MAX_LENGTH) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= MAX_LENGTH) {
      chunks.push(remaining);
      break;
    }

    // Try to cut at a paragraph break within the limit
    let cutAt = MAX_LENGTH;
    const paraBreak = remaining.lastIndexOf("\n\n", MAX_LENGTH);
    const lineBreak = remaining.lastIndexOf("\n", MAX_LENGTH);

    if (paraBreak > MAX_LENGTH * 0.5) {
      cutAt = paraBreak;
    } else if (lineBreak > MAX_LENGTH * 0.5) {
      cutAt = lineBreak;
    }

    chunks.push(remaining.slice(0, cutAt).trimEnd());
    remaining = remaining.slice(cutAt).trimStart();
  }

  return chunks;
}

/**
 * Builds a tool activity summary to prepend when tools were used.
 * Helps non-technical users understand what the agent did.
 */
export function buildToolSummary(toolsUsed: string[]): string {
  if (toolsUsed.length === 0) return "";

  const unique = [...new Set(toolsUsed)];
  const icons: Record<string, string> = {
    bash: "⚙️",
    read: "📂",
    write: "✏️",
    edit: "✏️",
    grep: "🔍",
    find: "🔍",
    ls: "📋",
    web_search: "🌐",
  };

  const parts = unique.map((t) => `${icons[t] ?? "🔧"} ${t}`);
  return `_Used: ${parts.join(", ")}_\n\n`;
}
