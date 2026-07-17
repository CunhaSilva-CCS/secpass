import app, { ensureInitialized } from "../backend/src/index.js";

export async function forwardToApp(req, res, path) {
  await ensureInitialized();

  const queryIndex = req.url.indexOf("?");
  const query = queryIndex >= 0 ? req.url.slice(queryIndex) : "";
  req.url = `${path}${query}`;

  return app(req, res);
}
