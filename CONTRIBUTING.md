# Contributing to Pramana API

## Development Setup

```bash
# Clone
git clone https://github.com/syd-ppt/pramana-api.git
cd pramana-api

# Python API
pip install -r requirements.txt
uvicorn api.main:app --reload

# Next.js dashboard
npm install
npm run dev
```

## ⚠️ Before You Open a PR — Read This

### How This System Works

Pramana's backend is intentionally minimal. The entire data path is:

1. **CLI** ([pramana](https://github.com/syd-ppt/pramana)) runs prompts against LLM APIs and submits results
2. **API** (this repo) writes each submission as a single Parquet file to Backblaze B2 — no database, no cache, no queue
3. **Dashboard** (this repo) reads those Parquet files back, aggregates server-side with PyArrow, and renders charts

That's it. If your PR introduces additional infrastructure (databases, caches, task queues, ORMs), it almost certainly doesn't fit.

### Two Repos, Separate Responsibilities

| Repo | Scope |
|------|-------|
| **[pramana](https://github.com/syd-ppt/pramana)** | CLI — prompt execution, eval logic, output formatting, submission client |
| **[pramana-api](https://github.com/syd-ppt/pramana-api)** *(this repo)* | Server — submission endpoint, B2 storage, PyArrow aggregation, Next.js dashboard |

**PRs that add CLI features, evaluation logic, or prompt execution to this repo will be closed.** The reverse also applies.

If you're unsure which repo your change belongs in, open an issue first — happy to point you the right way.

## Branch Strategy

1. Fork the repository
2. Create a feature branch from `main`: `git checkout -b feat/your-feature`
3. Make changes, commit with descriptive messages
4. Push and open a pull request against `main`

## Commit Messages

Use descriptive messages: `Add X`, `Fix Y`, `Update Z`. Keep the first line under 72 characters.

## Testing

```bash
pytest tests/ -v
```

## Code Style

- **Python:** Follow PEP 8. Use `ruff` for linting.
- **TypeScript:** Run `npm run lint` before committing.
- Pre-commit hooks: `pre-commit install` (runs ruff + formatters on commit).

## Pull Requests

- Keep PRs focused on a single change
- Include a description of what changed and why
- Ensure existing functionality isn't broken

## Reporting Issues

Use GitHub Issues. Include:
- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, Python/Node version)

