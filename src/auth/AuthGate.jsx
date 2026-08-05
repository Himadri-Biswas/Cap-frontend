/**
 * AuthGate — the ONE login portal.
 *
 * Everybody (admin, current employee, applicant) signs in through this exact
 * screen with just an email and a password. There is no separate admin URL and
 * no role picker at sign-in: the server reads the role out of MongoDB after
 * authentication and the app routes the person to their own portal.
 */
import React, { useState } from "react";
import { SignIn, SignUp } from "@clerk/clerk-react";
import { Loader2, ShieldCheck, TrendingUp, UsersRound } from "lucide-react";
import { useSession } from "./SessionProvider.jsx";

const clerkAppearance = {
  elements: {
    rootBox: "w-full",
    cardBox: "w-full shadow-none",
    card: "shadow-none border-0 bg-transparent p-0 w-full",
    header: "hidden",
    footer: "hidden",
    socialButtons: "hidden",
    dividerRow: "hidden",
    formButtonPrimary:
      "bg-indigo-600 hover:bg-indigo-700 text-sm font-semibold normal-case rounded-2xl h-11 shadow-sm",
    formFieldInput:
      "rounded-2xl border-slate-200 bg-white h-11 text-sm focus:border-indigo-300 focus:ring-0",
    formFieldLabel: "text-xs font-semibold uppercase tracking-wider text-slate-500",
    identityPreviewEditButton: "text-indigo-600",
    footerActionLink: "text-indigo-600 hover:text-indigo-700",
  },
  layout: { socialButtonsPlacement: "bottom", showOptionalFields: false },
};

function Highlight({ icon: Icon, title, body }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-sm font-semibold text-white">{title}</div>
        <div className="mt-0.5 text-xs leading-5 text-white/70">{body}</div>
      </div>
    </div>
  );
}

export function SplashScreen({ label = "Loading TalentPulse…" }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F9FC]">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        <div className="text-sm font-medium text-slate-600">{label}</div>
      </div>
    </div>
  );
}

export default function AuthGate() {
  const [mode, setMode] = useState("sign-in");

  return (
    <div className="min-h-screen bg-[#F7F9FC]">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-28 -left-28 h-96 w-96 rounded-full bg-indigo-200/45 blur-3xl" />
        <div className="absolute -bottom-28 -right-28 h-96 w-96 rounded-full bg-sky-200/45 blur-3xl" />
      </div>

      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-6 p-4 lg:grid-cols-[1.05fr_0.95fr]">
        {/* Brand panel */}
        <div className="hidden overflow-hidden rounded-[32px] bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 p-10 text-white shadow-xl lg:block">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-500 font-black">
              HR
            </div>
            <div>
              <div className="text-lg font-bold tracking-tight">TalentPulse</div>
              <div className="text-xs text-white/60">Intelligent HR Management System</div>
            </div>
          </div>

          <div className="mt-10 text-3xl font-bold leading-tight tracking-tight">
            One sign-in.
            <br />
            Your own workspace.
          </div>
          <p className="mt-3 max-w-sm text-sm leading-6 text-white/70">
            Admins, current employees and applicants all sign in here. We read your role from the
            database and take you straight to the right place.
          </p>

          <div className="mt-10 space-y-5">
            <Highlight
              icon={UsersRound}
              title="Applicants"
              body="Browse open roles, upload a CV, and track where every application stands."
            />
            <Highlight
              icon={TrendingUp}
              title="Current employees"
              body="See your own retention insight and the learning path built for your next role."
            />
            <Highlight
              icon={ShieldCheck}
              title="Admins"
              body="Screen candidates fairly, watch attrition risk live, and act on it in one click."
            />
          </div>
        </div>

        {/* Auth card */}
        <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-500 font-black text-white">
              HR
            </div>
            <div>
              <div className="font-bold tracking-tight text-slate-900">TalentPulse</div>
              <div className="text-xs text-slate-500">Intelligent HRMS</div>
            </div>
          </div>

          <div className="mb-6">
            <div className="text-xl font-bold tracking-tight text-slate-900">
              {mode === "sign-in" ? "Sign in to TalentPulse" : "Create your account"}
            </div>
            <div className="mt-1 text-sm text-slate-500">
              {mode === "sign-in"
                ? "Use your email and password. We'll route you to your portal."
                : "New accounts start as applicants. An admin can promote you later."}
            </div>
          </div>

          <div className="mb-6 inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
            {[
              { key: "sign-in", label: "Sign in" },
              { key: "sign-up", label: "Create account" },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setMode(tab.key)}
                className={
                  mode === tab.key
                    ? "rounded-xl bg-white px-4 py-1.5 text-sm font-semibold text-slate-900 shadow-sm"
                    : "rounded-xl px-4 py-1.5 text-sm font-semibold text-slate-500 hover:text-slate-700"
                }
              >
                {tab.label}
              </button>
            ))}
          </div>

          {mode === "sign-in" ? (
            <SignIn appearance={clerkAppearance} routing="virtual" signUpUrl={undefined} />
          ) : (
            <SignUp appearance={clerkAppearance} routing="virtual" signInUrl={undefined} />
          )}
        </div>
      </div>
    </div>
  );
}

/** Shown when Clerk authenticates but the API cannot resolve a MongoDB user. */
export function SessionErrorScreen({ error, onRetry }) {
  const { signOut } = useSession();
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F9FC] p-4">
      <div className="w-full max-w-lg rounded-3xl border border-rose-200 bg-white p-8 shadow-sm">
        <div className="text-lg font-bold text-slate-900">We signed you in, but the data API did not answer</div>
        <div className="mt-2 text-sm text-slate-600">{error?.message || "Unknown error."}</div>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-6 text-slate-600">
          <div className="font-semibold text-slate-700">Usually one of these:</div>
          <ul className="mt-1 list-disc pl-4">
            <li>
              The API is not running — start it with <code className="rounded bg-white px-1">npm run dev</code>.
            </li>
            <li>
              <code className="rounded bg-white px-1">MONGO_URI</code> or{" "}
              <code className="rounded bg-white px-1">CLERK_SECRET_KEY</code> is missing from{" "}
              <code className="rounded bg-white px-1">.env.local</code>.
            </li>
            <li>
              Your Atlas cluster has not allow-listed this machine's IP.
            </li>
          </ul>
        </div>
        <div className="mt-5 flex gap-2">
          <button
            onClick={onRetry}
            className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Try again
          </button>
          <button
            onClick={() => signOut()}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
