# Backend Supérette ERP/POS — API

Backend Node.js/Express + PostgreSQL, remplaçant le stockage `localStorage` du frontend par une vraie base
de données centralisée. Toutes les données (produits, ventes, clients, permissions, paramètres, journaux...)
transitent par cette API, sécurisée par jeton (JWT) et mots de passe hachés (bcrypt).

## Pourquoi PostgreSQL plutôt que MySQL/MariaDB

- Types **JSONB** natifs et indexables — utilisés ici pour les permissions par utilisateur et la configuration
  imprimante, sans avoir à créer des tables séparées pour chaque option.
- Verrouillage de lignes (`SELECT ... FOR UPDATE`) fiable pour empêcher deux caissiers de survendre le même
  produit en même temps (voir `routes/sales.js`) — essentiel pour un POS multi-utilisateurs.
- Offres gratuites avec sauvegardes automatiques incluses chez Supabase et Neon, ce qui répond directement
  à l'exigence de sauvegarde/restauration sans infrastructure supplémentaire à maintenir.

## ⚠️ État de ce livrable — à lire avant de faire confiance à de vraies données

Ce code a été écrit avec soin et vérifié **syntaxiquement** (chaque fichier passe `node --check`, tous les
chemins d'import ont été croisés avec l'arborescence réelle). En revanche, je n'ai **aucun accès réseau**
dans mon environnement de travail : je n'ai pas pu l'exécuter contre une vraie base PostgreSQL, ni envoyer
une seule requête HTTP réelle de bout en bout. **Teste-le toi-même avant toute mise en production** (voir
étapes ci-dessous) — c'est une vérification de 15 minutes, et je reste disponible pour corriger tout problème
que tu rencontrerais.

## Installation locale (test avant déploiement)

```bash
cd backend
npm install
cp .env.example .env        # puis remplis DATABASE_URL et JWT_SECRET
```

### Obtenir une base PostgreSQL gratuite (5 minutes)

1. Crée un compte sur [supabase.com](https://supabase.com) ou [neon.tech](https://neon.tech) (les deux ont un
   niveau gratuit avec sauvegardes automatiques)
2. Crée un projet, copie la chaîne de connexion PostgreSQL fournie dans `DATABASE_URL` (fichier `.env`)

### Créer les tables et le premier compte admin

```bash
npm run migrate                                   # crée toutes les tables (migrations/001_init.sql)
node scripts/create-admin.js "Administrateur" admin@superette.local "un-mot-de-passe-solide"
```

### Lancer le serveur

```bash
npm start
# puis dans un autre terminal :
curl http://localhost:4000/health
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@superette.local","password":"un-mot-de-passe-solide"}'
```

Si `/health` répond `{"ok":true,...}` et que le login renvoie un `token`, le backend fonctionne. **C'est le
test à faire avant d'aller plus loin.**

## Déploiement

Netlify/Vercel/Cloudflare Pages sont faits pour des sites **statiques** — ils ne peuvent pas exécuter un
serveur Node persistant connecté en continu à une base de données. Le frontend (déjà préparé) reste sur
Netlify ; ce backend a besoin d'un hébergeur d'applications :

- **Render** (recommandé, offre gratuite) : "New +" → "Web Service" → connecte ton dépôt Git → Build command
  `npm install`, Start command `npm start` → ajoute les variables d'environnement du `.env` dans "Environment"
- **Railway** : équivalent, également offre gratuite

Une fois déployé, note l'URL fournie (ex. `https://superette-api.onrender.com`) — c'est elle que le frontend
devra appeler (voir `MIGRATION-FRONTEND.md` à la racine du projet).

## Sauvegarde et restauration

```bash
./scripts/backup.sh                          # crée backend/backups/superette-AAAAMMJJ-HHMMSS.sql.gz
./scripts/restore.sh ./backups/fichier.sql.gz
```

Sur Supabase/Neon, une sauvegarde automatique quotidienne est en plus déjà incluse côté hébergeur —
`backup.sh` est une sauvegarde supplémentaire, sous ton contrôle, à planifier via une tâche cron si besoin.

## Structure

```
backend/
  migrations/001_init.sql   Schéma complet (13 tables)
  src/
    db.js                   Pool de connexions PostgreSQL
    auth.js                 Hachage bcrypt + JWT
    permissions.js           Miroir exact des permissions du frontend
    activityLog.js          Journal d'activité
    middleware/authenticate.js
    routes/                 Un fichier par module (products, sales, users...)
    app.js / server.js
  scripts/
    create-admin.js         Premier compte admin (hash bcrypt réel)
    backup.sh / restore.sh
```
