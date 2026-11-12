import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PORT, MODEL } from "./config.js";
import { getChampions, findChampion } from "./champions.js";
import { getAbilities } from "./wiki.js";
import { buildSystemPrompt, FOLLOW_UP_TOPICS } from "./prompt.js";
import { parseChatRequest } from "./validation.js";
import { detectProvider, streamChat, describeError } from "./providers/index.js";
import { createKnowledgeStore, knowledgeToPrompt } from "./knowledge.js";
import { knowledgeRouter } from "./knowledgeRoutes.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "256kb" }));
app.use(express.static(path.join(here, "..", "public")));

const ok = (res, data) => res.json({ success: true, data });
const fail = (res, status, error) => res.status(status).json({ success: false, error });

function logError(context, err) {
  process.stderr.write(`[${new Date().toISOString()}] ${context}: ${err.stack ?? err}\n`);
}

let providerPromise = detectProvider();
const knowledge = createKnowledgeStore(process.env.PLAYBOOK_FILE || path.join(here, "..", "data", "knowledge.json"));
app.use("/api/knowledge", knowledgeRouter(knowledge, { ok, fail, logError }));

app.get("/api/status", async (_req, res) => {
  providerPromise = detectProvider(); // re-check so a fresh `claude` login is picked up
  ok(res, { provider: await providerPromise, model: MODEL, followUpTopics: FOLLOW_UP_TOPICS });
});

app.get("/api/champions", async (_req, res) => {
  try {
    ok(res, await getChampions());
  } catch (err) {
    logError("champions", err);
    fail(res, err.status ?? 500, err.message);
  }
});

app.get("/api/abilities/:name", async (req, res) => {
  try {
    const champ = await findChampion(req.params.name);
    if (!champ) return fail(res, 404, `Unknown champion "${req.params.name}"`);
    const { title, abilities, sourceUrl } = await getAbilities(champ.name);
    ok(res, { title, abilities, sourceUrl });
  } catch (err) {
    logError(`abilities ${req.params.name}`, err);
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

  const abort = new AbortController();
  res.on("close", () => abort.abort());

  try {
    for await (const text of streamChat(provider, { system, messages })) {
      if (abort.signal.aborted) break;
      send("delta", { text });
    }
    send("done", {});
  } catch (err) {
    logError("chat stream", err);
    send("error", { error: describeError(err) });
  } finally {
    res.end();
  }
});

app.listen(PORT, async () => {
  const provider = await providerPromise;
  const how = { api: "Claude API key", cli: "your Claude account via the `claude` CLI" }[provider] ?? "NOT CONFIGURED (see README)";
  process.stdout.write(`Darius Coach running at http://localhost:${PORT}\nChat provider: ${how}\n`);
});
