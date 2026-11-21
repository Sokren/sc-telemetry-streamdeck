# Journal des modifications

**EN** [English](CHANGELOG.md) · 🇫🇷 **Français**

Les changements notables de SC Telemetry Deck (plugin Stream Deck et appli web autonome pour Star Citizen).
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/) ; les notes complètes sont dans
[`docs/releases/`](docs/releases/) et sur la [page des versions GitHub](https://github.com/Sokren/sc-telemetry-streamdeck/releases).

> **Bêta** — l'API de télémétrie du jeu est récente, non documentée par CIG et peut changer à chaque patch.
> 4.10.3 (LIVE) = affichage seulement, 5.0 (PTU) = affichage + actions.

## [0.3.5] — 2026-11-21

### Ajouté
- **Ship Display** (Stream Deck) : les **contre-mesures** du vaisseau en direct — leurres et brouilleurs ensemble (« 45 / 3 ») ou l'un des deux — sur une touche (valeur + jauge colorée) ou une molette de Stream Deck +. 100 % = le plus grand stock vu pour ce modèle de vaisseau pendant qu'un afficheur est visible (le jeu n'envoie pas le maximum). Affichage seulement : le jeu n'expose aucune commande pour lancer des contre-mesures.
- Appli web : instruments **Leurres** et **Brouilleurs** dans l'onglet *Vaisseau*, l'API et le menu *Ajouter* des vues.

## [0.3.4] — 2026-11-21

Appli web seulement (plugin Stream Deck inchangé depuis la 0.3.2).

### Ajouté
- **Tes vues** : compose tes propres onglets (le premier : *Ma vue* ; **＋** en ajoute, jusqu'à 10) avec des sections
  nommées (demi ou pleine largeur) et des cases choisies dans un menu **Ajouter** : constantes, instruments, voyants,
  fonctions du vaisseau, actions, émotes. Glisser-déposer (souris ou doigt), tailles 1× / 2×, cadenas pour modifier /
  renommer / supprimer. Enregistrées dans l'appli (`view.json`) et gardées au redémarrage ; chaque vue est enregistrée
  séparément, deux écrans peuvent donc modifier deux vues en même temps.
- Lien `?view=<id>` pour ouvrir une vue ; sur téléphone, les onglets deviennent une liste.
- **Accès tablette / téléphone** (📱, PC seulement) : interrupteur réseau local (désactivé par défaut), **QR code** et
  adresse complète masqués à chaque ouverture (aucune IP à l'écran), *Copier le lien*, *Ouvrir sur [vue]*,
  *Nouveau jeton*, nombre d'appareils connectés sans adresse, choix de la carte réseau (cartes virtuelles écartées).
  Option avancée : écouter sur toutes les interfaces (0.0.0.0), avec avertissement et confirmation.
- Fenêtre **À propos** : version de l'appli, version du jeu vérifiée, actions disponibles ou non, liens GitHub.
- Contrat d'API 1.2.0 : `/api/v1/views`, `/api/v1/lan`, `/api/v1/lan/token`, `/api/v1/lan/qr`, événement `views`.

### Tiers
- QR codes faits avec [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT), intégré à l'exe.

## [0.3.3] — 2026-11-21

### Ajouté
- Appli web : **les 34 émotes du joueur** dans l'onglet *Personnage*, lues en direct dans le jeu, ✔ / ⚠ à l'appui.
- Appli web : **version de l'appli** à côté du titre (au survol : version du jeu du schéma embarqué).

### Documentation
- Mise en place **Star Citizen 4.10.3 (LIVE)** : `setx GRPC_CLIENT_SERVER_ENABLED true` (affichage seulement ; les
  actions demandent la 5.0).
- Encart bêta et limites par version dans le README.

### Jeu
- Schéma vérifié sur le build 5.0 PTU 13248297 (5.0.202.10025) : inchangé (112 actions).

## [0.3.2] — 2026-11-21

### Ajouté
- Détection des versions du jeu sans commandes d'actions (ex. 4.10), uniquement par l'API du jeu : les touches
  Stream Deck affichent ⚠ avec un message clair dans le journal, l'appli web affiche un bandeau, les affichages
  continuent de marcher.
- API : champ `actions` (`available` / `unsupported` / `unknown`) dans `GET /api/v1/status` et l'événement `status`
  (contrat 1.1.0, ajout seulement).

## [0.3.1] — 2026-11-21

### Ajouté
- **`sc-telemetry-web.exe`** : l'appli web en un seul exécutable — pas besoin de Node.js, la page s'ouvre au double-clic.
- Un `sc_extrait.desc` / `actions.json` à jour posé à côté de l'exe remplace ceux embarqués (après un patch).

### Note
- L'exe n'est pas signé : Windows SmartScreen peut avertir la première fois (*Informations complémentaires →
  Exécuter quand même*).

## [0.3.0] — 2026-11-21

### Ajouté — Stream Deck
- **Ship Toggle** : 17 fonctions du vaisseau avec leur état en direct (train, phares, VTOL, transformation, découplage,
  G-safe, assistance de proximité, ESP, HUD avancé, vision nocturne, NAV/SCM, puissance moteurs / armes / boucliers,
  puissance générale, portes) ; bascule / allumer seulement / éteindre seulement ; trois styles (texte, voyant, fond coloré).
- **Ship Action** : toutes les commandes du vaisseau et du siège ; les variantes on / off / bascule regroupées en une
  ligne avec un réglage de mode (touches existantes converties automatiquement).
- Les actions dangereuses (autodestruction, éjection, coupure d'alimentation, ouverture / déverrouillage des portes) ne
  sont jamais proposées ni envoyées.

### Ajouté — appli web (aperçu)
- Grille de boutons, onglet *Personnage* (position, rôle, 13 constantes) et onglet *Vaisseau* (instruments, voyants,
  fonctions cliquables), en direct, en français et en anglais.
- API publique documentée (OpenAPI / Swagger sur `/api/docs`), jeton obligatoire, ce PC seulement.

## [0.2.0] — 2026-11-21

### Ajouté
- **Actor Display** : une constante du personnage sur une touche (valeur + jauge colorée) ou sur une **molette du
  Stream Deck +** (tourner pour changer de valeur) : santé, oxygène, faim, soif, températures, rythme cardiaque,
  gravité, pression, radiations, intoxication, air respirable, équilibre. « — » quand le jeu est fermé ou que le
  personnage n'est pas encore apparu.
- Un seul flux de télémétrie partagé, ouvert seulement quand un affichage est visible.

## [0.1.0] — 2026-11-20

Première version.

### Ajouté
- **Actor Action** : actions du perso (mobiGlas, torche, carte stellaire, visière) et les 34 émotes,
  dans une liste groupée.
- **Morse Code** : fait clignoter la torche en morse (texte, durée d'un point, répétitions).

### Problèmes connus
- En 5.0 PTU, le jeu accepte l'action `mobiglas` mais n'ouvre pas le mobiGlas.

[0.3.5]: https://github.com/Sokren/sc-telemetry-streamdeck/releases/tag/v0.3.5
[0.3.4]: https://github.com/Sokren/sc-telemetry-streamdeck/releases/tag/v0.3.4
[0.3.3]: https://github.com/Sokren/sc-telemetry-streamdeck/releases/tag/v0.3.3
[0.3.2]: https://github.com/Sokren/sc-telemetry-streamdeck/releases/tag/v0.3.2
[0.3.1]: https://github.com/Sokren/sc-telemetry-streamdeck/releases/tag/v0.3.1
[0.3.0]: https://github.com/Sokren/sc-telemetry-streamdeck/releases/tag/v0.3.0
[0.2.0]: https://github.com/Sokren/sc-telemetry-streamdeck/releases/tag/v0.2.0
[0.1.0]: https://github.com/Sokren/sc-telemetry-streamdeck/releases/tag/v0.1.0
