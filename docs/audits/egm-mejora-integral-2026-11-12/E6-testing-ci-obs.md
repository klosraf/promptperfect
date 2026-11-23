# E6 — Testing/CI/observabilidad/perf/Docker: que las puertas existan de verdad
## Prompt exacto
«PromptPerfect (Vitest 4, Playwright, GitHub Actions, Docker): diseña el cierre de las puertas declaradas y no cableadas (perf:budget, guard de esquema, trigger de la rama de trabajo) y la documentación honesta de alcances, sin daemon Docker disponible y sin inflar la suite.»
## Brief
Hallazgos: F6-01, F6-02, F6-03, F6-04, F6-05, F6-06, F6-07, F6-08. Patrones: PP-19, PP-34, PP-35, PP-39, PP-41.
## Draft v1
1. F6-02: ci.yml, job build: tras `npm run build`, paso `npm run perf:budget`.
2. F6-03 parcial: ci.yml dispara también en push/PR de `feat/db-production-hardening` (la rama viva del proyecto); el doble build de e2e queda registrado como ineficiencia aceptada (el artefacto entre jobs es el fix futuro).
3. F6-05: db.yml, el schema-diff guard pasa de `echo` a `exit 1` cuando un PR toca los legacy fuera del header DEPRECATED.
4. F6-01: vitest.critical.config.ts amplía el include con `src/lib/guest.ts` manteniendo perFile 95/80/90 — solo si la cobertura medida lo sostiene; si no, se añaden tests de guest hasta sostenerlo o se documenta el suelo real. El alcance «critical = N ficheros» queda escrito en el propio config.
5. F6-07: docker-compose.yml healthcheck → `http://127.0.0.1:3000/api/healthz` (misma definición que la imagen).
6. F6-06 DOC: el comentario del Dockerfile deja de decir «standalone» (dice multi-stage con `npm start` y el porqué del parche de TypeScript); standalone + USER non-root quedan «pendiente de decisión» hasta poder construir la imagen (daemon ausente).
7. F6-04/F4-06 DOC: README declara el alcance real de e2e (smoke + a11y en superficies no autenticadas) y de db:verify (conteo dinámico).
Verificación: YAML parseado (python yaml), perf:budget ejecutado tras build local, critical coverage ejecutada, suite completa sin regresión (suelo 511).
## Review Goldfish fresco
PENDIENTE.
## Resolve
PENDIENTE.
## Review-loop
PENDIENTE.

## Review Goldfish fresco — veredicto: APTO CON CAMBIOS
Bloqueantes: (1) el guard de db.yml por nombre de fichero bloquea cambios legítimos (¡incluida la redacción de E5!) — debe ser por contenido; (2) guest.ts en critical exige añadir AMBOS includes (tests y coverage).
## Resolve (diseño v2)
1. Guard por contenido: falla solo si el diff de los legacy contiene líneas modificadas que no sean comentarios SQL (`--`) ni blancas; en push sin base_ref se usa origin/main (comportamiento actual declarado).
2. Critical: se añaden src/lib/guest.test.ts a test.include y src/lib/guest.ts a coverage.include. Medido por Goldfish en el Mac: guest.ts = 100 % líneas / 88,23 % branches / 100 % funciones → sostiene 95/80/90 con margen estrecho en branches (queda registrado: tests nuevos de guest deben cubrir ramas).
3. perf:budget solo en el job build (mismo runner que produce .next); prohibido moverlo a jobs sin build. db.yml gana también el trigger de la rama de hardening.
## Review-loop
APTO v2.
