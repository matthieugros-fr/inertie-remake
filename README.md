# Inertie (Ubi Soft, 1987) : remake

Jeu d'origine : programmation Christophe Le Bouil, graphismes Patrick Daher, musique Xavier Talgorn.

## Jouer en ligne

https://matthieugros-fr.github.io/inertie-remake/

Le jeu d'origine n'est pas fourni : au premier lancement, la page demande les deux images disque d'Inertie
(fichiers `.dsk`, disquette 1 et disquette 2). Elles sont lues et gardées dans le navigateur, rien n'est envoyé.

## Lancer le jeu sur sa machine

Double-cliquer sur `lancer.command`. Ou, dans un terminal :

```bash
cd ~/inertie-remake && python3 tools/serve.py
```

puis ouvrir http://localhost:8642/

## Les deux modes

- **Original CPC** : le code Z80 du jeu de 1987 tourne tel quel dans une machine CPC simulée (`emu/`).
  Le comportement est celui de la vraie machine : physique, collisions, ennemis, menu, codes, sauvegarde des scores.
- **Amélioré** : même partie, rendu modernisé sur la carte graphique. Le pixel art est lissé par l'algorithme EPX,
  les couleurs vives rayonnent (lasers, réacteurs, explosions) et un éclairage suit le vaisseau. On passe d'un mode
  à l'autre en pleine partie.

- **Néo-Tokyo** : direction artistique inspirée d'Akira, sur le même gameplay. Le décor est redessiné par
  le code à partir de l'état du jeu (`app/state.js` lit la carte, le vaisseau, les textes et les pixels
  restants) : béton et chair biomécanique veinée de rouge, panneaux à katakana, survivants en combinaison
  blanche, vaisseau rouge Kaneda avec traînée lumineuse, explosion en dôme blanc, interface rouge et blanche.
  Les objets mobiles (soucoupes, comètes, boules de feu, tirs) sont repérés en interceptant les routines
  de dessin du jeu (&0FC2 pour les blocs, &0EEB pour les tirs) et redessinés avec une traînée lumineuse.
  Chaque planète prend la teinte de ses rochers d'origine. Les dialogues des cosmonautes deviennent des
  bulles de manga (réponse touche O ou N) ; les autres messages de l'écran de bord passent dans un panneau
  « transmission ».
  Effets d'image en WebGL (`app/neo_fx.js`) : halo, aberration chromatique, balayage, grain, parasites.

  Mise au point, dans la console du navigateur : `inertie.goto(planète, écran)` démarre une planète et y
  téléporte le vaisseau ; `inertie.frames(n)` fait avancer le jeu de n images.
  Les sons sont des effets générés avec ElevenLabs (`assets/sfx/`), déclenchés par les sons que le jeu
  original demande (`app/neo_audio.js`). Musiques Eleven Music (`assets/music/`) : Ruin Procession pour les
  menus, Tunnel Ritual en jeu, Collapse Loop quand l'énergie ou l'oxygène baissent, Victory Impact pour la
  victoire ; boucles calées avant le fondu final de chaque fichier, avec fondu enchaîné.
  Voix (`assets/voix/`, voix conçues avec ElevenLabs) : l'ordinateur de bord, voix de canard sarcastique
  (énergie basse, crash, refus d'un passager, game over), et le cosmonaute marseillais (demande, « oui »,
  « non », mort à bord). La musique baisse pendant qu'ils parlent. Explosion et tir refaits en qualité
  cinéma ; les anciennes versions sont dans `assets/sfx_pro/`.

- **Toutous** : même jeu, version chiens (`app/dog.js`, hérite du rendu Néo-Tokyo). Chiot dans une niche-fusée
  à petits nuages, chiens perdus en scaphandre, chats cosmiques, pelotes de laine, bouches d'incendie,
  aspirateurs ; os en guise de tirs, balles de tennis et onomatopées à chaque impact. Sons de chiens ElevenLabs
  (`assets/sfx_dog/`) joués très fort, aboiements-insultes façon « fuck you Tony » à intervalles réguliers.
  Création originale : aucun graphisme de Nintendo.

## Commandes

| Touche | En vol | À pied (cosmonaute) |
|---|---|---|
| ← → | tourner | marcher |
| ↑ | pousser | réacteur dorsal |
| X ou Maj | tirer | |
| Entrée | | rentrer (juste au-dessus du vaisseau) |
| Espace | posé sur une plateforme : sortir le cosmonaute | |
| O / N | | répondre à un savant |
| D, puis G + 1-4 | ordinateur de bord et guidage (posé) | |
| S / R | arrêter le guidage / revoir le radar | |

Après un crash, n'importe quelle touche relance le vaisseau. Manette : croix ou stick, bouton A = tir.
Règle (notice d'origine) : le vaisseau ne doit rien toucher. Les disquettes et les savants se ramassent à pied,
avec le cosmonaute, en surveillant l'oxygène ; l'énergie se recharge en survolant les réserves « E ».

Menu : `1` jeu, `2` table des scores, `3` redéfinition des touches. Le code d'une planète se valide tout seul au 6ᵉ caractère.

## Codes des planètes (relevés dans le jeu)

| # | Fichier | Code | Disquette |
|---|---|---|---|
| 1 | EJR | J12C58 | 1 |
| 2 | WTE | A35F13 | 1 |
| 3 | INV | J74V99 | 1 |
| 4 | ZBB | KIM742 | 1 |
| 5 | SHL | SUNC79 | 1 |
| 6 | FAX | G8I365 | 2 |
| 7 | CPA | RS232C | 2 |
| 8 | DUU | UBI57H | 2 |
| 9 | KED | O97P94 | 2 |
| 10 | YGQ | T78S26 | 2 |

Les plans complets des 10 planètes sont dans `ref/planetes/`.

## Organisation

```
index.html, app/      page, clavier/manette, rendu « Amélioré » (WebGL)
emu/z80.js            processeur Z80
emu/cpc.js            machine CPC : mémoire, Gate Array, écran, firmware simulé (clavier, son, disquette, événements)
emu/sound.js          gestionnaire de son du firmware et synthèse AY-3-8912
emu/original.js       chargement du jeu (reproduit ce que fait le chargeur LOD01)
tools/                extraction des disquettes, désassembleur, rendu des cartes, tests sans navigateur
ref/                  fichiers extraits de VOS disquettes, désassemblage, captures (à ne pas diffuser)
```

## Ce que l'analyse du jeu a établi

- Le jeu (`GAME.BIN`, chargé en &0400) est chiffré : octet XOR &AD puis + &12. Le chargeur `LOD01` le déchiffre, recopie
  50 octets de son propre code en &0FBB et en &B110 (protection : sans eux le jeu boucle), puis saute en &4012.
- Une planète est un fichier de 20 300 octets chargé en &5038 : une grille de 12 × 9 écrans, chaque écran faisant
  10 × 10 tuiles de 10 pixels sur 20 lignes ; puis la liste des cosmonautes (noms tirés au hasard) ; puis les graphismes
  des tuiles (100 octets chacune, en &7ACC + code × 100).
- Palette du jeu (table en &05AF) : 0, 1, 2, 4, 0, 11, 6, 15, 3, 24, 26, 9, 18, 20, 17, 13.
- Le vaisseau (8 orientations) et les explosions sont dans `HIBIN.BIN` (&A034). Sa position est en &041C (x en octets)
  et &041D (y en lignes) ; l'adresse écran de son sprite est en &040B.
- Touches par défaut (table en &21F1) : Z/X tourner, Maj réacteurs, Entrée tir ; joystick équivalent.

## Droits

Inertie © 1987 Ubi Soft. Aucun fichier du jeu original n'est inclus dans ce dépôt (dossier `ref/` exclu) :
chacun utilise les images de ses propres disquettes. Sons et musiques du remake générés avec ElevenLabs.
