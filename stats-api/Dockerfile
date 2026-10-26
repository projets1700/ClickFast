# Version précise, "slim" : Debian allégée, sans les soucis de compilation d'Alpine pour les libs C
FROM python:3.14.9-slim

# Pas de fichiers .pyc inutiles dans un conteneur éphémère
ENV PYTHONDONTWRITEBYTECODE=1
# Logs envoyés tout de suite, sinon ils restent dans un buffer et docker logs reste vide
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Dépendances avant le code : cette couche reste en cache tant que requirements.txt ne bouge pas
COPY requirements.txt .
# --no-cache-dir : pas de cache pip qui ferait grossir l'image pour rien
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

# Utilisateur non privilégié, créé sans mot de passe ni dossier personnel
RUN useradd --system --no-create-home --shell /usr/sbin/nologin stats
USER stats

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
