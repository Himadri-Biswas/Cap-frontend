/**
 * Vercel Serverless Function entry point — every request to /api/anything
 * lands here (the bracketed filename is Vercel's catch-all convention) and is
 * handed straight to server/app.js. server/index.js is never involved.
 *
 * Why `api/` contains nothing but this one file:
 * Vercel treats EVERY file in `api/` as a Serverless Function and picks a
 * runtime from the file's extension and its neighbours. The module-2 Python
 * reference backend used to live here too, and its `requirements.txt` made
 * Vercel try to build `app.py` as a Python function — torch + transformers +
 * gliner bundle to several GB, far past the 250MB limit, so that build failed
 * and NO function (not even this one) was ever published. Every `/api/...`
 * call then hit Vercel's static router, found nothing, and returned the
 * platform 404 page: "The page could not be found NOT_FOUND ...".
 * That backend now lives in `ml-backends/module2/`, where Vercel ignores it.
 *
 * `req.url` normalisation: with a catch-all function Vercel forwards the
 * original path (`/api/attrition/42/apply`), which is what server/app.js
 * mounts its routers on. Should the path ever arrive without the `/api`
 * prefix (a rewrite, a different platform), we put it back so Express still
 * matches instead of falling through to a 404.
 */
import app from "../server/app.js";

export default function handler(req, res) {
  if (!req.url || req.url === "/") req.url = "/api";
  else if (!req.url.startsWith("/api")) req.url = `/api${req.url.startsWith("/") ? "" : "/"}${req.url}`;
  return app(req, res);
}
