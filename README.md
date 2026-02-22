# Pramana API

LLM providers silently update their models. The same prompt that worked last month might return different — or worse — results today. **Pramana detects this.**

Users run a standard set of prompts against any model using the [Pramana CLI](https://github.com/syd-ppt/pramana), then submit their results here. This repo aggregates those submissions, applies statistical tests, and displays drift over time on a public dashboard.

**This repo is the server side:** submission API, storage, and dashboard. If you want to *run* evaluations, use the [CLI](https://github.com/syd-ppt/pramana).

---

## Setup

```bash
npm install
cp .env.example .env
# Fill in .env values
npm run dev
```

---

## API

### POST /api/submit

Submit evaluation results (anonymous or authenticated).

**Headers (optional):**
```
Authorization: Bearer <jwt_token>
```

**Request:**
```json
{
  "model_id": "gpt-5.2",
  "prompt_id": "reasoning-001",
  "output": "The answer is 42",
  "metadata": {
    "tier": "cheap",
    "temperature": 0.0,
    "seed": 42
  }
}
```

**Response:**
```json
{
  "status": "accepted",
  "id": "uuid-here",
  "hash": "sha256:..."
}
```

### DELETE /api/user/me

Delete user data (GDPR compliance). Requires authentication.

### GET /api/user/me/stats

Get personalized statistics. Requires authentication.

### GET /api/health

Health check.

---

## License

MIT
