import React from "react";
import { SignedIn, SignedOut } from "@clerk/clerk-react";
import { useSession } from "./auth/SessionProvider.jsx";
import AuthGate, { SplashScreen, SessionErrorScreen } from "./auth/AuthGate.jsx";
import MockHRTalentDashboard from "./app/MockHRTalentDashboard.jsx";
import ApplicantPortal from "./features/applicant/ApplicantPortal.jsx";
import Onboarding from "./features/applicant/Onboarding.jsx";
import EmployeePortal from "./features/employee/EmployeePortal.jsx";

/**
 * Role routing.
 *
 * Everyone lands on the same sign-in screen; `activeRole` — read from MongoDB,
 * not from Clerk — decides which workspace renders. Someone holding more than
 * one role gets a switcher in the top bar, which is how a current employee
 * moves over to the applicant portal to apply for another job.
 */
function RoleRouter() {
  const { loading, user, error, refresh, activeRole } = useSession();

  if (loading) return <SplashScreen label="Checking your access…" />;
  if (error) return <SessionErrorScreen error={error} onRetry={refresh} />;
  if (!user) return <SplashScreen label="Preparing your workspace…" />;

  if (activeRole === "admin") return <MockHRTalentDashboard />;
  if (activeRole === "employee") return <EmployeePortal />;

  // A brand-new account has no profile and no CV yet. Collect both once, here,
  // rather than asking for them again on every job application. `onboardedAt`
  // is stamped when they finish (or skip), so this screen never comes back.
  if (!user.onboardedAt) return <Onboarding />;

  return <ApplicantPortal />;
}

export default function App() {
  return (
    <>
      <SignedOut>
        <AuthGate />
      </SignedOut>
      <SignedIn>
        <RoleRouter />
      </SignedIn>
    </>
  );
}
