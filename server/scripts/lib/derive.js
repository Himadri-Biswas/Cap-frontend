/**
 * derive.js — turns a raw dataset.csv row into a display-ready employee.
 *
 * The IBM HR dataset has no names, emails or skills — only EmployeeNumber and
 * 34 features. The UI needs all three. Everything here is DETERMINISTIC (keyed
 * off EmployeeNumber), so the same row always produces the same person: seeds
 * are reproducible and re-running never scrambles who is who.
 */

const FIRST_NAMES_F = [
  "Aisha", "Priya", "Sarah", "Nusrat", "Maria", "Lena", "Fatima", "Grace", "Hannah", "Ivy",
  "Julia", "Kavya", "Leila", "Mira", "Nadia", "Olivia", "Paula", "Rania", "Sofia", "Tara",
  "Uma", "Vera", "Wendy", "Yasmin", "Zara", "Amara", "Bianca", "Chloe", "Dalia", "Elena",
];
const FIRST_NAMES_M = [
  "Marcus", "Rahul", "David", "Tanvir", "Omar", "Liam", "Hassan", "Noah", "Ethan", "Farhan",
  "Gabriel", "Hugo", "Imran", "Jonas", "Karim", "Lucas", "Mateo", "Nabil", "Oscar", "Pavel",
  "Qasim", "Rafael", "Samir", "Theo", "Usman", "Victor", "Wasim", "Xavier", "Yusuf", "Zaid",
];
const LAST_NAMES = [
  "Johnson", "Kim", "Patel", "Hossain", "Garcia", "Novak", "Rahman", "Chen", "Okafor", "Silva",
  "Andersen", "Bakker", "Costa", "Dubois", "Eriksson", "Fernandez", "Gupta", "Haddad", "Ivanov", "Jensen",
  "Khan", "Lopez", "Muller", "Nakamura", "Oliveira", "Petrov", "Quinn", "Rossi", "Santos", "Tanaka",
  "Ueda", "Vargas", "Weber", "Yamamoto", "Zhang", "Ahmed", "Brown", "Clarke", "Diaz", "Evans",
];
const MANAGERS = [
  "D. Martinez", "A. Rahman", "S. Whitfield", "M. Hasan", "L. Okonkwo", "R. Castellanos",
  "T. Nakamura", "J. Petrov", "K. Andersson", "P. Sharma", "N. Boateng", "C. Lindqvist",
];
const LOCATIONS = [
  "New York, US", "Austin, US", "London, UK", "Berlin, DE", "Dhaka, BD", "Bangalore, IN",
  "Toronto, CA", "Singapore, SG", "Dublin, IE", "Amsterdam, NL", "Sydney, AU", "Lisbon, PT",
];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Skills implied by an IBM job role, so module 2 has something real to work with. */
const ROLE_SKILLS = {
  "Sales Executive": ["Sales Strategy", "Client Relations", "CRM", "Negotiation", "Pipeline Mgmt"],
  "Research Scientist": ["Python", "Statistics", "Experimental Design", "Data Analysis", "Scientific Writing"],
  "Laboratory Technician": ["Lab Operations", "Quality Control", "Sample Analysis", "Documentation", "Safety Compliance"],
  "Manufacturing Director": ["Operations Management", "Lean Manufacturing", "Supply Chain", "Budgeting", "Leadership"],
  "Healthcare Representative": ["Medical Sales", "Account Management", "Product Training", "Communication", "CRM"],
  Manager: ["People Management", "Budgeting", "Stakeholder Management", "Strategic Planning", "Coaching"],
  "Sales Representative": ["Prospecting", "Cold Outreach", "CRM", "Negotiation", "Customer Success"],
  "Research Director": ["Research Strategy", "Grant Writing", "Team Leadership", "Statistics", "Publication"],
  "Human Resources": ["Recruiting", "Employee Relations", "HRIS", "Onboarding", "Policy Design"],
};
const FALLBACK_SKILLS = ["Communication", "Problem Solving", "Excel", "Teamwork", "Time Management"];

/** Extra technical skills mixed in by education field, for gap-analysis variety. */
const FIELD_SKILLS = {
  "Life Sciences": ["Biostatistics", "Lab Automation"],
  Medical: ["Clinical Research", "Patient Data"],
  Marketing: ["Market Research", "Campaign Analytics"],
  "Technical Degree": ["SQL", "Python", "Data Visualization"],
  Other: ["Project Coordination"],
  "Human Resources": ["Talent Acquisition", "Compensation Design"],
};

/** Small deterministic hash so every derived field is stable per employee. */
function hash(n, salt = 0) {
  let x = (n * 2654435761 + salt * 40503) >>> 0;
  x ^= x >>> 15;
  x = (x * 2246822507) >>> 0;
  x ^= x >>> 13;
  return x >>> 0;
}

const pick = (arr, n, salt) => arr[hash(n, salt) % arr.length];

export function deriveDisplayFields(row, { baseYear = 2026 } = {}) {
  const n = Number(row.EmployeeNumber);
  const firstPool = row.Gender === "Female" ? FIRST_NAMES_F : FIRST_NAMES_M;
  const firstName = pick(firstPool, n, 1);
  const lastName = pick(LAST_NAMES, n, 2);
  const name = `${firstName} ${lastName}`;

  const years = Number(row.YearsAtCompany) || 0;
  const joinYear = baseYear - years;
  const joinMonth = MONTHS[hash(n, 3) % 12];

  const sincePromotion = Number(row.YearsSinceLastPromotion) || 0;
  const promoYear = baseYear - sincePromotion;
  const promoMonth = MONTHS[hash(n, 4) % 12];

  const distance = Number(row.DistanceFromHome) || 0;
  const workMode = distance >= 16 ? "Remote" : distance >= 8 ? "Hybrid" : "On-site";

  const roleSkills = ROLE_SKILLS[row.JobRole] || FALLBACK_SKILLS;
  const fieldSkills = FIELD_SKILLS[row.EducationField] || [];
  const skills = [...new Set([...roleSkills, ...fieldSkills])].slice(0, 7);

  return {
    id: `EMP${String(n).padStart(4, "0")}`,
    initials: `${firstName[0]}${lastName[0]}`.toUpperCase(),
    name,
    email: `${firstName}.${lastName}${n}@talentpulse.io`.toLowerCase(),
    location: pick(LOCATIONS, n, 5),
    manager: pick(MANAGERS, n, 6),
    workMode,
    joined: `${joinMonth} ${joinYear}`,
    lastPromotion: `${promoMonth} ${promoYear}`,
    skills,
  };
}

/**
 * Parses dataset.csv. The IBM file has no quoted fields or embedded commas,
 * but the quote-aware split below costs nothing and keeps the parser honest if
 * anyone edits the CSV later.
 */
export function parseCsv(text) {
  const clean = text.replace(/^﻿/, "").replace(/\r\n/g, "\n").trim();
  const lines = clean.split("\n");
  const headers = splitCsvLine(lines[0]);

  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    if (!lines[i].trim()) continue;
    const cells = splitCsvLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      const raw = cells[idx];
      // Numbers stay numbers — the ML backends' pydantic models expect ints.
      row[h] = raw !== undefined && raw !== "" && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
    });
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line) {
  const out = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      out.push(current.trim());
      current = "";
    } else current += ch;
  }
  out.push(current.trim());
  return out;
}
