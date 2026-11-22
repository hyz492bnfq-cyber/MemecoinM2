# Meme Radar — première version

Cette version fournit :
- Un bot Telegram minimal (`/start`, `/dashboard`, `/help`).
- Un accès au dashboard par code partagé.
- Une session signée dans un cookie `HttpOnly`.
- Une session sans expiration automatique côté serveur.
- Une interface responsive avec les sections principales en attente de connexion des données.

## Prérequis
- Node.js 20 ou supérieur
- Un hébergement Node.js (par exemple FadeHost)
- HTTPS en production
- Un bot Telegram créé via BotFather si tu veux activer le bot

## Variables FadeHost

Ajoute ces variables dans le panneau de ton hébergeur :

```env
DASHBOARD_ACCESS_CODE=un_code_long_et_difficile_a_deviner
DASHBOARD_SESSION_SECRET=une_cle_aleatoire_d_au_moins_32_octets
DASHBOARD_URL=https://ton-domaine.example
BOT_TOKEN=ton_token_telegram
PORT=3000
NODE_ENV=production
```

Génère une clé de session robuste avec :
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

**Important :** conserve `DASHBOARD_SESSION_SECRET` identique après chaque redémarrage. Si tu la changes, toutes les sessions existantes seront invalidées.

## Installation / démarrage
Dans le gestionnaire de fichiers ou le terminal de ton hébergeur :
```bash
npm install
npm start
```

La commande de démarrage doit être `npm start` (elle lance `node index.js`).

## Comment fonctionne la connexion persistante
- Le code est comparé côté serveur. Il n'est jamais envoyé au navigateur après validation.
- Après validation, le serveur crée un cookie signé cryptographiquement.
- Le cookie est `HttpOnly`, `SameSite=Strict`, et `Secure` en production.
- Sa durée côté navigateur est de dix ans, et le serveur n'impose aucune expiration de session.
- La session est autonome : elle survit aux redémarrages et ne nécessite pas de base de données.
- Modifier `DASHBOARD_ACCESS_CODE` invalide les anciennes sessions car leur empreinte ne correspond plus.
- Modifier `DASHBOARD_SESSION_SECRET` invalide également toutes les sessions.
- Effacer les cookies, utiliser un autre navigateur/appareil ou réinitialiser le navigateur nécessitera une nouvelle saisie du code.

## Sécurité et limites
- Utilise uniquement HTTPS en production.
- Ne partage jamais `DASHBOARD_SESSION_SECRET` ni `BOT_TOKEN`.
- Le code partagé autorise toute personne qui le connaît : il n'y a pas d'identité individuelle.
- La limitation des tentatives de connexion est en mémoire et se réinitialise au redémarrage.
- Le scanner blockchain, les analyses on-chain, les scores et les alertes réelles ne sont pas encore implémentés dans cette première version. Les écrans affichent explicitement qu'ils sont en attente de données.

## Changer le code d'accès
Modifie uniquement `DASHBOARD_ACCESS_CODE` dans FadeHost puis redémarre l'application. Les sessions précédentes seront refusées. Ne change pas `DASHBOARD_SESSION_SECRET` si tu veux conserver les sessions lors des redémarrages normaux.
