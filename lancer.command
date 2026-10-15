#!/bin/bash
# Lance Inertie dans le navigateur (double-clic dans le Finder)
cd "$(dirname "$0")"
python3 tools/serve.py 8642 &
SERVER=$!
sleep 1
open "http://localhost:8642/"
echo "Inertie tourne sur http://localhost:8642/ — fermez cette fenêtre pour arrêter."
wait $SERVER
