# Eufy Local Bridge for Home Assistant

<img align="right" width="64" height="64" alt="eufy" src="https://raw.githubusercontent.com/home-assistant/brands/master/core_integrations/eufy/icon.png">

<a href="https://buymeacoffee.com/theuncas"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" width="180" alt="Buy me a coffee"></a>

[English](README.en.md) · [Français](README.md) · [Release notes](eufy_local_bridge/CHANGELOG.md)

Connect an **eufy HomeBase T9000** directly to Home Assistant OS on a **64-bit Intel or AMD PC or VM**. Use Home Assistant dashboards and automations to check camera batteries, monitor contact and motion sensors, change the alarm mode and view live video from supported cameras. Home Assistant connects to eufy and the HomeBase itself, so the PC hosting the Windows bridge can stay off.

**[Add this repository to my Home Assistant app store](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2FTheUncas%2Fha-eufy-t9000)**

## Installation

1. **Install the app.** Follow the store link above, install **Eufy Local Bridge T9000** and press **Start**. On the first start, leave **Pairing key** empty. The app installs the integration and stops. Restart **Home Assistant** once to load it.
2. **Pair the app.** Open Home Assistant over HTTPS. Go to **Settings → Devices & services → Add integration**, choose **Passerelle eufy locale**, then **Generate pairing key**. Home Assistant saves the key in the installed app and starts it. If the app already has a key, Home Assistant reuses it.
3. **Sign in.** Continue in the same wizard when the app’s fingerprint appears. Sign in to eufy if prompted. To start the bridge after a VM reboot, turn on **Start on boot** on the app’s page.

You’ll find **HomeBase T9000** and your cameras under **Settings → Devices & services → Passerelle eufy locale → Devices**. Open **Alarme T9000** for the confirmed alarm state, **Mode de garde T9000** to select a guard profile, or **Eufy batterie** for a camera’s latest battery level.

To open the full list of profiles by tapping the alarm tile, use the dashboard card example in the guide. [Configure the alarm tile](eufy_local_bridge/DOCS.en.md#open-all-guard-modes-from-the-alarm-tile)

## Cameras and PoE thumbnails

The **Mouvement** entity shows the last motion state the HomeBase reported for each supported device. Open the camera’s device page, or the HomeBase page for a standalone detector. The last detection time remains available even when the movement was brief. [See motion detections](eufy_local_bridge/DOCS.en.md#see-motion-detections)

Open **Settings → Devices & services → Passerelle eufy locale → Devices** and select a camera attached to your HomeBase. Open its camera entity to watch live video. On a battery-powered camera, enable its video entity first if you want to use it.

To display a dashboard image between live sessions, open **Eufy Local Bridge T9000 → Configuration**. Turn on **Refresh PoE camera images**, choose an interval (60 seconds by default) and restart the app. Periodic capture is off by default. A thumbnail shows the latest image held in memory. Opening a live view takes priority over refreshing thumbnails. [Camera and polling settings](eufy_local_bridge/DOCS.en.md#cameras-and-app-settings)

## Check the connection

If the HomeBase stays offline, open its **HomeBase T9000** device page and press **Test UDP link** once. After 90 seconds, open **UDP diagnostic** and read the `windows_lan_trial` attribute. A value of `connected` means the test opened its command channel. To check the connection used for everyday operation, read `homebase_online` on **Alarme T9000**. [Interpret the UDP test or troubleshoot a blank camera image](eufy_local_bridge/DOCS.en.md#test-the-udp-link-from-home-assistant)

## Generate a pairing key

The pairing key allows Home Assistant to read devices and control the alarm. On Home Assistant OS, **Generate pairing key** sets it up locally. **Show SHA-256 fingerprint** displays the public fingerprint Home Assistant uses to recognize your bridge.

Already paired? Open **Configure → Show SHA-256 fingerprint** on the integration to see the saved fingerprint. Keep your existing key for updates. If you need to pair again, choose **Continue pairing** and enter that same key. [Pairing help](eufy_local_bridge/DOCS.en.md#generate-the-pairing-key)

## Operating notes

- The app needs access to the Home Assistant configuration directory to install and update `custom_components/eufy_local_bridge`. The eufy connector then runs without access to that mount. After an update, check the app log to see whether Core needs a restart.
- Your eufy password is used at sign-in. The app stores the encrypted session and its key in its private data. Protect Home Assistant backups that include this data.
- Initial installation and authentication require internet access. After a restart, the app may also need to contact eufy to re-establish its connection. The Home Assistant VM must be able to reach the HomeBase on the LAN.
- Battery readings reflect the last measurement reported by each camera. PoE cameras draw power over Ethernet. You can enable live video separately on each battery-powered camera. Dashboard thumbnail requests do not wake these cameras.

For migration instructions, entity details and troubleshooting, see the [full English guide](eufy_local_bridge/DOCS.en.md).

## Support the project

If you find the app useful, you can support its development. [Buy me a coffee](https://buymeacoffee.com/theuncas)
