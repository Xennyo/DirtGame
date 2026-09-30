# DirtGame

Jeu de l'oie « action ou vérité » pour deux, en une seule page web avec un plateau en 3D.

## Jouer

La page est statique : `index.html` avec `style.css`, `main.js`, `board3d.js`, `deck.js` et Three.js dans `vendor/`. Il n'y a pas de serveur ni de compte, et elle fonctionne hors ligne une fois chargée.

- **En ligne** : activer GitHub Pages sur la branche `main` (Settings > Pages), puis ouvrir l'adresse sur le téléphone.
- **Sur ordinateur** : lancer `python3 -m http.server` dans ce dossier, puis ouvrir http://localhost:8000. Un double-clic sur `index.html` ne suffit pas, car les navigateurs bloquent les modules JavaScript en `file://`.

## Règles

- Deux joueurs, un dé de 1 à 6, et un plateau de 45 cases en forme de cœur.
- L'intensité est **progressive** (Soft pour les cases 1 à 15, Chaud de 16 à 30, Hot de 31 à 45) ou **fixe**. En jeu, rien n'indique la zone : toutes les cases et les cartes ont la même couleur.
- Les cases : Action, Vérité, Choix libre, Joker, Recul de 3, Échange de places, Bonus (rejouer) et Arrivée.
- Il faut tomber pile sur la case 45, sinon le pion recule du surplus. Le gagnant impose ensuite un gage final.
- Il n'y a pas de vérité au niveau Hot : une case Vérité ou Choix libre y donne une action.

## Modifier les gages

Les gages sont dans `content/gages.md`. Après une modification, lancer la commande suivante pour régénérer `deck.js` :

```
python3 tools/build_deck.py
```

Chaque gage porte l'étiquette `[Tous]`, `[H]` ou `[F]` selon le joueur qui le reçoit. Une durée en secondes ou en minutes écrite dans le texte ajoute automatiquement un minuteur à la carte.

Astuce : `index.html#board` ouvre directement le plateau.
