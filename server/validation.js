import { z } from "zod";
import { LIMITS, ROLES } from "./config.js";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(LIMITS.maxMessageChars),
});

const alternates = (messages) => messages.every((m, i) => m.role === (i % 2 === 0 ? "user" : "assistant"));

/** A conversation that starts with the player and ends on `lastRole`. */
function conversationSchema(lastRole) {
  return z
    .object({
      champion: z.string().min(1).max(60),
      role: z.enum(ROLES),
      messages: z.array(messageSchema).min(1).max(LIMITS.maxMessages),
    })
    .refine(({ messages }) => alternates(messages) && messages.at(-1).role === lastRole, {
      message: `messages must alternate user/assistant, starting with user and ending with ${lastRole}`,
    });
}

export const chatRequestSchema = conversationSchema("user");
export const suggestionsRequestSchema = conversationSchema("assistant");

function parseWith(schema, body) {
  const result = schema.safeParse(body);
  if (result.success) return { ok: true, data: result.data };
  const issue = result.error.issues[0];
  return { ok: false, error: `${issue.path.join(".") || "body"}: ${issue.message}` };
}

export const parseChatRequest = (body) => parseWith(chatRequestSchema, body);
export const parseSuggestionsRequest = (body) => parseWith(suggestionsRequestSchema, body);
