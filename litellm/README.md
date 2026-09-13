# LiteLLM Gateway

VeeFore can route all AI text/chat/streaming calls through a **LiteLLM proxy** — a
single OpenAI-compatible endpoint that fans out to many providers (OpenAI,
Google Gemini, Anthropic, GitHub Models, Perplexity, …) and handles retries and
cross-provider fallbacks for us.

The app talks to the proxy using the OpenAI SDK with a swapped `baseURL`
(`server/services/litellm/LiteLLMGateway.ts`). No provider-specific SDK code is
needed on the app side.

## Why a proxy (and not an npm package)?

LiteLLM's routing/fallback engine is a Python library. The supported way to use
it from Node/TypeScript is its **proxy server**, which exposes the OpenAI
`chat/completions` API. You point any OpenAI client at it and change only the
model name. That is exactly what this integration does.

## Architecture

```
VeeFore server (Node/TS)
   │  OpenAI SDK, baseURL = LITELLM_BASE_URL
   ▼
LiteLLM proxy  ──►  OpenAI / Gemini / Anthropic / GitHub / Perplexity
  (config.yaml: model_list + router_settings.fallbacks)
```

- `config.yaml` — model groups + fallback chains. Edit this to add/rename models.
- `docker-compose.yml` — runs the proxy on `:4000`.
- `.env.litellm.example` — provider keys for the proxy container.

## Quick start (local)

```bash
cd Veefore-E/litellm
cp .env.litellm.example .env.litellm
# edit .env.litellm: set LITELLM_MASTER_KEY (must start with "sk-") and provider keys
docker compose up -d
curl http://localhost:4000/health/liveliness   # -> {"status":"healthy"}
```

Then enable it in the app's root `.env`:

```dotenv
USE_LITELLM=true
LITELLM_BASE_URL=http://localhost:4000/v1
LITELLM_MASTER_KEY=sk-...        # same value as the proxy's master_key
```

Restart the server. `AIServiceManager.generateText` / `generateTextStream` now
lead with the gateway and fall back to the native provider chain if the proxy is
unreachable, so the switch is safe and reversible (set `USE_LITELLM=false`).

## Smoke test the proxy directly

```bash
curl http://localhost:4000/v1/chat/completions \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"veegpt-hybrid","messages":[{"role":"user","content":"ping"}]}'
```

## Model names

Requests use a `model_name` declared in `config.yaml`. The app maps its internal
ids (e.g. `veegpt-hybrid`, `openai-gpt4o`, `github-gpt-4o-mini`) to these names
in `LiteLLMGateway.toLiteLLMModel()`. Any other `model_name` the proxy knows can
be requested directly (`claude-3-5-sonnet`, `gemini-2.5-flash`, `perplexity-sonar`, …).

## Admin UI + database

The stack includes a Postgres container so the Admin UI at
**http://localhost:4000/ui** works (it stores users, virtual keys, and request
logs). The gateway API itself does not require the DB — only the UI and
persistence features do.

- UI login is set by `UI_USERNAME` / `UI_PASSWORD` in `.env.litellm`.
- DB data persists in the `litellm-pgdata` Docker volume across restarts.

### Virtual keys (recommended)

Don't ship the master key in app configs. Instead issue a **virtual key** —
scoped to specific models with an optional budget / rate limit — and point the
app at it via `LITELLM_API_KEY` (preferred over `LITELLM_MASTER_KEY` in
`LiteLLMGateway`).

Create one from the UI (**Virtual Keys → + Create New Key**) or via the API:

```bash
curl -X POST http://localhost:4000/key/generate \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"key_alias":"veefore-app","models":["veegpt-hybrid","gpt-4o-mini"],"max_budget":10,"budget_duration":"30d"}'
```

The response's `key` (an `sk-...` value) goes into the app's root `.env` as
`LITELLM_API_KEY`. Watch its usage/spend under **Observability → Usage / Logs**.

## Adding a provider/model

1. Add an entry under `model_list` in `config.yaml` with `litellm_params.model`
   in `provider/model` form and `api_key: os.environ/YOUR_KEY`.
2. Add the key to `.env.litellm`.
3. (Optional) add it to a `router_settings.fallbacks` chain.
4. Reload the proxy: `npm run litellm:reload`. NOTE: `config.yaml` is read only
   at startup, so editing it requires a container **restart** — `docker compose
   up -d` alone will NOT reload config changes.

### Temperature-locked models (GPT-5 family)

OpenAI's GPT-5 models (incl. gpt-5.6 sol/luna/terra) reject any non-default
`temperature`. The app handles this in two places:
- **Client**: `MODELS_WITHOUT_CREATIVITY` in `SettingsTabs.tsx` hides the
  creativity slider when such a model is selected.
- **Server**: `TEMPERATURE_LOCKED_MODELS` / `supportsTemperature()` in
  `LiteLLMGateway.ts` omit `temperature` from the request for those models.

The proxy's `drop_params` does NOT help here because temperature is a supported
param with a restricted value, so both lists must be kept in sync when adding a
new temperature-locked model.

See the LiteLLM docs: https://docs.litellm.ai/docs/proxy/configs
