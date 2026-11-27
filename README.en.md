# Eufy Local Bridge for Home Assistant

<img align="right" width="64" height="64" alt="eufy" src="https://raw.githubusercontent.com/home-assistant/brands/master/core_integrations/eufy/icon.png">

<a href="https://buymeacoffee.com/theuncas"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" width="180" alt="Buy me a coffee"></a>

[English](README.en.md) · [Français](README.md) · [Release notes](eufy_local_bridge/CHANGELOG.md)

Connect an **eufy HomeBase T9000** directly to Home Assistant OS on a **64-bit Intel or AMD PC or VM**. Use Home Assistant dashboards and automations to check camera batteries, monitor contact and motion sensors, change the alarm mode and view live video from supported cameras. Home Assistant connects to eufy and the HomeBase itself, so the PC hosting the Windows bridge can stay off.

**[Add this repository to my Home Assistant app store](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2FTheUncas%2Fha-eufy-t9000)**

## Installation

1. Follow the store link above and confirm. To add the repository manually, open **Settings → Apps → App store → ⋮ → Repositories** and enter `https://github.com/TheUncas/ha-eufy-t9000`.
2. Install **Eufy Local Bridge T9000**. Generate a pairing key using the instructions below. Paste it into **Pairing key** (`pairing_key`) on the app’s **Configuration** tab. Save, enable **Start on boot** and start the app. [Generate a pairing key](#generate-a-pairing-key)
3. Open the **Log** tab. Check that the app installed the integration and copy the public SHA-256 certificate fingerprint. **Restart Home Assistant Core** to load the integration.
4. Open Home Assistant over **HTTPS**. Go to **Settings → Devices & services → Add integration** and search for **Passerelle eufy locale**. Enter the same key in **App pairing key** and paste the fingerprint from the log into **Certificate SHA-256 fingerprint**. Sign in to eufy and complete any CAPTCHA or verification code prompt.
5. Open **Mode de garde T9000** to choose a profile reported by your HomeBase, including geofencing, schedules and custom profiles. **Alarme T9000** displays the active alarm state confirmed by the HomeBase. Each **Eufy batterie** sensor displays the latest battery level received for that camera.

To open the full list of profiles by tapping the alarm tile, use the dashboard card example in the guide. [Configure the alarm tile](eufy_local_bridge/DOCS.en.md#open-all-guard-modes-from-the-alarm-tile)

## Cameras and PoE thumbnails

Open **Settings → Devices & services → Passerelle eufy locale → Devices** and select a camera attached to your HomeBase. Open its camera entity to watch live video. On a battery-powered camera, enable its video entity first if you want to use it.

To display a dashboard image between live sessions, open **Eufy Local Bridge T9000 → Configuration**. Turn on **Refresh PoE camera images**, choose an interval (60 seconds by default) and restart the app. Periodic capture is off by default. A thumbnail shows the latest image held in memory. Opening a live view takes priority over refreshing thumbnails. [Camera and polling settings](eufy_local_bridge/DOCS.en.md#cameras-and-app-settings)

## Check the connection

If the HomeBase stays offline, open its **HomeBase T9000** device page and press **Test UDP link** once. After 90 seconds, open **UDP diagnostic** and read the `windows_lan_trial` attribute. A value of `connected` means the test opened its command channel. To check the connection used for everyday operation, read `homebase_online` on **Alarme T9000**. [Interpret the UDP test or troubleshoot a blank camera image](eufy_local_bridge/DOCS.en.md#test-the-udp-link-from-home-assistant)

## Generate a pairing key

The `pairing_key` is a secret shared by the Home Assistant integration and the app. The integration presents the key to read device states and send alarm commands. The SHA-256 fingerprint in the app log is public and lets the integration verify the app’s certificate.

Generate the key **once** and store it in your password manager. Use its generator to create a string of 32 to 128 characters using `A–Z`, `a–z`, `0–9`, `-` and `_`. On Windows, this PowerShell snippet generates a 64-character key from 32 random bytes.

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
[BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
```

## Operating notes

- The app needs access to the Home Assistant configuration directory to install and update `custom_components/eufy_local_bridge`. The eufy connector then runs without access to that mount. After an update, check the app log to see whether Core needs a restart.
- Your eufy password is used at sign-in. The app stores the encrypted session and its key in its private data. Protect Home Assistant backups that include this data.
- Initial installation and authentication require internet access. After a restart, the app may also need to contact eufy to re-establish its connection. The Home Assistant VM must be able to reach the HomeBase on the LAN.
- Battery readings reflect the last measurement reported by each camera. PoE cameras draw power over Ethernet. You can enable live video separately on each battery-powered camera. Dashboard thumbnail requests do not wake these cameras.

For migration instructions, entity details and troubleshooting, see the [full English guide](eufy_local_bridge/DOCS.en.md).

## Support the project

If you find the app useful, you can support its development. [Buy me a coffee](https://buymeacoffee.com/theuncas)
