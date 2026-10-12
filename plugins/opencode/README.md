# OpenCode Agent

The [OpenCode](https://github.com/anomalyco/opencode) AI coding agent inside
Noxs — chat in your terminal or in a browser window, using free model tiers
or your own provider. Everything runs in the Noxs Linux environment; no
account is created by the plugin and no key leaves the device.

## What you get

- **Terminal chat** — run `opencode` for the interactive OpenCode TUI in the
  Noxs terminal (agent with file editing, shell access, LSP and tools).
- **Browser chat** — run `opencode web` to serve the OpenCode web UI on
  `http://127.0.0.1:4096` and **auto-open it in the Noxs floating browser**
  (via `nx ow`). `opencode web --stop` stops the server again.
- **Free mode** — one command configures a free-tier provider:
  - `opencode free openrouter <key>` — OpenRouter models tagged `:free`
    (DeepSeek V3.1, Qwen3 Coder, Kimi K2, GLM 4.5 Air, Llama 3.3 …).
    Free keys: <https://openrouter.ai/keys>
  - `opencode free groq <key>` — Groq's free API tier (Llama 3.3 70B, Kimi
    K2, Qwen3). Free keys: <https://console.groq.com/keys>
  - `opencode free gemini <key>` — Google AI Studio free tier (Gemini Flash).
    Free keys: <https://aistudio.google.com/apikey>
  Omitting the key prompts for it in the terminal.
- **Custom providers** — any OpenAI-compatible endpoint:
  `opencode provider-add <id> <baseURL> <model> [name] [key]`
  (OpenAI, Azure, vLLM, llama.cpp server, LM Studio, corporate gateways…).
- **Official providers** — `opencode auth login` has the built-in flows
  (OpenCode Zen, Anthropic, OpenAI, Google, Groq, Azure, and more).
- **Status & diagnostics** — `opencode status` and `opencode doctor`.

## First run

1. Open the plugin (or run `opencode`) — it installs the OpenCode CLI from
   the official installer (`curl -fsSL https://opencode.ai/install | bash`)
   into `~/.opencode/bin` on first use. Needs `curl` (offered via apt when
   missing) and roughly 100 MB of disk.
2. Configure a model: tap a free-mode button in the plugin window and run
   the shown command with your key — or use `opencode auth login`.
3. Chat: `opencode` (terminal) or `opencode web` (browser, auto-opens).

## How configuration works

Plugin-managed providers live in a dedicated file,
`~/.config/opencode/noxs-providers.json`, exported to OpenCode through
`OPENCODE_CONFIG`. OpenCode **merges** config sources, so this plugin never
touches your own `opencode.json` — your settings stay yours. Generated
files are `chmod 600`; provider ids, URLs, model ids and keys are validated
(JSON-safe character set) before they are embedded. The web server binds to
`127.0.0.1` only — nothing is exposed to your network.

## Command reference

| Command | Purpose |
|---|---|
| `opencode` | interactive TUI chat (installs the CLI on first run) |
| `opencode web [--port N]` | web chat UI + auto-open in the Noxs browser |
| `opencode web --stop` | stop the background web server |
| `opencode setup` | install / update the OpenCode CLI |
| `opencode status` | CLI, server, provider and bridge status |
| `opencode free <preset> [key]` | configure a free-tier provider |
| `opencode provider-add <id> <url> <model> [name] [key]` | add a custom provider |
| `opencode provider-list` | list plugin-managed providers |
| `opencode provider-remove <id>` | remove one |
| `opencode doctor` | environment diagnostics |
| `opencode <anything else>` | forwarded to the real OpenCode CLI |

## Notes

- The OpenCode CLI itself is installed from the official installer and runs
  as your guest user; the plugin only orchestrates it.
- `OPENCODE_SERVER_PASSWORD` is respected when you set it yourself; the
  default local-only binding needs no password.
- Model availability on free tiers changes over time — edit or replace the
  preset with `provider-add` anytime.
