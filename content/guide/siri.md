Sur iPhone, crée un raccourci « Dis Siri, ajoute [X] dans Dodojo » avec l'app Raccourcis — pas besoin d'installer quoi que ce soit d'autre.

- Génère ton token personnel dans la section « Intégrations » du Vestiaire (bouton « Générer mon token »), copie-le immédiatement : il ne sera plus jamais affiché

- Dans l'app Raccourcis, crée un nouveau raccourci et ajoute l'action « Obtenir le contenu de l'URL »

- URL : l'adresse du webhook Dodojo ; Méthode : POST ; En-têtes : Authorization = Bearer <ton token>

- Corps de la requête (JSON) : { "title": "Texte dicté" } — utilise une variable de dictée Siri pour remplacer le texte

- Nomme le raccourci « Ajoute [texte] dans Dodojo » pour pouvoir le déclencher à la voix

- Bouton « Tester mon raccourci » dans le Vestiaire : vérifie que le token fonctionne avant même de configurer Raccourcis

Régénérer le token invalide immédiatement l'ancien : un raccourci déjà configuré devra être mis à jour avec le nouveau token.
