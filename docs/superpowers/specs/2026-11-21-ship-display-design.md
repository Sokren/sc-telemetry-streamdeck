# « Ship Display » — contre-mesures sur les touches et dans les vues (conception)

Date : 2026-11-21. Approche choisie par Remi : **A, nouvelle action Stream Deck « Ship Display »** (afficheur de
valeurs du vaisseau), qui commence par les contre-mesures. Données vérifiées en jeu (Prospector, 5.0 PTU, capture
`docs/captures/2026-11-21-prospector-5.0-ptu.json`) : leurres 48 → 45 et brouilleurs 5 → 3 en direct après des lancers.

## Pourquoi

En combat, Remi veut voir d'un coup d'œil ce qu'il reste de leurres et de brouilleurs, sur une touche, une molette du
Stream Deck + ou dans ses vues de l'appli web (tablette). Le jeu n'expose **aucune action** pour lancer des
contre-mesures : c'est un affichage seulement.

## Objectifs

- **Plugin** : nouvelle action **« Ship Display »** (`com.sokren.sc-telemetry.ship-display`), touche **et** molette,
  même rendu que « Actor Display » (libellé, valeur, jauge colorée). Valeurs au choix (liste du Property Inspector,
  rotation de la molette) :
  - `countermeasures` : les deux, « 45 / 3 » ; jauge et couleur = le **plus bas pourcentage** des deux ; un seul type
    présent → seulement son nombre (« 45 ») et sa jauge ; aucun → « — » ;
  - `decoys` : leurres seuls ; `noise` : brouilleurs seuls.
- **Appli web** : deux nouveaux instruments **`decoys`** et **`noise`** dans l'onglet Vaisseau, l'API (`shipStatus`,
  `/api/v1/ship/...`) et donc dans le menu « Ajouter » des vues (aucun code de vue spécifique).
- **Couleurs** *(proposées par Claude, acceptées avec l'approche)* : le jeu ne donne pas le stock maximal, donc
  **100 % = le plus grand stock vu depuis que le perso est assis dans ce vaisseau** ; vert ≥ 50 %, orange 25–50 %,
  rouge < 25 % ; **0 = rouge**.
- Textes FR + EN partout (manifeste `fr.json` / `en.json`, Property Inspector, libellés, API « — FR : »).

## Non-objectifs

- Une tuile « Ship Display » dans la grille de l'appli web (les vues suffisent).
- Lancer des contre-mesures (aucune action du jeu), boucliers / coque / armes sur « Ship Display » (étape suivante :
  le format le permet).
- Changer « Actor Display » ou toute action existante.

## Anti-objectifs

- Casser le plugin : actions existantes inchangées ; tests + build + `streamdeck validate` avant commit.
- Afficher « 0 » rouge pour un vaisseau qui **n'a pas** ce type de contre-mesure (voir « absent » ci-dessous).

## Conception

### Lecture (partagée plugin + appli web)

- Source : section **`weapons`** du flux (`WeaponsFrame.countermeasures[] { type, amount }`), fusionnée et périmée
  après ~3 s comme les autres sections (hub existant).
- Disponible si la section `weapons` est fraîche et que le perso est assis — **même règle que le code actuel des
  instruments** (`shipStatusOf`) : section `actor` absente ou périmée = considéré assis ; `actor` présente et pas
  SEATED → « — ».
- Type absent de la liste → **« — »** (ce vaisseau n'en a pas). Type présent sans `amount` → **0** (proto3).
- Un petit module à état (ex. `CountermeasureTracker`) garde le **maximum vu par modèle de vaisseau**
  (`vehicle.state.class_name`, ex. `MISC_Prospector`) et par type, **en mémoire pour la durée du processus**, sans
  remise à zéro : revenir dans un Prospector déjà vu plein garde la bonne référence, même après un combat ; un stock
  plus grand (autre équipement) relève simplement le maximum. *Choix de Claude, après relecture : une remise à zéro à
  chaque sortie de siège ou trou dans les frames rendrait les couleurs fausses.* `vehicle` périmée mais `weapons`
  fraîche → dernier modèle connu.
- Alimentation du suivi : **une abonnement au hub** qui le met à jour à chaque frame. Appli web : le flux reste
  ouvert tant que l'appli tourne (déjà le cas), donc le maximum est appris en continu. Plugin : **aucun changement**
  du moment où le flux est ouvert (seulement quand un affichage est visible) ; le maximum est donc appris pendant
  qu'un affichage du plugin est à l'écran. *Limite assumée et indiquée dans le README.*
- Le plugin et l'appli web sont deux programmes : chacun a son propre suivi, leurs pourcentages peuvent différer.
- Le maximum n'est mis à jour que si le modèle figure dans la même frame (à un changement de vaisseau, `vehicle`
  peut arriver après `weapons`) ; sans maximum connu, le stock courant sert de référence.

### Plugin

- Nouvelle classe d'action (même structure que `DisplayAction`, sans la modifier : les deux peuvent partager les
  utilitaires `render.ts`, `ThrottledRenderer`, `format.ts`). Disposition de molette : celle d'Actor Display
  (`layouts/actor-display.json`) convient.
- Libellés courts sur touche : « Leurres » / « Decoys », « Brouill. » / « Noise », « C-mesures » / « Counterm. ».
- Manifeste : nom « Ship Display », infobulle, icônes `imgs/actions/ship-display/{icon,key}.svg` (dessinées dans
  le style des autres), `ui/ship-display.html` (Property Inspector bilingue comme `actor-display.html`).

### Appli web

- `InstrumentId` += `decoys`, `noise` ; `INSTRUMENTS` dans l'ordre : boucliers, coque, **leurres, brouilleurs**,
  hydrogène, quantum, vitesse, altitude radar, cap. Texte = le nombre, sans unité, `percent` d'après le maximum vu.
- `shipStatusOf` reçoit la section `weapons` et le suivi des maximums ; contrat OpenAPI (énumération des
  instruments) et libellés `labels.fr.json` / `labels.en.json` mis à jour.

## Laissé au constructeur

Noms exacts des fichiers et fonctions, découpage des tests (dont : type absent → « — » ; 0 → rouge ; maximum remis à
zéro au changement de vaisseau ; section `weapons` périmée → « — »), dessin des icônes, textes définitifs FR + EN.
