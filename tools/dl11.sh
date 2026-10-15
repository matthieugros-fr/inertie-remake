#!/bin/sh
# dl11.sh <fichier> <session> <generation> <date> <signature> : télécharge un son généré par ElevenLabs
curl -sf -o "$1" "https://storage.googleapis.com/xi-backend/database/workspace/be08e6f0024d491daf583b5858bd8430/content_generation/$2/$3/content.mp3?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Credential=xi-backend-prod%40xi-labs.iam.gserviceaccount.com%2F20261014%2Fauto%2Fstorage%2Fgoog4_request&X-Goog-Date=$4&X-Goog-Expires=7200&X-Goog-SignedHeaders=host&X-Goog-Signature=$5" && echo "$1 ok" || echo "$1 ECHEC"
