/**
 * AuthGate — the one login portal.
 *
 * Everybody signs in here: admin, current employee, applicant. There is no
 * separate admin URL and no role picker, because picking your own role at a
 * login screen is a claim, not a fact — the server reads the role out of
 * MongoDB after authentication and the app routes accordingly.
 *
 * The left panel states what the product actually does rather than selling
 * it: three modules, three measurements, each shown as the before/after pair
 * the rest of the interface is built on.
 */
import React, { useState } from "react";
import { SignIn, SignUp } from "@clerk/clerk-react";
import { Loader2 } from "lucide-react";
import { useSession } from "./SessionProvider.jsx";
import { cx } from "../lib/cx.js";

const clerkAppearance = {
  variables: {
    colorPrimary: "#5b57d9",
    colorBackground: "transparent",
    colorText: "#101319",
    colorTextSecondary: "#5f6672",
    colorInputBackground: "#ffffff",
    colorInputText: "#101319",
    colorDanger: "#dc2743",
    borderRadius: "8px",
    fontFamily: '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif',
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full shadow-none border-0",
    card: "shadow-none border-0 bg-transparent p-0 w-full",
    header: "hidden",
    footer: "hidden",
    socialButtons: "hidden",
    dividerRow: "hidden",
    formButtonPrimary:
      "bg-brand hover:bg-brand-hi text-white text-sm font-semibold normal-case rounded-[8px] h-11 shadow-none",
    formFieldInput:
      "rounded-[8px] border border-ink-600 bg-white h-11 text-sm text-paper focus:border-brand/60 focus:ring-0",
    formFieldLabel: "text-[10px] font-medium uppercase tracking-[0.16em] text-mist-500",
    identityPreviewEditButton: "text-brand-hi",
    footerActionLink: "text-brand-hi hover:text-brand",
    formFieldInputShowPasswordButton: "text-mist-500 hover:text-paper",
    otpCodeFieldInput: "border-ink-600 bg-white text-paper",
  },
  layout: { socialButtonsPlacement: "bottom", showOptionalFields: false },
};

/**
 * The product in three lines. Each is a real measurement pair the system
 * produces, printed the way the app prints them.
 */
const MODULES = [
  {
    n: "01",
    title: "Bias-audited ranking",
    body: "Every CV is scored twice — once by the original model, once after debiasing — and the gap is attributed to university, gender, skin colour and ethnicity.",
    from: "0.9263",
    to: "0.8575",
  },
  {
    n: "02",
    title: "Attrition with a remedy",
    body: "A risk score, the drivers behind it, and counterfactual plans scored by the model so the predicted figure is the one you get.",
    from: "83.7%",
    to: "7.6%",
  },
  {
    n: "03",
    title: "Learning paths",
    body: "The gap between someone's skills and a role's, turned into an ordered course plan inside a time and money budget.",
    from: "41%",
    to: "88%",
  },
];

export function SplashScreen({ label = "Loading" }) {
  return (
    <div className="grain flex min-h-screen items-center justify-center bg-ink-900">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-brand" aria-hidden="true" />
        <p className="text-xs text-mist-500">{label}</p>
      </div>
    </div>
  );
}

export default function AuthGate() {
  const [mode, setMode] = useState("sign-in");

  return (
    <div className="grain relative min-h-screen bg-ink-900">
      <div className="aurora" aria-hidden="true" />

      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-8 px-5 py-8 lg:grid-cols-[1.08fr_0.92fr] lg:px-8">
        {/* ── The thesis ─────────────────────────────────────────────────── */}
        <div className="feature hidden h-full flex-col justify-center p-10 lg:flex">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid h-9 w-9 place-items-center rounded-tile bg-brand text-[13px] font-bold text-white"
            >
              TP
            </span>
            <span>
              <span className="block font-display text-[15px] font-bold tracking-tight text-white">TalentPulse</span>
              <span className="block text-[11px] feature-faint">Fair hiring · retention</span>
            </span>
          </div>

          <h1 className="display-xl mt-14 text-[60px] text-white">
            Measure it.
            <br />
            <span className="feature-faint">Then correct it.</span>
          </h1>
          <p className="mt-6 max-w-md text-sm leading-6 feature-dim">
            Three models, each producing the same shape of answer: a reading, and the same reading once the thing
            skewing it has been taken out.
          </p>

          <ul className="mt-14 space-y-0">
            {MODULES.map((m, i) => (
              <li
                key={m.n}
                className="enter grid grid-cols-[auto_1fr_auto] items-start gap-5 border-t border-white/10 py-5 last:border-b"
                style={{ "--i": i + 2 }}
              >
                <span className="num pt-0.5 text-[11px] feature-faint">{m.n}</span>
                <div>
                  <h2 className="text-[13px] font-semibold text-white">{m.title}</h2>
                  <p className="mt-1 max-w-sm text-xs leading-5 feature-faint">{m.body}</p>
                </div>
                {/* The same before→after device the app uses throughout. */}
                <div className="num flex items-center gap-2 pt-0.5 text-[11px] font-medium">
                  <span className="text-[#f0b429]">{m.from}</span>
                  <span aria-hidden="true" className="feature-faint">
                    →
                  </span>
                  <span className="text-[#3ee0cd]">{m.to}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* ── The form ───────────────────────────────────────────────────── */}
        <div className="panel enter p-6 sm:p-8" style={{ "--i": 1 }}>
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <span
              aria-hidden="true"
              className="grid h-9 w-9 place-items-center rounded-tile bg-brand text-[13px] font-bold text-white"
            >
              TP
            </span>
            <span>
              <span className="block font-display text-sm font-bold tracking-tight text-paper">TalentPulse</span>
              <span className="block text-[11px] text-mist-600">Fair hiring · retention</span>
            </span>
          </div>

          <h2 className="display text-2xl text-paper">
            {mode === "sign-in" ? "Sign in" : "Create an account"}
          </h2>
          <p className="mt-1 text-[13px] text-mist-500">
            {mode === "sign-in"
              ? "We'll take you to the workspace your role gives you."
              : "New accounts start as applicants. An admin can grant more later."}
          </p>

          <div
            role="tablist"
            aria-label="Sign in or create an account"
            className="mb-6 mt-6 grid grid-cols-2 gap-1 rounded-tile border border-ink-600 bg-ink-850 p-1"
          >
            {[
              { key: "sign-in", label: "Sign in" },
              { key: "sign-up", label: "Create account" },
            ].map((tab) => (
              <button
                key={tab.key}
                role="tab"
                aria-selected={mode === tab.key}
                onClick={() => setMode(tab.key)}
                className={cx(
                  "h-8 rounded-chip text-[13px] font-medium transition-colors",
                  mode === tab.key ? "bg-ink-700 text-paper" : "text-mist-500 hover:text-paper"
                )}
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
    <div className="grain flex min-h-screen items-center justify-center bg-ink-900 p-4">
      <div className="panel w-full max-w-lg p-7">
        <h1 className="font-display text-lg font-bold tracking-tight text-paper">
          Signed in, but the data API didn't answer
        </h1>
        <p className="mt-2 text-sm text-mist-400">{error?.message || "Unknown error."}</p>

        <div className="mt-5 rounded-tile border border-ink-600 bg-ink-850 p-4 text-xs leading-6 text-mist-400">
          <p className="font-semibold text-mist-200">Usually one of these:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            <li>
              The API isn't running — start it with <code className="num rounded bg-ink-750 px-1">npm run dev</code>.
            </li>
            <li>
              <code className="num rounded bg-ink-750 px-1">MONGO_URI</code> or{" "}
              <code className="num rounded bg-ink-750 px-1">CLERK_SECRET_KEY</code> is missing from{" "}
              <code className="num rounded bg-ink-750 px-1">.env.local</code>.
            </li>
            <li>Your Atlas cluster hasn't allow-listed this machine's IP.</li>
          </ul>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            onClick={onRetry}
            className="rounded-tile bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-hi"
          >
            Try again
          </button>
          <button
            onClick={() => signOut()}
            className="rounded-tile border border-ink-600 bg-ink-800 px-4 py-2 text-sm font-medium text-mist-200 transition hover:bg-ink-750"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
