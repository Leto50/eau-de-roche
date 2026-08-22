# Apex Task List — L’eau de Roche

| Task              | Owner | Files/Modules                                      | Depends On | Acceptance Criteria | Validation                             |
| ----------------- | ----- | -------------------------------------------------- | ---------- | ------------------- | -------------------------------------- |
| T1 — Socle        | main  | Config racine, `src/router.tsx`, primitives UI     | —          | AC1                 | Install, lint et typecheck minimal     |
| T2 — Migration    | main  | `scripts/`, `data/`                                | T1         | AC4                 | Extraction + rapport déterministe      |
| T3 — Backend      | main  | `convex/`                                          | T1, T2     | AC2, AC3, AC9       | Codegen + tests métier + appels locaux |
| T4 — Interface    | main  | `src/routes/`, `src/components/`, `src/styles.css` | T1, T3     | AC5, AC6, AC7, AC8  | Tests composants + navigateur          |
| T5 — Livraison    | main  | `netlify.toml`, `README.md`, configs               | T1–T4      | AC10                | Lint, typecheck, tests, build, audit   |
| T6 — Revue finale | main  | Ensemble du projet                                 | T5         | AC1–AC10            | Revue diff + navigateur desktop/mobile |
| T7 — Comptes      | main  | `convex/auth.ts`, connexion, shell, documentation  | T3, T4     | AC9                 | Tests des rôles et parcours admin      |

## Parallelization

- Sequential: T1 → T2 → T3 → T4 → T5 → T6, car le dépôt est vide et les types générés ainsi que le seed structurent l'interface.
- Parallel-safe: aucun travail délégué; les fichiers partagés et le codegen rendent l'exécution séquentielle plus sûre.
- Review-only: T6.
