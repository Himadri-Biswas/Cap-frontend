import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { AlertCircle, Loader2 } from "lucide-react";
import Sidebar, { MobileNav } from "../features/layout/Sidebar.jsx";
import Topbar from "../features/layout/Topbar.jsx";
import CommandPalette, { useCommandPalette } from "../features/layout/CommandPalette.jsx";
import SimpleDashboard from "../features/dashboard/SimpleDashboard.jsx";
import EmployeesView from "../features/employees/EmployeesView.jsx";
import JobPostsOnly from "../features/recruitment/JobPostsOnly.jsx";
import NewJobModal from "../features/recruitment/NewJobModal.jsx";
import UpskillingView from "../features/upskilling/UpskillingView.jsx";
import PeopleView from "../features/people/PeopleView.jsx";
import Button from "../components/ui/Button.jsx";
import { Page } from "../components/Motion.jsx";
import { api } from "../lib/api.js";

/**
 * The admin workspace.
 *
 * Layout is a fixed icon rail plus one scrolling column, so the data gets the
 * full width of the screen instead of sharing it with a permanent sidebar.
 * Switching sections cross-fades and lifts the incoming view a few pixels —
 * enough to say "this is a different place" without making anyone wait.
 */

export default function MockHRTalentDashboard() {
  const validViews = ["dashboard", "employees", "recruitment", "upskilling", "people"];
  const [active, setActive] = useState(() => {
    const hash = window.location.hash.replace("#", "");
    return validViews.includes(hash) ? hash : "dashboard";
  });
  const [search, setSearch] = useState("");

  useEffect(() => {
    window.location.hash = active;
  }, [active]);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "");
      if (validViews.includes(hash)) {
        setActive(hash);
      }
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const [jobs, setJobs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Deep-link target set by a notification click (e.g. open employee #123).
  const [focus, setFocus] = useState({ view: null, id: null });

  // The "New job posting" panel inside the Job Recruitment view opens this.
  const [showNewJob, setShowNewJob] = useState(false);
  const [paletteOpen, setPaletteOpen] = useCommandPalette();

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [jobsResult, employeesResult] = await Promise.all([
        api.jobs.list({ all: "true" }),
        api.employees.list({ limit: 1500, status: "active" }),
      ]);
      setJobs(jobsResult.jobs || []);
      setEmployees(employeesResult.employees || []);
    } catch (err) {
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleNavigate = useCallback((view, id) => {
    if (!view) return;
    setActive(view);
    setFocus({ view, id });
    setSearch("");
  }, []);

  const titles = useMemo(
    () => ({
      dashboard: { t: "Overview", s: "Hiring and retention at a glance", ph: "Search" },
      employees: { t: "Employees", s: "Attrition risk and interventions", ph: "Name, role or email" },
      recruitment: { t: "Recruitment", s: "Postings and fair screening", ph: "Title, department or location" },
      upskilling: { t: "Upskilling", s: "Learning paths under time and budget", ph: "Roles or employees" },
      people: { t: "People & roles", s: "Access for admins, employees and applicants", ph: "Name or email" },
    }),
    []
  );

  const heading = titles[active] || titles.dashboard;

  return (
    <div className="grain min-h-screen bg-ink-900">
      <Sidebar active={active} onChange={setActive} />
      <MobileNav active={active} onChange={setActive} />

      <div className="lg:pl-[68px]">
        <div className="mx-auto max-w-[1440px] px-4 pb-24 sm:px-6 lg:pb-10">
          <Topbar
            title={heading.t}
            subtitle={heading.s}
            search={search}
            setSearch={setSearch}
            placeholder={heading.ph}
            showSearch={active !== "dashboard" && active !== "upskilling" && active !== "recruitment"}
            onOpenPalette={() => setPaletteOpen(true)}
            onNavigate={handleNavigate}
          />

          <NewJobModal
            open={showNewJob}
            onClose={() => setShowNewJob(false)}
            onCreated={async (job) => {
              setShowNewJob(false);
              await loadData();
              handleNavigate("recruitment", job?.id || null);
            }}
          />

          {loadError && (
            <div className="panel mb-4 flex items-start gap-3 border-risk/35 bg-risk/8 p-4">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-risk" aria-hidden="true" />
              <div className="flex-1">
                <div className="text-sm font-semibold text-risk">Couldn't reach the data API</div>
                <div className="mt-1 text-xs text-mist-400">{loadError.message}</div>
                <Button intent="quiet" size="sm" className="mt-3" onClick={loadData}>
                  Try again
                </Button>
              </div>
            </div>
          )}

          {loading && !jobs.length && !employees.length ? (
            <div className="panel flex items-center justify-center gap-3 p-20 text-sm text-mist-500">
              <Loader2 className="h-4 w-4 animate-spin text-brand" aria-hidden="true" />Loading…</div>
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              <Page key={active}>
                {active === "dashboard" && <SimpleDashboard jobs={jobs} employees={employees} onNavigate={handleNavigate} />}
                {active === "employees" && (
                  <EmployeesView
                    employees={employees}
                    search={search}
                    setSearch={setSearch}
                    focusId={focus.view === "employees" ? focus.id : null}
                    onEmployeesChanged={loadData}
                  />
                )}
                {active === "recruitment" && (
                  <JobPostsOnly
                    jobs={jobs}
                    search={search}
                    setSearch={setSearch}
                    focusJobId={focus.view === "recruitment" ? focus.id : null}
                    onJobsChanged={loadData}
                    onNewJob={() => setShowNewJob(true)}
                  />
                )}
                {active === "upskilling" && (
                  <UpskillingView jobs={jobs} employees={employees} search={search} setSearch={setSearch} />
                )}
                {active === "people" && <PeopleView search={search} />}
              </Page>
            </AnimatePresence>
          )}
        </div>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={handleNavigate}
        jobs={jobs}
        employees={employees}
        isAdmin
      />
    </div>
  );
}
