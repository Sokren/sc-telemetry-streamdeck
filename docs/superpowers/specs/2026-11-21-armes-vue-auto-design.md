# Armes et groupes · changement de vue automatique (conception)

Date : 2026-11-21. Validé par Remi : maquette des armes (`scratchpad/maquette/7-armes.png`, touches, molette, onglet
Vaisseau) et proposition de changement de vue automatique. Sortie prévue en **0.3.6**.

## Partie 1 — Armes et groupes (affichage seulement)

### Pourquoi
Voir en combat si les armes sont prêtes, quel groupe d'armes est actif et si les cardans sont fixes ou libres. Le jeu
n'expose **aucune commande** pour changer de groupe ou de cardans (112 actions, seule la puissance des armes existe,
déjà dans Ship Toggle) : affichage seulement, la molette change la donnée affichée.

### Données (section `weapons`, `WeaponsFrame`)
`settings.gimbals_locked`, `preset_index`, `preset_name`, `weapons[] { name, is_powered, ready_to_fire, contained_in_preset }`.
Capture du Prospector : 2 armes prêtes, cardans verrouillés → déverrouillés (champ absent = `false`, proto3),
`preset_index` absent (= 0) et `preset_name` vide.

### Comportement
- Mêmes règles de disponibilité que les contre-mesures : section `weapons` fraîche, perso assis (`actor` absente =
  considéré assis) ; sinon « — ».
- **Armes** (`weapons`) : « prêtes / total » (ex. « 1 / 2 ») ; jauge = prêtes / total ; vert si toutes, orange si une
  partie, rouge si aucune ; vaisseau sans arme (liste vide) → « — ».
- **Groupe** (`weapon_group`) : `preset_name` s'il n'est pas vide, sinon le numéro tel qu'en jeu : **0 = « Toutes » /
  « All »** (toutes les armes), puis 1, 2… (*confirmé par Remi en jeu ; l'Arrow envoyait `preset_index: 1`*). Pas de jauge.
- **Cardans** (`gimbals`) : « Fixes » / « Locked » si verrouillés, « Libres » / « Free » sinon. Pas de jauge.
- Ship Display : ordre de rotation `countermeasures, decoys, noise, weapons, weapon_group, gimbals`.
- Appli web : instruments `weapons_ready`, `weapon_group`, `gimbals` (après `noise`) ; onglet Vaisseau, API,
  menu « Ajouter » des vues ; contrat OpenAPI mis à jour.
- Hors périmètre : liste détaillée arme par arme (option de la maquette, plus tard si utile), icônes sur les touches.

## Partie 2 — Changement de vue automatique (appli web)

### Pourquoi
Qu'un écran (tablette surtout) affiche tout seul la vue « à pied » quand Remi marche et la vue « vaisseau » quand il
s'assoit, avec un interrupteur pour l'activer ou non.

### Comportement
- **Réglage par appareil** (`localStorage` `sctd-autoswitch`) : `{ enabled, on_foot, seated, eva }`, chaque position =
  un onglet (`character`, `ship`), une vue (`view:<id>`) ou vide (« ne pas changer »). Désactivé par défaut ;
  **à pied → onglet Personnage, assis → onglet Vaisseau** par défaut (demande de Remi), EVA → ne pas changer.
- Fenêtre **« Changement auto »** ouverte par un bouton de l'en-tête (« 🔁 Auto » / « 🔁 Auto : on »), sur tous les
  appareils : interrupteur + une liste par position (vues existantes + « Ne pas changer »).
- Position lue dans l'événement `state` (`character.locomotion` : `on_foot`, `eva`, `seated` ; `unknown` ignoré).
- Bascule seulement après **2 s de position stable** (minuterie, car `state` n'est renvoyé qu'en cas de changement).
- **Jamais pendant l'édition** d'une vue (cadenas ouvert) : la bascule attend le verrouillage.
- Changement d'onglet à la main : respecté jusqu'au **prochain vrai changement de position**.
- Page ouverte avec `?view=` (lien / QR code) : la position du départ ne déclenche rien.
- Vue choisie supprimée : ignorée (« ne pas changer »).
- Logique dans un petit module testable (`static/autoswitch.js`), branché dans `app.js`.

## Contraintes
Plugin : seulement Ship Display étendu, autres actions inchangées. Tests + build + `streamdeck validate` avant commit.
Tout texte FR + EN. Aucun commit sans l'accord de Remi.
