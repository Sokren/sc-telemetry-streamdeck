# Accès tablette / téléphone par le réseau local, avec QR code (conception)

Date : 2026-11-21. Maquette validée par Remi : [`maquettes/tablette.html`](maquettes/tablette.html)
(`?mode=on` : activé et masqué ; `?mode=on&show=1` : adresse affichée ; sans paramètre : désactivé). Son QR code
est un faux motif de démonstration.
Choix du QR code validé : **A, bibliothèque `qrcode-generator`** (MIT, sans dépendance, téléchargement accepté).
Sort dans la même mise à jour que les vues multiples (branche `feat/tablette`, partie de `feat/ma-vue`).

## Pourquoi

Remi veut afficher ses vues sur d'autres écrans (tablette, téléphone) pendant qu'il joue : un écran = une vue.
Aujourd'hui l'appli web n'écoute que le PC (`127.0.0.1`). Il faut pouvoir l'ouvrir depuis le réseau local,
simplement (scanner un QR code), sans jamais montrer d'adresse IP à l'écran (stream, regards indiscrets).

## Objectifs

- Bouton **« 📱 Tablette / téléphone »** dans l'en-tête, **sur le PC seulement**, qui ouvre une fenêtre.
- Interrupteur **« Autoriser l'accès depuis le réseau local »**, **désactivé par défaut**, réglable **depuis le PC seulement**,
  gardé quand l'appli redémarre (`lan` dans `settings.json`, champ déjà prévu).
- Activé : **QR code** et **adresse complète masqués à chaque ouverture** (QR flouté, adresse en points), bouton
  **👁 Afficher** pour les révéler ; **« Copier le lien »** marche même masqué.
- **« Ouvrir sur : [vue ▾] »** : le lien et le QR code ouvrent directement la vue choisie (`?view=<id>`).
  *Proposé par Claude, découle des vues multiples.*
- **« Nouveau jeton »** (avec confirmation) : déconnecte tous les appareils ; la page du PC continue avec le nouveau jeton.
- **Appareils connectés** : « 2 (ce PC + 1 appareil) », **sans aucune adresse**.
- Notes : pare-feu Windows (cocher **Réseaux privés** à la première activation), connexion **non chiffrée**
  (éviter les Wi-Fi publics), le jeton est dans le lien (ne pas le partager).
- Tout texte visible en français et en anglais ; API décrite FR + EN.

## Non-objectifs

- Accès par Internet, HTTPS / chiffrement, jeton par appareil, code d'appairage.
- Restreindre ce qu'une tablette peut faire (elle a les mêmes droits que la page du PC, y compris modifier
  les vues ; les actions dangereuses restent refusées partout).
- Toute modification du plugin Stream Deck.

## Anti-objectifs

- Afficher une IP sans action explicite (👁) ; l'écrire dans les journaux de la page.
- Activer le réseau local par défaut, ou pouvoir l'activer / changer le jeton depuis un autre appareil.
- Casser le plugin : tests + build + `streamdeck validate` avant commit.

## Approches envisagées (QR code)

- **A. `qrcode-generator`** *(retenue par Remi)* : fiable, très utilisée, regroupée dans le serveur par rollup (donc
  dans l'exe). Téléchargement npm accepté.
- B. Encodeur écrit à la main : rien à télécharger, mais risque de QR mal lu par certains téléphones.

## Conception

### Serveur

- **Écoute** (même port partout) :
  - `lan: false` → `127.0.0.1` seulement ;
  - `lan: true` → `127.0.0.1` **+ l'adresse de la carte réseau choisie** (voir plus bas) : les cartes virtuelles,
    VPN, etc. ne sont pas exposées ;
  - `lan: true, lanAll: true` → `127.0.0.1` (ouvert en premier : détecte une autre instance) **+ toutes les
    interfaces (`0.0.0.0`)** ; couper l'accès remet aussi `lanAll` à `false` (à reconfirmer). Option avancée demandée par Remi, case
    « Toutes les interfaces (0.0.0.0) » sous un avertissement rouge (« expose l'appli sur **toutes** les cartes :
    VPN, machines virtuelles, et tout réseau auquel le PC se connecte, y compris un Wi-Fi public ; n'importe qui
    sur ces réseaux qui obtient le lien peut piloter le jeu ») et une confirmation à l'activation.
  - Changer un réglage **relance l'écoute** (les pages ouvertes se reconnectent seules, EventSource). Au démarrage,
    l'écoute suit les réglages enregistrés. Si l'adresse de la carte choisie a changé (DHCP), l'écoute est relancée
    à la lecture suivante de `GET /api/v1/lan`.
- **Échec d'écoute** (port pris) *(choix de Claude)* : au démarrage avec `lan: true` comme lors d'un `PUT`, l'appli
  repasse sur `127.0.0.1`, enregistre `lan: false` et garde une erreur `lanError: "listen_failed"` (renvoyée par
  `GET /api/v1/lan`, effacée à la prochaine activation réussie) ; la fenêtre l'affiche (« L'accès réseau n'a pas pu
  démarrer : le port est peut-être utilisé par un autre programme »). Si même `127.0.0.1` échoue, comportement
  actuel (l'appli s'arrête avec un message).
- Une page ouverte sur le PC via l'IP du réseau local compte comme « autre appareil » : seule l'adresse locale
  (127.0.0.1 / ::1) est « ce PC ».
- **Garde** : avec `lan: false`, toute requête dont l'adresse distante n'est pas locale (127.0.0.1, ::1,
  ::ffff:127.0.0.1) → 403, même si l'écoute était encore ouverte.
- **Routes réservées au PC** (adresse distante locale, sinon 403 `pc_only`), toutes avec le jeton :

| Méthode | Chemin | Corps | Réponse |
|---|---|---|---|
| GET | `/api/v1/lan` | — | 200 `{ enabled, all, url?, networks?, network?, error?, devices: { pc: boolean, others: number } }` |
| PUT | `/api/v1/lan` | `{ enabled?, all?, network? }` | 200 (même forme) · 400 `invalid_lan` · 500 `{ error: "listen_failed" }` (réglage remis à `false`) |
| POST | `/api/v1/lan/token` | — | 200 `{ token }` (nouveau jeton, enregistré) |
| GET | `/api/v1/lan/qr?view=<id>` | — | 200 `image/svg+xml` · 409 `{ error: "lan_disabled" }` · 404 `{ error: "no_network" }` |

  - `url` : `http://<IPv4 privée>:<port>/?t=<jeton>` (sans `view`, ajouté par la page). *Choix de Claude* pour
    l'adresse, car un PC de jeu a souvent des cartes virtuelles (Hyper-V / WSL « vEthernet », VirtualBox, VMware,
    Docker, VPN) que la tablette ne peut pas joindre :
    1. candidates = IPv4 non internes en 192.168/16, 10/8 ou 172.16/12 de `os.networkInterfaces()`, **sauf** les
       cartes dont le nom contient `vEthernet`, `VirtualBox`, `VMware`, `WSL`, `Docker`, `Hyper-V`, `Loopback`
       (sans tenir compte de la casse) ;
    2. préférée = l'adresse locale de la route par défaut (socket UDP « connecté » vers `8.8.8.8:53` puis
       `address()` ; **aucun paquet n'est envoyé**) si elle fait partie des candidates ;
    3. sinon la première candidate ; aucune → `url` absent et la page affiche « Aucun réseau local trouvé ».
    - S'il reste **plusieurs** candidates, `GET /api/v1/lan` renvoie aussi `networks: [{ id, name }]` (nom de la
      carte, ex. « Wi-Fi », « Ethernet » — **jamais l'IP**) et la fenêtre affiche « Réseau : [Wi-Fi ▾] ». Le choix est
      envoyé par `PUT /api/v1/lan { network }` et enregistré (`lanNetwork` dans `settings.json`) ; carte disparue →
      règle 2-3.
  - `devices` : adresses distantes **distinctes** ayant un flux `/api/v1/events` ouvert ; `pc` = une locale
    parmi elles, `others` = le nombre des autres. Lu par la page toutes les 3 s pendant que la fenêtre est ouverte.
  - QR : `qrcode-generator`, correction d'erreur **M**, SVG noir sur blanc avec marge ; `view` validé
    (`[A-Za-z0-9_-]{1,32}`, sinon ignoré).
- **Nouveau jeton** : enregistré dans `settings.json`, tous les flux SSE fermés ; les appareils reçoivent 401 au
  prochain appel (« jeton refusé », message existant).

### Page

- Le bouton 📱 n'apparaît que si `GET /api/v1/lan` répond 200 (donc sur le PC).
- Fenêtre (`<dialog>`, comme « À propos ») suivant la maquette : interrupteur ; si activé : QR + adresse masqués,
  👁 Afficher / 🙈 Masquer, « Ouvrir sur » (Grille, puis chaque vue ; défaut : vue affichée si c'en est une, sinon
  la première vue), Copier le lien (retour « Lien copié »), Nouveau jeton (confirmation), appareils connectés,
  notes. Masqué de nouveau à chaque ouverture.
- Choix « Grille » : lien sans `view` (la tablette ouvre son dernier onglet).
- Après « Nouveau jeton » : la page du PC enregistre le nouveau jeton et se reconnecte.
- Erreurs : `listen_failed` → message, interrupteur remis à off ; `no_network` → message à la place du QR.

## Laissé au constructeur

Noms exacts des fichiers et fonctions, découpage des tests (dont un test du choix de l'IPv4 privée et de la garde
« PC seulement » avec une adresse distante simulée), style CSS fin, textes définitifs FR + EN, mention de la licence
MIT de `qrcode-generator` (README ou fichier de notices).
