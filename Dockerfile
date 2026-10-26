# Version précise, jamais latest : le même Dockerfile donne la même image demain
FROM nginx:1.30.6-alpine

# On vide la racine servie : l'image de base y laisse index.html et 50x.html par défaut
RUN rm -rf /usr/share/nginx/html/*

# Copie explicite des seuls fichiers du site, rien d'autre
COPY index.html style.css script.js /usr/share/nginx/html/

EXPOSE 80
