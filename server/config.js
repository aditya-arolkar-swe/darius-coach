export const PORT = Number(process.env.PORT) || 3000;

export const WIKI_BASE = "https://wiki.leagueoflegends.com";
export const WIKI_API = `${WIKI_BASE}/en-us/api.php`;
export const DDRAGON_BASE = "https://ddragon.leagueoflegends.com";
export const USER_AGENT = "DariusCoach/1.0 (personal matchup helper)";

export const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
export const EFFORT = process.env.CLAUDE_EFFORT || "medium";
export const MAX_OUTPUT_TOKENS = 16000;

export const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
export const FETCH_TIMEOUT_MS = 15000;

export const LIMITS = Object.freeze({
  maxMessages: 40,
  maxMessageChars: 4000,
});

export const ROLES = Object.freeze(["top", "jungle"]);
