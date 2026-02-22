# Contributing to Pramana API

## Development Setup

```bash
git clone https://github.com/syd-ppt/pramana-api.git
cd pramana-api
npm install
npm run dev
```

## Before You Open a PR

### How This System Works

Pramana's backend is intentionally minimal. The data path is:

1. **CLI** ([pramana](https://github.com/syd-ppt/pramana)) runs prompts against LLM APIs and submits results
2. **API** (this repo) stores submissions and aggregates data
3. **Dashboard** (this repo) visualizes drift over time

If your PR introduces additional infrastructure (databases, caches, task queues, ORMs), it almost certainly doesn't fit.

### Two Repos, Separate Responsibilities

| Repo | Scope |
|------|-------|
| **[pramana](https://github.com/syd-ppt/pramana)** | CLI — prompt execution, eval logic, submission client |
| **[pramana-api](https://github.com/syd-ppt/pramana-api)** *(this repo)* | Server — submission endpoint, storage, aggregation, dashboard |

PRs that add CLI features, evaluation logic, or prompt execution to this repo will be closed.

## Branch Strategy

1. Fork the repository
2. Create a feature branch from `main`
3. Make changes, commit with descriptive messages
4. Push and open a pull request against `main`

## Testing

```bash
npm test
```

## Code Style

TypeScript with strict mode. Run `npm test` before committing.

## Reporting Issues

Use GitHub Issues. Include steps to reproduce, expected vs actual behavior, and environment details.
