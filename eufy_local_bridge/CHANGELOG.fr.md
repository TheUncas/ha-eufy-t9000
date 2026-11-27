# Notes de version

[Release notes in English](https://github.com/TheUncas/ha-eufy-t9000/blob/main/eufy_local_bridge/CHANGELOG.md)

## 1.6.1

- Les caméras PoE E40, E41 et S4 disposent désormais d’une entité **Mouvement** dès leur découverte sur la HomeBase. Elle reste **Inconnu** jusqu’au premier état reçu.
- Le module traite les alertes locales de mouvement des caméras PoE dont le connecteur ne reconnaissait pas la détection. Le direct et les vignettes périodiques peuvent rester désactivés.
- Mettez à jour le module et démarrez-le. L’intégration déjà chargée en version 1.6.0 découvre les entités à l’actualisation suivante.

## 1.6.0

- **Générer une clé d’appairage** enregistre la clé directement dans le module via le Supervisor de Home Assistant et démarre le module si nécessaire. L’assistant réutilise une clé existante. La saisie manuelle reste disponible.
- L’entité **Mouvement** apparaît dès qu’un appareil annonce cette capacité ou transmet un état compatible. Son attribut `last_motion_received_at` donne l’heure de réception du dernier début de mouvement, y compris lorsqu’il s’est terminé entre deux lectures.
- Après la mise à jour, démarrez le module et redémarrez Home Assistant Core une fois pour charger l’intégration. Les installations déjà appairées gardent leur clé.

## 1.5.0

- Choisissez **Générer une clé d’appairage** dans l’assistant de l’intégration, puis collez la clé dans les paramètres du module. L’assistant peut afficher et préremplir l’empreinte SHA-256 du certificat du module.
- Les guides français et anglais décrivent le premier appairage sans commande à saisir.
- Après la mise à jour, démarrez le module et redémarrez une fois Home Assistant Core pour charger le nouvel assistant. Les installations existantes conservent leur clé et leur session eufy.

## 1.4.1

- Le README et le guide d’installation, de configuration des caméras et de diagnostic UDP sont désormais disponibles en anglais.
- Les notes de version sont accessibles depuis l’écran de mise à jour du module dans Home Assistant. Un lien y donne accès à cette édition française.
- Mettez le module à jour depuis Home Assistant. Core peut continuer à fonctionner avec l’intégration en version 1.4.0.

## 1.4.0

- Chaque caméra annoncée par la HomeBase dispose de sa propre fiche appareil. Ouvrez son entité caméra pour afficher le direct local. Les entités vidéo sur batterie sont activables individuellement.
- Ajout de vignettes périodiques pour les caméras PoE compatibles. L’option est désactivée par défaut. Une fois activée, le module attend 60 secondes par défaut entre chaque tour de capture et donne la priorité au direct.
- Ajout de réglages pour l’intervalle de lecture des états par Home Assistant, l’intervalle d’interrogation de la HomeBase et le délai de démarrage de la vidéo.
- L’intégration fournit son icône eufy localement à partir de Home Assistant Core 2026.3.

## 1.3.7

- La connexion habituelle à la HomeBase utilise en priorité la sélection d’adresse et de port UDP validée par le diagnostic. Le module vérifie la paire retenue à l’ouverture et au renouvellement du canal de commande.

## 1.3.6

- **Tester la liaison UDP** essaie la sélection d’adresse et de port de la passerelle Windows dans une session locale dédiée. L’attribut `windows_lan_trial` vaut `connected` lorsque le test a ouvert le canal de commande sur la paire attendue.

## 1.3.5

- **Diagnostic UDP** conserve jusqu’à quatre expirations ICE survenues pendant les 90 secondes du test. Chaque rapport indique l’étape atteinte et si les candidats correspondaient aux adresses de la route locale et de la HomeBase.

## 1.3.4

- Correction du canal de signalisation utilisé pour transmettre les candidats ICE à la HomeBase.
- Home Assistant explique qu’un changement de mode est déjà en cours lorsque la passerelle refuse une seconde demande avec une erreur HTTP 409.

## 1.3.3

- Correction d’un cas où une tentative de connexion expirée pouvait fermer la session suivante.
- L’entité d’alarme affiche le dernier rapport ICE disponible dans `last_ice_attempt` lorsqu’une tentative expire.

## 1.3.2

- **Diagnostic UDP** compte les requêtes STUN Binding et les réponses de succès ou d’erreur, dans chaque sens.

## 1.3.1

- Le connecteur attend brièvement la collecte des candidats ICE locaux avant d’envoyer sa réponse de session à la HomeBase.

## 1.3.0

- Ajout du bouton **Tester la liaison UDP** sur la fiche de la HomeBase. Pendant 90 secondes, le test compte le trafic UDP par interface et par sens, sans envoyer de commande d’alarme.

## 1.2.1

- Correction d’un échec de connexion possible lorsqu’un candidat ICE de la HomeBase arrivait avant l’initialisation du transport local.

## 1.2.0

- Ajout du sélecteur de mode de garde pour les modes annoncés par la HomeBase, dont la programmation, le géorepérage et les profils personnalisés sur les bases compatibles.
- Ajout des attributs `homebase_online` et `connection_issue` sur l’entité d’alarme pour diagnostiquer une commande refusée.

## 1.1.1

- Correction de l’appairage pour les installations bloquées sur « En attente d’eufy ». Après la mise à jour du module et le redémarrage de Core, rouvrez la configuration de l’intégration pour terminer l’appairage.

## 1.1.0

- Première publication du module Home Assistant pour les machines et VM Intel/AMD 64 bits. L’intégration s’appaire avec une clé dédiée et permet de se connecter à eufy depuis Home Assistant.
- Ajout de la commande de l’alarme, des pourcentages de batterie des caméras, des capteurs d’ouverture et de mouvement et du direct des caméras compatibles à la demande. Le module conserve la session eufy chiffrée pour la réutiliser après un redémarrage.
