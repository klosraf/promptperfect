# Cierre verificado — endurecimiento y perfeccionamiento de PromptPerfect · 2026-11-22

**Árbol:** `~/Proyecto/promptperfect` (Mac del titular), rama
`feat/db-production-hardening`, integrada en `main` del fork
(github.com/klosraf/promptperfect) por fast-forward, sin commits de merge.
**Alcance:** confirmación por grupos de la oleada EGM 2026-11-12/13, cierre de
la línea de endurecimiento de BD, primera CI remota de la rama con corrección
de los tres fallos reales que destapó, merge a `main`, y programa de
perfeccionamiento (reconciliación de ramas, actions v5, dependencias a cero
vulnerabilidades, identidad visual propia, método EGM nativo).

## 1. Línea de endurecimiento (confirmada y publicada)

- Commits por grupos sobre el working tree de la oleada EGM (100 ficheros):
  `f931bad` security(db), `3921251` security(byok), `08e7d14` feat(egm),
  `cfad6fe` chore(ci/docs); `5af9271` fija npm como gestor canónico (los
  artefactos pnpm eran de una corrida local; conservados fuera del repo).
- Ensayo en Postgres efímero aislado antes de confirmar: 28 migraciones
  aplicadas / 0 pendientes, verify 61/0, RPC de cuota atómica verificada, y la
  guard BYOK preparada (`supabase/prepared/20261113000001`) se negó a correr
  antes de su ventana de 14 días, como está diseñada.
- Push al fork por SSH y **merge fast-forward a `main`** (`ac3bf6c..91f2083`,
  71 commits, ancestro estricto verificado, sin commit de merge).

## 2. Primera CI remota: tres fallos reales, tres correcciones

1. `2f35b3a` — el guard de diff de esquema de `db.yml` no podía pasar en push
   (`actions/checkout` no materializa `origin/<base>`); ahora hace fetch
   explícito de la ref base y sigue fallando cerrado si el fetch falla.
2. `b211b83` — `src/proxy.ts` devolvía 500 en `/app` y `/library` sin
   credenciales Supabase (llamaba `createServerClient` con env afirmada);
   ahora degrada a «sin sesión» con el mismo contrato null-safe del resto del
   código. Reproducido y verificado en copia limpia `npm ci` sin env: e2e
   5/8 → 8/8.
3. `91f2083` — tres directivas `eslint-disable` de `set-state-in-effect`
   sobraban bajo el plugin bloqueado 7.0.1 (el árbol local pnpm, con plugin
   más nuevo, sí las necesitaba: divergencia de entornos, causa raíz de la
   sorpresa). Árbol local reinstalado con `npm ci`: un solo entorno canónico.

## 3. Perfeccionamiento (2026-11-22)

- **Ramas reconciliadas:** `main` local fast-forward a `91f2083` (su contenido
  estaba íntegramente contenido en la rama; 0/0 con el fork tras el merge).
- `1018080` — `actions/checkout` y `actions/setup-node` a **v5** (Node 24
  nativo; desaparece la anotación de deprecación de Node 20).
- `0205990` — **npm audit: 31 vulnerabilidades (1 crítica, 15 altas) → 0**,
  sin saltos de versión mayor: next 16.1.6 → 16.4.6 (la crítica era el propio
  Next: smuggling en rewrites y crecimiento sin cota de la caché de imágenes;
  arrastra las altas de postcss y sharp), eslint-config-next a juego, vitest
  4.1.4 → 4.1.12. Efecto lateral gestionado: el plugin react-hooks 7.1.1 que
  trae eslint-config-next 16.4.6 sí dispara `set-state-in-effect` en los tres
  sitios E4, así que las directivas firmadas EGM se restauraron junto a su
  rationale (sin tocar código).
- `1e2d705` — **Identidad visual propia**: marca (prompt de terminal + chispa
  de optimización sobre el gradiente del acento), maestros SVG en
  `public/brand/`, pipeline reproducible `npm run brand:assets`, juego
  completo de recursos (app, PWA, social, extensión), componente `Logo` en las
  cabeceras y el héroe, `metadataBase` + tarjetas OG/Twitter, contraste medido
  y guía en `docs/brand/IDENTIDAD-VISUAL.md`.
- `52037cd` — **Método EGM nativo**: 7 skills y 10 agentes vendorizados en la
  configuración del repo (`.claude/skills`, `.claude/agents`,
  `.claude/egm`), referencias re-enraizadas, carta en `.claude/egm/METHOD.md`
  y `AGENTS.md`/`CLAUDE.md` en la raíz. Consolida la oleada de noviembre (que
  ejecutó el método por sustitución declarada) sin duplicar su expediente en
  `docs/audits`.

## 4. Estado final verificado

| Puerta | Resultado |
| --- | --- |
| typecheck / lint (`--max-warnings=0`) | 0 / 0 |
| Vitest | 544/544 en 88 ficheros (+2 del componente Logo en corrida dirigida: 5/5 con WorkspaceHeader) |
| Coberturas core y crítica | exit 0 / exit 0 |
| build + perf:budget | exit 0; chunk máx. 112 KB gz, total 466 KB gz (presupuestos 200/550) |
| npm audit | **0 vulnerabilidades** |
| CI remota (rama, HEAD `52037cd`) | run 45099065049: static ✓, test ✓, build ✓, e2e ✓, docker ✓ |
| CI + Database sobre `main` (merge) | runs 45096392108 / 45096392109: exit 0 / exit 0 |
| Ensayo BD efímero | 28 migraciones, verify 61/0, guard BYOK rechazada por su interlock |

## 5. Lo único que queda: acto del titular

La aplicación a la **base de datos de producción** sigue pendiente de su acto
personal: dejar la conexión real en la Mac (nunca por chat). Con ella, el
runbook de `docs/audits/APLICACION-PRODUCCION-2026-11-13.md` se ejecuta de
inmediato: `db:check` → backup `pg_dump` verificado con SHA-256 → aplicación
acotada en orden de `20261112000000`, `20261112000001`, `20261113000000` con
verificación tras cada una → a los 14 días, guard BYOK paso 2 desde
`supabase/prepared/`.

Diferidos con causa (decisiones, no defectos): rate-limit distribuido
(F2-04, solo si se acredita un despliegue multi-instancia) y convergencia del
esquema `guest_usage` (addendum de ADR-0006).
