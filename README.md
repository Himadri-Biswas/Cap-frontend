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
