import { z } from "zod";
import { messagesToPrompt } from "./providers/cli.js";

export const SUGGESTION_COUNT = 3;
const MAX_QUESTION_CHARS = 120;

/** Shape the model must return: the player's most likely next questions. */
export const SuggestionsSchema = z.object({
  questions: z.array(z.string()),
});

export const SUGGESTIONS_JSON_SCHEMA = Object.freeze({
  type: "object",
  properties: { questions: { type: "array", items: { type: "string" } } },
  required: ["questions"],
  additionalProperties: false,
});

export function buildSuggestionsPrompt({ opponent, role, messages }) {
  const where = role === "jungle" ? "Darius jungle" : "Darius top lane";
  const system = `You help a League of Legends player get the most out of a matchup coach. The player is playing ${where} against ${opponent}.

Read the conversation and predict the ${SUGGESTION_COUNT} questions this player is most likely to ask next. Good questions:
- go deeper on something the coach just said that a player would want explained or made concrete (a trade pattern, a power spike, an item choice, a specific ${opponent} ability)
- cover a useful topic the conversation hasn't touched yet (levels 1-3, runes, wave management, teamfights, when to call the jungler)
- don't repeat anything already asked or answered
- are written in the player's own voice ("How do I...", "When should I..."), short and specific to ${opponent}, each under 15 words

Return exactly ${SUGGESTION_COUNT} questions, most useful first.`;

  return { system, prompt: messagesToPrompt([...messages, { role: "user", content: "(What should I ask next?)" }]) };
}

/** Validates and tidies model output: trims, drops blanks/dupes/overlong items, caps the count. */
export function normalizeSuggestions(raw) {
  const parsed = SuggestionsSchema.safeParse(raw);
  if (!parsed.success) return [];
  const seen = new Set();
  return parsed.data.questions
    .map((q) => q.trim().replace(/\s+/g, " "))
    .filter((q) => q.length > 0 && q.length <= MAX_QUESTION_CHARS)
    .filter((q) => {
      const key = q.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, SUGGESTION_COUNT);
}
