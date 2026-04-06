# TalentPulse-Bias-Aware Resume Screening(Module 1)
TalentPulse predicts similarlity between a candidate's resume and the job description, while also providing bias-aware explanations to ensure fair hiring decisions.

---
    Currently ,We just implemented the CV Extraction ,in the next phase we will implement the bias-aware explainability and the similarity scoring using embeddings and cosine similarity.

---

### How It Works
**CV Extraction**: We currently Use gliner model to extract skills from the candidate's resume. GLiner is a powerful tool for extracting structured information from unstructured text, making it ideal for parsing resumes and identifying relevant skills.
Before we used BERT-based model for CV extraction but it was not performing well and was giving us bad results, so we switched to gliner and it is giving us much better results.

We need to configure gliner levels more comprehensively to extract more skills and other relevant information from the resumes. 

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

The system uses **GLiNER**, a general-purpose named entity recognition model that performs well for domain-specific entity extraction.

It identifies skills across categories such as:

- Programming Languages
- Frameworks
- Databases
- DevOps Tools
- Machine Learning Concepts
- Soft Skills
- Methodologies
We need to configure gliner levels more comprehensively to extract more skills and other relevant information from the resumes.

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

Only features that HR can realistically act on are considered — things like overtime, salary, job satisfaction, promotions, and training. Immutable attributes like age or gender are never suggested.

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Prediction model | XGBoost |
| Explainability | SHAP (TreeExplainer) |
| Interventions | Custom DiCE-style engine |
| API | FastAPI (Python) |
| Dataset | IBM HR Analytics (1,470 employees) |
