# « Ma vue » — vue personnalisée de l'appli web (conception)

Date : 2026-11-21 — validé par Remi sur maquettes (verrouillée, édition, menu « Ajouter », tablette).

## Pourquoi

Chaque joueur veut voir **ses** informations, rangées à sa façon, sur l'écran de son choix (PC, puis
tablette / téléphone à l'étape suivante). Les onglets actuels (Grille figée de 10 tuiles, Personnage,
Vaisseau) montrent tout, dans un ordre imposé.

## Objectifs

- Un nouvel onglet **« Ma vue » / « My view »** composé par l'utilisateur.
- **Sections** : cadres nommés (renommables), en **demi-largeur** ou **pleine largeur**, réordonnables, supprimables.
- **Cases** dans les sections : ajoutées par un **menu « ＋ Ajouter »** propre à chaque section
  (onglets Personnage / Vaisseau / Actions / Émotes + recherche), taille **1×** ou **2×**, retirables,
  déplaçables par **glisser-déposer**, y compris d'une section à l'autre. À la souris **et au doigt**.
- **Cadenas** : vue **verrouillée par défaut** (les boutons marchent, rien ne bouge) ; déverrouillée =
  mode édition. « Terminer » reverrouille.
- **Une seule vue**, enregistrée **dans l'appli** (`view.json` à côté de `settings.json`) : la même sur
  tous les appareils. Les pages ouvertes se mettent à jour quand la vue change.
- Tout texte visible en **français et en anglais**.

## Non-objectifs

- Plusieurs vues nommées : voir `2026-11-21-vues-multiples-design.md` (fait ensuite, avant toute publication).
- Accès tablette / téléphone (QR code, adresse masquée) : **chantier suivant**, conception à part.
- Placement libre au pixel, couleurs ou thèmes personnalisés.
- Toute modification du plugin Stream Deck ou des onglets existants.

## Anti-objectifs

- Casser le plugin ou l'onglet Grille. Le plugin n'est pas touché ; tests + build + `streamdeck validate`
  quand même avant le commit.
- Perdre une vue composée : enregistrement automatique à chaque changement ; fichier illisible gardé en
  `view.json.bak` et remplacé par la vue par défaut.
- Permettre une action dangereuse : refusée à l'enregistrement **et** au déclenchement (règle existante).

## Approches envisagées

1. **Vue stockée dans l'appli, rendue dans la page à partir du flux `state` existant** *(retenue)*.
   Aucune nouvelle donnée du jeu ; le serveur ne fait que valider et enregistrer la disposition.
2. Vue stockée dans le navigateur (`localStorage`) : plus simple, mais une vue par appareil — contraire
   au souhait de retrouver la même vue sur la tablette.
3. Étendre la Grille actuelle (tuiles images rendues côté serveur) : réutilise le dessin des touches,
   mais images figées, pas de jauges lisibles ni de sections ; et risque de toucher au code partagé
   avec le plugin.

## Conception

### Données (`view.json`, format versionné)

```json
{
  "version": 1,
  "sections": [
    { "id": "s1", "title": "Survie", "width": "half",
      "items": [ { "id": "i1", "kind": "vital", "ref": "oxygen", "size": 1 } ] }
  ]
}
```

Types de cases (`kind` → `ref`) :

| kind | ref | Source dans le flux `state` | Clic |
|---|---|---|---|
| `vital` | une des 13 constantes (`oxygen`, `health`…) | `vitals[]` | — |
| `instrument` | `shields`, `hull`, `hydrogen`, `quantum`, `speed`, `radar_altitude`, `heading` | `shipStatus.instruments[]` | — |
| `annunciators` | — | `shipStatus.annunciators[]` | — |
| `ship_info` | `name`, `master_mode`, `landed` | `shipStatus` | — |
| `character_info` | `position`, `role`, `seat` | `character` | — |
| `ship_function` | une des 17 fonctions (`gear`, `lights`…) | `ship[]` | bascule (route existante) |
| `action` | nom d'action du jeu (émotes comprises) | libellé via `/api/v1/actions` | déclenche (route existante) |

Limites validées par le serveur : 20 sections, 40 cases par section, titre ≤ 40 caractères (vide →
« Section »), identifiants `[A-Za-z0-9_-]{1,32}` uniques, `ref` connu pour les types fermés,
`action` : `[a-z0-9_]{1,64}` et **pas dans la liste des actions dangereuses**. Vue invalide → 400
`invalid_view` (rien n'est enregistré).

Vue par défaut (premier lancement) : « Survie » (oxygène, santé, faim, température corporelle — demi),
« Vol » (vitesse 2×, hydrogène, quantum — demi), « Commandes du vaisseau » (train, phares, voyants 2× — pleine).

### API (contrat 1.2.0, décrite FR + EN)

- `GET /api/v1/view` → la vue.
- `PUT /api/v1/view` (corps = vue) → 200 + vue enregistrée (normalisée), ou 400 `invalid_view`.
- Flux SSE : nouvel événement `view` (la vue complète) à la connexion et à chaque enregistrement.

### Page

- Onglet « Ma vue » après « Vaisseau ». Bouton cadenas visible seulement sur cet onglet. État
  verrouillé / déverrouillé gardé par appareil (`localStorage`), verrouillé par défaut.
- Rendu des cases à partir du dernier `state` (mêmes cartes, jauges et voyants que les autres onglets).
  Case dont la donnée est absente → « — » (jeu fermé, pas dans un vaisseau).
- Édition : glisser-déposer écrit à la main avec les événements « pointer » (souris + tactile), sans
  bibliothèque ; un cadre orange montre l'emplacement d'arrivée. Sections déplacées par leur poignée ⋮⋮.
- Enregistrement automatique (PUT, regroupé ~400 ms) à chaque changement ; « Terminer » reverrouille.
- Une vue reçue d'un autre appareil remplace l'affichage, sauf pendant l'édition sur cette page
  (dernier enregistrement gagnant).
- Suppression d'une section non vide : confirmation.
- Mise en page : 2 colonnes de sections au-delà de 1000 px, 1 en dessous ; cases sur 4 colonnes
  (section pleine) ou 2 (demi) ; téléphone : 2 colonnes.

## Laissé au constructeur

Noms exacts des fichiers et fonctions, style CSS fin, textes définitifs (FR + EN), découpage des tests.
