export function logError(context, err) {
  process.stderr.write(`[${new Date().toISOString()}] ${context}: ${err?.stack ?? err}\n`);
}
