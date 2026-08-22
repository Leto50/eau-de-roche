# Feature Plan — L’eau de Roche

## Goal

- Remplacer le classeur `Inventaire 2.xlsx` par une application web quotidienne, responsive et déployable sur Netlify, avec TanStack Start, Convex et des composants shadcn/ui.
- Conserver la logique métier utile du classeur (stocks, journal, commandes, recettes, lots et comptes) dans un modèle de données explicite, validé et transactionnel.
- Donner au produit une direction artistique de registre d'apothicaire de Skyrim, lisible et crédible, sans codes visuels de logiciel SaaS.
- Employer des termes métier directs dans les libellés et réserver l'ambiance Skyrim à la direction artistique.

## Non-Goals

- Reproduire les formules Excel cellule par cellule ou conserver les erreurs `#N/A` / `#VALUE!` du classeur.
- Construire une comptabilité légale, une boutique e-commerce, un système de paiement ou une gestion multi-guildes.
- Déployer le projet sur les comptes Netlify/Convex du propriétaire sans ses identifiants ou clés de déploiement.

## Acceptance Criteria

| ID   | Criteria                                                                                                                                                                                                                                                                                                                                 | Proof                                                                               |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| AC1  | Le projet démarre avec TanStack Start, Convex et shadcn/ui, avec TypeScript strict et une configuration ESLint flat inspirée de create-t3-app (`recommendedTypeChecked` + `stylisticTypeChecked`).                                                                                                                                       | `pnpm typecheck`, `pnpm lint`, inspection des dépendances et configurations.        |
| AC2  | Le schéma Convex couvre produits, personnages, contacts, opérations, mouvements de stock, commandes, lignes de commande, recettes et ingrédients de recette avec index utiles.                                                                                                                                                           | Génération Convex et tests des fonctions métier.                                    |
| AC3  | Une opération validée écrit atomiquement le journal et le mouvement de stock correspondant, refuse les valeurs invalides et empêche un stock négatif involontaire.                                                                                                                                                                       | Tests unitaires et mutation Convex locale.                                          |
| AC4  | Les données utiles de `Inventaire 2.xlsx` peuvent être transformées par un script reproductible, contrôlées, puis importées sans dupliquer un jeu déjà initialisé.                                                                                                                                                                       | Exécution du script d'extraction, rapport d'import et seed Convex local.            |
| AC5  | Le tableau de bord expose les alertes de stock, l'activité récente, les commandes ouvertes et la valeur du stock.                                                                                                                                                                                                                        | Test navigateur sur données seedées.                                                |
| AC6  | L'inventaire permet recherche, filtre par famille et lecture immédiate du stock, du seuil, du prix et de l'état; le journal permet de créer une opération.                                                                                                                                                                               | Test navigateur desktop et mobile.                                                  |
| AC7  | Les commandes et recettes sont consultables dans des vues dédiées cohérentes avec les données du classeur.                                                                                                                                                                                                                               | Test navigateur et vérification des états vides/chargement/erreur.                  |
| AC8  | L'interface est responsive, navigable au clavier, respecte `prefers-reduced-motion` et possède une DA Skyrim/apothicaire cohérente sans apparence de dashboard SaaS. Les primitives shadcn fournissent les comportements éprouvés et restent entièrement configurées par Tailwind pour cette DA, sans imposer leur présentation vanilla. | Audit visuel, inventaire des primitives et interactions clavier dans le navigateur. |
| AC9  | Les mutations privées exigent une identité authentifiée, l'inscription publique est désactivée et seuls les administrateurs peuvent créer les comptes employés avec le plugin admin de Better Auth sur Convex.                                                                                                                           | Tests d'autorisation et documentation du bootstrap administrateur.                  |
| AC10 | Le dépôt contient la configuration Netlify et une documentation précise pour le développement local, l'import initial et le déploiement Convex + Netlify.                                                                                                                                                                                | `pnpm build` et revue du README/netlify.toml.                                       |

## Relevant Files

| Path                           | Purpose                                           | Expected Change |
| ------------------------------ | ------------------------------------------------- | --------------- |
| `package.json`                 | Scripts, dépendances, garde-fous du projet        | Création        |
| `eslint.config.js`             | Validation stricte de style T3 adaptée à TanStack | Création        |
| `src/routes/`                  | Routes TanStack Start                             | Création        |
| `src/components/`              | Shell, vues métier et primitives shadcn           | Création        |
| `src/styles.css`               | Thème apothicaire, responsive et mouvements       | Création        |
| `convex/schema.ts`             | Modèle de données métier                          | Création        |
| `convex/*.ts`                  | Requêtes, mutations, auth, import                 | Création        |
| `scripts/extract-workbook.mjs` | Conversion reproductible du classeur en seed      | Création        |
| `data/inventaire.seed.json`    | Données normalisées issues du classeur            | Génération      |
| `netlify.toml`                 | Build et runtime Netlify                          | Création        |
| `README.md`                    | Installation, auth, import et déploiement         | Création        |

## Execution Plan

1. Initialiser le projet TanStack Start et shadcn/ui, puis installer Convex et le socle strict TypeScript/ESLint/tests.
2. Extraire le classeur dans un format de seed contrôlé et documenter les anomalies ignorées.
3. Définir le schéma Convex, l'authentification, les services métier et les opérations atomiques, puis générer les types.
4. Construire le shell responsive et les quatre parcours principaux : vue d'ensemble, inventaire, journal, commandes et recettes.
5. Connecter les formulaires aux mutations, finaliser les états de chargement/erreur/vide et la direction artistique.
6. Ajouter la configuration Netlify et la documentation de déploiement.
7. Exécuter lint, typecheck, tests, build, audit dépendances et validation navigateur desktop/mobile; corriger jusqu'au vert.

## Validation Plan

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm audit --prod`
- Génération Convex et seed sur un backend de développement local.
- Parcours navigateur : connexion, dashboard, recherche inventaire, ajout d'une opération, commandes, recettes, navigation mobile et clavier.

## Risks

| Risk                                                                                                       | Mitigation                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Certaines cellules Excel sont des formules en erreur ou des tableaux auxiliaires très larges.              | Importer les lignes métier sources, recalculer les agrégats dans Convex et produire un rapport explicite des lignes ignorées.                                                                |
| TanStack Start est encore en RC et l'intégration auth/SSR peut évoluer.                                    | Utiliser l'intégration officielle Convex + Better Auth pour TanStack Start, épingler les versions sensibles et valider le build Netlify.                                                     |
| Une inscription publique permettrait aux employés de créer eux-mêmes leur accès.                           | Désactiver l'inscription dans Better Auth, créer le premier admin par un bootstrap secret et réserver l'API de création au rôle admin.                                                       |
| La mutation d'import initial pourrait être appelée depuis un client non authentifié.                       | Exiger un secret de seed propre au déploiement avant toute lecture ou écriture, en plus de l'idempotence de l'import.                                                                        |
| Une opération mal saisie pourrait corrompre le stock.                                                      | Valider les montants, calculer le delta côté backend et écrire journal + stock dans une mutation atomique testée.                                                                            |
| La DA très typée peut nuire à la lisibilité.                                                               | Réserver la typographie décorative aux titres, conserver des contrastes AA et tester mobile/clavier/réduction des mouvements.                                                                |
| Une primitive shadcn pourrait imposer son aspect vanilla ou être remplacée à tort par un composant maison. | Employer shadcn pour les mécaniques disponibles (dialogue, formulaire, navigation, tableau, retour d’état), puis configurer leur rendu exclusivement avec les utilitaires Tailwind de la DA. |

## Open Questions

- L'adresse et le nom du premier administrateur seront renseignés lors de la configuration du déploiement.
