# ClickFast

Jeu de rapidité : il faut cliquer le plus de fois possible sur un bouton en 5 secondes.

Projet fil rouge de la formation DevOps : le jeu est volontairement simple (HTML / CSS / JS), le vrai sujet est sa dockerisation puis son passage en pipeline CI/CD.

## Comment jouer

- Le premier clic sur le bouton **Clique !** lance le chrono de 5 secondes.
- Chaque clic ajoute 1 au score.
- À la fin du chrono, le bouton se bloque et le score final s'affiche.
- **Rejouer** remet le score à 0 et le chrono à 5 secondes.

## Lancer le projet

Pour l'instant, aucune installation n'est nécessaire :

```bash
git clone https://github.com/projets1700/ClickFast.git
cd ClickFast
```

Puis ouvrir `index.html` dans un navigateur.

## Structure

| Fichier      | Rôle                                          |
| ------------ | --------------------------------------------- |
| `index.html` | La page : titre, compteur, chrono, boutons    |
| `style.css`  | La mise en forme                              |
| `script.js`  | La logique : comptage des clics et chrono     |

## Journal de bord

### Étape 1 : le jeu tourne

Départ sur les fichiers du repo du prof (`index.html`, `style.css`, `script.js`). Le HTML ne contenait que le titre, et `script.js` uniquement des consignes en commentaire : ajout du compteur, du chrono, du bouton de clic et du bouton Rejouer, puis de la logique JS. Le chrono démarre au premier clic et se base sur l'heure de fin (`Date.now()`) plutôt que sur un simple décompte, pour ne pas dériver si l'intervalle prend du retard. Une seconde vérification dans le clic empêche de compter un clic arrivé après la fin. Premier accroc : le titre utilisait une classe `flex` qui n'existe pas dans le CSS (seule `flex-center` existe), corrigé. Vérifié en ouvrant `index.html` : le score monte, se fige à 0.0 s, et Rejouer remet tout à zéro.
