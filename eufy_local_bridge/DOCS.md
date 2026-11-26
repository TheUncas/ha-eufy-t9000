# Installer Eufy Local Bridge dans Home Assistant OS

<a href="https://buymeacoffee.com/theuncas"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" width="180" alt="M’offrir un café sur Buy Me a Coffee"></a>

Le module se connecte à votre compte eufy et au T9000 depuis Home Assistant OS sur **PC ou VM Intel/AMD 64 bits**. L’intégration fournit les entités aux tableaux de bord et aux automatisations. Le PC qui héberge le site Windows peut être éteint. La VM doit pouvoir joindre la HomeBase sur le réseau local. Sous VMware, utilisez une carte réseau en mode pont sur ce réseau.

## Installer depuis la boutique

1. Ouvrez [Ajouter le dépôt Eufy Local Bridge à Home Assistant](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2FTheUncas%2Fha-eufy-t9000) et confirmez. Pour l’ajouter manuellement, ouvrez **Paramètres → Applications** (ou **Modules complémentaires**), puis **Boutique → ⋮ → Dépôts**. Saisissez `https://github.com/TheUncas/ha-eufy-t9000`.
2. Ouvrez **Eufy Local Bridge T9000** dans la boutique et sélectionnez **Installer**. La première construction nécessite Internet. Si le module tarde à apparaître, choisissez **Rechercher des mises à jour** dans le menu de la boutique. [Fonctionnement des dépôts Home Assistant](https://contributors.home-assistant.io/apps/guides/repository/)
3. [Générez votre clé d’appairage](#générer-la-clé), puis collez-la dans le champ `pairing_key` de l’onglet **Configuration** du module. Enregistrez, activez **Démarrer au démarrage** puis démarrez le module. Dans son **Journal**, vérifiez le résultat de l’installation de l’intégration et copiez l’empreinte publique SHA-256.
4. **Redémarrez Home Assistant Core** lorsque le journal le demande. Le module installe les fichiers dans `custom_components/eufy_local_bridge` et indique les mises à jour qui nécessitent un nouveau redémarrage.

### Si vous utilisiez déjà une version précédente

- **Fenêtre « En attente d’eufy » de la version 1.1.0** — Fermez cette fenêtre. Après la mise à jour du module vers la version 1.1.1, démarrez-le, vérifiez dans son journal que l’intégration a été mise à jour, puis redémarrez Home Assistant Core. Relancez l’appairage dans **Appareils et services** avec votre clé et l’empreinte du journal.
- **Ancien module installé depuis le ZIP** — Les versions locale et boutique sont deux installations distinctes pour Home Assistant. Arrêtez l’ancien module et désactivez son démarrage automatique avant de démarrer celui de la boutique, car ils utilisent les mêmes ports. La nouvelle installation a son propre certificat et son propre stockage. Dans Home Assistant, suivez la demande de réauthentification avec la nouvelle empreinte et la clé choisie.
- **Intégration YAML vers le PC Windows** — Retirez uniquement l’ancien bloc `eufy_local_bridge:` dans `configuration.yaml`, vérifiez la configuration et redémarrez Core après le premier démarrage du module. Si vous utilisiez le package REST, désactivez sa déclaration pour éviter les doublons.
- L’installateur reconnaît les versions déjà distribuées. S’il signale un conflit avec des fichiers personnalisés, sauvegardez votre personnalisation avant de décider de la remplacer.

## Générer la clé

La `pairing_key` est le secret partagé entre l’intégration Home Assistant et le module. L’intégration le présente pour lire les états et envoyer des commandes à l’alarme. L’empreinte SHA-256 du journal est publique et permet à l’intégration de vérifier le certificat du module.

Générez la clé **une seule fois** et conservez-la dans votre gestionnaire de mots de passe. Vous pouvez utiliser son générateur avec 32 à 128 caractères parmi `A–Z`, `a–z`, `0–9`, `-` et `_`. Sur Windows, ce bloc PowerShell génère une clé de 64 caractères à partir de 32 octets aléatoires.

```powershell
$octets = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($octets)
$rng.Dispose()
[BitConverter]::ToString($octets).Replace('-', '').ToLowerInvariant()
```

## Connecter eufy depuis Home Assistant

1. Ouvrez Home Assistant via **HTTPS** avant de saisir vos identifiants. Le navigateur utilise la connexion de votre installation Home Assistant.
2. Dans **Paramètres → Appareils et services → Ajouter une intégration**, recherchez **Passerelle eufy locale**. Collez **la même clé** que dans la configuration du module dans le champ de la clé d’appairage. Dans le champ SHA-256, collez l’empreinte copiée depuis le journal.
3. Saisissez votre adresse e-mail eufy, votre mot de passe et le code pays du compte (par exemple `FR`). Laissez la fenêtre ouverte. Home Assistant termine l’appairage automatiquement ou affiche le captcha ou le code de vérification demandé par eufy. Si l’attente atteint 90 secondes, le formulaire de connexion réapparaît avec un message. Vérifiez alors l’accès Internet de la VM et le pays du compte avant de réessayer.
4. Sous **Entités**, recherchez **Alarme T9000** et **Eufy batterie**. Vérifiez un pourcentage et le mode actif de la base. Les actions natives `alarm_control_panel.alarm_arm_home`, `alarm_control_panel.alarm_arm_away` et `alarm_control_panel.alarm_disarm` sont disponibles selon les modes annoncés par la base. L’affichage change quand la base confirme le mode. Le direct s’ouvre à la demande pour les caméras compatibles. Les entités vidéo des caméras sur batterie sont désactivées par défaut pour éviter les réveils dus aux vignettes.

Les composants qui signalent une ouverture ou un mouvement fournissent aussi des capteurs binaires dans Home Assistant. Ils deviennent indisponibles si la liaison avec la base est perdue.

## Ouvrir tous les modes depuis la tuile Alarme

Depuis la version 1.2.0, ouvrez l’entité **Mode de garde T9000** pour choisir parmi les modes que votre HomeBase annonce. Selon la base, vous y trouverez notamment les profils personnalisés, la programmation, le géorepérage et le désarmement. Les mêmes choix sont utilisables dans une automatisation avec l’action `select.select_option` et le nom exact affiché dans la liste.

Pour afficher l’état de l’alarme et ouvrir la liste complète d’un appui, modifiez votre tableau de bord, ajoutez une carte **Manuel** et collez cette configuration. Si vous avez renommé vos entités, utilisez leurs identifiants dans les trois champs `entity`.

```yaml
type: tile
entity: alarm_control_panel.alarme_t9000
tap_action:
  action: more-info
  entity: select.mode_de_garde_t9000
icon_tap_action:
  action: more-info
  entity: select.mode_de_garde_t9000
```

La tuile affiche l’état actif confirmé par la base. Le sélecteur affiche le dernier profil configuré signalé par eufy. Vous pouvez ainsi voir « Geofencing » dans le sélecteur et « Présent » sur la tuile. En l’absence de confirmation de l’état actif, la tuile peut afficher « Inconnu ».

## Diagnostiquer une commande d’alarme en erreur 503

### Tester la liaison UDP depuis Home Assistant

1. Après la mise à jour vers la version **1.3.0**, démarrez le module et redémarrez **Home Assistant Core** pour charger ses nouvelles entités.
2. Ouvrez **Paramètres → Appareils et services → Passerelle eufy locale → HomeBase T9000**. Dans **Diagnostic**, appuyez sur **Tester la liaison UDP**. [Ouvrir l’intégration](https://my.home-assistant.io/redirect/integration/?domain=eufy_local_bridge)
3. Consultez **Diagnostic UDP** sur la même fiche. Le module observe les échanges pendant **90 secondes**. Si la base est hors ligne, il demande une connexion locale au début du test. Le mode de l’alarme reste inchangé.

Le capteur indique si des paquets circulent dans les deux sens, en sortie seulement, en entrée seulement, ou si aucun trafic n’a été observé. Ses attributs donnent les compteurs par interface et les heures du test. En cas d’échec, consultez l’attribut **Motif**. Un échange dans les deux sens confirme la circulation de paquets avec la base. L’attribut `homebase_online` de l’alarme indique si la liaison eufy a effectivement abouti.

Le module utilise automatiquement l’IPv4 locale annoncée par la HomeBase. Avec l’autorisation Linux `NET_RAW`, un filtre du noyau examine les en-têtes des paquets échangés avec cette adresse. La sonde reçoit au plus les 20 premiers octets de l’en-tête IPv4. Le module conserve en mémoire les compteurs du dernier test jusqu’au suivant ou à son redémarrage.

À partir de la version **1.3.1**, le module attend jusqu’à 15 secondes que la collecte des candidats ICE se termine pour les inclure dans sa réponse à la HomeBase. Si le délai expire, il envoie la réponse initiale. Pour vérifier si la session s’ouvre, lancez **Tester la liaison UDP**, puis consultez `homebase_online` dans les attributs d’**Alarme T9000**.

### Localiser un blocage ICE malgré du trafic UDP

Avec la version **1.3.2**, démarrez le module et redémarrez Home Assistant Core pour charger les nouveaux attributs du capteur. Appuyez sur **Tester la liaison UDP** et attendez la fin des 90 secondes. Dans **Diagnostic UDP**, les six attributs `stun_*` comptent les requêtes STUN Binding et les réponses de succès ou d’erreur observées dans chaque sens. « Envoyé » désigne un paquet allant vers la HomeBase. [Vérifications de connectivité ICE](https://www.rfc-editor.org/rfc/rfc8445.html#section-7)

| Observation pendant le test | Ce qu’elle permet de vérifier |
|---|---|
| Les six compteurs sont à zéro malgré le trafic UDP | Aucune vérification STUN Binding reconnue avec cette IPv4. Il faut ensuite vérifier quels candidats UDP la VM et la base ont annoncés lors de la tentative. |
| Des requêtes partent vers la base, aucune réponse de succès ou d’erreur ne revient | La VM émet des vérifications. Aucune réponse STUN de la base n’est visible sur le chemin observé. |
| Des requêtes arrivent de la base, aucune réponse ne repart | Les vérifications atteignent la VM. La réception de ces paquets par le connecteur et sa capacité à répondre restent à vérifier. |
| Des réponses d’erreur circulent | Au moins un participant signale une erreur STUN. Le sens indique lequel l’a émise. |
| Des réponses de succès circulent et `homebase_online` reste à `false` | Consultez `connection_issue`. Avec `ice_unavailable`, il faut ensuite examiner la sélection de la paire ICE. |

Les compteurs couvrent les messages STUN Binding sur UDP/IPv4 non fragmenté durant la fenêtre du test. Ils incluent les retransmissions et regroupent les échanges de la base sur toutes les interfaces. Ils ne relient pas une réponse à une requête ou à une session particulière. Pour partager le résultat, les six valeurs et `connection_issue` suffisent.

### Lire le motif d’une erreur

Dans la version 1.1.1, le message HTTP 503 indique que Home Assistant a joint la passerelle. Il ne précise pas si la commande a atteint la HomeBase. Vérifiez son mode dans l’application eufy avant de renouveler la commande.

À partir de la version 1.2.0, ouvrez **Outils de développement → États**, puis cherchez `alarm_control_panel.alarme_t9000`. L’attribut `homebase_online` indique si la passerelle a une liaison avec la base. Lorsqu’elle est hors ligne, `connection_issue` peut indiquer la dernière cause connue. Vous pouvez lire ces attributs sans actionner l’alarme. En cas d’échec, le journal du module peut aussi afficher le motif de la commande.

- `no_lan_candidate` indique que le connecteur n’a reçu aucune proposition de liaison directe de la base. Avec `ice_unavailable`, il en a reçu une, mais la négociation a expiré avant de trouver un chemin utilisable. Dans les deux cas, la commande d’alarme n’a pas été envoyée.
- `signaling_unavailable` indique que le connecteur n’a pas pu joindre la signalisation eufy nécessaire à l’ouverture d’une nouvelle liaison. Vérifiez l’accès Internet de la VM.
- `command_unconfirmed` indique que la passerelle a perdu la confirmation. Consultez l’état de la base avant de décider d’envoyer une autre commande.

Le module 1.2.1 corrige la perte d’un candidat de connexion reçu avant l’initialisation du transport. Si `ice_unavailable` persiste sous VMware, relevez l’IPv4 de la **HomeBase** dans les baux DHCP de votre routeur. Vérifiez que le pont de la VM utilise la carte physique reliée à ce réseau. Depuis la console VMware, à l’invite `ha >`, saisissez `network info` pour lire l’IPv4 et le préfixe de l’interface active. [Configuration VMware de Home Assistant OS](https://www.home-assistant.io/installation/windows/)

## Session et redémarrage

Le mot de passe sert à l’authentification auprès d’eufy. Le module persiste la session chiffrée et sa clé dans ses données privées. L’intégration conserve la clé d’appairage et l’empreinte publique. Protégez les sauvegardes Home Assistant qui contiennent ces données. Une session expirée ou révoquée demande une nouvelle authentification dans Home Assistant.

Pour vérifier l’autonomie, laissez le PC Windows éteint, redémarrez le module et contrôlez la mise à jour des entités. Les batteries indiquent les dernières mesures communiquées. Après une coupure Internet, l’établissement d’une **nouvelle liaison T9000** demande la signalisation eufy. Pendant cette coupure, l’alarme peut rester indisponible et de nouvelles mesures ou images peuvent manquer.
