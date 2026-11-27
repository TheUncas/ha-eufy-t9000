# Eufy Local Bridge pour Home Assistant

[English README](README.en.md) · [Journal des versions](https://github.com/TheUncas/ha-eufy-t9000/blob/main/eufy_local_bridge/CHANGELOG.fr.md)

<img align="right" width="64" height="64" alt="eufy" src="https://raw.githubusercontent.com/home-assistant/brands/master/core_integrations/eufy/icon.png">

<a href="https://buymeacoffee.com/theuncas"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" width="180" alt="M’offrir un café sur Buy Me a Coffee"></a>

Connectez une **HomeBase eufy T9000** directement à Home Assistant OS sur PC ou VM **Intel/AMD 64 bits**. Vous pouvez consulter les batteries, suivre les capteurs d’ouverture et de mouvement, commander l’alarme et afficher le direct des caméras compatibles depuis vos cartes et automatisations. La VM communique elle-même avec eufy et avec la base.

**[Ajouter ce dépôt à ma boutique Home Assistant](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2FTheUncas%2Fha-eufy-t9000)**

## Installation

1. **Installez le module.** Suivez le lien vers la boutique ci-dessus, installez **Eufy Local Bridge T9000** et appuyez sur **Démarrer**. Au premier lancement, laissez **Clé d’appairage** vide. Le module installe l’intégration puis s’arrête. Redémarrez **Home Assistant** une fois pour la charger.
2. **Créez votre clé.** Ouvrez Home Assistant en HTTPS. Dans **Paramètres → Appareils et services → Ajouter une intégration**, choisissez **Passerelle eufy locale** puis **Générer une clé d’appairage**. Copiez la clé et gardez cette fenêtre ouverte.
3. **Démarrez la passerelle.** Dans un deuxième onglet, ouvrez **Paramètres → Applications → Eufy Local Bridge T9000 → Configuration**. Collez la clé dans **Clé d’appairage** et enregistrez. Activez **Démarrer au démarrage** puis démarrez le module.
4. **Connectez votre compte.** Revenez dans l’intégration et validez l’écran de la clé. L’empreinte du module s’affiche. Continuez, laissez le champ de la clé vide pour réutiliser celle que vous venez de créer, puis validez. Connectez-vous à eufy et suivez les étapes de vérification si eufy le demande.

Vous trouverez la **HomeBase T9000** et vos caméras dans **Paramètres → Appareils et services → Passerelle eufy locale → Appareils**. Ouvrez **Alarme T9000** pour voir l’état confirmé par la base, **Mode de garde T9000** pour choisir un profil ou **Eufy batterie** pour lire la dernière mesure d’une caméra.

Pour ouvrir tous les profils d’un appui sur la tuile **Alarme T9000**, copiez l’exemple de carte du guide. [Configurer la tuile](https://github.com/TheUncas/ha-eufy-t9000/blob/main/eufy_local_bridge/DOCS.md#ouvrir-tous-les-modes-depuis-la-tuile-alarme)

## Caméras et vignettes PoE

Dans **Paramètres → Appareils et services → Passerelle eufy locale → Appareils**, ouvrez la fiche d’une caméra rattachée à la HomeBase. Sélectionnez son entité caméra pour voir le direct. Pour un modèle sur batterie, activez d’abord son entité vidéo si vous souhaitez l’utiliser.

Pour afficher une image sur le tableau de bord entre deux directs, ouvrez **Configuration** dans le module **Eufy Local Bridge T9000**. Activez **Actualiser les images des caméras PoE**, réglez l’intervalle (60 secondes par défaut) et redémarrez le module. Cette option est désactivée à l’installation. Les vignettes affichent la dernière capture en mémoire et le direct a priorité sur leur actualisation. [Caméras et réglages du module](https://github.com/TheUncas/ha-eufy-t9000/blob/main/eufy_local_bridge/DOCS.md#caméras-et-réglages-du-module)

## Diagnostic de la liaison

Si la base reste hors ligne, ouvrez la fiche **HomeBase T9000** et appuyez une fois sur **Tester la liaison UDP**. Après 90 secondes, lisez **Diagnostic UDP** et l’attribut `windows_lan_trial`. Le résultat `connected` confirme que la session de test a ouvert le canal de commande. Pour vérifier la connexion habituelle, lisez `homebase_online` sur **Alarme T9000**. [Interpréter le test et diagnostiquer un direct sans image](https://github.com/TheUncas/ha-eufy-t9000/blob/main/eufy_local_bridge/DOCS.md#tester-la-liaison-udp-depuis-home-assistant)

## Générer la clé

Le bouton **Générer une clé d’appairage** crée une clé privée sur votre installation. Gardez-la dans votre gestionnaire de mots de passe. Elle autorise Home Assistant à lire les appareils et à commander l’alarme. **Afficher l’empreinte SHA-256** présente l’empreinte publique qui permet à Home Assistant de reconnaître la passerelle.

Votre installation est déjà appairée ? Ouvrez **Configurer → Afficher l’empreinte SHA-256** sur l’intégration pour retrouver l’empreinte enregistrée. Gardez votre clé lors des mises à jour. Pour refaire l’appairage, choisissez **Continuer l’appairage** et saisissez cette même clé. [Aide à l’appairage](https://github.com/TheUncas/ha-eufy-t9000/blob/main/eufy_local_bridge/DOCS.md#générer-la-clé)

## Notes d’utilisation

- Le module demande accès au dossier de configuration de Home Assistant pour installer et mettre à jour `custom_components/eufy_local_bridge`. Le connecteur eufy s’exécute ensuite sans accès à ce montage. Après une mise à jour, le journal indique si vous devez redémarrer Core.
- Le mot de passe eufy sert à ouvrir la session. Le module conserve la session chiffrée et sa clé dans ses données privées. Protégez vos sauvegardes Home Assistant.
- La première installation et l’authentification nécessitent Internet. Après un redémarrage, eufy peut également être nécessaire pour rétablir la liaison avec la base. La VM doit pouvoir joindre la HomeBase sur le réseau local.
- Une batterie affiche la dernière mesure reçue. Une caméra PoE est alimentée par câble. Sur les caméras à batterie, le direct est activable individuellement et les demandes de vignette du tableau de bord ne réveillent pas la caméra.

Les instructions de migration depuis une installation antérieure et le détail des entités figurent dans le guide du module. [Guide complet](https://github.com/TheUncas/ha-eufy-t9000/blob/main/eufy_local_bridge/DOCS.md)

## Soutenir le projet

Si ce module vous est utile, vous pouvez [m’offrir un café sur Buy Me a Coffee](https://buymeacoffee.com/theuncas).
