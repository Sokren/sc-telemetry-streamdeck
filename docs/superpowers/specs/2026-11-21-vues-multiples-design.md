# Vues multiples — plusieurs onglets « Ma vue » (conception)

Date : 2026-11-21. Complète `2026-11-21-ma-vue-design.md` et remplace son point « Une seule vue ».
Choix d'enregistrement validé par Remi : **B, chaque vue s'enregistre séparément**.

## Pourquoi

Remi veut **un écran = une vue** : par exemple le PC sur « Vol », la tablette sur « Survie », le
téléphone sur « Émotes ». Le chantier suivant (accès tablette par QR code) ouvrira directement une
vue précise ; il faut donc d'abord plusieurs vues, chacune avec un identifiant stable.

## Objectifs

- **Chaque vue est un onglet** de la barre du haut, après Grille / Personnage / Vaisseau.
- Un bouton **＋** au bout de la barre crée une nouvelle vue (vide) et l'ouvre déverrouillée.
- Une vue se **renomme** et se **supprime** (avec confirmation) **seulement déverrouillée**.
- Les vues sont **gardées quand on relance le serveur** (fichier dans l'appli, comme aujourd'hui).
- Le lien **`?view=<id>`** ouvre directement cette vue ; l'appareil s'en souvient ensuite ; on peut
  toujours changer de vue avec les onglets (sur téléphone : liste déroulante).
- Deux écrans peuvent modifier **deux vues différentes en même temps** sans rien perdre.
- Tout texte visible en français et en anglais.

## Non-objectifs

- Le QR code et l'accès réseau local : chantier suivant, conception à part.
- Réordonner les onglets de vues (ordre = ordre de création). *Choix de Claude : pas demandé, ajoutable plus tard.*
- Fusionner deux modifications simultanées **de la même vue** : le dernier enregistrement gagne
  (comme aujourd'hui).
- Toute modification du plugin Stream Deck ou des onglets Grille / Personnage / Vaisseau.

## Anti-objectifs

- Casser le plugin : il n'est pas touché ; tests + build + `streamdeck validate` avant commit.
- Perdre des vues : fichier illisible → copié en `.bak`, vue par défaut à la place (règle actuelle).
- Perdre la vue de test de Remi : un `view.json` de l'ancien format (une seule vue, `version: 1`)
  est relu et devient la première vue.
- Effacer la vue d'un autre écran en enregistrant la sienne (raison du choix B).

## Approches envisagées

- **A. Un seul envoi pour toutes les vues** (`PUT` de la liste complète) : le plus simple, mais deux
  écrans qui modifient deux vues différentes s'écrasent mutuellement.
- **B. Une route par vue** *(retenue par Remi)* : `PUT` d'une vue ne touche qu'elle ; création et
  suppression ont leur propre route. Un peu plus de code serveur.

## Conception

### Données (`view.json`, `version: 2`)

```json
{
  "version": 2,
  "views": [
    { "id": "v1a2b3c", "name": "Vol", "sections": [ /* format de « Ma vue » inchangé */ ] }
  ]
}
```

- `id` : créé par le serveur, `[A-Za-z0-9_-]{1,32}`, jamais réutilisé ni modifié.
- `name` : ≤ 24 caractères, espaces retirés aux bords ; vide → « Vue » / « View ».
- Sections et cases : validation existante (`parseView` actuel) appliquée à chaque vue ; unicité des
  ids de sections et de cases **par vue**.
- **10 vues au plus**, **au moins 1** (la dernière ne se supprime pas).
- Premier lancement (rien d'enregistré) : une vue « Ma vue » / « My view » (nom dans la langue de la
  page) contenant la vue par défaut actuelle, id fixe `main`.
- Ancien format `version: 1` → une vue `main`, sections reprises telles quelles. Réécrit en
  `version: 2` au premier enregistrement.
- Nom de la vue `main` tant que rien n'est écrit en `version: 2` (premier lancement ou ancien
  format) : il suit la langue de la page (« Ma vue » / « My view »). Au premier enregistrement
  (création, modification ou suppression d'une vue), il est figé dans la langue de la page qui
  enregistre, puis se renomme comme les autres. *Choix de Claude : un nom écrit par l'utilisateur
  ne doit pas changer selon la langue ; seul le nom par défaut s'adapte.*

### API (contrat 1.2.0, pas encore publié : `/api/v1/view` est remplacée, pas gardée)

| Méthode | Chemin | Corps | Réponse |
|---|---|---|---|
| GET | `/api/v1/views` | — | 200 `{ views: View[] }` |
| POST | `/api/v1/views` | `{ name }` | 201 la vue créée (vide) · 409 `too_many_views` · 400 `invalid_view` |
| PUT | `/api/v1/views/{id}` | `{ name, sections }` | 200 la vue normalisée · 400 `invalid_view` · 404 `unknown_view` |
| DELETE | `/api/v1/views/{id}` | — | 204 · 404 `unknown_view` · 409 `last_view` |

- Descriptions FR + EN (« — FR : ») comme toutes les routes.
- Flux SSE : l'événement `view` devient **`views`** (`{ views: View[] }`), envoyé à la connexion et
  après chaque création, modification ou suppression.

### Page

- Barre : `Grille | Personnage | Vaisseau | <vue 1> | <vue 2> | … | ＋`. Le **＋** est toujours
  visible (créer une vue vide ne risque rien) et masqué à 10 vues. *Choix de Claude.*
- Nouvelle vue : nom proposé « Vue N » / « View N » (N = premier numéro libre), ouverte déverrouillée,
  champ du nom sélectionné pour le taper tout de suite.
- Déverrouillée : en tête du panneau, champ **nom de la vue** et bouton **Supprimer la vue**
  (confirmation : « Supprimer la vue « … » et son contenu ? »). Masqué pour la dernière vue.
- Cadenas : un seul état par appareil (comme aujourd'hui), valable pour la vue affichée.
- Onglet ouvert au démarrage : `?view=<id>` s'il existe, sinon le dernier onglet retenu par
  l'appareil, sinon Grille. Id inconnu (vue supprimée) → première vue. Le paramètre est retiré de
  l'adresse après lecture (`history.replaceState`) pour que l'appareil garde ensuite son propre choix.
- Vue supprimée depuis un autre écran pendant qu'on l'affiche → bascule sur la première vue.
- Vue modifiée ailleurs : mise à jour immédiate, sauf la vue en cours d'édition sur cette page
  (règle actuelle, appliquée à cette seule vue).
- Téléphone (< 600 px) : les onglets laissent place à une **liste déroulante** des onglets + « ＋ Nouvelle vue ».

## Laissé au constructeur

Génération exacte des ids, noms des fonctions et fichiers, découpage des tests, style CSS fin, textes
définitifs FR + EN.
