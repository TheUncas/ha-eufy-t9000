# Dépendances du connecteur amd64

L’archive `connector-amd64.tar.gz` contient les paquets de fonctionnement de l’image du connecteur, y compris les mentions de licence livrées dans les paquets npm. Les dépendances sont installées dans `/usr/src/app/node_modules`. L’image vérifie l’empreinte SHA-256 de l’archive avant extraction.

| Composant | Source de la version distribuée | Mentions incluses |
|---|---|---|
| eufy-security-client | [Révision 7bdd289](https://github.com/genomez/eufy-security-client/tree/7bdd28966b6c6385118999550a7afea6cbbfc062) | `node_modules/eufy-security-client/LICENSE` (MIT) |
| eufy-security-ws | [Révision cb7534d](https://github.com/bropat/eufy-security-ws/tree/cb7534d7c5ee55a02ef0ab99c2275009dcb69282) | `node_modules/eufy-security-ws/LICENSE` (MIT) |
| Adaptations T9000 | [Révision 92273af](https://github.com/genomez/hassio-eufy-security-ws/tree/92273af10a07e269624073dd6e9ae1605a4bfee4) | MIT, copyright © 2023–2025 bropat. [Licence du dépôt](https://github.com/genomez/hassio-eufy-security-ws/blob/92273af10a07e269624073dd6e9ae1605a4bfee4/LICENSE) |
| node-datachannel | [Version 0.32.3](https://github.com/murat-dogan/node-datachannel/tree/v0.32.3) | Sources C++ du binaire recompilé sous `node_modules/node-datachannel/src/cpp`, licence MPL-2.0 sous `node_modules/node-datachannel/LICENSE` |
| node-addon-api | [Version 7.1.1](https://github.com/nodejs/node-addon-api/tree/v7.1.1) | Licence de ses en-têtes sous `node_modules/node-datachannel/NODE-ADDON-API-LICENSE.md` |
| long-timeout | [Projet de Christian Tellnes](https://github.com/tellnes/long-timeout) | Christian Tellnes, MIT. Le texte de cette licence figure notamment sous `node_modules/eufy-security-client/LICENSE`. |

## Icône eufy

Le module utilise le logo eufy du catalogue de marques Home Assistant, redimensionné à 128 × 128 pixels pour la boutique. [Visuel source](https://github.com/home-assistant/brands/blob/master/core_integrations/eufy/icon.png)
