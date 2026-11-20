# Conception — actions « Ship Toggle » et « Ship Action »

Date : 2026-11-21 · Statut : à valider

## Intention

Remi veut piloter son vaisseau depuis le Stream Deck **en voyant l'état réel** : une touche « Train »
qui sort ou rentre le train et montre s'il est sorti, rentré ou en mouvement ; pareil pour phares,
VTOL, découplage, G-safe, mode NAV/SCM, puissance… Il veut que **chaque joueur choisisse, touche par
touche, le mode d'appui (bascule / on / off) et l'apparence (A / B / C)**. Les commandes vaisseau sans
état (flight ready, ATC, ping…) doivent aussi être accessibles.

Ces actions réutilisent le flux de télémétrie partagé (`TelemetryHub`) d'Actor Display et le
mécanisme de liste d'Actor Action.

## Objectifs

- **Ship Toggle** (`com.sokren.sc-telemetry.ship-toggle`, touches) : une fonction vaisseau avec état.
- **Ship Action** (`com.sokren.sc-telemetry.ship-action`, touches) : liste des commandes vaisseau
  et siège, groupées par catégorie, sans état (comme Actor Action).
- Réglages de Ship Toggle par touche : **fonction**, **mode** (`toggle` défaut / `on` / `off`),
  **style** (`text` = A, défaut / `led` = B / `fill` = C).
- Tout texte visible en français et en anglais (règle du projet).

## Hors périmètre

- Actions dangereuses : `v_self_destruct`, `v_eject`, `v_emergency_exit`, `v_power_set_off`,
  `v_power_toggle`, `v_open_all_doors`, `v_toggle_all_doors`, `v_unlock_all_doors`,
  `v_unlock_all_ports` (et `v_toggle_all_doorlocks`, `v_toggle_all_portlocks`, qui peuvent
  déverrouiller). Jamais envoyées, jamais proposées. Une confirmation viendra plus tard.
- Ship Toggle sur molette du Stream Deck + ; afficheurs vaisseau (boucliers, carburant…).
- Actions maintenues (`hold_ms`, seulement `v_invoke_ping`) : appui simple.

## À éviter absolument

- Qu'une touche **envoie une action dangereuse**, quel que soit le mode ou un profil importé.
- Afficher un état faux : jeu fermé, pas dans un vaisseau, ou fonction absente du vaisseau → « — ».
- Basculer à l'aveugle quand l'état est connu (risque de désynchronisation, cf. CLAUDE.md).

## Données observées (flux réel, 2026-11-21, Avenger Titan, siège pilote)

- 97 frames en 5 s, **section `vehicle` dans chacune** (comme `actor`) → péremption 3 s valable.
- `vehicle.state.flight.state` : `is_landed: true`, `gear: DEPLOYED`, `vtol: DEPLOYED` ;
  `transformation` absent (champ `optional` : le vaisseau n'en a pas).
- `lights_enabled` absent → **faux** (proto3).
- `flight.settings.*` : `Availability{enabled, active}` ; ex. `ifcs_coupled {enabled, active}`,
  `ifcs_proximity_assist {enabled}` (active absent → inactif), `ifcs_cruise_mode {}` (indisponible).
  `flight_light_amplification`, `advanced_hud_enabled_*` absents → faux.
- `power` : tous `true`. `master_mode {mode: SCM, spooled: true}`. `doors` **absent** (Titan).
- `actor.state.locomotion: SEATED`, `crew_role: PILOT`.
- Perso **à pied** (relevés du 2026-11-20) : frames avec **seulement** `actor`, aucune section
  `vehicle` → les touches passent bien à « — » hors du vaisseau.

## Approche

Une seule approche sensée : **réutiliser `TelemetryHub`** (un flux, section `vehicle`) pour l'état,
`GameApi.trigger` pour les commandes, et le dessin SVG par `setImage` comme Actor Display ;
**Ship Action réutilise `CategoryAction`** (liste groupée fournie par le plugin). Écartés : un flux
par touche (contraire à « un seul abonnement ») ; des bascules sans lecture d'état (désynchronisation).

## Ce qui est décidé

### États

Chaque fonction lit un état parmi : `on`, `off`, `moving-on` (en train de s'allumer / sortir),
`moving-off`, `unavailable` (le vaisseau n'a pas la fonction), `unknown` (section `vehicle` absente
ou périmée : jeu fermé, pas dans un vaisseau).

Règles de lecture :
- Section `vehicle` absente / périmée → `unknown`.
- Champ `optional` absent dans une section fraîche (`gear`, `vtol`, `transformation`, `doors`,
  `power`, `master_mode`) → `unavailable`.
- Enum de déploiement : `DEPLOYED` → on, `RETRACTED` → off, `DEPLOYING` → moving-on,
  `RETRACTING` → moving-off, autre valeur → `unknown`.
- `Availability` : sous-message absent ou `enabled` faux → `unavailable` ; sinon `active` (absent = faux).
- Booléen simple absent → faux (proto3).
- **Garde-fou supplémentaire** *(choix de Claude)* : si la section `actor` est fraîche et que
  `actor.state.locomotion` n'est pas `SEATED`, toutes les fonctions sont `unknown` (au cas où le jeu
  continuerait d'envoyer un vaisseau quitté). Siège passager / tourelle : on affiche ce que le jeu
  envoie (à vérifier en jeu).
- `master_mode.mode` autre que NAV ou SCM (dont `UNSPECIFIED`, non transmis en proto3) → `unknown`
  pour `master_nav` ; `advanced_hud` est alors `unknown` aussi (on ne sait pas quel indicateur lire)
  *(choix de Claude)*.

### Fonctions

| Id | Libellé FR / EN | État (sous `vehicle.state`) | On | Off | Bascule du jeu | Mots d'état FR / EN |
|---|---|---|---|---|---|---|
| `gear` | Train / Gear | `flight.state.gear` | `v_deploy_landing_system` | `v_retract_landing_system` | `v_toggle_landing_system` | SORTI·RENTRÉ / DOWN·UP |
| `lights` | Phares / Lights | `lights_enabled` | `v_lights_on` | `v_lights_off` | `v_lights` | ON·OFF |
| `vtol` | VTOL | `flight.state.vtol` | `v_vtol_on` | `v_vtol_off` | `v_vtol_toggle` | ON·OFF |
| `transform` | Transformation / Transform | `flight.state.transformation` | `v_transform_deploy` | `v_transform_retract` | `v_transform_cycle` | DÉPLOYÉ·RENTRÉ / DEPLOYED·STOWED |
| `decoupled` | Découplage / Decoupled | non `flight.settings.ifcs_coupled.active` (indispo. si `ifcs_coupled` l'est) | `v_ifcs_vector_decoupling_on` | `v_ifcs_vector_decoupling_off` | `v_ifcs_vector_decoupling_toggle` | DÉCOUPLÉ·COUPLÉ / DECOUPLED·COUPLED |
| `gsafe` | G-safe | `flight.settings.ifcs_g_safe` | `v_ifcs_gsafe_on` | `v_ifcs_gsafe_off` | `v_ifcs_toggle_gforce_safety` | ON·OFF |
| `proximity` | Proximité / Proximity | `flight.settings.ifcs_proximity_assist` | `v_ifcs_proximity_assist_on` | `v_ifcs_proximity_assist_off` | `v_ifcs_proximity_assist_toggle` | ON·OFF |
| `esp` | ESP | `flight.settings.ifcs_esp` | — | — | `v_ifcs_toggle_esp` | ON·OFF |
| `advanced_hud` | HUD avancé / Adv. HUD | `flight.settings.advanced_hud_enabled_nav` si mode maître NAV, sinon `_scm` | `v_flight_advanced_hud_on` | `v_flight_advanced_hud_off` | `v_flight_advanced_hud_toggle` | ON·OFF |
| `night_vision` | Vision nocturne / Night vision | `flight.settings.flight_light_amplification` | `v_light_amplification_on` | `v_light_amplification_off` | `v_light_amplification_toggle` | ON·OFF |
| `master_nav` | Mode NAV / NAV mode | `master_mode.mode` = NAV → on, SCM → off | `v_master_mode_set_nav` | `v_master_mode_set_scm` | `v_master_mode_cycle` | NAV·SCM |
| `power_engines` | Moteurs / Engines | `power.engines` | `v_power_set_thrusters_on` | `v_power_set_thrusters_off` | `v_power_toggle_thrusters` | ON·OFF |
| `power_weapons` | Armes / Weapons | `power.weapons` | `v_power_set_weapons_on` | `v_power_set_weapons_off` | `v_power_toggle_weapons` | ON·OFF |
| `power_shields` | Boucliers / Shields | `power.shield_generators` | `v_power_set_shields_on` | `v_power_set_shields_off` | `v_power_toggle_shields` | ON·OFF |
| `power_main` | Puissance / Power | `power.powerplants` | `v_power_set_on` | *exclu* | *exclu* | ON·OFF |
| `doors_closed` | Portes fermées / Doors closed | `doors.open_state` = CLOSED → on, OPENED → off | `v_close_all_doors` | *exclu* | *exclu* | FERMÉES·OUVERTES / CLOSED·OPEN |
| `doors_locked` | Portes verrouillées / Doors locked | `doors.lock_state` = LOCKED → on, UNLOCKED → off | `v_lock_all_doors` | *exclu* | *exclu* | VERROUIL.·OUVERT / LOCKED·UNLOCKED |

Valeur par défaut d'une nouvelle touche : `gear`, mode `toggle`, style `text`.
« En mouvement » s'écrit « … » dans les trois styles.

### Appui (Ship Toggle)

Cible = état voulu : mode `on` → on ; mode `off` → off ; mode `toggle` → l'inverse de l'état lu
(`on` ou `moving-on` → off ; `off` ou `moving-off` → on).

1. Fonction `unavailable` → ⚠ (rien envoyé).
2. État connu et déjà égal à la cible (`on` pour on, `off` pour off) → ✔ sans rien envoyer.
3. État connu (on/off/moving) : envoyer la commande **On** ou **Off** de la cible ; si la fonction
   n'en a pas (ESP), envoyer la **bascule du jeu** (l'état diffère de la cible, donc basculer est sûr).
4. État `unknown` : mode `toggle` → bascule du jeu si elle existe et n'est pas exclue ; modes `on` /
   `off` → commande On / Off si elle existe ; sinon ⚠.
5. Commande *exclue* ou dans la liste des actions dangereuses → ⚠ + ligne de journal, **jamais
   envoyée** (garde-fou indépendant de la table). La liste des actions dangereuses est **la même**
   que celle d'Actor Action (`DANGEROUS_ACTIONS`), complétée par `v_toggle_all_doorlocks` et
   `v_toggle_all_portlocks` — Actor Action et Ship Action en profitent aussi.
   **Fonctions à commande exclue** (`power_main`, `doors_closed`, `doors_locked`) : le mode réglé
   est ignoré et se comporte toujours comme « On » — un appui ferme / verrouille / allume, ou ✔ si
   c'est déjà le cas ; jamais de ⚠ juste parce que la touche est en mode Bascule *(choix de Claude)*.
6. Résultat du jeu : OK → ✔ ; sinon ⚠ + journal (comme Actor Action). L'image ne change pas à
   l'appui : elle suit le flux (l'état réel). Un second appui rapide calcule sa cible sur l'état
   déjà reçu (le train « en mouvement » apparaît en ~60 ms) ; pas d'état supposé *(choix de Claude)*.

### Apparence (choix par touche)

Image SVG 144×144 par `setImage`, redessinée quand l'état change (≤ 4 par seconde), titre masqué.
- **`text` (A)** : icône, libellé, mot d'état coloré (vert = on, gris = off, orange = en mouvement).
- **`led` (B)** : icône (grise si off), libellé, voyant rond en haut à droite (vert / gris / orange).
- **`fill` (C)** : fond de touche coloré (vert foncé = on, orange foncé = en mouvement, sombre =
  off), icône, libellé et mot d'état.
- `unknown` / `unavailable` : dans les trois styles, éléments gris et mot d'état « — ».

Une icône par fonction (glyphe simple, blanc ou gris selon l'état) ; maquette validée par Remi
(train : flèche vers une barre, phares : ampoule…).

### Panneau de Ship Toggle

Trois listes, libellés bilingues :
- « Fonction / Function » : les 17 fonctions, libellés dans la langue du logiciel (fournie par le plugin).
- « Mode » : Bascule / Toggle · Allumer seulement / On only · Éteindre seulement / Off only.
- « Style » : A — Texte / Text · B — Voyant / LED · C — Fond coloré / Filled.
Note bilingue : les fonctions *exclues* (puissance générale, portes) fonctionnent toujours comme
« Allumer seulement / On only », quel que soit le mode choisi.

### Ship Action

- Action liste comme Actor Action, groupes : `spaceship_general`, `spaceship_movement`,
  `spaceship_power`, `spaceship_quantum`, `spaceship_radar`, `spaceship_target_hailing`,
  `spaceship_docking`, `seat_general`, `lights_controller`.
- Les actions dangereuses **ne sont pas proposées** dans la liste (et restent refusées à l'appui).
- Libellés FR / EN pour toutes les actions de ces catégories (fichiers de libellés existants),
  libellé tiré du nom pour une action inconnue.

## Laissé au développeur

- Dessin exact des icônes et des trois styles, dans l'esprit de la maquette.
- Organisation des fichiers et tests (états et règles d'appui testés de façon pure ; rendu testé
  sur le contenu du SVG).
- Formulation des libellés des ~50 actions de Ship Action.

## Questions ouvertes

- Sens réel de `advanced_hud_enabled_nav/_scm` et de `ifcs_coupled` à vérifier en jeu (supposé :
  `ifcs_coupled.active` vrai = couplé ; HUD avancé lu dans le mode maître courant).
- `Availability.enabled` = « la fonction existe sur ce vaisseau » (supposé ; observé
  `ifcs_cruise_mode {}` sur le Titan) : si un vaisseau désactive temporairement une fonction
  (`enabled` faux), la touche affichera « — » plutôt qu'un état — à confirmer en jeu.
- Effet réel de `v_light_amplification_*` en vaisseau ou en tourelle (`turret.light_amplification`).
