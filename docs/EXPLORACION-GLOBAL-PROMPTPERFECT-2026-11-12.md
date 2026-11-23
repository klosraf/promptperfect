# Exploración global — PromptPerfect · 2026-11-12

**Método:** Goldfish de contexto fresco, solo lectura pública web, fuentes 2024-2026 verificadas en búsqueda (URLs copiadas de resultados reales). Sustitución de método EGM declarada: el repo no tiene el plugin google/elephant-goldfish-model adoptado in-repo; la línea se ejecuta con Elephant (coordinador, contexto completo) + subagentes Goldfish de contexto fresco. No se instaló el plugin.
**Criterio:** open-source, Next.js 16.1.6 / React 19.2.3 / Supabase / AI SDK 6, BYOK, `npm ci` canónico, sin presupuesto cloud extra, sin relajar RLS/rate-limit/CSP/auth, ADR-0001/0002 vigentes.
**Contexto de mercado:** Humanloop cerró 2025-09-08, Helicone en mantenimiento, promptfoo adquirido por OpenAI, Vellum pivotó — toda dependencia de plataforma de prompts se evalúa por riesgo de desaparición.

## Patrones numerados (PP-01…PP-42)

| ID | Patrón | Fuente | Área | Veredicto |
|---|---|---|---|---|
| PP-01 | Prompts como activos versionados con etiqueta de entorno (promover = mover etiqueta) | langwatch.ai/blog/best-prompt-management-tools | IA | DEBE — versionar templates/optimizaciones sin servicio externo |
| PP-02 | Eval gate bloqueante antes de promoción (umbrales numéricos) | belsoftsolutions.com/blog/prompt-management-enterprise-ai-production-2026 | IA | DEBE — golden local + umbrales, coste cloud cero |
| PP-03 | Golden dataset por prompt (≥50, 200 en core) | belsoftsolutions.com (idem) | IA/datos | DEBE — prerrequisito de PP-02/PP-04 |
| PP-04 | promptfoo en CI (regresión LLM, fail-on-threshold) | lucaberton.com/blog/llm-regression-testing-ci-promptfoo | IA/CI | PUEDE — job opcional/nocturno BYOK, no gate por PR |
| PP-05 | Red-teaming OWASP LLM Top 10 con promptfoo eval local | dev.to/jangwook_kim_e31e7291ad98 | IA/seg | PUEDE — solo eval local, sin cloud de generación |
| PP-06 | DSPy/MIPROv2/GEPA optimización programática | fzeba.com/posts/60-dspy-programming-llms-gepa | IA | DESCARTAR runtime Python; PUEDE el concepto (métrica+explicación en TS) |
| PP-07 | No construir sobre Humanloop/Vellum/Helicone | promptlayer.com/blog/best-prompt-management-tools-2026-field-guide | IA/arq | DESCARTAR — plataformas muertas/pivotadas |
| PP-08 | Explicabilidad como producto (linaje: versión, dataset, scores, qué cambió y por qué) | jfrog.com/learn/mlops/prompt-management | IA/UX | DEBE — es la propuesta de valor declarada |
| PP-09 | Abstracción multi-proveedor AI SDK tras capa propia | alexcloudstar.com/blog/ai-sdk-v6-developer-guide-2026 | IA/arq | DEBE — nunca SDK de proveedor directo en rutas |
| PP-10 | Streaming SSE + ruta sync JSON separadas, contrato compartido | mcp.nerdleveltech.com (AI SDK v6) | IA/arq | DEBE — conservar dualidad optimize/optimize-sync |
| PP-11 | Vercel AI Gateway como capa | rabinarayanpatra.com/blogs/vercel-ai-gateway-deep-dive | IA/arq | DESCARTAR como defecto (rompe BYOK/self-host); PUEDE opción documentada |
| PP-12 | Telemetría OTel del AI SDK (`experimental_telemetry`, sin inputs/outputs) | pydantic.dev/articles/vercel-ai-sdk-logfire-otel | IA/obs | PUEDE — solo con flags, prompts nunca a trazas por defecto |
| PP-13 | Cifrado envelope para claves BYOK si se persisten | frankcostoya.com/blog/you-probably-dont-need-vault | seg/datos | DEBE si se persiste alguna clave; preferible no persistir ninguna |
| PP-14 | Defensa en profundidad anti prompt-injection (OWASP LLM01: delimitar, validar salida, mínimo privilegio) | docs.modulos.ai/frameworks/owasp-top-10-llm | IA/seg | DEBE — el input ES un prompt ajeno: tratar como datos |
| PP-15 | Next 16: Turbopack defecto, Cache Components opt-in, `proxy.ts` sustituye middleware | preview.nextjs.org/docs/app/guides/upgrading/version-16 | arq | DEBE con cautela — el repo ya usa proxy.ts (verificado); no activar Cache Components a ciegas con sesiones |
| PP-16 | RSC por defecto, `use client` solo en hojas | infrivasolutions.com/blog/nextjs-react-server-components-rsc | arq/UX | DEBE — medir con perf:budget propio |
| PP-17 | Suspense + fetch paralelo en Server Components | coderix.dev/insights/nextjs-app-router-best-practices | arq | DEBE — estados loading/empty/error por frontera |
| PP-18 | Route Handlers como única API externa; Server Actions solo mutaciones internas | dharmsy.com/blog/nextjs-16-best-practices | arq | DEBE — la API la consumen extensión y n8n |
| PP-19 | Presupuesto de rendimiento en CI (bundle budget con baseline propio, ratchet) | nexisltd.com/blog/web-performance-budget-optimization | CI/UX | DEBE — conectar perf:budget existente a CI (hoy no cableado, ver F6-02) |
| PP-20 | Bundle audit recurrente (analyzer, imports por hoja) | dev.to/thegdsks (bundle audit) | arq/CI | PUEDE — sin bundlewatch si perf:budget cubre |
| PP-21 | RLS en toda tabla expuesta, políticas por operación, test anti allow-all | backloo.com/insights/supabase-rls-checklist | datos/seg | DEBE — test que falle si una tabla carece de RLS o tiene política `true` |
| PP-22 | `(select auth.uid())` en políticas + `search_path` fijo en funciones | deepwiki.com/ahnbu/my_bookstations (RLS initplan) | datos | DEBE — corregir con migración nueva, nunca editando aplicadas |
| PP-23 | @supabase/ssr factories por contexto; `getClaims()/getUser()`, nunca `getSession()` para autorizar | supabase.com/docs/guides/auth/server-side | datos/seg/arq | DEBE — es ADR-0001; el repo usa getUser en proxy (verificado) |
| PP-24 | Hardening Supabase: service_role solo servidor, Auth endurecido, Storage privado | aicodingguild.org/blog/supabase-security-hardening-checklist | seg/datos | DEBE — grep CI anti service-key en cliente; lo gated por plan = pendiente de decisión |
| PP-25 | Defensa triple: proxy optimista + DAL + RLS (lección CVE-2025-29927) | octoagency.io/blog/next-js-supabase-saas | seg/arq | DEBE — ninguna ruta protegida depende solo del proxy |
| PP-26 | CSP con nonce + strict-dynamic como objetivo; headers HTTP, sin relajar la actual | github.com/ndisisnd/cook (security standards) | seg | DEBE mantener; nonce solo con test e2e (hoy unsafe-inline: deuda F2-10) |
| PP-27 | OWASP API Top 10 por Route Handler (BOLA, DTO allowlist, límites, validar respuestas de proveedores) | dynasec.pro/en/blog/api-security-owasp-api-top-10 | seg/arq | DEBE — tests negativos usuario B vs recurso de A |
| PP-28 | Rate-limit por cuenta además de por IP; respuestas genéricas anti-enumeración | github.com/itssulaimann/orchestrator (owasp-security) | seg | DEBE — cuota guest en servidor, sin filtrar saldos ajenos |
| PP-29 | Validación de entrada como contrato único — en este repo, parsers propios por ADR-0002, no Zod | jfrog.com/learn/mlops/prompt-management | seg/arq | DEBE — cerrar topes/enums en apiSchemas, no introducir Zod |
| PP-30 | axe + Playwright gate WCAG 2.1/2.2 AA en CI | matthewswong.com/en/blog/accessibility-audit-nextjs | UX/CI | DEBE — el repo ya lo tiene en 5 rutas; ampliar a estados reales (F4-06) |
| PP-31 | WCAG 2.2 AA: foco no oscurecido 2.4.11, target size 2.5.3, ayuda consistente 3.2.6 | socialanimal.dev/blog/wcag-22-aa-accessible-components-nextjs | UX | DEBE — revisar header sticky y botones-icono |
| PP-32 | a11y en tres capas (unit/página/manual) declarando cobertura real | contextqa.com/blog/automated-accessibility-testing-playwright-axe | UX/CI | PUEDE — capa componente solo en críticos |
| PP-33 | UX de streaming completa: cancelar real, conservar ante error, foco gestionado, aria-live prudente | vercel.com/ai-sdk | UX/IA | DEBE — cero éxitos fingidos (ver F3-12, F4-07, F4-10) |
| PP-34 | Cuatro gates duros: tests+coverage, e2e sin console.error, a11y, tipos+lint | github.com/martian56/claude-engineer (testing-and-gates) | CI | DEBE — es el perfil normativo del repo |
| PP-35 | Coverage por partición en rutas críticas, no media vanidosa | github.com/vsxd/afilmory-vercel/docs/testing.md | CI | DEBE — suelos por fichero crítico (ver F6-01) |
| PP-36 | Testing Trophy: integración manda, e2e solo journeys críticos | martian56/claude-engineer (idem) | CI | DEBE |
| PP-37 | Langfuse self-hosted como observabilidad LLM | datacamp.com/blog/langfuse-vs-langsmith | obs/IA | DESCARTAR por defecto (pila ops desproporcionada); logs propios + OTel opcional |
| PP-38 | Web Vitals RUM sin cookies a endpoint propio | aicassindra.com/blogs/cloud/vercel_analytics | obs/UX | PUEDE — nunca URLs con prompts/IDs sin redactar |
| PP-39 | Supply chain CI: SHA-pinning, Dependabot con cooldown, CodeQL, secret scanning | wellarchitected.github.com/library/application-security | CI/seg | DEBE — gratis; Dependabot nunca cambia el gestor (npm canónico) |
| PP-40 | Install delay / cooldown de dependencias (npm no lo trae: compensar) | notesof.dev/dependabot-codeql-and-the-install-delay | CI/seg | PUEDE — cooldown + no auto-merge + npm audit |
| PP-41 | Docker multi-stage + standalone + non-root + healthcheck | matthewswong.com/en/learn/devops (docker multi-stage) | CI/seg/arq | DEBE verificar contra Dockerfile real (hoy: sin standalone ni USER — F6-06) |
| PP-42 | Extensión MV3 estricta: service worker, sin código remoto, mínimo privilegio, storage seguro | deepwiki.com/baiqwe/web-text-extractor (MV3 compliance) | ext/seg | DEBE — claves BYOK jamás en storage.sync (ver F6-09) |

## Mapeo patrón → área del programa
- Arquitectura/API/validación: PP-09, PP-10, PP-15…PP-18, PP-25, PP-27, PP-29 → Enfoque E1
- Seguridad/RLS/auth: PP-13, PP-14, PP-21…PP-28, PP-39 → Enfoque E2
- IA/proveedores/modos: PP-01…PP-14 → Enfoque E3
- UX/diseño/a11y: PP-16, PP-19, PP-30…PP-33 → Enfoque E4
- Datos/migraciones/guest/share: PP-21, PP-22, PP-24, PP-28 → Enfoque E5
- Testing/CI/observabilidad/perf/Docker: PP-19, PP-20, PP-34…PP-41 → Enfoque E6
- Extensión/integraciones: PP-42, PP-10 → Enfoque E7

## Descartados con motivo (resumen)
DSPy runtime (Python en stack TS), plataformas de prompts muertas/pivotadas, AI Gateway como defecto (rompe BYOK/self-host y puede cobrar saldo), Langfuse/LangSmith por defecto (ops/coste), Zod (viola ADR-0002), Cache Components con sesiones (riesgo de sesión cacheada ajena), pnpm (npm es canónico por README/ADR).
