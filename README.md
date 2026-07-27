# Supérette ERP/POS — Plateforme complète (base de données centralisée)

Ce dossier contient tout ce qu'il te faut : le frontend (déjà connecté à une API) et le backend
(Node.js/Express + PostgreSQL). Les données ne sont plus stockées dans le navigateur — tout passe
désormais par une base de données centrale, partagée entre tous les appareils et utilisateurs.

```
superette-plateforme/
  frontend/          Le site à héberger sur Netlify (ou Vercel/Cloudflare Pages)
    index.html
    netlify.toml / _headers / vercel.json
  backend/           L'API à héberger sur Render (ou Railway)
    migrations/001_init.sql
    src/ ...
    scripts/create-admin.js, backup.sh, restore.sh
```

## ⚠️ Avant de commencer — ce qui a été testé, et comment

Je n'ai aucun accès réseau dans mon environnement de travail : impossible d'exécuter un vrai
PostgreSQL ou d'envoyer une requête HTTP réelle. Voici précisément ce qui a été vérifié malgré cette
limite, pour que tu saches où se situe la marge d'incertitude :

- **Vérifié réellement** : un navigateur automatisé (Playwright) a fait tourner ce fichier `index.html`
  exact contre un faux serveur qui reproduit fidèlement le contrat de l'API (mêmes routes, mêmes noms
  de champs, mêmes codes d'erreur) — connexion, création de catégorie/produit, vente en caisse,
  paramètres, et **synchronisation entre deux sessions différentes** (un produit créé dans l'une
  apparaît dans l'autre après actualisation) : tout fonctionne, 0 erreur.
- **Non vérifié** : le vrai serveur PostgreSQL et le vrai serveur Express n'ont jamais tourné
  ensemble sous mes yeux. Le code SQL et le code Express ont été relus et validés syntaxiquement,
  mais un premier test réel de ta part (15 minutes, étapes ci-dessous) reste nécessaire avant de
  basculer des données réelles dessus.

## Ordre des étapes

### 1. Backend — base de données + API (≈ 20 min)

```bash
cd backend
npm install
cp .env.example .env
```

Crée une base gratuite sur [Supabase](https://supabase.com) ou [Neon](https://neon.tech), colle
l'URL de connexion dans `DATABASE_URL` (fichier `.env`), puis :

```bash
npm run migrate
node scripts/create-admin.js "Administrateur" admin@superette.local "un-mot-de-passe-solide"
npm start
```

Vérifie que ça répond (dans un autre terminal) :
```bash
curl http://localhost:4000/health
curl -X POST http://localhost:4000/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@superette.local","password":"un-mot-de-passe-solide"}'
```
Si le login renvoie un `token`, le backend fonctionne. Déploie-le ensuite sur
[Render](https://render.com) (détails dans `backend/README.md`) et note son URL
(ex. `https://superette-api.onrender.com`).

### 2. Frontend — brancher l'URL du backend (1 min)

Ouvre `frontend/index.html`, cherche la ligne (vers le début) :
```js
const API_BASE_URL = "https://REMPLACE-PAR-URL-DE-TON-BACKEND.onrender.com";
```
et remplace-la par l'URL notée à l'étape 1.

### 3. Frontend — héberger sur Netlify (5 min)

Va sur [app.netlify.com/drop](https://app.netlify.com/drop) et glisse le dossier `frontend/` entier.
Netlify te donne une URL en quelques secondes. Retourne ensuite dans le backend et mets à jour
`CORS_ORIGIN` (fichier `.env` du backend) avec cette URL Netlify, puis redéploie le backend.

### 4. Vérification finale

- Connecte-toi avec le compte admin créé à l'étape 1
- Crée un produit, ouvre l'URL sur un autre appareil/navigateur, reconnecte-toi : le produit doit
  apparaître (c'était le problème signalé — il est résolu ici puisque tout vient de la même base)
- Change ton mot de passe admin dans Utilisateurs

## Ce qui a changé par rapport à la version précédente (localStorage)

Toutes les fonctionnalités, l'interface, le design, les rôles/permissions, les QR Codes, les
impressions et le responsive sont **identiques** à la version précédente — seule la façon dont les
données sont enregistrées a changé (base de données centrale au lieu du navigateur). Le bouton
"Réinitialiser toutes les données" a été désactivé côté frontend (il n'est plus sûr de vider une base
partagée entre plusieurs utilisateurs d'un simple clic) — utilise `backend/scripts/backup.sh` et
`restore.sh` pour toute opération de ce type.

## Sauvegardes

```bash
cd backend
./scripts/backup.sh      # sauvegarde datée dans backend/backups/
./scripts/restore.sh ./backups/fichier.sql.gz
```

Supabase/Neon incluent en plus leur propre sauvegarde automatique quotidienne, indépendante de ce
script.
