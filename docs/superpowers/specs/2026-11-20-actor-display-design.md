# Conception — action « Actor Display » (constantes du personnage)

Date : 2026-11-20 · Statut : à valider

## Intention

Remi veut **avoir sous les yeux en permanence** les constantes de son personnage dans Star Citizen
(oxygène, santé, faim, soif, températures…) sur ses Stream Deck : un **chiffre avec une jauge
colorée** sur une touche, et le même affichage sur l'écran des **molettes du Stream Deck +**.
Ce n'est pas un système d'alerte : la couleur aide seulement à lire d'un coup d'œil.

C'est aussi la première brique « lecture d'état » du plugin : le module qui écoute le flux de
télémétrie servira ensuite aux afficheurs vaisseau et aux interrupteurs avec état.

Matériel de Remi : Stream Deck XL, Stream Deck MK.2, Stream Deck + (4 molettes avec écran tactile).

## Objectifs

- Nouvelle action **Actor Display** (`com.sokren.sc-telemetry.actor-display`), utilisable sur une
  **touche** et sur une **molette** (Stream Deck +).
- Réglage par touche/molette : **la donnée affichée**, choisie dans une liste (libellés FR/EN).
- Touche : image dessinée avec libellé court, valeur, unité et, pour les jauges, une barre colorée.
- Molette : écran tactile avec libellé, valeur et barre colorée ; **tourner la molette fait défiler
  la donnée affichée** (le choix est enregistré dans les réglages).
- Mise à jour continue depuis le flux du jeu ; « — » et barre grise si la donnée n'est pas
  disponible (jeu fermé, perso pas spawné, section trop ancienne).
- Tout texte visible en français et en anglais (règle du projet).

## Hors périmètre

- Alertes (clignotement, son), seuils réglables par touche.
- Données vaisseau, armes, tourelle (même module de flux, actions futures).
- Appui sur la touche ou sur la molette : sans effet.

## À éviter absolument

- **Afficher une valeur fausse avec assurance** : une valeur figée alors que le jeu est fermé, ou
  « 0 % d'oxygène » parce qu'une section manque. En cas de doute : « — ».
- Surcharger le Stream Deck : pas plus de 4 rafraîchissements par seconde et par touche, et
  seulement si l'affichage change.
- Garder un flux gRPC ouvert quand aucune touche d'affichage n'est visible.
- Lire la mémoire du jeu ; dépendre d'autre chose que l'API locale.

## Contraintes

- SDK `@elgato/streamdeck` 3.x : `KeyAction.setImage(dataUri)`, `DialAction.setFeedbackLayout`,
  `setFeedback({ key: value | { value, bar_fill_c, … } })`, `onDialRotate` (`ev.payload.ticks`),
  `onWillAppear` / `onWillDisappear`. Manifeste : `"Controllers": ["Keypad", "Encoder"]` et un bloc
  `Encoder` (mise en page, description des gestes).
- API du jeu : `TelemetryStream(TelemetryStreamRequest{})` → flux de `TelemetryStreamResponse`
  (~17–20 frames/s). Une frame peut ne contenir qu'une partie des sections. proto3 : `0`, `false`
  et `""` ne sont pas transmis.
- Le flux ne démarre qu'après le spawn ; avant, l'appel échoue ou reste vide.
- Schéma chargé depuis `data/sc_extrait.desc` (comme le reste du plugin) ; repli « schéma
  indisponible » déjà en place (`createGameApi`).

## Données observées (flux réel, 2026-11-20, perso à pied)

```
actor.vitals: health {current 100, max 100}, oxygen {current 1, max 1}, hunger {78.2, 100},
              thirst {47.3, 100}, body_temperature {36.5, 100}, heart_rate 60.7,
              gravity 1.0003, pressure 1
actor.state:  locomotion ON_FOOT, uec_balance "15001986"
actor.environment: external_temperature 21.0, breathable_atmosphere true
```

`ambient_radiation_rate` et `intoxication_level` n'apparaissent pas (valeur 0 → non transmise).

**Cadence mesurée** : 97 frames en 5 s (~19/s), **toutes** avec la section `actor` (perso à pied) —
le jeu la renvoie à chaque frame, pas seulement quand une valeur change. La péremption à 3 s par
section est donc sûre pour `actor`. (À revérifier pour les sections vaisseau quand elles serviront.)

## Approches envisagées

- **Module de flux unique partagé + images générées (retenue).** Un seul abonnement
  `TelemetryStream`, état fusionné par section avec horodatage ; chaque touche dessine une image
  SVG, chaque molette met à jour sa mise en page. Seule approche qui permet une jauge et qui
  respecte « un seul abonnement pour toutes les touches » (CLAUDE.md).
- **Interroger le jeu périodiquement.** Impossible : l'API ne fournit l'état que par le flux.
- **Valeur dans le titre de la touche.** Pas de jauge possible ; contraire au choix B de Remi.

## Ce qui est décidé

### Module de flux (`TelemetryHub`)

- Ouvre `TelemetryStream` **seulement quand au moins un abonné est actif** (une touche ou molette
  Actor Display visible) ; le ferme quand il n'y en a plus.
- État fusionné **par section de premier niveau** (`actor`, `vehicle`, …) : à chaque frame, chaque
  section présente remplace la précédente et note son heure de réception.
- Une section est **périmée après 3 s** sans réception → considérée absente.
- Flux terminé ou en erreur (jeu fermé, pas spawné) → nouvelle tentative avec attente croissante
  (1 s, 2 s, 4 s, plafond 5 s), tant qu'il y a des abonnés.
- Les abonnés sont notifiés à chaque frame reçue **et** quand une section devient périmée (pour
  passer à « — » même si plus rien n'arrive).
- Interface pensée pour les futurs afficheurs : lecture d'une section par nom, abonnement / désabonnement.

### Données proposées (identifiant de réglage → source)

| Id | Source | Affichage | Jauge |
|---|---|---|---|
| `health` | `actor.vitals.health` (Gauge) | % (current/max) | oui |
| `oxygen` | `actor.vitals.oxygen` (Gauge) | % (current/max) | oui |
| `hunger` | `actor.vitals.hunger` (Gauge) | % | oui |
| `thirst` | `actor.vitals.thirst` (Gauge) | % | oui |
| `body_temperature` | `actor.vitals.body_temperature.current` | °C, 1 décimale | oui, échelle 30–42 °C |
| `external_temperature` | `actor.environment.external_temperature` | °C, entier | non |
| `heart_rate` | `actor.vitals.heart_rate` | bpm, entier | non |
| `gravity` | `actor.vitals.gravity` | g, 2 décimales | non |
| `pressure` | `actor.vitals.pressure` | 2 décimales, sans unité affirmée | non |
| `radiation` | `actor.environment.ambient_radiation_rate` | 2 décimales | non |
| `intoxication` | `actor.vitals.intoxication_level` | entier | non |
| `breathable` | `actor.environment.breathable_atmosphere` | Oui/Non · Yes/No | non |
| `balance` | `actor.state.uec_balance` (int64) | aUEC, format compact (`15,0 M`) | non |

Valeur par défaut d'une nouvelle touche : `oxygen`.

### Absence de valeur (règle centrale)

- Section `actor` absente ou périmée → « — », barre grise.
- Section `actor` fraîche mais champ scalaire absent → **valeur 0 / faux** (proto3), affichée
  normalement.
- Jauge : sous-message absent dans une section fraîche → `current` = 0 ; `max` absent ou 0 →
  « — » (on ne peut pas calculer un pourcentage).
- Jauge hors bornes (`current` > `max` ou < 0) : pourcentage **borné à 0–100 %** pour le texte, la
  barre et la couleur *(choix de Claude : une jauge ne doit pas afficher 104 %)*. L'oxygène
  (`max` = 1) se traite comme les autres : `current / max`.

### Couleurs (seuils fixes)

- Jauges en % (santé, oxygène, faim, soif) : **vert ≥ 50 %, orange 25–50 %, rouge < 25 %**
  (plus c'est haut, mieux c'est — sens de faim/soif à confirmer en jeu, voir Questions ouvertes).
- Température corporelle : **vert 35–38 °C, orange 34–35 ou 38–39 °C, rouge < 34 ou > 39 °C**.
- Données sans jauge : texte blanc, pas de couleur.
- Indisponible : gris.

### Touche

- Image SVG 144×144 générée (fond sombre), envoyée par `setImage` en `data:image/svg+xml`.
- Contenu : libellé court en haut, valeur en grand, unité, barre en bas pour les jauges.
- Le titre de la touche n'est pas utilisé par le plugin (vide) ; un titre saisi par l'utilisateur
  se superpose, comme pour toute action Stream Deck.
- Rafraîchie **au plus toutes les 250 ms**, et seulement si l'image change.

### Molette (Stream Deck +)

- Mise en page fournie avec le plugin (`layouts/actor-display.json`) : libellé long, valeur, barre.
- Mise à jour par `setFeedback` (mêmes règles de rafraîchissement que la touche).
- **Rotation** : passe à la donnée suivante / précédente de la liste (dans l'ordre du tableau,
  en boucle) et l'enregistre dans les réglages. Appui et toucher de l'écran : sans effet.
- Description des gestes (FR/EN) : « Tourner : changer de donnée ».

### Panneau de réglage

- Une liste « Donnée / Value » des 13 données, libellés dans la langue du logiciel (fournie par le
  plugin, comme Actor Action).

### Libellés

- Chaque donnée a un **libellé court** (touche, ≤ 6 caractères si possible : « O₂ », « Corps »,
  « Faim »…) et un **libellé long** (liste et molette : « Oxygène », « Température corporelle »…),
  en français et en anglais, dans des fichiers séparés du code comme `labels.*.json`.
- Nombres au format de la langue (virgule décimale en français).

## Laissé au développeur

- Dessin exact de l'image (polices, tailles, positions) et de la mise en page molette, dans l'esprit
  de la maquette validée par Remi (libellé gris, valeur blanche en gros, barre colorée en bas).
- Format compact du solde (`15,0 M` / `15.0M`, `999 k`…) tant qu'il tient sur la touche.
- Organisation des fichiers et tests (logique pure testée ; module de flux testé contre un faux
  serveur gRPC qui diffuse des frames, comme les tests existants).

## Questions ouvertes

- Sens de **faim / soif** : 100 % = rassasié / désaltéré (supposé, valeurs observées 78 % et 47 %
  sur un perso actif) — à vérifier en jeu ; si c'est l'inverse, inverser les seuils de ces deux
  jauges.
- Unités exactes de pression et de rayonnement non documentées : affichées sans unité.
