# amd64 connector dependencies

[Version française](THIRD_PARTY.md)

`connector-amd64.tar.gz` contains the connector’s runtime packages and the license notices shipped with them. The image verifies the archive’s SHA-256 checksum before extracting the packages into `/usr/src/app/node_modules`.

| Component | Source of the bundled version | Included notices |
|---|---|---|
| eufy-security-client | [Revision 7bdd289](https://github.com/genomez/eufy-security-client/tree/7bdd28966b6c6385118999550a7afea6cbbfc062) | `node_modules/eufy-security-client/LICENSE` (MIT) |
| eufy-security-ws | [Revision cb7534d](https://github.com/bropat/eufy-security-ws/tree/cb7534d7c5ee55a02ef0ab99c2275009dcb69282) | `node_modules/eufy-security-ws/LICENSE` (MIT) |
| T9000 adaptations | [Revision 92273af](https://github.com/genomez/hassio-eufy-security-ws/tree/92273af10a07e269624073dd6e9ae1605a4bfee4) | MIT, copyright © 2023–2025 bropat. [Repository license](https://github.com/genomez/hassio-eufy-security-ws/blob/92273af10a07e269624073dd6e9ae1605a4bfee4/LICENSE) |
| node-datachannel | [Version 0.32.3](https://github.com/murat-dogan/node-datachannel/tree/v0.32.3) | The C++ source for the rebuilt native binary is in `node_modules/node-datachannel/src/cpp`. Its MPL-2.0 license is in `node_modules/node-datachannel/LICENSE`. |
| node-addon-api | [Version 7.1.1](https://github.com/nodejs/node-addon-api/tree/v7.1.1) | The license for its headers is in `node_modules/node-datachannel/NODE-ADDON-API-LICENSE.md`. |
| long-timeout | [Christian Tellnes’s project](https://github.com/tellnes/long-timeout) | MIT, Christian Tellnes. A copy of the license is included in `node_modules/eufy-security-client/LICENSE`. |

## eufy icon

The app uses the eufy icon from the Home Assistant brands repository. The store displays a 128 × 128 pixel version. The integration ships the original PNG files in its `brand/` directory so Home Assistant can serve the icon locally. [Source images](https://github.com/home-assistant/brands/tree/master/core_integrations/eufy)
