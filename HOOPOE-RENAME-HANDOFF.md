# Hoopoe rename — manual steps checklist

Phases 1–4 are committed on `main` (5 commits, verified via backend
vitest 1207, frontend vitest 1449, mcp vitest 22, `cargo check`). The
steps below are the ones that need **your** hand (shared infra, local
dir moves, or require decisions I shouldn't make on my own).

## 1. Push phases 1–4

```sh
git push origin main
```

Watch CI once it lands (both unit + e2e). The e2e workflow uses the
renamed `POSTGRES_USER=hoopoe` / `POSTGRES_DB=hoopoe_e2e` service
config — if CI goes red on a stale cached runner image, re-run the
job.

## 2. Rename the GitHub repo (`Gekkotron/Athena-Ledger` → `Gekkotron/Hoopoe`)

`gh auth status` shows the Gekkotron account is already the active one
on this machine, so no `gh auth switch` is needed.

```sh
cd ~/superconductor/projects/Athena-Ledger
gh repo rename Hoopoe
```

GitHub keeps a server-side redirect from `Gekkotron/Athena-Ledger` to
`Gekkotron/Hoopoe` for both the UI and `git` fetches, so nothing
immediately breaks.

Then point the local checkout at the new slug (replaces the ssh host
alias form the current remote uses):

```sh
git remote set-url origin git@github.com-gekkotron:Gekkotron/Hoopoe.git
git fetch
```

## 3. Rename the local directory

The current terminal session's cwd is `Athena-Ledger/`; moving it from
under me would kill the session, so you need to do this one yourself
after closing the active terminal:

```sh
cd ~/superconductor/projects
mv Athena-Ledger Hoopoe
```

Then update anything local that references the old path:

- The gitignored `.local/sync-frontend-seed.mjs` still points at
  `~/.../Athena-Ledger` (I left it alone — it's your personal tool).
- Any shell aliases, `~/.gitconfig` `includeIf` blocks, `direnv`
  envs, Alfred/Raycast workflows, etc.
- `.sc` orchestrator session metadata (if any — I didn't modify it;
  check `~/superconductor/projects/Athena-Orchestrator/projects.yaml`
  — this repo wasn't listed there, so nothing to update on that side).

Re-open your session in the new directory. Claude Code's auto-memory
lives under `~/.claude/projects/-Users-julienhuguel-superconductor-projects-Athena-Ledger/`
— it keeps working from the renamed directory but under the old
auto-memory folder; move it if you want:

```sh
mv ~/.claude/projects/-Users-julienhuguel-superconductor-projects-Athena-Ledger \
   ~/.claude/projects/-Users-julienhuguel-superconductor-projects-Hoopoe
```

(This isn't necessary — Claude Code will spin up a fresh memory folder
if the one for the new path doesn't exist. Moving it just keeps the
accumulated context.)

## 4. If you have an existing desktop install on your Mac

The Tauri app's data directory (`~/Library/Application Support/Athena Ledger/`)
and the PGlite file inside (`athena.db`) will be auto-migrated on
first boot of the new build — the migration code in
`backend/src/entry/tauri.ts` renames the data dir and all `*.db*`
files in one atomic pass, idempotently. First-boot sequence after
installing the new build:

1. Launch the new `.dmg` once. The data-dir rename happens before
   anything is read.
2. The new session cookie (`hoopoe.sid`) replaces the old
   (`athena.sid`), so you log in once.
3. MCP tokens still unwrap under the preserved HKDF salts (see commit
   73c6615 for the preserved-crypto list), so your MCP config keeps
   working — but the env-var names in the Claude Desktop / Cursor
   MCP config changed. Update them from `ATHENA_*` to `HOOPOE_*`:
   - `ATHENA_API_URL` → `HOOPOE_API_URL`
   - `ATHENA_MCP_USER` → `HOOPOE_MCP_USER`
   - `ATHENA_MCP_TOKEN` → `HOOPOE_MCP_TOKEN`
   - `ATHENA_STATEMENTS_DIR` → `HOOPOE_STATEMENTS_DIR`
   - `ATHENA_PORT_FILE` → `HOOPOE_PORT_FILE`
4. Existing backup files (`athena-backup-*.enc.json`,
   `athena-attachments-*.bin`) are still recognised by the rotation
   pruner — the regex accepts both `(athena|hoopoe)-` prefixes.
5. If you were using the Prometheus `/metrics` endpoint, series names
   now begin with `hoopoe_` (same labels, same meaning). Rewire any
   dashboards.

## 5. Delete this hand-off file

Once you've worked through this list, `rm HOOPOE-RENAME-HANDOFF.md`
and commit. It only exists as a one-shot checklist.
