/**
 * Vercel Serverless Function entry point — every request to /api/anything
 * lands here (the bracketed filename is Vercel's catch-all convention) and is
 * handed straight to server/app.js. server/index.js is never involved.
 */
import app from "../server/app.js";

export default app;
