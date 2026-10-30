# WeatherGPT Mark 7 — skill installation manifest

Reviewed 30 October 2026 (Asia/Calcutta).

All 183 original files are preserved byte-for-byte, including every existing skill, frontend file, runtime dependency manifest and lockfile. Three skill folders were added: `impeccable`, `animejs`, `motion`. No redesign, runtime-library installation, MCP configuration, global skill installation or hook activation was performed.

## Status and sources

| Skill | Status | Source | License |
|---|---|---|---|
| shadcn | preserved; exact upstream payload match | [Official shadcn repository](https://github.com/shadcn-ui/ui/tree/96da9cc7f1aa10580a3741664e2a77c721206c00/skills/shadcn) | MIT |
| frontend-design | preserved; exact upstream payload match | [Official Anthropic repository](https://github.com/anthropics/skills/tree/ca45fc496a3436251f191354091d557da31c15b5/skills/frontend-design) | Apache-2.0 (skill LICENSE.txt) |
| gsap-core | preserved; exact upstream payload match | [Official GreenSock repository](https://github.com/greensock/gsap-skills/tree/aed9cfd3277740755f6bfc1155c7aa645403b760/skills/gsap-core) | MIT |
| chartjs-pro | preserved; exact upstream payload match | [Community skill; not Chart.js official](https://github.com/aicodedecode/awesome-muse-skills/tree/faf37c0859ebf627bfcb5225e8057d088691e0ae/skills/chartjs-pro) | MIT |
| recharts | preserved; exact upstream payload match | [Community skill; not Recharts official](https://github.com/ansanabria/skills/tree/2737eadc3b88390775e71b4e0e4c5e1571607409/skills/recharts) | MIT |
| web-design-guidelines | preserved; exact upstream payload match | [Official Vercel Labs repository](https://github.com/vercel-labs/agent-skills/tree/1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62/skills/web-design-guidelines) | No license file found in repository snapshot; existing copy retained |
| ui-ux-pro-max | preserved; partial provenance match (14 differing files) | [Original UI/UX Pro Max project; existing generated/modified copy](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/tree/28b3b8dee8c976df4fa3e94aed4e092ad43fcb03/.claude/skills/ui-ux-pro-max) | MIT |
| impeccable | installed; pinned upstream files verified | [Original Impeccable project, linked by impeccable.style](https://github.com/pbakaus/impeccable/tree/e945845762eb5898b2b705dcc763a6f1818fdf33/.agents/skills/impeccable) | Apache-2.0, with upstream NOTICE.md |
| motion | installed; pinned upstream files verified | [Official Motion repository and AI Kit documentation](https://github.com/motiondivision/ai-kit/tree/1e424943582cbbdb6e3f410687e39f96451447bb/plugins/motion/skills/motion) | No license file found in repository snapshot; upstream explicitly documents skill installation. Do not assume the Motion runtime MIT license covers this repository. |
| animejs | installed; pinned upstream files verified | [Community skill; not Anime.js official](https://github.com/BowTiedSwan/animejs-skills/tree/cf2bed8d6654a6cfd02d3ff11b74ff3a7a7631e2) | MIT declared in upstream README; no standalone license text supplied |

## Verification and limits

Downloaded sources directly from the named GitHub repositories at the full commits recorded below. Compared payloads to Git blob hashes and recorded SHA-256 checksums for all installed skill files in SKILLS-MANIFEST.json. Reviewed skill instructions and targeted executable/network behavior. This is a bounded static review, not a guarantee of safety or a complete functional audit. No suspicious credential-harvesting or unrelated upload instructions were found in the reviewed paths. Upstream instructions remain subordinate to the user’s scope.

UI/UX Pro Max has a real provenance discrepancy: its source repository and declared commit exist, but 14 bundled files do not match that snapshot. Its old provenance note is preserved as original evidence, not endorsed as an exact match. The local search smoke check and helper syntax checks passed.

## Per-skill notes

### shadcn

SKILL.md includes dynamic npx shadcn@latest context and CLI instructions; not executed. Bundled showcase script reads local files. This vanilla-JS project was not migrated to React/shadcn.

Commit: `96da9cc7f1aa10580a3741664e2a77c721206c00`. Upstream-matching files: 21.

### frontend-design

Design guidance only; preserved alongside Impeccable under separate names.

Commit: `ca45fc496a3436251f191354091d557da31c15b5`. Upstream-matching files: 2.

### gsap-core

Documentation-only skill; no GSAP runtime installed.

Commit: `aed9cfd3277740755f6bfc1155c7aa645403b760`. Upstream-matching files: 1.

### chartjs-pro

Documentation-only community skill; no runtime dependency installed.

Commit: `faf37c0859ebf627bfcb5225e8057d088691e0ae`. Upstream-matching files: 1.

### recharts

React-specific guidance; adding the skill does not install React or Recharts.

Commit: `2737eadc3b88390775e71b4e0e4c5e1571607409`. Upstream-matching files: 4.

### web-design-guidelines

Fetches live rules from vercel-labs/web-interface-guidelines when invoked. Those future rules are not pinned by this package.

Commit: `1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62`. Upstream-matching files: 1.

### ui-ux-pro-max

54 payload files match the declared source path; LICENSE matches repository root. 14 files differ, including SKILL.md, scripts, datasets and tests. No replacement attempted. Exact CLI package provenance not independently established. Python syntax and a read-only search smoke check passed; complete test suite not run.

Commit: `28b3b8dee8c976df4fa3e94aed4e092ad43fcb03`. Upstream-matching files: 55.

Differing files: `SKILL.md`, `data/catalog-summary.json`, `scripts/core.py`, `scripts/design_system.py`, `scripts/search.py`, `scripts/validate_data.py`, `scripts/tests/test_design_system_mode.py`, `scripts/tests/test_native_desktop_stack_freshness.py`, `scripts/tests/test_web_stack_freshness.py`, `scripts/tests/fixtures/relevance-baseline.json`, `scripts/tests/fixtures/relevance-thresholds.json`, `data/stacks/nuxt-ui.csv`, `data/stacks/react.csv`, `data/stacks/threejs.csv`.

### impeccable

Skill and references installed without running its engine or enabling hooks. The GitHub archive converted impeccable.cmd line endings; restored the raw pinned file so its Git blob hash matches exactly. Launcher may download a version-pinned executable from GitHub releases into the user cache on first use and checks published SHA-256 values. Existing override/path binaries and verified cache stamps have different trust paths. Live tools communicate with a local server and may fetch page assets. Engine binaries and runtime behavior were not audited or tested.

Commit: `e945845762eb5898b2b705dcc763a6f1818fdf33`. Upstream-matching files: 65.

### motion

Local best-practice references are usable without MCP. Search, spring generation and other connected features need Motion MCP; some features need Motion+. No MCP server, account, subscription or runtime package was configured. Source and live documentation may differ on feature tiers.

Commit: `1e424943582cbbdb6e3f410687e39f96451447bb`. Upstream-matching files: 12.

### animejs

Installed SKILL.md, references and README. Removed only the newly downloaded install.sh: it downloads unpinned main into the global Claude directory and is unnecessary for this project-local installation. Examples are guidance, not validated against every Anime.js version. Existing js/vendor/animejs is unchanged.

Commit: `cf2bed8d6654a6cfd02d3ff11b74ff3a7a7631e2`. Upstream-matching files: 4.

## Use

Extract the ZIP and open that extracted project folder in your coding agent. These project-local skills become discoverable on its next turn or after reloading the project, depending on the agent. They do not become global skills merely by downloading this ZIP. Use relevant skills only when you request that work; installation does not authorize a redesign.

Impeccable and frontend-design intentionally coexist. React-oriented skills are available as reference, but WeatherGPT remains its original stack. Motion MCP and Impeccable engine-dependent features have not been end-to-end tested.

## Package validation

- Original archive SHA-256: `9b69eee9dfa41b1ad237146e57c0651a27ff2fd621beeba0b0fb5310c10806bb`.
- 183 original files checked unchanged.
- Ten unique SKILL.md names checked.
- New skill payloads checked against pinned Git blobs.
- ZIP integrity and post-packaging original-file hash comparison checked.
- Application/browser tests were not run because application files are unchanged.
