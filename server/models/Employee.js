/**
 * Employee — collection `employees` (MODULE 3, shared with the teammate's
 * FastAPI backend).
 *
 * Every field your teammate's backend reads is preserved byte-for-byte:
 * the 34 raw IBM HR columns plus his display fields (id, initials, name,
 * email, location, manager, workMode, joined, skills). His `GET /employees`
 * does `{"$project": {"_id": 0, "pred": 0}}` and `**emp`, so the extra
 * lifecycle fields added below simply flow through his API untouched.
 *
 * ADDED HERE (all optional, all additive):
 *   - employmentStatus / exitDate / exitReason  → drives the module-1
 *     "former employee re-applying" POSITIVE tag
 *   - clerkUserId / userEmail                   → links an Employee row to a
 *     Clerk login so a `current employee` sees their own record
 *   - lastPromotion                             → already rendered by
 *     EmployeesView but was missing from the DB
 */
import mongoose from "mongoose";

const RAW_FEATURE_DEFS = {
  Age: Number,
  BusinessTravel: String,
  DailyRate: Number,
  Department: String,
  DistanceFromHome: Number,
  Education: Number,
  EducationField: String,
  EmployeeCount: Number,
  EnvironmentSatisfaction: Number,
  Gender: String,
  HourlyRate: Number,
  JobInvolvement: Number,
  JobLevel: Number,
  JobRole: String,
  JobSatisfaction: Number,
  MaritalStatus: String,
  MonthlyIncome: Number,
  MonthlyRate: Number,
  NumCompaniesWorked: Number,
  Over18: String,
  OverTime: String,
  PercentSalaryHike: Number,
  PerformanceRating: Number,
  RelationshipSatisfaction: Number,
  StandardHours: Number,
  StockOptionLevel: Number,
  TotalWorkingYears: Number,
  TrainingTimesLastYear: Number,
  WorkLifeBalance: Number,
  YearsAtCompany: Number,
  YearsInCurrentRole: Number,
  YearsSinceLastPromotion: Number,
  YearsWithCurrManager: Number,
};

/** The exact ordered payload EmployeesView POSTs to module 3 `/infer`. */
export const RAW_FEATURE_KEYS = Object.keys(RAW_FEATURE_DEFS);

/** Numeric features a DiCE counterfactual is allowed to move live. */
export const MUTABLE_NUMERIC_FEATURES = [
  "DistanceFromHome",
  "MonthlyIncome",
  "MonthlyRate",
  "DailyRate",
  "HourlyRate",
  "PercentSalaryHike",
  "StockOptionLevel",
  "TrainingTimesLastYear",
  "WorkLifeBalance",
  "JobSatisfaction",
  "EnvironmentSatisfaction",
  "RelationshipSatisfaction",
  "JobInvolvement",
  "JobLevel",
  "YearsSinceLastPromotion",
  "YearsInCurrentRole",
  "YearsWithCurrManager",
  "PerformanceRating",
  "Education",
];

/** Categorical features a DiCE counterfactual is allowed to move live. */
export const MUTABLE_CATEGORICAL_FEATURES = {
  OverTime: ["Yes", "No"],
  BusinessTravel: ["Non-Travel", "Travel_Rarely", "Travel_Frequently"],
  JobRole: null, // any string accepted
  Department: null,
};

const employeeSchema = new mongoose.Schema(
  {
    // ── Identity / display (teammate's fields) ──────────────────────────────
    EmployeeNumber: { type: Number, required: true, unique: true, index: true },
    id: { type: String, index: true }, // "EMP0001"
    initials: String,
    name: String,
    email: { type: String, lowercase: true, trim: true, index: true },
    location: String,
    manager: String,
    workMode: String, // On-site | Hybrid | Remote
    joined: String, // "Mar 2018"
    skills: { type: [String], default: [] },

    // ── 34 raw IBM HR feature columns ──────────────────────────────────────
    ...RAW_FEATURE_DEFS,

    // ── Additive lifecycle fields (new) ────────────────────────────────────
    lastPromotion: String,
    employmentStatus: {
      type: String,
      enum: ["active", "former", "on_leave"],
      default: "active",
      index: true,
    },
    exitDate: Date,
    exitReason: String,
    rehireEligible: { type: Boolean, default: true },

    // Link to a Clerk login (a "current employee" account)
    clerkUserId: { type: String, index: true, sparse: true },
    userEmail: { type: String, lowercase: true, trim: true },

    // Denormalised pointer so lists can sort by risk without a $lookup
    latestPredictionAt: Date,
    lastInterventionAt: Date,

    source: { type: String, default: "dataset.csv" },
  },
  { timestamps: true, collection: "employees", strict: false, minimize: false }
);

employeeSchema.index({ Department: 1, JobRole: 1 });
employeeSchema.index({ employmentStatus: 1, Department: 1 });

export const Employee = mongoose.model("Employee", employeeSchema);
