import { forwardToApp } from "../_forward.mjs";

export default async function handler(req, res) {
  return forwardToApp(req, res, "/auth/logout");
}
