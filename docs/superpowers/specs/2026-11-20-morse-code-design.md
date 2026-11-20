# Conception — action « Morse Code »

Date : 2026-11-20 · Statut : validée par Remi (dans la conversation)

## Intention

Reprendre `tools/sc_morse.py` dans le plugin : une touche Stream Deck qui fait clignoter la torche
du personnage en morse, avec le texte et le rythme réglables par touche.

## Ce qui est décidé

- Nouvelle action **Morse Code** (`com.sokren.sc-telemetry.morse-code`), catégorie « Star Citizen »,
  touches seulement.
- Réglages par touche : **texte** (défaut `SOS`), **durée d'un point** en ms (défaut 400, de 100 à
  2000), **répétitions** (défaut 1, de 1 à 10).
- Un appui lance l'émission ; un nouvel appui sur n'importe quelle touche Morse pendant l'émission
  l'arrête. Une seule émission à la fois (la torche est commune).
- À l'arrêt ou en cas d'erreur, si la torche est restée allumée, on la rebascule une fois (comme le
  Ctrl+C du script).
- Le jeu n'expose pas l'état de la torche (seulement `toggle_flashlight`) : **la torche doit être
  éteinte au départ** ; le panneau de réglage le rappelle.
- Rythme morse standard : point = 1 unité allumée, trait = 3, 1 unité entre deux signes, 3 entre
  deux lettres, 7 entre deux mots et entre deux répétitions. Les bascules sont planifiées sur une
  horloge absolue pour compenser la durée des appels (comme le script).
- Alphabet du script : A–Z, 0–9, espaces. Les accents sont retirés (É → E). **Autres caractères
  ignorés** ; le panneau indique les caractères acceptés *(choix de Claude : plus simple et plus sûr
  qu'un message d'erreur dynamique dans le panneau ; écart avec la proposition initiale)*.
- Retour visuel : titre de la touche = le texte ; pendant l'émission, « ● » devant le texte ; ✔ à
  la fin normale, ⚠ si une bascule échoue (jeu injoignable…) ou si le texte ne contient aucun
  caractère émettable.

## Approches

- **Action dédiée dans le plugin (retenue)** : réutilise le client gRPC et le mécanisme d'actions
  existants ; seule façon d'avoir les réglages dans le panneau Stream Deck.
- Lancer le script Python depuis une touche « Ouvrir » : écarté (dépend de Python, pas de réglages,
  contraire à « pas de Python dans le plugin final »).

## Hors périmètre

Ponctuation morse, son, lecture de l'état de la torche (inexistant dans l'API).
