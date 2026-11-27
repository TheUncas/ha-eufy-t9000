# Installer Eufy Local Bridge dans Home Assistant OS

[English guide](https://github.com/TheUncas/ha-eufy-t9000/blob/main/eufy_local_bridge/DOCS.en.md) · [Journal des versions](https://github.com/TheUncas/ha-eufy-t9000/blob/main/eufy_local_bridge/CHANGELOG.fr.md) · [Dépendances et licences](https://github.com/TheUncas/ha-eufy-t9000/blob/main/eufy_local_bridge/THIRD_PARTY.md)

<a href="https://buymeacoffee.com/theuncas"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" width="180" alt="M’offrir un café sur Buy Me a Coffee"></a>

Utilisez Home Assistant OS sur **PC ou VM Intel/AMD 64 bits**, sur le même réseau que la HomeBase. Préparez vos identifiants eufy et ouvrez Home Assistant en HTTPS. L’installation et la connexion au compte nécessitent Internet. Après l’appairage, vos caméras et votre alarme apparaissent directement dans Home Assistant.

## Installer depuis la boutique

1. Ajoutez le dépôt à la boutique et confirmez. [Ajouter Eufy Local Bridge à Home Assistant](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2FTheUncas%2Fha-eufy-t9000)
2. Installez **Eufy Local Bridge T9000**, laissez **Clé d’appairage** vide et appuyez sur **Démarrer**. Le module installe l’intégration puis s’arrête pour vous laisser créer la clé. **Redémarrez Home Assistant** une fois pour charger l’intégration.

Pour ajouter le dépôt manuellement, ouvrez **Paramètres → Applications → Boutique → ⋮ → Dépôts** et saisissez `https://github.com/TheUncas/ha-eufy-t9000`. Si le module tarde à apparaître, choisissez **Rechercher des mises à jour** dans le menu de la boutique.

## Générer la clé

1. Dans **Paramètres → Appareils et services → Ajouter une intégration**, choisissez **Passerelle eufy locale**, puis **Générer une clé d’appairage**. Sur Home Assistant OS, l’assistant enregistre la clé dans le module et le démarre. Si le module possède déjà une clé, l’assistant la réutilise.
2. Lorsque l’empreinte SHA-256 apparaît, validez pour continuer dans la même fenêtre. Si le module démarre encore, choisissez **Vérifier à nouveau**. Activez **Démarrer au démarrage** sur la fiche du module pour que la passerelle redémarre avec votre VM.

L’empreinte est publique et permet à Home Assistant de reconnaître le module avant de lui envoyer les identifiants. La clé d’appairage reste privée. Si la configuration automatique est indisponible, vérifiez qu’une seule copie du module est installée, puis réessayez. Pour un appairage manuel, utilisez la clé existante ou choisissez **Générer une clé à copier manuellement** si le champ est vide. Dans ce dernier cas, collez-la dans **Configuration → Clé d’appairage** du module, enregistrez et démarrez-le.

## Connecter eufy depuis Home Assistant

1. Dans le formulaire eufy, saisissez votre adresse e-mail, votre mot de passe et le code pays de votre compte (par exemple `FR`). Gardez la fenêtre ouverte. Si eufy le demande, résolvez le captcha ou saisissez le code de vérification.
2. Ouvrez **Paramètres → Appareils et services → Passerelle eufy locale → Appareils**. Sur la fiche de la HomeBase, **Alarme T9000** affiche l’état confirmé par la base et **Mode de garde T9000** permet de choisir un profil. Ouvrez la fiche d’une caméra sur batterie pour lire sa dernière mesure, ou l’entité vidéo d’une caméra compatible pour voir le direct.

### Refaire l’appairage sur une installation existante

Conservez votre clé à chaque mise à jour. Pour refaire l’appairage, démarrez le module avec sa clé existante, choisissez **Continuer l’appairage** et saisissez cette clé. Le bouton **Afficher l’empreinte SHA-256** permet de consulter l’empreinte avant l’appairage. Après l’appairage, ouvrez **Configurer → Afficher l’empreinte SHA-256** sur l’intégration pour retrouver l’empreinte qu’elle utilise.

Si l’empreinte tarde à apparaître, vérifiez que le module est démarré puis appuyez sur **Vérifier à nouveau**. Vous pouvez aussi choisir **Saisir les informations manuellement** et copier l’empreinte SHA-256 du **Journal** du module. Si la connexion à eufy dépasse 90 secondes, vérifiez le pays du compte et l’accès Internet de Home Assistant avant de réessayer.

## Caméras et réglages du module

### Voir les mouvements détectés

Dans **Paramètres → Appareils et services → Passerelle eufy locale → Appareils**, ouvrez la caméra concernée. Pour un détecteur de mouvement autonome, ouvrez **HomeBase T9000**. L’entité **Mouvement** porte le nom de l’appareil qui a détecté le passage. Elle indique **Détecté** ou **Aucun mouvement** selon le dernier état reçu. Elle indique **Inconnu** si la base connectée n’a encore transmis aucun état, et **Indisponible** si la liaison est coupée.

Sur les caméras PoE **E40 (T8P00), E41 (T8P10) et S4 (T8E00)**, l’entité apparaît dès que le module reconnaît le modèle. Une notification locale de mouvement active le capteur pendant 10 secondes par défaut. Une nouvelle notification prolonge ce délai. Pour vérifier la réception, passez devant la caméra, même avec le direct fermé, puis attendez une actualisation de Home Assistant. Dans **Outils de développement → États**, ouvrez l’entité **Mouvement** de cette caméra et comparez `last_motion_received_at` à l’heure d’une alerte de mouvement dans eufy.

Si le capteur reste **Inconnu**, regardez l’attribut `homebase_online` de l’entité **Alarme T9000**. S’il vaut `true`, relevez l’heure locale et le type d’une nouvelle alerte dans eufy, puis vérifiez si `last_motion_received_at` apparaît sur la même caméra dans HA. Sur les PoE E40, E41 et S4, les alertes de personne, de visage, d’animal et de véhicule comptent également comme un mouvement avec les réglages par défaut du connecteur.

Pour une automatisation qui doit aussi réagir aux passages brefs, choisissez un déclencheur **État**, sélectionnez cette entité et son attribut `last_motion_received_at`. Il contient l’heure UTC du dernier début de mouvement reçu par le module, même si le détecteur est déjà revenu au repos à la prochaine lecture. Plusieurs passages entre deux lectures donnent la dernière heure reçue. Le redémarrage du module efface cette valeur en mémoire.

### Régler les caméras

Dans **Paramètres → Appareils et services → Passerelle eufy locale → Appareils**, chaque caméra annoncée par la HomeBase a sa propre fiche. Ouvrez son entité caméra pour démarrer le direct local. Sur un modèle sur batterie, ouvrez au besoin la liste des entités désactivées et activez l’entité vidéo de cette caméra. La HomeBase fournit un seul direct à la fois.

Ouvrez **Paramètres → Applications → Eufy Local Bridge T9000 → Configuration** pour modifier les options. Enregistrez puis redémarrez le module.

| Option | Valeur initiale | Effet |
|---|---|---|
| **Actualiser les images des caméras PoE** (`poe_snapshots_enabled`) | Désactivé | Capture une image des caméras PoE compatibles à tour de rôle. Le direct à la demande a priorité. |
| **Intervalle des images PoE** (`poe_snapshot_interval_seconds`) | 60 s | Entre 30 et 3 600 s. Les vignettes lisent la dernière capture gardée en mémoire. Les caméras sur batterie sont exclues. |
| **Intervalle de lecture des états par Home Assistant** (`state_poll_seconds`) | 10 s | Entre 5 et 120 s. Home Assistant relit les états déjà disponibles dans le module. |
| **Intervalle d’interrogation de la HomeBase** (`station_poll_seconds`) | 30 s | Entre 15 et 120 s. La passerelle interroge les événements de la base en ligne. Le pourcentage de batterie change quand la caméra communique une mesure. |
| **Délai de démarrage de la vidéo** (`camera_start_timeout_seconds`) | 30 s | Entre 15 et 60 s pour recevoir la première image lorsque la base est en ligne. |

L’option d’images périodiques couvre toutes les caméras PoE reconnues qui annoncent un direct, y compris si leur entité vidéo est masquée ou désactivée dans HA. Elle s’applique aux modèles E40 (T8P00), E41 (T8P10) et S4 (T8E00). Le module attend l’intervalle choisi après chaque tour de capture. Si un direct occupe la base, les autres vignettes gardent leur dernière image disponible. [Modèles compatibles avec la HomeBase Professional S1](https://service.eufy.com/expertsecure-system/article-description/What-eufy-devices-are-compatible-with-HomeBase-Professional-S1)

Pour une carte de tableau de bord, choisissez **Entité image** (*Picture entity*), sélectionnez la caméra PoE et laissez la **Vue caméra** sur **Auto**. Activez les captures PoE pour obtenir la vignette, puis touchez la carte pour ouvrir le direct. L’image peut être vide jusqu’à la première capture. L’icône eufy de l’intégration est fournie localement depuis ce module sur Home Assistant Core 2026.3 et ultérieur. [Images de marque des intégrations Home Assistant](https://contributors.home-assistant.io/core/integrations/brands/#brand-images-for-custom-integrations)

## Ouvrir tous les modes depuis la tuile Alarme

Depuis la version 1.2.0, ouvrez l’entité **Mode de garde T9000** pour choisir parmi les modes que votre HomeBase annonce. Selon la base, vous y trouverez notamment les profils personnalisés, la programmation, le géorepérage et le désarmement. Les mêmes choix sont utilisables dans une automatisation avec l’action `select.select_option` et le nom exact affiché dans la liste.

Pour les modes standard, vos automatisations peuvent aussi appeler `alarm_control_panel.alarm_arm_home`, `alarm_control_panel.alarm_arm_away` et `alarm_control_panel.alarm_disarm` selon les modes de la base. Les détecteurs d’ouverture et de mouvement fournissent des capteurs binaires. Ceux-ci deviennent indisponibles si la liaison avec la base est interrompue.

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

## Dépanner la connexion et le direct

### Tester la liaison UDP depuis Home Assistant

1. Démarrez le module. Après une mise à jour, redémarrez **Home Assistant Core** si le journal du module le demande.
2. Ouvrez **Paramètres → Appareils et services → Passerelle eufy locale → HomeBase T9000**. Dans **Diagnostic**, appuyez sur **Tester la liaison UDP**. [Ouvrir l’intégration](https://my.home-assistant.io/redirect/integration/?domain=eufy_local_bridge)
3. Après **90 secondes**, ouvrez **Outils de développement → États** et recherchez `sensor.homebase_t9000_diagnostic_udp`. Le test observe le trafic et, lorsque la base est hors ligne, essaie d’ouvrir un canal de commande dans une session dédiée. Il ne nécessite aucune action sur l’alarme.

| Résultat | Vérification suivante |
|---|---|
| `windows_lan_trial: connected` | Le canal de test s’est ouvert. Lisez `homebase_online` sur `alarm_control_panel.alarme_t9000` pour connaître l’état de la session habituelle. |
| `windows_lan_trial: skipped_online` | La session habituelle était disponible. Pour vérifier la vidéo, ouvrez séparément le direct d’une caméra PoE. |
| `bidirectional` avec `windows_lan_trial: failed` | Du trafic a circulé dans les deux sens. Consultez `windows_lan_trial_reason` et, si présent, `windows_lan_ice_attempt` pour situer l’échec de connexion. |
| `outbound_only`, `inbound_only` ou `no_traffic` | Contrôlez l’interface dans `sent_by_interface` et `received_by_interface`, le réseau en pont de la VM et le réseau local de la HomeBase. |

**Base en ligne, image absente.** Ouvrez la fiche d’une caméra PoE compatible et son direct, puis attendez le délai de démarrage configuré. Si le direct s’affiche, vérifiez **Actualiser les images des caméras PoE**, l’intervalle et l’entité sélectionnée sur la carte. Fermez le direct pour laisser les autres caméras PoE actualiser leurs images. Une vignette vide sur une caméra sur batterie est attendue. Pour un signalement, indiquez la version, le résultat du bouton UDP, `homebase_online` et si le direct ou seulement la vignette manque.

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

### Lire le dernier essai ICE du connecteur

La version **1.3.3** corrige un cas où l’expiration d’une ancienne tentative pouvait fermer la connexion suivante. Après la mise à jour, démarrez le module, redémarrez Home Assistant Core et appuyez sur **Tester la liaison UDP**. Dans **Outils de développement → États**, ouvrez **Alarme T9000**. Si la base reste hors ligne, l’attribut `connection_issue` donne le dernier motif. Lorsqu’une tentative avec un pair ICE expire, `last_ice_attempt` précise ce que le connecteur a observé.

| Champ | Lecture |
|---|---|
| `finished_at` | Heure UTC d’expiration. Comparez-la aux heures de début et de fin de **Diagnostic UDP** car les reconnexions automatiques produisent aussi des tentatives. |
| `local_udp_announced` / `remote_udp_submitted` | Le module a annoncé au moins un candidat IPv4 UDP de type *host* / a soumis au moteur ICE au moins un tel candidat distant sans erreur immédiate. Ces indicateurs ne précisent pas l’interface choisie. |
| `ice_state` | État natif à l’expiration, par exemple `checking`, `failed` ou `completed`. |
| `ice_connected` / `pair_seen` | Le moteur a signalé une connexion ICE / le connecteur a observé une paire sélectionnée au moins une fois pendant cette tentative. |

Avec `ice_unavailable` et les deux derniers indicateurs à `false`, aucune paire utilisable n’a été observée pour cet essai, même si des réponses STUN ont circulé. `ice_path_lost` indique qu’un chemin avait été observé puis perdu à l’expiration. `secure_channel_unavailable` situe le blocage après un indice de connectivité ICE. Avec `command_channel_unavailable`, le transport était connecté à l’expiration mais le canal de commande eufy n’était pas prêt.

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

## Notes sur les versions précédentes

### Vérifier la connexion de la HomeBase en 1.3.7

La connexion habituelle du module utilise désormais en priorité la sélection UDP essayée par le bouton de diagnostic. La VM choisit son IPv4 de sortie vers la HomeBase et le premier port UDP annoncé pour l’adresse LAN de celle-ci. Le module recalcule la paire au renouvellement de la session. Si ce chemin échoue, une reconnexion peut reprendre la sélection automatique des candidats du réseau local.

Après la mise à jour, démarrez le module et redémarrez Home Assistant Core si le journal le demande. Dans **Outils de développement → États**, ouvrez `alarm_control_panel.alarme_t9000` et vérifiez que l’attribut `homebase_online` passe à `true`. Vérifiez-le de nouveau environ cinq minutes plus tard pour couvrir le premier renouvellement automatique. Ces vérifications se font sans changer le mode de l’alarme. Si la base reste hors ligne, relevez `connection_issue` et, si présent, `last_ice_attempt` après la reconnexion.

### Essayer la sélection UDP de Windows avec la version 1.3.6

Installez la mise à jour, démarrez le module et redémarrez **Home Assistant Core**. Sur **HomeBase T9000**, appuyez une fois sur **Tester la liaison UDP**. Si la base est hors ligne pour le module, il tente d’ouvrir un canal de commande dans une session de diagnostic dédiée. La VM utilise son adresse IPv4 de sortie vers la base et retient le premier port candidat UDP annoncé pour l’IPv4 LAN de la base. L’essai s’exécute sur Home Assistant, sans le PC Windows ni commande d’alarme.

Après 90 secondes, ouvrez **Outils de développement → États** et cherchez `sensor.homebase_t9000_diagnostic_udp`. L’attribut **`windows_lan_trial`** indique le résultat de cet essai.

| Valeur | Lecture |
|---|---|
| `connected` | Le canal de commande s’est ouvert avec la paire UDP attendue. La session d’essai est ensuite fermée. `homebase_online` reflète toujours la connexion ordinaire. |
| `failed` | L’essai a échoué. `windows_lan_trial_reason` donne le motif. `windows_lan_ice_attempt` fournit les observations ICE lorsqu’elles sont disponibles. |
| `skipped_online` | Le module avait déjà une liaison active avec la base. Seule la capture UDP était nécessaire. |
| `running`, `busy` | L’essai est en cours, ou un autre essai occupe déjà le connecteur. |
| `error`, `inconclusive` | L’essai était indisponible, ou aucun résultat n’était parvenu au module à la fin de la capture. |

Le motif `route_unavailable` indique que l’IPv4 de sortie locale n’a pas pu être déterminée. Les motifs `pair_mismatch` et `pair_unverified` indiquent respectivement que la paire observée différait de celle attendue ou que le connecteur n’a pas pu vérifier cette correspondance. Le statut du capteur, les compteurs UDP/STUN et `ice_attempts` gardent leur portée habituelle. Les compteurs incluent le trafic des reconnexions ordinaires survenues pendant la capture.

### Localiser un échec ICE avec la version 1.3.5

Mettez le module à jour, démarrez-le et redémarrez **Home Assistant Core**. Sur la fiche **HomeBase T9000**, appuyez une fois sur **Tester la liaison UDP**. Ce bouton peut ouvrir une session avec la base sans lui envoyer de commande d’alarme.

Au bout de 90 secondes, ouvrez **Outils de développement → États** et sélectionnez `sensor.homebase_t9000_diagnostic_udp`. L’attribut `ice_attempts` conserve, dans l’ordre chronologique, jusqu’à quatre tentatives dont le connecteur a signalé l’expiration pendant la capture. Une reconnexion ultérieure ne remplace pas ce résultat. Une liste vide signifie qu’aucune expiration accompagnée d’un rapport ICE n’a été observée dans cette fenêtre. Consultez aussi `homebase_online` sur **Alarme T9000** pour connaître l’état actuel.

| Dans une même entrée de `ice_attempts` | Comment la lire |
|---|---|
| `reason: offer_unavailable` | La tentative a expiré en attendant l’offre de session. |
| `local_udp_matches_route: false` | Parmi les adresses candidates locales annoncées, aucune ne correspond à l’IPv4 que le système utiliserait pour joindre la base. Sur une VM à plusieurs interfaces, vérifiez l’interface et l’adresse source de la route vers la HomeBase. |
| `remote_udp_matches_station: false` | Le moteur a reçu un candidat UDP distant, mais aucun des candidats observés ne correspond à l’IPv4 LAN déclarée par la HomeBase. Vérifiez l’adresse de la **base** dans les baux DHCP. |
| `ice_checking_seen: true` et `pair_seen: false` | Le moteur ICE a commencé les vérifications sans que le connecteur observe une paire sélectionnée. `ice_failed_seen: true` signale un échec explicite du moteur, même si l’état final est `closed`. |
| `ice_connected: true` ou `pair_seen: true` | Le connecteur a observé une connexion ICE ou une paire sélectionnée pendant cet essai. Le champ `reason` précise à quelle étape la tentative a ensuite expiré. |

Les comparaisons d’adresses portent sur les candidats UDP/IPv4 de type *host*. Un indicateur de comparaison absent signifie que les éléments nécessaires manquent. Deux correspondances à `true` confirment que les adresses attendues figuraient parmi les candidats. La sélection de la paire reste une étape distincte. Les compteurs STUN couvrent toute la capture et peuvent inclure d’autres tentatives. [Vérification et sélection des paires ICE](https://www.rfc-editor.org/rfc/rfc8445.html#section-8.1.1)

Pour partager le diagnostic, copiez uniquement `ice_attempts`. Ce champ contient des horaires, des états et des indicateurs booléens. Les comparaisons d’adresses s’effectuent localement.

### Mettre à jour vers la version 1.3.4

Installez la mise à jour dans la boutique, démarrez le module, puis redémarrez **Home Assistant Core** pour charger l’intégration mise à jour.

- Pour ouvrir une session avec la HomeBase, le module envoie la réponse de session (SDP) sur le canal de signalisation 0 et les candidats ICE transmis séparément sur le canal 1. Pour vérifier la liaison sans commander l’alarme, appuyez sur **Tester la liaison UDP**. Après les 90 secondes du test, ouvrez **Alarme T9000**. L’attribut `homebase_online` indique si la session est ouverte. S’il vaut `false`, consultez `connection_issue`.
- Si deux changements de mode se chevauchent, Home Assistant indique désormais que le premier est encore en cours (HTTP 409). La passerelle écarte la seconde demande. Attendez le résultat de la première et vérifiez le mode actif dans **Alarme T9000** ou, si son état reste **Inconnu**, dans eufy Security avant de relancer une action.

### Si vous utilisiez déjà une version précédente

- **Fenêtre « En attente d’eufy » de la version 1.1.0** — Fermez cette fenêtre. Après la mise à jour du module vers la version 1.1.1, démarrez-le, vérifiez dans son journal que l’intégration a été mise à jour, puis redémarrez Home Assistant Core. Relancez l’appairage dans **Appareils et services** avec votre clé et l’empreinte du journal.
- **Ancien module installé depuis le ZIP** — Les versions locale et boutique sont deux installations distinctes pour Home Assistant. Arrêtez l’ancien module et désactivez son démarrage automatique avant de démarrer celui de la boutique, car ils utilisent les mêmes ports. La nouvelle installation a son propre certificat et son propre stockage. Dans Home Assistant, suivez la demande de réauthentification avec la nouvelle empreinte et la clé choisie.
- **Intégration YAML vers le PC Windows** — Retirez uniquement l’ancien bloc `eufy_local_bridge:` dans `configuration.yaml`, vérifiez la configuration et redémarrez Core après le premier démarrage du module. Si vous utilisiez le package REST, désactivez sa déclaration pour éviter les doublons.
- L’installateur reconnaît les versions déjà distribuées. S’il signale un conflit avec des fichiers personnalisés, sauvegardez votre personnalisation avant de décider de la remplacer.
