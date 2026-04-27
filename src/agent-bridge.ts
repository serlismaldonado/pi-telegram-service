import { getOrCreateSession } from "./session-manager.js";
import { logger } from "./logger.js";

const RESPONSE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes max per turn

export interface AgentResponse {
  text: string;
  toolsUsed: string[];
  error?: string;
}

export async function runPrompt(
  chatId: string,
  userMessage: string
): Promise<AgentResponse> {
  const session = await getOrCreateSession(chatId);

  let responseText = "";
  const toolsUsed: string[] = [];

  return new Promise<AgentResponse>((resolve) => {
    let resolved = false;

    // Safety timeout
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        unsub();
        logger.warn("Agent response timed out", { chatId });
        resolve({
          text: responseText || "⚠️ The agent took too long to respond.",
          toolsUsed,
          error: "timeout",
        });
      }
    }, RESPONSE_TIMEOUT_MS);

    // Subscribe to streaming events
    const unsub = session.subscribe((event: any) => {
      switch (event.type) {
        // Accumulate streamed text
        case "message_update":
          if (event.assistantMessageEvent?.type === "text_delta") {
            responseText += event.assistantMessageEvent.delta;
          }
          break;

        // Track which tools ran (for logging)
        case "tool_execution_start":
          if (event.toolName) toolsUsed.push(event.toolName);
          break;

        // Agent finished all work for this prompt
        case "agent_end":
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            unsub();

            logger.info("Agent turn complete", {
              chatId,
              tools: toolsUsed,
              chars: responseText.length,
            });

            resolve({ text: responseText.trim(), toolsUsed });
          }
          break;
      }
    });

    // Send the message
    session.prompt(userMessage).catch((err: Error) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        unsub();
        logger.error("session.prompt() threw", { chatId, error: err.message });
        resolve({
          text: "❌ An error occurred while processing your request.",
          toolsUsed,
          error: err.message,
        });
      }
    });
  });
}
