# Freecode

A free, mobile-first coding agent. It plans, waits for your approval, edits files in an isolated git worktree, runs sandboxed commands, shows a diff and a live preview, and runs several agents in parallel.

## Run

```bash
python3 -m freecode --mode local --port 8790 --data ~/.freecode          # PC local (127.0.0.1)
python3 -m freecode --mode cloud --port 8790 --data /srv/freecode --token "$FREECODE_TOKEN"   # Cloud (token-protected)
python3 -m freecode --mode local --mock                                     # demo models, no keys needed
```

Open http://127.0.0.1:8790 (cloud: `/?token=...` once). Phone mode keeps files on the device (localStorage) and runs `node` in a Web Worker.

Keys are BYOK and free: add an NVIDIA NIM key and/or an OpenRouter key in Settings. They are stored at `<data>/keys.json` (mode 600) and are never returned by the API. If there are no keys and no `--mock` flag, the agent says how to add one.

Models: Freecode Auto, FC Forge, FC Flux, FC Atlas, FC Craft, FC Spark, FC Lite. Premium families are refused on the free plan.

## Test

```bash
pip install pytest playwright      # uses system Chrome at /usr/bin/google-chrome
python -m pytest tests -q          # unit + parameterized + API + Playwright e2e (390x844, 1440x900)
python scripts/walkthrough.py      # real end-to-end task, step log -> walkthrough.log, shots/ walk-*.png
```

## Safety
- Commands: allowlist only, no shell operators, no absolute or `..` paths, clean env, 20 s timeout.
- Files: workspace-confined, 512 KB cap. The preview is a sandboxed iframe with CSP and `connect-src 'none'`. Cloud previews use a per-agent HMAC capability URL, never the account token.

License MIT. See THIRD_PARTY_NOTICES.md.

## Keys (BYOK)
Keys come from Settings (`keys.json`), falling back to the environment: `NVIDIA_API_KEY`, `OPENROUTER_API_KEY`, `GROQ_API_KEY`, `GITHUB_MODELS_TOKEN`, `MISTRAL_API_KEY`, `CLOUDFLARE_AI_KEY` (`<account id>:<token>`). Environment keys are never written to disk. They are never logged. The test suite removes these variables, so it never calls real providers.

## Typed AI layer
Every model output is parsed with strict Pydantic schemas (`freecode/schema.py`: Plan, BuildPlan, WriteFile, RunCommand). On invalid output, the validation errors go back to the same model (up to 2 repairs). After that, the router falls back to the next free model; when every option is used up, you get a clear message.

## Resilience
Runs execute on the server and are checkpointed atomically after every event (`data/agents/<id>.json`). After a restart they resume from the last completed step and never repeat a step. Request ids and duplicate approvals are idempotent. The client reconnects with backoff and shows a small "Reconnecting…" banner. Sessions don't time out and there are no hour limits.

## Checks and auto-fix
If a command the plan ran (such as `node test.js`) exits non-zero, the agent sends the failing output plus the files back to the model and re-runs the check, for up to 2 rounds. While checks still fail, "Ready to merge" is blocked; "Merge anyway" asks for confirmation (`{"override": true}` in the API). This works in the local, cloud and phone runtimes.

## Preview toolbar
Back, forward, refresh, an editable URL field (path navigation), copy link, open in a new tab, and the phone/desktop frame toggle. In cloud mode, "Share" creates a signed public link that expires after 24 h.

## Real-model scripts
`scripts/live_probe3.py` sends a chat and a typed plan to each upstream. `scripts/walk_real.py [brands]` runs the full UI walkthrough with real models (writes `live/walk_real*.log` and `shots/real-*`).

## Ads and revenue
`freecode/ads.py`: one labelled ad between turns, matched by default to the current task's topic (no personal data; the summary is redacted). Personalised ads are an explicit opt-in (Settings > Ads and rewards) with 50 bonus credits once and 25 extra free runs a day (Freebuff scale). An ad is shown only when it clearly matches the current task (`min_relevance`, default 0.5) and only at a natural pause (a finished run), never while an agent plans, waits for approval, builds or fixes. Turning it off takes one click and deletes the interest profile. Global Privacy Control is honoured, and you can export or delete your ad data. Revenue is booked in `data/ads/ledger.jsonl`: it fills the model-cost pool up to its target first, then the surplus is split (configurable) between the pool and profit. The owner dashboard is at Settings > Revenue (`/api/admin/revenue`). The network is `FC_ADS_NETWORK=mock` (default) or `gravity` (needs `pip install gravity-sdk` and `GRAVITY_API_KEY`; falls back to mock when it isn't configured).

## CLI
```
python -m freecode                     # start the app (same as `serve`)
python -m freecode run "task" --yes    # plan, build, review, suggest next steps (--think, --image FILE, --merge, --json)
python -m freecode chat "question"     # or: research "question" (cited sources)
python -m freecode interview "task"    # three clarifying questions
python -m freecode review AGENT_ID     # or: deploy AGENT_ID --host netlify
python -m freecode models
```
Add `--mock` to any command to use the demo models.

## Helpers, images, chat and research
- Slash commands in the composer: `/plan` (a thinker reasons first), `/review` (code review plus a headless browser check of the preview), `/interview` (3 questions before planning). Three follow-up suggestions appear after each run.
- Images: attach, paste or drop up to 4 (downscaled on the device). A free vision model describes them for the coding model: NIM Nemotron VL, then OpenRouter, then Gemma 4.
- Chat and Research view: research searches with Tavily (falling back to DuckDuckGo instant answers), reads pages with Jina Reader and cites sources.
- Element picker: the cursor button in the preview toolbar adds a clicked element (selector and HTML) to your prompt.
- File-picker: for existing projects (for example an imported GitHub repo) the most relevant files go to the planner.

## Deploy and GitHub
Settings > One-click deploy takes your own tokens for Cloudflare Pages (via `npx wrangler`), GitHub Pages, Netlify, Vercel (Hobby is non-commercial only) and Render (deploy hook). Settings > GitHub cloud agent takes your own GitHub App (App ID and private key; signed with the system `openssl`). Import a repo, let an agent work on it, then open a pull request from the agent screen. Credentials are kept in `integrations.json` (0600) and never returned by the API.

## Desktop app
`desktop/` is an Electron shell that starts the local server on 127.0.0.1 and shows it in a sandboxed window. It needs Python 3.10+ on the computer. `npm install && npm start` runs it; `npm run dist` builds unsigned installers (Linux AppImage and tar.gz here; Windows and macOS targets are configured). The packaged sources never include `freecode/ads.py`, and the server runs with `FC_ADS=off`, so signed builds carry no ad code.

## Model check
`python scripts/check_models.py [--vision] [--provider nim]` calls every free upstream with the keys in your environment and prints OK, FAIL or SKIP with latency. It never prints keys.
