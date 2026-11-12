import { FETCH_TIMEOUT_MS, USER_AGENT } from "./config.js";

export class UpstreamError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

export async function fetchJson(url) {
  let res;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    throw new UpstreamError(`Could not reach ${new URL(url).host}: ${err.message}`);
  }
  if (!res.ok) {
    throw new UpstreamError(`${new URL(url).host} responded ${res.status}`);
  }
  return res.json();
}
