# Naming — product rename brainstorm

**Context:** Registering `gekkotron.app` as the umbrella domain. This app currently lives as `Athena-Ledger` and will be hosted at `<name>.gekkotron.app`. Goal: pick a name that is **global**, **discoverable** by end users, **FR-safe** (primary audience is French via Enable Banking), and distinctive enough to compete.

**Status:** DECIDED on 2026-10-18 — the chosen name is **`Hoopoe`**. The owl mark stays (the mark carries brand identity visually; the word is now `Hoopoe`). Repo renaming to `Gekkotron/Hoopoe` is in progress.

---

## Constraints that emerged during the search

1. **Global, not French** — the name itself must work in English worldwide; FR must still be the primary user base, so no FR-only words.
2. **FR-safe meanings** — the word must not translate into something negative, clinical, or state-affiliated in French.
3. **SEO / trademark survivability** — avoid names dominated by giant brands in finance or crypto categories.
4. **Owl is the mark, not necessarily the word** — the owl logo (just rolled out across web and desktop) can carry brand identity visually, which frees the word from needing to literally mean "owl".
5. **Pre-public** — no existing SEO equity to protect, so now is the right moment to rename.

---

## Names evaluated

### Ruled out

| Name       | Why ruled out                                                                                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Ledger`   | Direct conflict with Ledger SAS (FR hardware-wallet unicorn). Trademark risk + SEO domination on `.fr`.                                                           |
| `Athena`   | Crowded (Amazon Athena, countless OSS projects). Also the whole `Athena-*` family suggests moving beyond this prefix for the public brand.                         |
| `Hoot`     | English owl-sound reads as **"huée"** (booing/jeering) to French ears — negative association.                                                                     |
| `Owl`      | Too generic. Dominated by Owl Labs, Owl Cyber Defense, OWL (W3C), Overwatch League, Night Owl. Fails the "end users find me" goal.                                |
| `Lucid`    | Weak in French despite the EN/FR cognate (clinical connotations in FR usage); user ruled out.                                                                     |
| `Zenith`   | **Le Zénith** is the famous chain of large FR concert venues (Paris, Nantes, Lille…). Strong existing FR association.                                             |
| `Chouette` | French-only (user wants a global name).                                                                                                                            |
| `Pécule`   | French-only (user wants a global name).                                                                                                                            |
| `Budget`   | Generic, "not sexy" per user.                                                                                                                                      |
| `Treasure` | FR `Trésor` = **Trésor Public** (French tax authority). Also direct conflict with Treasure Financial (YC fintech) and TREASURE K-pop band. Dual-side bad.         |

### Still on the board

| Name       | For                                                                                                   | Against                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **`Horizon`** ⭐ | Identical spelling + meaning EN/FR, positive, forward-looking, finance-friendly, owl-adjacent (owls see far). | Generic; many unrelated Horizon products (Robotics, Insurance, Zero Dawn, Hyundai…). SEO is a slow climb. OVH exposes OpenStack Horizon dashboard — different category, not a legal issue. |
| `Pecunia`  | Latin for *money*. Premium educated feel. Zero FR cultural conflict. International.                   | Slightly obscure — needs a tagline to land.                                           |
| `Trove`    | Short English word, warm, means *treasure cache*. No FR tax-authority association (unlike Treasure).  | Unfamiliar word for French users; takes a beat to understand.                        |
| `Noctua`   | Latin for *little owl*. Keeps the owl thread. Pronounces the same in every European language.         | **Noctua** PC fan brand is well-known — different category, but SEO fight early on.  |
| `Vista`    | Same word in EN/FR/ES/IT. Means *view/outlook*. Zero conflicts.                                       | Safe but generic / forgettable.                                                      |
| `Aura`     | Same word EN/FR. Warm, modern.                                                                        | Used by many wellness/beauty brands.                                                 |
| `Opal`     | Gem, iridescent (money reflects categories). International.                                           | Not finance-connotative; needs explanation.                                          |

---

## Decision pending

- **Lock `Horizon`** → fastest path, perfect EN/FR match, benign OVH overlap, generic but survivable.
- **Pivot to `Pecunia`** → most distinctive and conflict-free, premium feel, costs one explanatory tagline.
- **Pivot to `Trove`** → warm/personal, short, less distinctive than Pecunia but easier to say.

## Open questions for next session

1. Does `Horizon` feel strong enough despite being generic, or is distinctiveness worth the extra friction of `Pecunia`?
2. Rename *scope*: user-facing surface only (domain, app title, website, README headline) vs. also the repo (`Athena-Ledger` → `Gekkotron-<name>`), which cascades into `Athena-Orchestrator`'s hard-coded path and the whole `Athena-*` family convention.
3. Social handles / GitHub availability check for the chosen name under `Gekkotron/*`.
