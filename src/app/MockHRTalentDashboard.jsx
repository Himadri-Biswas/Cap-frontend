import React, { useState } from "react";
import { motion } from "framer-motion";
import Sidebar from "../features/layout/Sidebar.jsx";
import Topbar from "../features/layout/Topbar.jsx";
import SimpleDashboard from "../features/dashboard/SimpleDashboard.jsx";
import EmployeesView from "../features/employees/EmployeesView.jsx";
import JobPostsOnly from "../features/recruitment/JobPostsOnly.jsx";
import UpskillingView from "../features/upskilling/UpskillingView.jsx";
import { mockJobs } from "../mocks/jobs.js";
import { ibmEmployees } from "../data/ibmEmployees.js";

export default function MockHRTalentDashboard() {
  const [active, setActive] = useState("dashboard");
  const [search, setSearch] = useState("");

  const jobs = mockJobs;
  const employees = ibmEmployees;

  const titles = {
    dashboard: {
      t: "Dashboard",
      s: "",
      ph: "Search...",
    },
    employees: {
      t: "Employees",
      s: "",
      ph: "Search employees by name, position, or email...",
    },
    recruitment: {
      t: "Job Recruitment",
      s: "",
      ph: "Search jobs by title, dept, location...",
    },
    upskilling: {
      t: "Upskilling",
      s: "Plan learning paths under time & budget constraints.",
      ph: "Search jobs or employees...",
    },
  };

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
              title={titles[active].t}
              subtitle={titles[active].s}
              search={search}
              setSearch={setSearch}
              placeholder={titles[active].ph}
              showSearch={active !== "dashboard"}
              showNew={active === "recruitment"}
            />

            {active === "dashboard" && <SimpleDashboard jobs={jobs} />}
            {active === "employees" && <EmployeesView employees={employees} search={search} setSearch={setSearch} />}
            {active === "recruitment" && <JobPostsOnly jobs={jobs} search={search} setSearch={setSearch} />}
            {active === "upskilling" && <UpskillingView jobs={jobs} employees={employees} search={search} setSearch={setSearch} />}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
