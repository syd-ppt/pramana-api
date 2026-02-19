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

## Architecture Note

This repo is the **backend infrastructure + dashboard**. The CLI tool lives at [pramana](https://github.com/syd-ppt/pramana). Do not mix responsibilities.
