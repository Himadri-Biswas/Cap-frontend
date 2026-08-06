import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, Loader2 } from "lucide-react";
import Sidebar from "../features/layout/Sidebar.jsx";
import Topbar from "../features/layout/Topbar.jsx";
import SimpleDashboard from "../features/dashboard/SimpleDashboard.jsx";
import EmployeesView from "../features/employees/EmployeesView.jsx";
import JobPostsOnly from "../features/recruitment/JobPostsOnly.jsx";
import NewJobModal from "../features/recruitment/NewJobModal.jsx";
import UpskillingView from "../features/upskilling/UpskillingView.jsx";
import PeopleView from "../features/people/PeopleView.jsx";
import { api } from "../lib/api.js";

/**
 * The admin workspace.
 *
 * Only the DATA SOURCE changed: `jobs` and `employees` now come from MongoDB
 * instead of `mockJobs` / `ibmEmployees`, and they arrive with exactly the same
 * field names — so every child view, and every ML call inside them, is
 * untouched. If the API is unreachable the views still render with empty
 * arrays rather than crashing.
 */
export default function MockHRTalentDashboard() {
  const [active, setActive] = useState("dashboard");
  const [search, setSearch] = useState("");

  const [jobs, setJobs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Deep-link target set by a notification click (e.g. open employee #123).
  const [focus, setFocus] = useState({ view: null, id: null });

  // The "New job posting" panel inside the Job Recruitment view opens this.
  const [showNewJob, setShowNewJob] = useState(false);

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
      dashboard: { t: "Dashboard", s: "", ph: "Search..." },
      employees: { t: "Employees", s: "", ph: "Search employees by name, position, or email..." },
      recruitment: { t: "Job Recruitment", s: "", ph: "Search jobs by title, dept, location..." },
      upskilling: {
        t: "Upskilling",
        s: "Plan learning paths under time & budget constraints.",
        ph: "Search jobs or employees...",
      },
      people: {
        t: "People & Roles",
        s: "Grant admin, employee and applicant access.",
        ph: "Search by name or email...",
      },
    }),
    []
  );

  const heading = titles[active] || titles.dashboard;

  return (
    <div className="min-h-screen bg-[#F7F9FC]">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-28 -left-28 h-96 w-96 rounded-full bg-indigo-200/45 blur-3xl" />
        <div className="absolute -bottom-28 -right-28 h-96 w-96 rounded-full bg-sky-200/45 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl p-4">
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="lg:sticky lg:top-4 h-fit"
          >
            <Sidebar active={active} onChange={(k) => setActive(k)} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.05 }}
            className="space-y-4"
          >
            <Topbar
              title={heading.t}
              subtitle={heading.s}
              search={search}
              setSearch={setSearch}
              placeholder={heading.ph}
              showSearch={active !== "dashboard"}
              // Posting a job now lives inside the Job Recruitment screen,
              // directly above "Latest Job Posts", instead of in this header.
              showNew={false}
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
              <div className="flex items-start gap-3 rounded-3xl border border-rose-200 bg-rose-50 p-4">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
                <div className="flex-1">
                  <div className="text-sm font-semibold text-rose-700">Could not load data from MongoDB</div>
                  <div className="mt-1 text-sm text-rose-600">{loadError.message}</div>
                  <button
                    onClick={loadData}
                    className="mt-3 rounded-2xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                  >
                    Retry
                  </button>
                </div>
              </div>
            )}

            {loading && !jobs.length && !employees.length ? (
              <div className="flex items-center justify-center gap-3 rounded-[28px] border border-slate-200 bg-white p-16 text-sm text-slate-500 shadow-sm">
                <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
                Loading from MongoDB…
              </div>
            ) : (
              <>
                {active === "dashboard" && <SimpleDashboard jobs={jobs} onNavigate={handleNavigate} />}
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
              </>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
