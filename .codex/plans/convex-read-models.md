# Modèles de lecture Convex

## Goal

- Réduire fortement les lectures Convex provoquées par les ventes, achats,
  productions, changements de stock et rechargements, sans modifier le rendu ni
  les règles métier visibles.
- Valider la migration sur un déploiement Convex de preview contenant une copie
  isolée des tables métier de production avant toute fusion vers `main`.

## Non-Goals

- Modifier l'UX, les libellés, les formulaires ou les droits utilisateurs.
- Écrire dans la base de production pendant le développement de la branche.
- Copier les tables internes Better Auth, les sessions, les secrets ou les JWKS
  vers la preview.

## Acceptance Criteria

| ID  | Criteria                                                                                                                             | Proof                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| AC1 | Le tableau de bord et la page Compte renvoient les mêmes valeurs qu'avant pour un même jeu de données.                               | Tests de comparaison avec transactions, échanges, commandes et productions. |
| AC2 | `accounts:overview` lit au plus huit résumés hebdomadaires après migration, et non l'historique brut des transactions.               | Tests Convex et métriques d'exécution sur la preview.                       |
| AC3 | Une vente ne réexécute plus la lecture complète des recettes et ingrédients lorsque seule la quantité en stock change.               | Coûts de recette matérialisés et vérification des dépendances/logs preview. |
| AC4 | Le tableau de bord s'appuie sur un résumé d'inventaire maintenu atomiquement pour ses indicateurs de stock.                          | Tests de création, modification et suppression d'opérations.                |
| AC5 | Les requêtes temporelles de production reçoivent des bornes stables et n'appellent plus `Date.now()` sur leur chemin normal.         | Recherche statique ciblée et tests avec bornes explicites.                  |
| AC6 | Les nouvelles projections peuvent être reconstruites de façon idempotente depuis les données existantes.                             | Test de migration exécutée deux fois.                                       |
| AC7 | Le build Netlify de preview utilise un backend Convex isolé ; la copie des données métier est documentée et exclut Better Auth/JWKS. | Configuration, script/documentation et déploiement de la branche.           |
| AC8 | L'ensemble des contrôles du dépôt passe.                                                                                             | `pnpm check` et `pnpm build`.                                               |

## Relevant Files

| Path                                    | Purpose                    | Expected Change                                                              |
| --------------------------------------- | -------------------------- | ---------------------------------------------------------------------------- |
| `convex/schema.ts`                      | Schéma métier              | Ajouter les projections, marqueurs et index nécessaires.                     |
| `convex/lib/accountSummary.ts`          | Projection comptable       | Nouveau calcul/rebuild incrémental des semaines.                             |
| `convex/lib/inventorySummary.ts`        | Projection d'inventaire    | Nouveau calcul/rebuild incrémental des indicateurs.                          |
| `convex/lib/recipeCost.ts`              | Coûts matière              | Matérialiser et reconstruire les coûts et références manquantes.             |
| `convex/accounts.ts`                    | Vue Compte                 | Lire les résumés hebdomadaires avec borne stable.                            |
| `convex/dashboard.ts`                   | Vue tableau de bord        | Lire les projections et une borne temporelle stable.                         |
| `convex/transactions.ts`                | Écritures métier           | Maintenir atomiquement les projections.                                      |
| `convex/orders.ts`                      | Paiement/réception         | Maintenir atomiquement les projections.                                      |
| `convex/products.ts`                    | Catalogue et stock         | Maintenir les coûts et le résumé d'inventaire.                               |
| `convex/recipes.ts`                     | Recettes                   | Lire et maintenir les coûts matérialisés.                                    |
| `convex/migrations.ts`                  | Migration production       | Rebuild idempotent des nouveaux modèles de lecture.                          |
| `convex/seed.ts`                        | Initialisation             | Construire les projections sur une base neuve.                               |
| `src/routes/_app/index.tsx`             | Chargement tableau de bord | Fournir les bornes stables et différer les données des dialogues.            |
| `src/routes/_app/compte.tsx`            | Chargement Compte          | Fournir le début de semaine stable.                                          |
| `src/components/operation-dialog.tsx`   | Dialogues rapides          | Charger leurs données seulement à l'ouverture si elles ne sont pas fournies. |
| `netlify.toml`, `README.md`, `scripts/` | Preview isolée             | Documenter/outiller la copie contrôlée des tables métier.                    |

## Execution Plan

1. Ajouter des fonctions pures de calcul et leurs tests.
2. Ajouter les tables de résumés avec chemins de repli compatibles avant migration.
3. Maintenir les résumés dans toutes les mutations créant, modifiant ou supprimant transactions et stocks.
4. Matérialiser les coûts de recettes afin de supprimer leur dépendance au stock courant.
5. Passer des bornes temporelles stables depuis les routes.
6. Retirer du chargement initial du tableau de bord les données propres aux dialogues.
7. Ajouter la migration idempotente et l'outillage de copie métier vers une preview.
8. Tester, mesurer localement puis sur la preview de branche.

## Validation Plan

- Tests unitaires des contributions comptables et d'inventaire.
- Tests Convex sur créations, corrections, suppressions et changement de semaine.
- Test de migration idempotente et égalité avec le calcul historique.
- `pnpm check`.
- `pnpm build`.
- Mesure `databaseReadBytes`, documents lus et cache hits sur la preview.

## Risks

| Risk                                                          | Mitigation                                                                                                  |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Désynchronisation d'un résumé lors d'une mutation rare.       | Centraliser les mises à jour, couvrir tous les appels et fournir un rebuild idempotent.                     |
| Incohérence temporaire lors du déploiement avant migration.   | Garder un chemin de repli vers les calculs historiques tant que le marqueur n'existe pas.                   |
| Altération de données de production.                          | Développer sur preview, migration additive, aucune commande `--prod` d'écriture avant validation explicite. |
| Copie de comptes ou de clés cryptographiques vers la preview. | Exporter/importer uniquement les tables métier de l'application.                                            |
| Coût en écritures supérieur au gain de lecture.               | Une projection compacte, mise à jour une fois par mutation, puis mesure sur preview.                        |

## Open Questions

- Le gain réel sera confirmé par les métriques de la preview avec un scénario de ventes répétées.
