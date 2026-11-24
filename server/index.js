import express from "express";
import { logError } from "./log.js";
import { answerKey, createAnswerCache } from "./answerCache.js";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PORT, MODEL } from "./config.js";
import { getChampions, findChampion } from "./champions.js";
import { getAbilities } from "./wiki.js";
import { buildSystemPrompt } from "./prompt.js";
import { parseChatRequest, parseSuggestionsRequest } from "./validation.js";
import { detectProvider, streamChat, completeJson, describeError } from "./providers/index.js";
import { buildSuggestionsPrompt, normalizeSuggestions, SuggestionsSchema, SUGGESTIONS_JSON_SCHEMA } from "./suggestions.js";
import { createKnowledgeStore, knowledgeToPrompt } from "./knowledge.js";
import { knowledgeRouter } from "./knowledgeRoutes.js";
import { renderAbilitiesPage, renderErrorPage, EMBED_CSP } from "./embed.js";
import { isAllowedTooltip, renderTooltip } from "./tooltip.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "256kb" }));
app.use(express.static(path.join(here, "..", "public")));

const ok = (res, data) => res.json({ success: true, data });
const fail = (res, status, error) => res.status(status).json({ success: false, error });


let providerPromise = detectProvider();
const answers = createAnswerCache();
const knowledge = createKnowledgeStore(process.env.PLAYBOOK_FILE || path.join(here, "..", "data", "knowledge.json"));
app.use("/api/knowledge", knowledgeRouter(knowledge, { ok, fail, logError }));

app.get("/api/status", async (_req, res) => {
  providerPromise = detectProvider(); // re-check so a fresh `claude` login is picked up
  ok(res, { provider: await providerPromise, model: MODEL });
});

app.get("/api/health", (_req, res) => {
  ok(res, { status: "ok", uptimeSeconds: Math.round(process.uptime()) });
});

app.get("/api/hello", (_req, res) => {
  ok(res, { message: "Hello from Darius Coach!" });
});

app.get("/api/builds/:champion", (req, res) => {
  ok(res, {
    champion: req.params.champion,
    items: ["Trinity Force", "Sundered Sky", "Dead Man's Plate", "Maw of Malmortius", "Guardian Angel"],
  });
});

app.post("/api/team-comp", (req, res) => {
  const champions = req.body?.champions;
  if (!Array.isArray(champions) || champions.length === 0 || champions.length > 5 || !champions.every((c) => typeof c === "string" && c.trim())) {
    return fail(res, 400, "champions must be an array of 1 to 5 champion names");
  }
  ok(res, { champions, advice: "just git gud" });
});

app.get("/api/champions", async (_req, res) => {
  try {
    ok(res, await getChampions());
  } catch (err) {
    logError("champions", err);
    fail(res, err.status ?? 500, err.message);
  }
});

app.get("/embed/abilities/:name", async (req, res) => {
  res.set("Content-Security-Policy", EMBED_CSP);
  res.type("html");
  try {
    const champ = await findChampion(req.params.name);
    if (!champ) return res.status(404).send(renderErrorPage(`Unknown champion "${req.params.name}"`));
    res.send(renderAbilitiesPage(await getAbilities(champ.name)));
  } catch (err) {
    logError(`abilities ${req.params.name}`, err);
    res.status(err.status ?? 500).send(renderErrorPage(`Couldn't load abilities: ${err.message}`));
  }
});

app.get("/api/wiki/tooltip", async (req, res) => {
  const text = typeof req.query.text === "string" ? req.query.text : "";
  if (!isAllowedTooltip(text)) return fail(res, 400, "Unsupported tooltip");
  try {
    res.set("Cache-Control", "public, max-age=3600");
    ok(res, { html: await renderTooltip(text) });
  } catch (err) {
    logError("tooltip", err);
    fail(res, err.status ?? 500, err.message);
  }
});

app.post("/api/chat", async (req, res) => {
  const parsed = parseChatRequest(req.body);
  if (!parsed.ok) return fail(res, 400, parsed.error);
  const { champion, role, messages } = parsed.data;

  const provider = await providerPromise;
  if (!provider) return fail(res, 503, "No Claude connection configured. See the setup steps in the chat panel.");

  let system;
  try {
    const champ = await findChampion(champion);
    if (!champ) return fail(res, 404, `Unknown champion "${champion}"`);
    const [darius, opponent, entries] = await Promise.all([
      getAbilities("Darius"),
      getAbilities(champ.name),
      knowledge.findAll(),
    ]);
    system = buildSystemPrompt({
      opponent: champ.name,
      role,
      dariusText: darius.text,
      opponentText: opponent.text,
      playbook: knowledgeToPrompt(entries),
    });
  } catch (err) {
    logError("chat context", err);
    return fail(res, err.status ?? 500, err.message);
  }

  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  // Same prompt + same conversation -> replay the saved answer instead of spending tokens.
  const key = answerKey({ kind: "chat", provider, system, messages });
  const saved = await answers.get(key);
  if (saved !== undefined) {
    send("delta", { text: saved });
    send("done", { cached: true });
    return res.end();
  }

  const abort = new AbortController();
  res.on("close", () => abort.abort());

  try {
    let reply = "";
    for await (const text of streamChat(provider, { system, messages })) {
      if (abort.signal.aborted) break;
      reply += text;
      send("delta", { text });
    }
    // Only complete answers are saved; a stopped or empty stream is not.
    if (!abort.signal.aborted && reply.trim()) await answers.set(key, reply);
    send("done", { cached: false });
  } catch (err) {
    logError("chat stream", err);
    send("error", { error: describeError(err) });
  } finally {
    res.end();
  }
});

/** After each coach reply: asks Claude which questions the player will most likely ask next. */
app.post("/api/suggestions", async (req, res) => {
  const parsed = parseSuggestionsRequest(req.body);
  if (!parsed.ok) return fail(res, 400, parsed.error);
  const provider = await providerPromise;
  if (!provider) return fail(res, 503, "No Claude connection configured.");
  try {
    const champ = await findChampion(parsed.data.champion);
    if (!champ) return fail(res, 404, `Unknown champion "${parsed.data.champion}"`);
    const { system, prompt } = buildSuggestionsPrompt({ ...parsed.data, opponent: champ.name });
    const key = answerKey({ kind: "suggestions", provider, system, messages: prompt });
    const saved = await answers.get(key);
    if (saved !== undefined) return ok(res, { questions: saved, cached: true });
    const questions = normalizeSuggestions(
      await completeJson(provider, { system, prompt, schema: SuggestionsSchema, jsonSchema: SUGGESTIONS_JSON_SCHEMA }),
    );
    if (questions.length) await answers.set(key, questions);
    ok(res, { questions, cached: false });
  } catch (err) {
    logError("suggestions", err);
    fail(res, 502, describeError(err));
  }
});

app.listen(PORT, async () => {
  const provider = await providerPromise;
  const how = { api: "Claude API key", cli: "your Claude account via the `claude` CLI" }[provider] ?? "NOT CONFIGURED (see README)";
  process.stdout.write(`Darius Coach running at http://localhost:${PORT}\nChat provider: ${how}\n`);
});
