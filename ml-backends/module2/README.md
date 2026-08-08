---
title: Module 2 Learning Path API
emoji: 🎓
colorFrom: indigo
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
license: mit
---

# Module 2 — Learning Path Recommendation API

Given a resume and a job description (free text), this service:

1. Extracts skills from both using GLiNER zero-shot NER, normalized against
   a canonical skill vocabulary.
2. Computes a skill gap analysis (proficiency shortfall, semantic partial
   credit for related skills, transferability, priority, learning-hour
   estimate) between the candidate and the job.
3. Recommends an ordered, constraint-aware learning path (time budget +
   money budget + prerequisites) from the course catalog.

This is a straight port of `notebooks/01_data_preparation.ipynb` through
`notebooks/04_course_recommendation.ipynb` into a FastAPI service.

**Deployment note**: as of July 2026, HuggingFace requires a paid PRO plan to
create a *new* Docker-SDK Space on a free account, unlike Modules 1/3, and
new free accounts are often restricted to ZeroGPU hardware for new Gradio
Spaces too (see below). This Space runs on plain **Docker SDK + CPU Basic**
hardware, on an existing Space slot that already had that access — a pure
FastAPI app with no Gradio dependency at all, served via the `Dockerfile`'s
`CMD ["uvicorn", "app:app", ...]`.

Two dead ends hit along the way, in case you're setting this up fresh
elsewhere:
- **ZeroGPU** (ony available free hardware for *new* Gradio Spaces) requires
  `@spaces.GPU` to register, which only works through Gradio's own native
  `.launch()` serving model — it does not work with a custom FastAPI app
  mounted via `gr.mount_gradio_app()` and served through `uvicorn.run()`
  (confirmed the hard way; see
  [this HF forum thread](https://discuss.huggingface.co/t/cant-get-zero-gpu-to-work-with-fastapi-uvicorn/141634)
  for others hitting the same wall).
- Even when just mounting Gradio into FastAPI (no ZeroGPU involved) via
  `gr.mount_gradio_app(app, demo, path="/ui")`, Gradio's own queue/internal
  machinery still defaults to trying to claim port 7860 for itself
  separately from the app's own uvicorn socket, causing an intermittent
  `address already in use` crash right after startup completes. Since a
  Docker-SDK Space doesn't need Gradio at all, the fix was simply removing
  the Gradio mount entirely — `app.py` is a plain FastAPI app.

## Endpoints

- `GET /health` — model/artifact load status.
- `POST /analyze-text` — JSON body `{ resume_text, jd_text, level_hint?, max_hours?, max_budget? }`.
- `POST /analyze` — multipart form: `file` (resume PDF/DOCX/TXT) + `jd_text` + optional `level_hint`, `max_hours`, `max_budget`.
- `GET /courses?skill=Python&top_k=8` — browse the course catalog by skill relevance.
- `GET /skills?query=react` — normalize a raw skill string to its canonical vocab entry.

## Response shape (`/analyze-text`, `/analyze`)

```json
{
  "resume_skills": [ { "canonical_name": "Python", "proficiency_score": 4.0, "...": "..." } ],
  "jd_skills": [ { "canonical_name": "Python", "required_proficiency": 4.0, "criticality_label": "required", "...": "..." } ],
  "gap_analysis": {
    "gaps": [ { "canonical_name": "Docker", "effective_gap": 2.1, "learning_hours_mean": 34.0, "priority_score": 12.4, "...": "..." } ],
    "matched_skills": [ "..." ],
    "job_readiness": 62.4,
    "total_learn_hours": 145.0,
    "total_weeks_at_5h": 29.0
  },
  "learning_path": {
    "learning_path": [ { "course_id": "C014", "course_name": "Docker for Developers", "duration_hours": 18, "price_usd": 25, "is_prerequisite_course": false, "...": "..." } ],
    "total_hours": 145.0,
    "total_cost_usd": 211.0,
    "gap_coverage_pct": 100.0
  },
  "meta": { "n_resume_skills_found": 13, "n_jd_skills_found": 14 }
}
```

## Data artifacts

`data/processed/` contains the artifacts produced by notebooks 01–04 (skill
vocabulary, alias lookup, skill graph, skill embeddings, course embeddings,
course catalog). They are small (<2MB total) and committed directly.

Most are `.pkl`/`.npy`. Two are plain **JSON** instead
(`skill_emb_lookup.json`, `courses.json`) even though the notebooks produce
them as a raw-pickled dict of numpy arrays and a pickled pandas DataFrame
respectively — those two formats aren't portable across numpy/pandas major
versions (a pickle written under numpy 2.x can fail to load under numpy
1.x with `ModuleNotFoundError: No module named 'numpy._core...'`, and
similarly for pandas' internal DataFrame pickle format). JSON sidesteps
this: the arrays/DataFrame are rebuilt fresh against whatever numpy/pandas
is actually installed at load time.

If you re-run notebooks 01–04 and `data/raw/` changes, regenerate
`skill_emb_lookup.json` / `courses.json` by running
`python data/export_portable_artifacts.py` **using the same Python
environment the notebooks ran in** (i.e. the one that can still unpickle
the freshly-produced `skill_emb_lookup.pkl` / `courses.pkl`), then copy the
two `.json` files here.

## Run locally

```bash
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

First run downloads GLiNER (`gliner-community/gliner_large-v2.5`, ~1.5GB)
and Sentence-BERT (`all-mpnet-base-v2`, ~420MB) — this can take a while.

## Deploy to HuggingFace Spaces (Docker SDK + CPU Basic, free)

1. Use an existing Space with confirmed Docker SDK + CPU Basic access
   (new free accounts are usually paywalled for creating *new* Docker
   Spaces — see the deployment note above), or check whether Docker SDK is
   available when creating a new one at huggingface.co/new-space.
2. Push this folder's contents (`app.py`, `requirements.txt`, `Dockerfile`,
   `README.md`, `data/`) to the Space, either via git:
   ```bash
   git clone https://huggingface.co/spaces/YOUR-USERNAME/YOUR-SPACE-NAME
   # copy this folder's contents in, overwriting existing files
   git add . && git commit -m "Deploy Module 2 API" && git push
   ```
   or via `huggingface_hub`:
   ```bash
   pip install huggingface_hub
   huggingface-cli login   # or set HF_TOKEN
   python -c "
   from huggingface_hub import HfApi
   api = HfApi()
   api.upload_folder(folder_path='.', repo_id='YOUR-USERNAME/YOUR-SPACE-NAME', repo_type='space', commit_message='Deploy Module 2 API')
   "
   ```
3. Watch the build logs on the Space page — first build downloads GLiNER
   (~1.5GB) and Sentence-BERT (~420MB), then runs the Dockerfile's
   `CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]`.
4. Once "Running", the REST API is live at
   `https://YOUR-USERNAME-YOUR-SPACE-NAME.hf.space` (test with `/health`).

Then point the frontend's `VITE_MODULE2_API_URL` at that base URL.
