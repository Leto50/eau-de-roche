# L’eau d’Roche

Application quotidienne de gestion de la boutique RP Skyrim L’eau d’Roche,
issue du classeur `Inventaire 2.xlsx`. Elle réunit le stock, les opérations, les
commandes, les recettes et les lots dans une interface responsive inspirée d’un
registre d’apothicaire.

## Socle technique

- TanStack Start et React 19 pour le rendu serveur et le routage.
- Convex pour les données temps réel et les mutations atomiques.
- Better Auth intégré à Convex, avec rôles administrateur/employé et inscription
  publique désactivée côté backend.
- shadcn/ui pour les primitives interactives et accessibles, configurées avec
  Tailwind CSS pour conserver la direction artistique Skyrim.
- ESLint flat strict de type T3 (`recommendedTypeChecked` et
  `stylisticTypeChecked`), TypeScript strict et Vitest.
- Génération d’un point d’entrée SSR minimal pour le déploiement Netlify.

## Développement local

Prérequis : Node.js 22 et pnpm 11.

```bash
pnpm install
pnpm dev:convex
```

Au premier lancement, Convex propose un déploiement cloud de développement ou
un backend local anonyme. Le CLI écrit ensuite `CONVEX_DEPLOYMENT`,
`VITE_CONVEX_URL` et `VITE_CONVEX_SITE_URL` dans `.env.local`.

Configurer les secrets sur le déploiement Convex sélectionné :

```bash
pnpm convex env set SITE_URL http://localhost:3000
pnpm convex env set BETTER_AUTH_SECRET
pnpm convex env set INITIAL_ADMIN_IDENTIFIER "administrateur"
pnpm convex env set INITIAL_ADMIN_PASSWORD
pnpm convex env set SEED_SECRET
```

Les commandes sans valeur demandent celle-ci de manière interactive. Utiliser
des secrets aléatoires d’au moins 32 octets.

Dans un second terminal :

```bash
pnpm seed -- '{"seedSecret":"votre-secret-de-seed"}'
pnpm convex run internal.auth.bootstrapAdmin '{"name":"Administrateur"}'
pnpm convex env remove INITIAL_ADMIN_PASSWORD
pnpm dev:web
```

La commande `bootstrapAdmin` attribue le rôle `admin` à l’identifiant défini
dans `INITIAL_ADMIN_IDENTIFIER`. Si le compte existe déjà, il est promu et
conserve son mot de passe actuel. Sinon, il est créé avec le mot de passe lu depuis
`INITIAL_ADMIN_PASSWORD`. C’est une fonction Convex interne : elle est
accessible au CLI du déploiement, mais pas au navigateur. Supprimer
immédiatement `INITIAL_ADMIN_PASSWORD` après son exécution. Ouvrir ensuite
<http://localhost:3000/connexion>. Les autres comptes sont créés par un
administrateur depuis le menu de l’application. Les mots de passe doivent
contenir entre 12 et 128 caractères.

`pnpm dev` lance Convex et Vite ensemble une fois la configuration initiale
terminée.

## Initialisation des données

Le classeur historique a déjà été converti dans le seed versionné
`data/inventaire.seed.json`. Le jeu actuel contient 84 produits, 111 opérations
valides, 12 commandes, 35 recettes, 8 lots, 5 personnages et 11 contacts.
L’import Convex est idempotent : un `systemSetting` empêche de dupliquer un jeu
déjà initialisé. La mutation d’import refuse toute requête qui ne présente pas
`SEED_SECRET`.

## Règles métier importantes

- Toutes les requêtes et mutations applicatives exigent une session valide.
- Un échange peut réunir dans le même panier produits, lots et services vendus,
  ainsi que les produits achetés par la boutique. La production reste séparée.
- Chaque échange écrit dans une même mutation Convex l’opération, ses lignes,
  les mouvements de stock, les nouveaux stocks et l’audit.
- Un échange est refusé si son résultat rendrait un stock négatif.
- Le paiement d’une commande client et la réception d’une commande fournisseur
  créent une transaction liée, à la date choisie par l’employé.
- Les quantités, prix, remises, dates et textes sont validés côté backend.
- Un service ne produit aucun mouvement de stock.
- L’inscription publique est désactivée côté Better Auth, y compris si son
  endpoint est appelé directement.
- Seul un utilisateur ayant le rôle `admin` peut appeler l’API de création des
  comptes employés.

## Vérification

```bash
pnpm check
pnpm build
```

`pnpm check` exécute Prettier en mode contrôle, ESLint sans avertissement,
TypeScript strict et les tests Convex. Les tests montent également le composant
Better Auth et vérifient l’atomicité des opérations ainsi que les refus de stock
négatif et d’accès anonyme.

## Déploiement Convex + Netlify

Le fichier `netlify.toml` est déjà configuré. Le build Netlify exécute
`convex deploy`, injecte automatiquement `VITE_CONVEX_URL` et
`VITE_CONVEX_SITE_URL`, déploie les fonctions Convex, puis produit le client et
le serveur TanStack Start. Le script `scripts/prepare-netlify.mjs` génère ensuite
le point d’entrée SSR attendu par Netlify. Des en-têtes empêchent également
l’intégration en iframe, la détection incorrecte des contenus et l’accès aux
capteurs inutiles.

1. Créer ou sélectionner un projet Convex cloud avec `pnpm convex dev`.
2. Créer le site Netlify à partir du dépôt Git afin de connaître son URL finale.
3. Générer une clé de déploiement de production dans le tableau de bord Convex.
4. Ajouter `CONVEX_DEPLOY_KEY` aux variables d’environnement du site Netlify.
5. Configurer les variables du backend de production :

```bash
pnpm convex env set --prod SITE_URL "https://votre-site.netlify.app"
pnpm convex env set --prod BETTER_AUTH_SECRET
pnpm convex env set --prod INITIAL_ADMIN_IDENTIFIER "administrateur"
pnpm convex env set --prod INITIAL_ADMIN_PASSWORD
pnpm convex env set --prod SEED_SECRET
```

6. Lancer le premier déploiement Netlify. Le fichier `netlify.toml` fournit la
   commande et le dossier de publication.
7. Importer une seule fois les données et créer le premier administrateur :

```bash
pnpm convex run --prod seed:importWorkbook '{"seedSecret":"votre-secret-de-seed"}'
pnpm convex run --prod internal.auth.bootstrapAdmin '{"name":"Administrateur"}'
pnpm convex env remove --prod INITIAL_ADMIN_PASSWORD
```

L’import initial convertit directement les données du classeur. Pour un
déploiement qui contenait déjà ces données avant cette évolution, exécuter une
seule fois, après le déploiement des fonctions :

```bash
pnpm convex run --prod migrations:convertLegacyOperations
pnpm convex run --prod migrations:repairRecipeReferences
pnpm convex run --prod migrations:reclassifyAnnexePotions
pnpm convex run --prod migrations:classifyPotionCraftability
pnpm convex run --prod migrations:normalizeCatalogNames
pnpm convex run --prod migrations:normalizeRecipeFamilies
pnpm convex run --prod migrations:indexTransactionSearch
pnpm convex run --prod migrations:normalizeContacts
pnpm convex run --prod migrations:normalizeSupplierOrderStatuses
pnpm convex run --prod migrations:rebuildJournalSummary
```

Ces migrations sont idempotentes. La première ne rejoue aucun mouvement sur le
stock courant ; la seconde rattache les recettes et leurs ingrédients aux
articles canoniques, puis recalcule les coûts matière disponibles. Les suivantes
réunissent toutes les potions dans la même catégorie, distinguent les potions
fabricables de celles trouvées uniquement, uniformisent l’affichage du
catalogue, normalisent les catégories de recettes, préparent la recherche du
journal et dédupliquent le carnet de contacts sans réécrire les libellés
historiques des opérations et commandes. La dernière matérialise le solde global
du journal afin que la page Compte n’ait plus à relire toutes les transactions ;
la précédente ramène les anciennes commandes fournisseur « prêtes » à l’état
« À recevoir ».

Après la première connexion, l’administrateur crée les comptes employés depuis
le menu « Administration ». Il n’existe aucune page d’inscription publique.

Si le domaine Netlify ou le domaine personnalisé change, mettre à jour
`SITE_URL` sur Convex avant de se reconnecter. Pour les Deploy Previews, utiliser
une clé Convex de preview et une URL d’authentification dédiée ; leurs données
sont isolées de la production.

## Commandes utiles

| Commande                                                           | Rôle                                                   |
| ------------------------------------------------------------------ | ------------------------------------------------------ |
| `pnpm dev`                                                         | Convex et site local en parallèle                      |
| `pnpm seed -- '{…}'`                                               | Importe le seed avec le secret du déploiement          |
| `pnpm convex run --prod migrations:convertLegacyOperations`        | Convertit les anciennes opérations                     |
| `pnpm convex run --prod migrations:repairRecipeReferences`         | Répare les références et les coûts des recettes        |
| `pnpm convex run --prod migrations:reclassifyAnnexePotions`        | Réunit toutes les potions dans la catégorie « Potion » |
| `pnpm convex run --prod migrations:classifyPotionCraftability`     | Renseigne le mode d’obtention des potions              |
| `pnpm convex run --prod migrations:normalizeCatalogNames`          | Uniformise les noms du catalogue                       |
| `pnpm convex run --prod migrations:normalizeRecipeFamilies`        | Normalise les catégories de recettes                   |
| `pnpm convex run --prod migrations:indexTransactionSearch`         | Indexe la recherche textuelle du journal               |
| `pnpm convex run --prod migrations:normalizeContacts`              | Normalise et déduplique les contacts des commandes     |
| `pnpm convex run --prod migrations:normalizeSupplierOrderStatuses` | Corrige les anciens états fournisseur                  |
| `pnpm convex run --prod migrations:rebuildJournalSummary`          | Matérialise le solde global du journal                 |
| `pnpm lint`                                                        | ESLint strict, zéro avertissement                      |
| `pnpm typecheck`                                                   | Vérification TypeScript sans émission                  |
| `pnpm test`                                                        | Tests métier Convex + Better Auth                      |
| `pnpm build`                                                       | Build client, SSR et fonction Netlify                  |
| `pnpm build:netlify`                                               | Déploiement Convex puis build Netlify                  |
