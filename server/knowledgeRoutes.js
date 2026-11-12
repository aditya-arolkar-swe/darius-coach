import { Router } from "express";
import { entryInputSchema } from "./knowledge.js";

/** REST routes for the playbook: GET/POST /, PUT/DELETE /:id. Every route returns the full list. */
export function knowledgeRouter(store, { ok, fail, logError }) {
  const router = Router();

  const handle = (fn) => async (req, res) => {
    try {
      ok(res, await fn(req));
    } catch (err) {
      if (!err.status || err.status >= 500) logError("knowledge", err);
      fail(res, err.status ?? 500, err.status ? err.message : "Could not update the playbook");
    }
  };

  const parseBody = (body) => {
    const parsed = entryInputSchema.safeParse(body);
    if (parsed.success) return parsed.data;
    const issue = parsed.error.issues[0];
    throw Object.assign(new Error(`${issue.path.join(".")}: ${issue.message}`), { status: 400 });
  };

  router.get("/", handle(() => store.findAll()));
  router.post("/", handle((req) => store.create(parseBody(req.body))));
  router.put("/:id", handle((req) => store.update(req.params.id, parseBody(req.body))));
  router.delete("/:id", handle((req) => store.remove(req.params.id)));
  return router;
}
