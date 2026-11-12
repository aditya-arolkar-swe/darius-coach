import { z } from "zod";
import { LIMITS, ROLES } from "./config.js";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(LIMITS.maxMessageChars),
});

export const chatRequestSchema = z
  .object({
    champion: z.string().min(1).max(60),
    role: z.enum(ROLES),
    messages: z.array(messageSchema).min(1).max(LIMITS.maxMessages),
  })
  .refine(
    ({ messages }) =>
      messages.every((m, i) => m.role === (i % 2 === 0 ? "user" : "assistant")) &&
      messages.at(-1).role === "user",
    { message: "messages must alternate user/assistant, starting and ending with user" },
  );

export function parseChatRequest(body) {
  const result = chatRequestSchema.safeParse(body);
  if (result.success) return { ok: true, data: result.data };
  const issue = result.error.issues[0];
  return { ok: false, error: `${issue.path.join(".") || "body"}: ${issue.message}` };
}
