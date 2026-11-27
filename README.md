# Eufy Local Bridge pour Home Assistant

<img align="right" width="64" height="64" alt="eufy" src="https://raw.githubusercontent.com/home-assistant/brands/master/core_integrations/eufy/icon.png">

<a href="https://buymeacoffee.com/theuncas"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" width="180" alt="M’offrir un café sur Buy Me a Coffee"></a>

Connectez une **HomeBase eufy T9000** directement à Home Assistant OS sur PC ou VM **Intel/AMD 64 bits**. Vous pouvez consulter les batteries, suivre les capteurs d’ouverture et de mouvement, commander l’alarme et afficher le direct des caméras compatibles depuis vos cartes et automatisations. La VM communique elle-même avec eufy et avec la base.

**[Ajouter ce dépôt à ma boutique Home Assistant](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2FTheUncas%2Fha-eufy-t9000)**

## Installation

1. Cliquez sur le lien ci-dessus et confirmez l’ajout. Vous pouvez aussi ouvrir **Paramètres → Applications → Boutique → ⋮ → Dépôts** et saisir `https://github.com/TheUncas/ha-eufy-t9000`.
2. Installez **Eufy Local Bridge T9000**. [Générez votre clé d’appairage](#générer-la-clé), puis collez-la dans le champ `pairing_key` de l’onglet **Configuration** du module. Enregistrez et démarrez le module. Activez **Démarrer au démarrage**.
3. Dans l’onglet **Journal**, vérifiez que le module a installé l’intégration et copiez l’empreinte publique SHA-256. **Redémarrez Home Assistant Core** pour charger l’intégration.
4. Ouvrez Home Assistant en **HTTPS**. Dans **Paramètres → Appareils et services → Ajouter une intégration**, cherchez **Passerelle eufy locale**. Collez **la même clé** dans le champ de la clé d’appairage et l’empreinte du journal dans le champ SHA-256. Connectez ensuite votre compte eufy. Le formulaire prend en charge le captcha et le code de vérification.
5. Ouvrez **Mode de garde T9000** pour choisir parmi les profils annoncés par votre base, dont le géorepérage, la programmation et les profils personnalisés. **Alarme T9000** affiche l’état actif confirmé par la base. **Eufy batterie** indique la dernière mesure de chaque caméra sur batterie.

Pour ouvrir tous les profils d’un appui sur la tuile **Alarme T9000**, copiez l’exemple de carte du guide. [Configurer la tuile](https://github.com/TheUncas/ha-eufy-t9000/blob/main/eufy_local_bridge/DOCS.md#ouvrir-tous-les-modes-depuis-la-tuile-alarme)

## Caméras et vignettes PoE

Dans **Paramètres → Appareils et services → Passerelle eufy locale → Appareils**, ouvrez la fiche d’une caméra rattachée à la HomeBase. Sélectionnez son entité caméra pour voir le direct. Pour un modèle sur batterie, activez d’abord son entité vidéo si vous souhaitez l’utiliser.

Pour afficher une image sur le tableau de bord entre deux directs, ouvrez **Configuration** dans le module **Eufy Local Bridge T9000**. Activez **Actualiser les images des caméras PoE**, réglez l’intervalle (60 secondes par défaut) et redémarrez le module. Cette option est désactivée à l’installation. Les vignettes affichent la dernière capture en mémoire et le direct a priorité sur leur actualisation. [Caméras et réglages du module](https://github.com/TheUncas/ha-eufy-t9000/blob/main/eufy_local_bridge/DOCS.md#caméras-et-réglages-du-module)

## Diagnostic de la liaison

Si la base reste hors ligne, ouvrez la fiche **HomeBase T9000** et appuyez une fois sur **Tester la liaison UDP**. Après 90 secondes, lisez **Diagnostic UDP** et l’attribut `windows_lan_trial`. Le résultat `connected` confirme que la session de test a ouvert le canal de commande. Pour vérifier la connexion habituelle, lisez `homebase_online` sur **Alarme T9000**. [Interpréter le test et diagnostiquer un direct sans image](https://github.com/TheUncas/ha-eufy-t9000/blob/main/eufy_local_bridge/DOCS.md#tester-la-liaison-udp-depuis-home-assistant)

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

## Notes d’utilisation

- Le module demande accès au dossier de configuration de Home Assistant pour installer et mettre à jour `custom_components/eufy_local_bridge`. Le connecteur eufy s’exécute ensuite sans accès à ce montage. Après une mise à jour, le journal indique si vous devez redémarrer Core.
- Le mot de passe eufy sert à ouvrir la session. Le module conserve la session chiffrée et sa clé dans ses données privées. Protégez vos sauvegardes Home Assistant.
- La première installation et l’authentification nécessitent Internet. Après un redémarrage, eufy peut également être nécessaire pour rétablir la liaison avec la base. La VM doit pouvoir joindre la HomeBase sur le réseau local.
- Une batterie affiche la dernière mesure reçue. Une caméra PoE est alimentée par câble. Sur les caméras à batterie, le direct est activable individuellement et les demandes de vignette du tableau de bord ne réveillent pas la caméra.

Les instructions de migration depuis une installation antérieure et le détail des entités figurent dans le guide du module. [Guide complet](https://github.com/TheUncas/ha-eufy-t9000/blob/main/eufy_local_bridge/DOCS.md)

## Soutenir le projet

Si ce module vous est utile, vous pouvez [m’offrir un café sur Buy Me a Coffee](https://buymeacoffee.com/theuncas).
