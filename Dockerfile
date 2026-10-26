# Version précise, jamais latest : le même Dockerfile donne la même image demain.
# Variante alpine-slim : même nginx, sans les modules njs/acme dont un site statique n'a pas besoin
FROM nginx:1.30.6-alpine-slim

# On vide la racine servie : l'image de base y laisse index.html et 50x.html par défaut.
# On retire aussi le server par défaut, remplacé par notre nginx.conf.
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf

# Config qui place le PID et les fichiers temporaires dans /tmp, pour tourner sans root
COPY nginx.conf /etc/nginx/nginx.conf

# Script lancé par l'entrypoint nginx : génère config.js depuis la variable API_URL
COPY --chmod=755 docker/40-clickfast-config.sh /docker-entrypoint.d/

# Copie explicite des seuls fichiers du site, rien d'autre
COPY index.html style.css script.js /usr/share/nginx/html/

EXPOSE 80

# Le processus maître lui-même tourne en nginx, plus jamais en root
USER nginx

# Forme exec : nginx est PID 1 et reçoit correctement les signaux d'arrêt
CMD ["nginx", "-g", "daemon off;"]
