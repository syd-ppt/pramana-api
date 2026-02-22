<h1 align="center">Pramana API</h1>

<p align="center">
  <strong>Crowdsourced LLM drift detection</strong><br>
  <a href="https://pramana.pages.dev">Dashboard</a> &middot; <a href="https://github.com/syd-ppt/pramana">CLI</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/runtime-Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white" alt="Cloudflare Workers">
  <img src="https://img.shields.io/badge/framework-Hono-E36002?logo=hono&logoColor=white" alt="Hono">
  <img src="https://img.shields.io/badge/frontend-React-61DAFB?logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/github/license/syd-ppt/pramana-api" alt="License">
</p>

---

LLM providers silently update their models. The same prompt that worked last month might return different — or worse — results today.

Pramana detects this. Users run standardized prompts against any model with the [CLI](https://github.com/syd-ppt/pramana), submit results here, and this service aggregates submissions, runs statistical tests (Welch's t-test with Holm-Bonferroni correction), and displays drift on a [public dashboard](https://pramana.pages.dev).

**This repo is the server side.** To run evaluations, use the [CLI](https://github.com/syd-ppt/pramana).

---

## How It Works

```
You                          Pramana                         Dashboard
 |                              |                               |
 |  pramana run --model gpt-5   |                               |
 |  ............................ |                               |
 |  pramana submit results.json |                               |
 |----------------------------->|                               |
 |      POST /api/submit        |                               |
 |                              |-- aggregate + statistical     |
 |                              |   tests (daily cron)          |
 |                              |------------------------------>|
 |                              |     drift visualization       |
 |                              |     "you vs crowd" stats      |
```

---

## API

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/submit` | Optional | Submit evaluation results |
| `POST` | `/api/submit/batch` | Optional | Submit multiple results |
| `GET` | `/api/data/chart` | None | Aggregated drift data |
| `GET` | `/api/user/me/stats` | Required | Personal statistics |
| `GET` | `/api/user/me/comparison` | Required | You vs crowd comparison |
| `DELETE` | `/api/user/me` | Required | Delete your data (GDPR) |
| `GET` | `/api/health` | None | Health check |

---

## Development

```bash
npm install
cp .env.example .env
npm run dev
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

MIT
