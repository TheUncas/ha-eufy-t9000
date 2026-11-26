# Eufy Local Bridge pour Home Assistant

<a href="https://buymeacoffee.com/theuncas"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" width="180" alt="M’offrir un café sur Buy Me a Coffee"></a>

Connectez une **HomeBase eufy T9000** directement à Home Assistant OS sur PC ou VM **Intel/AMD 64 bits**. Vous pouvez consulter les batteries, suivre les capteurs d’ouverture et de mouvement, commander l’alarme et afficher le direct des caméras compatibles depuis vos cartes et automatisations. La VM communique elle-même avec eufy et avec la base.

**[Ajouter ce dépôt à ma boutique Home Assistant](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2FTheUncas%2Fha-eufy-t9000)**

## Installation

1. Cliquez sur le lien ci-dessus et confirmez l’ajout. Vous pouvez aussi ouvrir **Paramètres → Applications → Boutique → ⋮ → Dépôts** et saisir `https://github.com/TheUncas/ha-eufy-t9000`.
2. Installez **Eufy Local Bridge T9000**. Dans l’onglet **Configuration**, définissez `pairing_key` avec une clé aléatoire dédiée de 32 à 128 caractères (lettres, chiffres, tiret ou tiret bas). Enregistrez et démarrez le module. Activez **Démarrer au démarrage**.
3. Dans l’onglet **Journal**, vérifiez que le module a installé l’intégration et copiez l’empreinte publique SHA-256. **Redémarrez Home Assistant Core** pour charger l’intégration.
4. Ouvrez Home Assistant en **HTTPS**. Dans **Paramètres → Appareils et services → Ajouter une intégration**, cherchez **Passerelle eufy locale**. Saisissez la clé et l’empreinte, puis connectez votre compte eufy. Le formulaire prend en charge le captcha et le code de vérification.
5. Ouvrez les entités **Alarme T9000** et **Eufy batterie** pour vérifier la première lecture. L’alarme affiche le mode confirmé par la base.

## Notes d’utilisation

- Le module demande accès au dossier de configuration de Home Assistant pour installer et mettre à jour `custom_components/eufy_local_bridge`. Le connecteur eufy s’exécute ensuite sans accès à ce montage. Après une mise à jour, le journal indique si vous devez redémarrer Core.
- Le mot de passe eufy sert à ouvrir la session. Le module conserve la session chiffrée et sa clé dans ses données privées. Protégez vos sauvegardes Home Assistant.
- La première installation et l’authentification nécessitent Internet. Après un redémarrage, eufy peut également être nécessaire pour rétablir la liaison avec la base. La VM doit pouvoir joindre la HomeBase sur le réseau local.
- Une batterie affiche la dernière mesure reçue. Les caméras PoE n’ont pas de pourcentage de batterie. Les entités vidéo sur batterie sont désactivées par défaut pour éviter les réveils automatiques liés aux vignettes.

Les instructions de migration depuis une installation antérieure et le détail des entités figurent dans le guide du module. [Guide complet](https://github.com/TheUncas/ha-eufy-t9000/blob/main/eufy_local_bridge/DOCS.md)

## Soutenir le projet

Si ce module vous est utile, vous pouvez [m’offrir un café sur Buy Me a Coffee](https://buymeacoffee.com/theuncas).
