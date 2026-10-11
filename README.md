# DZ DRIVE — Algérie, monde ouvert

Jeu de conduite en monde ouvert qui tourne directement dans le navigateur (Three.js + Vite), jouable **au clavier/souris ou à la manette**.
Une seule carte continue de **32 × 32 km (1 024 km²)**, sans choix de map : on part d'Alger et on peut rouler jusqu'au Sahara.

Tout est généré par le code (relief, routes, villes, voitures, textures, sons) : aucun fichier 3D ou audio externe.

## Lancer le jeu

```bash
npm install
npm run dev        # puis ouvrir l'adresse affichée (http://localhost:5173)
```

Version de production (fichiers statiques dans `dist/`, à héberger n'importe où, y compris GitHub Pages) :

```bash
npm run build
npm run preview
```

Un navigateur récent avec WebGL 2 est nécessaire (Chrome, Edge, Firefox, Safari 16+). Pour la manette, branchez-la puis appuyez sur un bouton.

## La carte (du nord au sud)

| Région | Ce qu'on y trouve |
| --- | --- |
| **Mer Méditerranée & Corniche** | Route côtière, plages, palmiers, ruines romaines de **Tipaza** |
| **Alger** | Grille de rues (~1 300 tronçons), ~3 000 immeubles : Casbah blanche, boulevards haussmanniens à volets bleus, cités HLM, tours de bureaux, **Djamaa El Djazaïr** (minaret de 265 m), Grande Poste, Coupole, front de mer |
| **Port d'Alger** | Quais, terminal à conteneurs, portiques, cargos, ferry, phare, **tremplin** au-dessus du bassin |
| **Riadh El Feth** | **Maqam Echahid** et sa flamme éternelle |
| **Aéroport** | Piste de 4,3 km (idéale pour la vitesse max), taxiway, terminal, tour de contrôle, hangars, avions, **tremplin** au-dessus d'un avion |
| **Autoroute Est-Ouest (A1)** | 2 × 3 voies, séparateur central, lampadaires, portiques bilingues |
| **Plaine de la Mitidja** | Champs, orangers, oliviers, eucalyptus, Blida |
| **Atlas & forêt de Chréa** | Cols, gorges de la Chiffa, routes de montagne, cèdres et pins |
| **Hauts Plateaux** | Steppe, **Chott El Hodna** (lac salé plat) |
| **Sahara** | Dunes du **Grand Erg** et son **méga tremplin**, **Ghardaïa** (ksar ocre, palmeraie), canyons du **Tassili n'Ajjer** |
| **Stunt Park** | Looping hélicoïdal, kickers, saut de bus, half-pipe, mur incliné, méga-rampe de 32 m |

## Voitures (12) et garage

Berline Atlas Classic, Taxi Alger, Kasbah Hatch R, Hoggar Pickup 4x4, Erg Dune Buggy, Sahara Cruiser V8, Djurdjura Rally WRX, Tassili Muscle 6.4, Patrouille Interceptor (gyrophares + sirène), Corniche GT, Mirage S, Fennec X Hyper (1 350 ch).

Dans le garage : achat avec l'argent gagné (en dinars), peinture (20 teintes + couleur libre, finitions brillant/métallisé/nacré/mat/chrome), jantes (6 modèles, 7 couleurs), étriers, teinte des vitres, livrées (bandes, drapeau DZ, rallye…), néons, plaque, améliorations (moteur, turbo, freins, allègement, nitro), pneus (route, sport, semi-slick, rallye, tout-terrain), suspensions, réglages (hauteur, répartition de freinage, direction, couple 4x4).

## Modes de jeu

- **Monde ouvert** : trafic sur autoroute/nationales/ville, 8 radars, 30 **fennecs dorés** à trouver, 17 lieux à découvrir, GPS et voyage rapide depuis la carte, cycle jour/nuit.
- **Courses avec IA** : Sprint de l'autoroute, Grand Prix d'Alger (circuit 2 tours), Gorges de la Chiffa, Corniche de Tipaza, Transsaharienne, Piste du Tassili, Rallye du Grand Erg (hors-piste), Drag de l'aéroport, Montée de Chréa (contre-la-montre).
- **Défis** : Stunt Park (90 s de figures), Méga Saut du Grand Erg (distance), Drift du Port.
- **Cascades** comptées partout : sauts, flips avant/arrière, tonneaux, 360°, looping, wall ride, dérapages, deux roues, frôlements, vitesse extrême — avec combos multiplicateurs convertis en dinars.

## Commandes

| Action | Clavier | Manette |
| --- | --- | --- |
| Accélérer / freiner-reculer | Z (W) / S ou ↑ / ↓ | RT / LT |
| Diriger | Q (A) / D ou ← / → | Stick gauche |
| Frein à main | Espace | Ⓐ |
| Nitro | Maj | Ⓑ |
| Lancer une épreuve | F | Ⓧ |
| Caméra (6 vues) | C | Ⓨ |
| Regarder autour / derrière | Souris (clic droit) / B | Stick droit / R3 |
| Rapports (boîte manuelle) | E / A (Q) | RB / LB |
| Replacer la voiture | R | Croix ↓ |
| Phares / sirène / heure | L / K / N | Croix ↑ / ← / → |
| Klaxon | H | L3 |
| Carte / pause | M / Échap | View / Menu |
| Figures en l'air | Avancer/reculer + diriger (+ Espace = tonneau) | Stick gauche (+ Ⓐ) |

Les touches suivent la position physique : sur un clavier AZERTY on conduit avec **ZQSD**.

## Paramètres

Qualité graphique (Auto, Faible, Moyenne, Haute, Ultra avec bloom), cycle jour/nuit et heure, volumes, radio procédurale (« Raï FM » en gamme Hijaz avec darbouka, « Chaâbi Drive »), boîte manuelle, ABS / antipatinage / ESP / aide au contre-braquage, densité du trafic, mini-carte, compteur FPS, **mode libre** (tout débloqué). La progression est sauvegardée dans le navigateur.

## Architecture

```
src/
  main.js               boucle de jeu, états, chargement
  world/                relief (worldgen), routes, terrain LOD + workers, ville, lieux, végétation, ciel, mer, collisions
  vehicle/              catalogue, physique (suspension par rayons, pneus, moteur/boîte), modèle 3D procédural, effets
  game/                 caméras, cascades, épreuves + IA, trafic, activités
  ui/                   HUD, mini-carte/carte/GPS, menus, garage
  core/                 entrées clavier/manette, audio synthétisé, sauvegarde
tools/                  aperçu de carte, tests physiques, captures et simulations automatisées (Playwright)
```

- **Terrain** : fonction de hauteur analytique (bruit simplex, crêtes de l'Atlas, dunes, mesas) + zones aplanies + routes qui creusent/remblaient le relief ; rendu en quadtree de 250 m à 32 km avec jupes anti-fissures, généré dans des Web Workers.
- **Physique** : corps rigide à 120 Hz, 4 roues à suspension par lancer de rayon, courbe de dérive type Pacejka et cercle de friction, transfert de charge, barres anti-roulis, aérodynamique, collisions caisse/terrain/bâtiments/arbres/véhicules.
- **Outils de dev** : `node tools/preview-map.mjs 800 carte.png` (aperçu de la carte + stats des routes), `node tools/physics-test2.mjs` (accélérations), `node tools/tour.mjs` et `node tools/simtest.mjs` (captures et simulations dans Chromium headless).
