# Plan — Échanges et commandes

## Goal

- Remplacer les saisies commerciales séparées par un panier d’échange unique, relier le paiement ou la réception d’une commande à une transaction datée, et convertir toutes les opérations historiques vers ce modèle sans modifier le stock courant pendant la migration.

## Non-Goals

- Mélanger la production interne au panier commercial.
- Ajouter un suivi bancaire ou plusieurs moyens de paiement.
- Inventer silencieusement des références absentes du classeur.

## Acceptance Criteria

| ID   | Criteria                                                                                                                                                                  | Proof                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| AC1  | Un même panier accepte simultanément produits vendus, lots vendus, services vendus et produits achetés.                                                                   | Tests Convex et parcours navigateur avec panier mixte.                |
| AC2  | Les quantités restent entières, les prix conservent la saisie en rapports et les sous-totaux entrant/sortant sont arrondis séparément au septim inférieur.                | Tests unitaires des cas fractionnaires et mixtes.                     |
| AC3  | La recherche « lot » ne conserve pas de faux positifs et la liste possède un défilement visible.                                                                          | Vérification navigateur desktop et mobile.                            |
| AC4  | Le paiement d’une commande client crée une transaction de vente liée à la date choisie sans changer son état logistique.                                                  | Test Convex et dialogue de paiement.                                  |
| AC5  | La réception d’une commande fournisseur crée une transaction d’achat liée, ajoute le stock et utilise la date choisie.                                                    | Test Convex et dialogue de réception.                                 |
| AC6  | Une commande liée ne peut pas produire une seconde transaction ; supprimer la transaction la délie.                                                                       | Tests d’idempotence et de suppression.                                |
| AC7  | Les anciennes opérations `bundle`, `order` et `service` sont converties en ventes/achats structurés et toutes les opérations commerciales importées possèdent des lignes. | Mutation de migration idempotente et contrôle Convex à zéro anomalie. |
| AC8  | Les composants des lots et lignes de commandes importés sont reliés aux produits réels.                                                                                   | Contrôle Convex à zéro référence requise non reliée.                  |
| AC9  | La migration conserve exactement les stocks et le nombre d’opérations existants.                                                                                          | Comparaison avant/après de la base locale.                            |
| AC10 | Toutes les mutations vérifient session, permissions, bornes, références et stocks côté Convex.                                                                            | Tests d’authentification, autorisation et atomicité.                  |

## Relevant Files

| Path                                  | Purpose                     | Expected Change                                                 |
| ------------------------------------- | --------------------------- | --------------------------------------------------------------- |
| `convex/schema.ts`                    | Modèle de données           | Ajouter échange, sens des lignes et liens commande/transaction. |
| `convex/transactions.ts`              | Moteur commercial           | Enregistrer et modifier les paniers mixtes atomiquement.        |
| `convex/orders.ts`                    | Cycle des commandes         | Ajouter paiement/réception et lien transactionnel.              |
| `convex/migrations.ts`                | Conversion locale/prod      | Conversion idempotente des anciennes données.                   |
| `convex/lib/legacy.ts`                | Correspondances historiques | Résolution déterministe des noms et lignes du classeur.         |
| `convex/seed.ts`                      | Import initial              | Produire directement des données converties.                    |
| `src/components/operation-dialog.tsx` | Saisie des opérations       | Panier à deux sens composé avec Shadcn.                         |
| `src/routes/_app/commandes.tsx`       | Suivi des commandes         | Dialogues de paiement/réception datés.                          |
| `src/components/ui/command.tsx`       | Sélecteurs                  | Rendre le défilement visible.                                   |

## Execution Plan

1. Étendre le schéma de manière rétrocompatible et factoriser le moteur d’échange.
2. Adapter l’enregistrement, la modification et la suppression des transactions.
3. Ajouter la finalisation des commandes et ses protections.
4. Construire le panier mixte et les dialogues de finalisation avec les composants Shadcn existants.
5. Implémenter et exécuter la migration historique idempotente.
6. Valider la base, les tests stricts, le build et les parcours navigateur.

## Validation Plan

- Tests ciblés `transactions`, `orders`, `migrations`, `seed`.
- `pnpm check` et `pnpm build`.
- Comparaison Convex avant/après : stocks, transactions, références manquantes et liens de commande.
- Vérification navigateur du panier, de la recherche, du scroll et des dialogues datés.

## Risks

| Risk                                       | Mitigation                                                                                                                          |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Double application des stocks historiques  | La migration ajoute la structure et les mouvements de référence sans patcher les stocks courants ; comparaison stricte avant/après. |
| Correspondance erronée de noms historiques | Table d’alias explicite et échec de migration lorsqu’une référence obligatoire reste ambiguë.                                       |
| Double paiement/réception                  | Lien unique côté commande, vérifié dans la même mutation Convex.                                                                    |
| Régression sur données déjà importées      | Champs de schéma optionnels pendant la transition et migration idempotente.                                                         |

## Open Questions

- Aucune question bloquante ; les opérations de commande dont le détail est réellement absent conserveront une ligne historique financière explicite plutôt qu’un stock inventé.
