# Hoopoe rename — manual steps checklist

Phases 1–5 are **done and pushed**:

- 5 rename commits (`04a881e` → `155e8a0`) + handoff (`a0ea572`) on
  `main`, pushed to origin (pre-push hook ran tsc + eslint + vitest
  on both backend and frontend — all green).
- Backend vitest 1207/1207, frontend vitest 1449/1449, mcp vitest
  22/22, `cargo check` green.
- GitHub repo renamed: `Gekkotron/Athena-Ledger` →
  **`Gekkotron/Hoopoe`** (new URL: https://github.com/Gekkotron/Hoopoe).
  GitHub keeps a server-side redirect from the old slug for both UI
  and `git` fetches.
- Local git remote URL updated to point at the new slug — `git fetch`
  verified clean.

CI will run on the next event under the new slug. Watch the e2e job:
it uses the renamed `POSTGRES_USER=hoopoe` / `POSTGRES_DB=hoopoe_e2e`
service config, which hasn't been exercised on a GitHub Actions
runner yet (local vitest doesn't boot Postgres).

The steps below are the ones that still need **your** hand (local dir
move would kill the current session's cwd; your desktop install's
first-boot behavior; dashboard rewiring).

## 1. Rename the local directory

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

## 2. If you have an existing desktop install on your Mac

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

## 3. (Optional) Delete the old GHCR package

The pre-rename images under
`ghcr.io/gekkotron/athena-ledger-{backend,frontend}` are no longer
referenced by any compose file and won't be pushed to again, but
GitHub keeps them until explicitly deleted. If you want them gone:

- https://github.com/users/Gekkotron/packages/container/package/athena-ledger-backend
- https://github.com/users/Gekkotron/packages/container/package/athena-ledger-frontend

Each page has a *Delete package* button. This is destructive and
unrecoverable — if anyone else is still running an older release
that pulls those tags, their next `update-release.sh` run will 404
on the pull. On your own Mac the next `./update-release.sh` run also
removes the pre-rename images from the local Docker cache (new
cleanup block in that script after the health check).

## 4. Delete this hand-off file

Once you've worked through this list, `rm HOOPOE-RENAME-HANDOFF.md`
and commit. It only exists as a one-shot checklist.
