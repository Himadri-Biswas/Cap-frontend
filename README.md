# TalentPulse-Bias-Aware Resume Screening(Module 1)
TalentPulse predicts similarlity between a candidate's resume and the job description, while also providing bias-aware explanations to ensure fair hiring decisions.

---
    Currently ,We just implemented the CV Extraction ,in the next phase we will implement the bias-aware explainability and the similarity scoring using embeddings and cosine similarity.

---

### How It Works
**CV Extraction**: We currently Use gliner and BERT model in combination to extract skills from the candidate's resume. GLiner is a powerful tool for extracting structured information from unstructured text, making it ideal for parsing resumes and identifying relevant skills.
Before we used only BERT-based model for CV extraction but it was not performing well and was giving us bad results, so we switched to gliner and it is giving us much better results.

We need to configure gliner levels more comprehensively and train BERT using more varied data to extract more skills and other relevant information from the resumes. 

**Current Status**: Currently,We do this

This module takes a resume and:

1. Extracts readable text from the file
2. Runs an AI model to detect skill entities
3. Cleans and filters the extracted skills
4. Returns a structured JSON response

The result is a **reliable list of skills categorized by type**, along with confidence scores.

---

## Supported Resume Formats

The API currently supports:

- **PDF (.pdf)**
- **Word documents (.docx)**
- **Plain text (.txt)**

Each file type is parsed and converted into normalized text before skill extraction begins. :contentReference[oaicite:0]{index=0}

---

## Skill Extraction Model

The system  identifies skills across categories such as:

- Programming Languages
- Frameworks
- Databases
- DevOps Tools
- Machine Learning Concepts
- Soft Skills
- Methodologies
We need to configure gliner levels more comprehensively and fine tuning bert  to extract more skills and other relevant information from the resumes.

Each detected skill is returned with:

- its **name**
- its **category**
- a **confidence score**

Low-confidence predictions are filtered using a configurable threshold to ensure higher quality results. :contentReference[oaicite:1]{index=1}

---

## Cleaning and Normalizing Skills

Model predictions can sometimes include noise or inconsistent formatting.  
To improve quality, the system performs several cleanup steps before returning results:

- Removing punctuation artifacts
- Normalizing whitespace
- Converting skill names to lowercase
- Filtering common non-skill words
- Removing numeric-only entities
- Ignoring extremely long phrases

These steps ensure the final output contains **clean and meaningful skill names**.

---

## Handling Long Resumes

Some resumes are very long and may exceed the model's optimal input size.

To handle this efficiently:

- The resume text is split into **smaller chunks**
- Each chunk is analyzed separately
- Detected skills are merged afterward
- The **highest confidence score** for each skill is retained

This allows the system to process long resumes **without losing accuracy**. :contentReference[oaicite:2]{index=2}

---

## Example Response

A typical response looks like this:

```json
{
  "filename": "resume.pdf",
  "extractor": "gliner",
  "total": 8,
  "skills": [
    {"name": "python", "category": "programming language", "score": 0.94},
    {"name": "pytorch", "category": "framework", "score": 0.88},
    {"name": "docker", "category": "devops tool", "score": 0.81}
  ]
}
```




# TalentPulse — Employee Attrition Prediction (Module 3)

TalentPulse predicts the likelihood of an employee leaving the company and explains *why* and *what can be done about it* — all in real time.

---

## How It Works

### 🔧 Feature Engineering
Raw HR data alone isn't enough. Before feeding anything into the model, the system creates four extra signals that capture more meaningful patterns:

- **Income vs. Department Average** — Is this employee underpaid compared to colleagues in the same department?
- **Promotion Stagnation** — How long has the employee been at the company without a promotion?
- **Burnout Risk** — A combined signal of overtime and poor work-life balance.
- **Overall Satisfaction** — An average across job satisfaction, environment, relationships, and work-life balance.

These engineered features give the model a richer picture than raw columns alone.

---

### 🌲 XGBoost — Attrition Risk Prediction
An **XGBoost** classifier is trained to predict the probability that an employee will leave. It outputs:

- A **risk score** (0–100%) — how likely is this employee to leave?
- A **risk tier** — Low / Medium / High / Critical

XGBoost was chosen because it handles tabular HR data well, is robust to class imbalance, and produces reliable probability estimates.

---

### 🔍 SHAP — Why Is This Employee at Risk?
SHAP (SHapley Additive exPlanations) explains the model's prediction for each individual employee. It answers:

> *"Which features are pushing this employee's risk score up or down — and by how much?"*

The system returns the **top 5 contributing features** for each employee, with a direction (increasing risk vs. protective). This helps HR understand the specific reasons behind a score rather than treating the model as a black box.

---

### 🎲 DiCE — What Can HR Do About It?
DiCE (Diverse Counterfactual Explanations) goes one step further and asks:

> *"What would need to change for this employee's risk to drop significantly?"*

It generates **3 intervention plans**:

- **Plan 1** — The single most impactful change HR can make
- **Plan 2** — An alternative single change (in case Plan 1 isn't feasible)
- **Plan 3** — A combined two-change intervention for maximum risk reduction

Only features that HR can realistically act on are considered — things like overtime, salary, job satisfaction, promotions, and training. Immutable attributes like age or gender are never suggested..

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Prediction model | XGBoost |
| Explainability | SHAP (TreeExplainer) |
| Interventions | Custom DiCE-style engine |
| API | FastAPI (Python) |
| Dataset | IBM HR Analytics (1,470 employees) |

---

# TalentPulse — Learning Path Recommendation (Module 2)

Given an employee's current skills and a target job (an existing posting or
a freeform description), Module 2 recommends a personalized, ordered
learning path — under a time and budget constraint — to close the gap.

---

## How It Works

### 🔎 Skill Extraction
Resume/JD text is run through **GLiNER** (zero-shot NER), then normalized
against a canonical skill vocabulary (72 skills, 197 aliases, fuzzy-matched
with Jaro-Winkler similarity) so "TF", "tensorflow" and "TensorFlow" all
resolve to the same skill.

### 📊 Gap Analysis
For each required skill: proficiency shortfall is computed, with **partial
credit** if the employee has a semantically related skill (via Sentence-BERT
cosine similarity) — e.g. knowing Vue.js reduces the effective gap for
React. **Transferability** (graph + semantic neighbors already known) feeds
into a learning-time estimate and a priority score
(`criticality × gap / transferability`).

### 🎯 Course Recommendation
Courses are embedded with Sentence-BERT and semantically matched to each
gap, then greedily selected under a **time budget + money budget +
prerequisite** constraint, and topologically sorted into a valid learning
order.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Skill extraction | GLiNER (`gliner-community/gliner_large-v2.5`) |
| Semantic similarity | Sentence-BERT (`all-mpnet-base-v2`) |
| Course/skill graph | NetworkX |
| API | FastAPI (Python), see `ml-backends/module2/` |
| Data | Synthetic employee/JD/course catalog (`notebooks/data/`) |

## Frontend integration

The "Upskilling" tab (`src/features/upskilling/UpskillingView.jsx`) calls
the Module 2 API directly, following the same pattern as Module 1/3: set
`VITE_MODULE2_API_URL` in `.env.local`, pick an employee + target job (or
write a custom job description), then "Generate Learning Path". See
`ml-backends/module2/README.md` for running the backend locally and deploying it to
HuggingFace Spaces.

---

# Deploying to Vercel

## Repository layout Vercel cares about

| Path | What Vercel does with it |
|------|--------------------------|
| `api/[...path].js` | The one and only Serverless Function. Every `/api/...` request lands here and is handed to `server/app.js` (Express + MongoDB + Clerk). |
| `server/` | Imported by that function, bundled with it. Never started as a process — `server/index.js` is for `npm run dev` / `npm start` only. |
| `dist/` | The Vite build output, served as static files. |
| `ml-backends/module2/` | Reference source for the module-2 HuggingFace Space. Excluded from the deployment by `.vercelignore`. |

**Nothing except `[...path].js` may live in `api/`.** Vercel turns every file in
that directory into a Serverless Function and picks a runtime from the file
extensions it finds there. The module-2 Python backend used to sit in `api/`,
and its `requirements.txt` made Vercel try to build `app.py` with the Python
runtime — torch + transformers + gliner bundle to several GB, far past the size
limit, so the build failed and *no* function was published at all. Every
`/api/...` call then fell through to Vercel's static router and came back as the
platform 404 page:

> The page could not be found  NOT_FOUND  bom1::xxxxx-…

which the UI surfaced as an error inside the panel that made the call. Running
locally never showed it, because `npm run dev` starts the Express server itself
and Vite proxies `/api` to it (see `vite.config.js`) — the serverless packaging
step that was failing simply does not exist locally.

## Environment variables to set in the Vercel project

`.env.local` is git-ignored, so none of it reaches Vercel. Add these under
**Project → Settings → Environment Variables** (Production *and* Preview):

| Variable | Needed by | Notes |
|----------|-----------|-------|
| `MONGO_URI` | server | Atlas connection string. Without it every `/api` call fails at connect time. |
| `MONGO_DB_NAME` | server | Defaults to `IBM_HR_Analytics`. |
| `CLERK_SECRET_KEY` | server | Session verification. |
| `CLERK_PUBLISHABLE_KEY` | server | |
| `ADMIN_EMAILS` | server | Comma-separated; these accounts get `admin` on first sign-in. |
| `VITE_CLERK_PUBLISHABLE_KEY` | build | Baked into the bundle at build time. |
| `VITE_API_URL` | build | Module 3 Space. |
| `VITE_MODULE1_API_URL` | build | Module 1 skill extractor Space. |
| `VITE_MODULE1_RANKING_API_URL` | build | Module 1 ranking / debiasing Space. |
| `VITE_MODULE2_API_URL` | build | Module 2 Space. |

Leave `VITE_SERVER_URL` unset: the browser then calls `/api/...` on the same
origin, which is what the catch-all function serves.

`AUTH_DISABLED` must **never** be set in a deployed environment — it is the
local-demo escape hatch that trusts an `x-demo-email` header.

## Checking a deployment

`GET https://<your-app>.vercel.app/api/health` should return JSON with
`mongo.connected: true`. If it returns Vercel's HTML 404 page instead, the
function was not published — check the build log for a Python or size error
before looking anywhere else.
