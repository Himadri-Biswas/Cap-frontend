/**
 * demoData.js — the job posts and demo applications the seed writes.
 *
 * The four original mock jobs are kept verbatim (same ids, titles, dates and
 * skills as src/mocks/jobs.js) so nothing that referenced them shifts, and
 * each one gains the long-form `description` module 1 ranking and module 2 gap
 * analysis actually need.
 *
 * The demo applications are deliberately chosen to light up every tag state at
 * once, so the admin UI is demoable the moment the seed finishes:
 *   • one FORMER EMPLOYEE returning        → positive tag
 *   • one PREVIOUSLY REJECTED re-applicant → negative tag
 *   • one plain first-time applicant       → no tag
 */

export const JOBS = [
  {
    id: "J201",
    title: "Data Scientist",
    dept: "Data",
    location: "Dhaka, BD",
    created: "2026-02-06",
    deadline: "2026-02-20",
    summary:
      "Build predictive models, improve HR analytics, and support data-driven decision making across hiring and retention.",
    skills: ["Python", "SQL", "Machine Learning", "Statistics", "Communication"],
    experienceLevel: "Mid-Level",
    openings: 2,
    salaryMin: 4500,
    salaryMax: 7000,
    description: `Data Scientist — Data Team

We are looking for a Data Scientist to build predictive models that improve HR analytics and support data-driven decision making across hiring and retention.

Responsibilities:
- Design, train and evaluate supervised models on structured HR data
- Build and maintain SQL data pipelines feeding the analytics layer
- Run statistical analyses and A/B tests to validate people-operations changes
- Communicate findings to non-technical stakeholders with clear visualisations

Required skills: Python, SQL, Machine Learning, Statistics, Communication.
Preferred: scikit-learn, pandas, experiment design, data visualization, feature engineering.
Experience: 3+ years in an analytics or data science role.`,
    responsibilities: [
      "Design, train and evaluate supervised models on structured HR data",
      "Build and maintain SQL data pipelines",
      "Run statistical analyses and A/B tests",
      "Communicate findings to non-technical stakeholders",
    ],
    qualifications: ["3+ years in analytics or data science", "Strong Python and SQL", "Solid grounding in statistics"],
  },
  {
    id: "J202",
    title: "Backend Engineer",
    dept: "IT",
    location: "Remote",
    created: "2026-01-28",
    deadline: "2026-02-18",
    summary:
      "Develop scalable APIs and services, maintain reliability, and collaborate with product teams to ship features.",
    skills: ["Node.js", "Microservices", "Redis", "System Design", "CI/CD"],
    experienceLevel: "Senior",
    openings: 3,
    salaryMin: 5500,
    salaryMax: 9000,
    description: `Backend Engineer — IT

Develop scalable APIs and services, maintain reliability, and collaborate with product teams to ship features end to end.

Responsibilities:
- Design and build RESTful services in Node.js
- Decompose monolithic workloads into well-bounded microservices
- Own caching strategy with Redis and keep p99 latency within SLO
- Improve CI/CD pipelines and deployment safety

Required skills: Node.js, Microservices, Redis, System Design, CI/CD.
Preferred: PostgreSQL, Docker, Kubernetes, observability, message queues.
Experience: 5+ years building production backend systems.`,
    responsibilities: [
      "Design and build RESTful services in Node.js",
      "Decompose monolithic workloads into microservices",
      "Own caching strategy with Redis",
      "Improve CI/CD pipelines",
    ],
    qualifications: ["5+ years backend experience", "Strong system design", "Production on-call experience"],
  },
  {
    id: "J203",
    title: "Product Designer",
    dept: "Product",
    location: "Dhaka, BD",
    created: "2026-01-15",
    deadline: "2026-02-01",
    summary:
      "Design user-centered workflows, create prototypes, and improve product usability across web dashboards.",
    skills: ["Figma", "UX Research", "Prototyping", "Design Systems"],
    experienceLevel: "Mid-Level",
    openings: 1,
    salaryMin: 3800,
    salaryMax: 6000,
    description: `Product Designer — Product

Design user-centered workflows, create prototypes, and improve product usability across our web dashboards.

Responsibilities:
- Run discovery and usability sessions with real users
- Produce high-fidelity prototypes in Figma
- Extend and maintain the shared design system
- Partner with engineering through implementation and QA

Required skills: Figma, UX Research, Prototyping, Design Systems.
Preferred: accessibility (WCAG), interaction design, motion design, HTML/CSS literacy.
Experience: 3+ years designing data-dense web products.`,
    responsibilities: [
      "Run discovery and usability sessions",
      "Produce high-fidelity Figma prototypes",
      "Maintain the design system",
      "Partner with engineering through delivery",
    ],
    qualifications: ["3+ years product design", "Portfolio of data-dense interfaces", "Strong systems thinking"],
  },
  {
    id: "J204",
    title: "ML Engineer (NLP)",
    dept: "AI",
    location: "Remote",
    created: "2026-01-05",
    deadline: "2026-01-25",
    summary:
      "Build and deploy NLP pipelines, fine-tune transformer models, and optimize inference for production.",
    skills: ["Python", "PyTorch", "Transformers", "MLOps"],
    experienceLevel: "Senior",
    openings: 2,
    salaryMin: 6000,
    salaryMax: 10000,
    description: `ML Engineer (NLP) — AI

Build and deploy NLP pipelines, fine-tune transformer models, and optimise inference for production workloads.

Responsibilities:
- Fine-tune and evaluate transformer models for entity extraction and classification
- Build reproducible training pipelines and model registries
- Optimise inference latency and cost for serving
- Ship models behind versioned APIs with monitoring

Required skills: Python, PyTorch, Transformers, MLOps.
Preferred: HuggingFace, ONNX, quantisation, vector databases, Docker, FastAPI.
Experience: 4+ years in applied machine learning.`,
    responsibilities: [
      "Fine-tune and evaluate transformer models",
      "Build reproducible training pipelines",
      "Optimise inference latency and cost",
      "Ship models behind versioned APIs",
    ],
    qualifications: ["4+ years applied ML", "Deep PyTorch knowledge", "Production model deployment experience"],
  },
  {
    id: "J205",
    title: "HR Operations Specialist",
    dept: "HR",
    location: "Dhaka, BD",
    created: "2026-02-01",
    deadline: "2026-03-15",
    summary:
      "Own onboarding, HRIS hygiene and people analytics reporting for a fast-growing engineering organisation.",
    skills: ["HRIS", "Onboarding", "Employee Relations", "Excel", "Communication"],
    experienceLevel: "Junior",
    openings: 1,
    salaryMin: 2200,
    salaryMax: 3500,
    description: `HR Operations Specialist — HR

Own onboarding, HRIS hygiene and people analytics reporting for a fast-growing engineering organisation.

Responsibilities:
- Run end-to-end onboarding and offboarding
- Keep HRIS records accurate and audit-ready
- Produce monthly headcount, attrition and hiring reports
- Act as first point of contact for employee relations questions

Required skills: HRIS, Onboarding, Employee Relations, Excel, Communication.
Preferred: SQL basics, data visualization, policy writing.
Experience: 1+ year in an HR operations role.`,
    responsibilities: [
      "Run onboarding and offboarding",
      "Keep HRIS records audit-ready",
      "Produce monthly people reports",
      "Handle first-line employee relations",
    ],
    qualifications: ["1+ year HR operations", "Strong attention to detail", "Comfortable with spreadsheets"],
  },
  {
    id: "J206",
    title: "Data Engineer",
    dept: "Data Platform",
    location: "Hybrid",
    created: "2026-02-03",
    deadline: "2026-03-20",
    summary:
      "Build and operate the batch and streaming pipelines that feed every analytics and ML workload in the company.",
    skills: ["Python", "SQL", "Data Modeling", "ETL", "Airflow", "Cloud"],
    experienceLevel: "Mid-Level",
    openings: 2,
    salaryMin: 5000,
    salaryMax: 8000,
    description: `Data Engineer — Data Platform

Build and operate the batch and streaming pipelines that feed every analytics and ML workload in the company.

Responsibilities:
- Model warehouse schemas that stay usable as the business changes
- Build and schedule ETL with Airflow
- Operate cloud data infrastructure with cost discipline
- Guarantee data quality with tests and contracts

Required skills: Python, SQL, Data Modeling, ETL, Airflow, Cloud.
Preferred: dbt, Spark, Kafka, Terraform, data quality frameworks.
Experience: 3+ years in data engineering.`,
    responsibilities: [
      "Model warehouse schemas",
      "Build and schedule ETL with Airflow",
      "Operate cloud data infrastructure",
      "Guarantee data quality with tests",
    ],
    qualifications: ["3+ years data engineering", "Strong SQL and Python", "Cloud platform experience"],
  },
];

/**
 * Demo applicants. `formerEmployee: true` means the seeder reuses a real
 * `former` employee's email so the POSITIVE tag is derived by the same code
 * path a genuine returning applicant would take — nothing is faked.
 */
export const DEMO_APPLICANTS = [
  {
    jobId: "J201",
    name: "Howard Anuron",
    email: "howard.anuron@example.com",
    skills: ["Python", "SQL", "Pandas", "Machine Learning", "Statistics", "Data Visualization"],
    currentTitle: "Senior Data Analyst",
    yearsExperience: 6,
    location: "Dhaka, BD",
    daysAgo: 9,
    coverLetter:
      "Six years turning messy people-data into decisions leaders actually act on. I have shipped retention models end to end and would love to do it here.",
  },
  {
    jobId: "J201",
    name: "Nusrat Jahan",
    email: "nusrat.jahan@example.com",
    skills: ["SQL", "PowerBI", "Excel", "Reporting", "Communication"],
    currentTitle: "BI Analyst",
    yearsExperience: 4,
    location: "Dhaka, BD",
    daysAgo: 7,
    previouslyRejected: true,
    coverLetter:
      "I applied last cycle and was told to deepen my modelling experience. Since then I have completed two production forecasting projects.",
  },
  {
    jobId: "J201",
    name: "Rahat Ahmed",
    email: "rahat.ahmed@example.com",
    skills: ["Python", "SQL", "Statistics", "A/B Testing", "Feature Engineering"],
    currentTitle: "Data Scientist",
    yearsExperience: 5,
    location: "Remote",
    daysAgo: 4,
    formerEmployee: true,
    coverLetter:
      "I spent four years on the analytics team here before leaving to lead experimentation at a fintech. I would like to come back and bring that with me.",
  },
  {
    jobId: "J202",
    name: "Siam Ahmed",
    email: "siam.ahmed@example.com",
    skills: ["Node.js", "REST API", "PostgreSQL", "Redis", "Docker", "CI/CD", "System Design"],
    currentTitle: "Senior Backend Engineer",
    yearsExperience: 7,
    location: "Remote",
    daysAgo: 11,
    coverLetter: "I have run Node services at ~40k rps and care a great deal about the boring parts: observability, rollbacks and on-call load.",
  },
  {
    jobId: "J202",
    name: "Tanvir Hossain",
    email: "tanvir.hossain@example.com",
    skills: ["Node.js", "Express", "MongoDB", "Git", "Testing"],
    currentTitle: "Backend Engineer",
    yearsExperience: 3,
    location: "Dhaka, BD",
    daysAgo: 6,
    previouslyRejected: true,
    coverLetter: "Re-applying after a year of focused work on distributed systems and a production Kubernetes migration.",
  },
  {
    jobId: "J204",
    name: "Mahira Khan",
    email: "mahira.khan@example.com",
    skills: ["Python", "PyTorch", "Transformers", "HuggingFace", "MLOps", "Docker"],
    currentTitle: "ML Engineer",
    yearsExperience: 5,
    location: "Remote",
    daysAgo: 14,
    formerEmployee: true,
    coverLetter: "I built the first version of the entity-extraction service here. I have spent two years since on inference optimisation.",
  },
  {
    jobId: "J204",
    name: "Samiul Karim",
    email: "samiul.karim@example.com",
    skills: ["Python", "TensorFlow", "NLP", "Data Visualization", "Communication"],
    currentTitle: "Research Assistant",
    yearsExperience: 2,
    location: "Dhaka, BD",
    daysAgo: 3,
    coverLetter: "Fresh out of a research group where I published on low-resource NER. Eager to move into production ML.",
  },
  {
    jobId: "J205",
    name: "Farhana Islam",
    email: "farhana.islam@example.com",
    skills: ["HRIS", "Onboarding", "Excel", "Employee Relations", "Communication", "Recruiting"],
    currentTitle: "HR Coordinator",
    yearsExperience: 2,
    location: "Dhaka, BD",
    daysAgo: 2,
    coverLetter: "Two years running onboarding for a 200-person org, and the person people ask when the HRIS does something strange.",
  },
  {
    jobId: "J206",
    name: "Zayan Chowdhury",
    email: "zayan.chowdhury@example.com",
    skills: ["Python", "SQL", "Airflow", "ETL", "Data Modeling", "AWS", "dbt"],
    currentTitle: "Data Engineer",
    yearsExperience: 4,
    location: "Hybrid",
    daysAgo: 5,
    coverLetter: "I like pipelines that page nobody. Four years of Airflow, dbt and warehouse modelling.",
  },
];

/** Builds a plain-text CV so demo applications have real, viewable files. */
export function buildDemoCvText(applicant, job) {
  return `${applicant.name}
${applicant.currentTitle} | ${applicant.location} | ${applicant.email}

PROFESSIONAL SUMMARY
${applicant.coverLetter}

EXPERIENCE
${applicant.currentTitle} — ${applicant.yearsExperience} years total professional experience.
Applied for: ${job.title} (${job.dept}).

SKILLS
${applicant.skills.join(", ")}

EDUCATION
BSc in Computer Science and Engineering.

University: Bangladesh University of Engineering and Technology
University Tier: Tier 1
Gender: ${applicant.gender || "Not specified"}
Skin Color: Not specified
Ethnicity: South Asian
`;
}
