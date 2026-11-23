# Método EGM en PromptPerfect

El método de trabajo de este repositorio es EGM (Elephant–Goldfish): un
coordinador con contexto (Elephant) y revisores de contexto fresco (Goldfish)
que auditan, diseñan y verifican antes de implementar. Vive **dentro** del
repo, como estructura única del proyecto:

| Pieza | Ruta | Qué es |
| --- | --- | --- |
| Skills (7) | `.claude/skills/egm-*/` | bootstrap, brainstorm, draft, review, review-loop, resolve, drift-report |
| Agentes (10) | `.claude/agents/*.md` | Wrappers invocables; leen su persona canónica antes de actuar |
| Personas (10) | `.claude/egm/agents/*.md` | bootstrap_orchestrator, zoom_out, comprehension, codebase_details, design_critic, structural, style, implementation_readiness, inventive_catalyst, synthesizer |
| Conceptos | `.claude/egm/concepts.md` | El brief conceptual del método |
| Integración por harness | `.claude/egm/claude.md`, `.claude/egm/codex.md` | Cómo opera el método en cada superficie; las rutas de plugin del original se resuelven aquí: la raíz del método es la raíz del repo y su hogar es `.claude/egm/` |

## Cómo se invoca

- Claude Code (configuración de proyecto): las skills se descubren en
  `.claude/skills/` y los agentes en `.claude/agents/` sin instalación alguna.
- Otros harnesses: `AGENTS.md` (raíz) declara este método y apunta aquí.

## Consolidación con la oleada EGM de 2026-11

La oleada EGM del 2026-11-12/13 ejecutó el método por sustitución declarada
(sin plugin in-repo) y dejó el registro del proyecto: `docs/audits/EGM-*`,
`docs/audits/INTEGRACION-EGM-PROMPTPERFECT-2026-11-12.md`, los enfoques
E1–E7 y las decisiones firmadas que el código aún porta (p. ej. las
desactivaciones puntuales E4 de `set-state-in-effect` con su rationale).
Esta integración **consolida** ese estado: el método queda presente de forma
nativa y esos documentos siguen siendo el expediente del proyecto; no se
duplican aquí. Los ficheros TEST.md y test_scenarios.yaml del plugin no se
vendorizan: son la QA del plugin, no piezas del método en este repo.

## Procedencia y licencia

Snapshot del método EGM v0.1.1 (Apache-2.0) tomado del repositorio local del
titular el 2026-11-22, con las referencias de ruta adaptadas al layout de
este repo (sin referencias funcionales externas). La licencia se conserva en
`.claude/egm/LICENSE`, como exige Apache-2.0.
