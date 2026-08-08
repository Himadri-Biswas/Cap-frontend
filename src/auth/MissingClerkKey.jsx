import React from "react";

/** Shown when VITE_CLERK_PUBLISHABLE_KEY is absent, instead of a blank page. */
export default function MissingClerkKey() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F9FC] p-4">
      <div className="w-full max-w-2xl rounded-panel border border-raw/35 bg-ink-800 p-8">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-raw">Setup required</div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-paper">
          Clerk publishable key is missing
        </h1>
        <p className="mt-2 text-sm leading-6 text-mist-400">
          TalentPulse uses Clerk for sign-in. Add your key to{" "}
          <code className="rounded bg-ink-750 px-1.5 py-0.5 text-xs">Cap-frontend/.env.local</code> and
          restart the dev server.
        </p>

        <pre className="mt-5 overflow-x-auto rounded-tile bg-ink-850 p-4 text-xs leading-6 text-mist-100">
{`VITE_CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxxxxxxxxx
CLERK_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxx
MONGO_URI="mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority"
ADMIN_EMAILS=you@example.com`}
        </pre>

        <div className="mt-5 rounded-tile border border-ink-600 bg-ink-850 p-4 text-sm leading-6 text-mist-200">
          Step-by-step instructions (where to click in the Clerk and MongoDB Atlas dashboards) are in{" "}
          <span className="font-semibold">what to do.md</span> at the root of the project.
        </div>

        <div className="mt-5 text-xs text-mist-500">
          After editing <code className="rounded bg-ink-750 px-1 py-0.5">.env.local</code>, stop the dev
          server and run <code className="rounded bg-ink-750 px-1 py-0.5">npm run dev</code> again — Vite
          only reads env files at startup.
        </div>
      </div>
    </div>
  );
}
