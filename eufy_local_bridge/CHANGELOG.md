# Changelog

[Notes de version en français](https://github.com/TheUncas/ha-eufy-t9000/blob/main/eufy_local_bridge/CHANGELOG.fr.md)

## 1.6.0

- **Generate pairing key** now saves the key directly in the app through Home Assistant Supervisor and starts the app when needed. The wizard reuses an existing key. Manual pairing is still available.
- Each device that advertises motion detection or sends a supported motion state gets a **Mouvement** entity. Its `last_motion_received_at` attribute records when the bridge last received a transition to motion, including brief motion that clears between polls.
- After the update, start the app and restart Home Assistant Core once to load the integration. Already paired installations keep their key.

## 1.5.0

- Choose **Generate pairing key** in the integration wizard, then paste the key into the app settings. The wizard can show and fill in the app’s SHA-256 certificate fingerprint for you.
- The English and French setup guides now walk through first-time pairing without terminal commands.
- After updating, start the app and restart Home Assistant Core once to load the new wizard. Existing installations keep their pairing key and eufy session.

## 1.4.1

- Added an English README and an English guide to installation, camera settings and UDP troubleshooting.
- Added release notes to the Home Assistant app update screen, with a French edition linked above.
- Update the app from Home Assistant. Core can keep running with integration version 1.4.0.

## 1.4.0

- Each camera reported by the HomeBase now has its own device page. Open the camera entity for local live video. Live video for battery-powered cameras can be enabled per camera.
- Added optional dashboard snapshots for supported PoE cameras. The option is off by default. When enabled, the app waits 60 seconds between capture rounds by default and gives priority to live viewers.
- Added settings for the Home Assistant state refresh interval, HomeBase polling interval and video startup timeout.
- Bundled the eufy icon with the integration for Home Assistant Core 2026.3 and later.

## 1.3.7

- The regular HomeBase connection now prefers the local UDP address and port selection verified by the diagnostic. The module checks the selected pair when opening and renewing the command channel.

## 1.3.6

- **Test UDP link** now tries the Windows bridge’s address and port selection in a separate local session. A `windows_lan_trial` result of `connected` confirms that the test opened the command channel on the expected pair.

## 1.3.5

- **UDP diagnostic** now records up to four ICE timeouts from the same 90-second test. Each report shows how far negotiation progressed and whether the candidate addresses matched the local route and the HomeBase.

## 1.3.4

- Fixed the signaling channel used to send ICE candidates to the HomeBase.
- Home Assistant now explains when a guard-mode request is already in progress and the gateway rejects a second request with HTTP 409.

## 1.3.3

- Fixed a race where an expired connection attempt could close the next session.
- Added `last_ice_attempt` to the alarm entity to show the last available ICE timeout report.

## 1.3.2

- Added separate sent and received counters for STUN Binding requests, successes and errors to **UDP diagnostic**.

## 1.3.1

- The connector now waits briefly for local ICE candidates before sending its session answer to the HomeBase.

## 1.3.0

- Added **Test UDP link** to the HomeBase device page. Its 90-second capture reports UDP traffic in each direction by interface. The test sends no alarm command.

## 1.2.1

- Fixed a connection failure that could occur when a HomeBase ICE candidate arrived before the local transport was ready.

## 1.2.0

- Added a guard-mode selector for the modes advertised by the HomeBase, including schedules, geofencing and custom profiles where supported.
- Added `homebase_online` and `connection_issue` to the alarm entity to help diagnose rejected commands.

## 1.1.1

- Fixed pairing for installations stuck on the eufy waiting screen. After updating the app and restarting Core, reopen the integration setup to complete pairing.

## 1.1.0

- First public Home Assistant app release for Intel/AMD 64-bit machines and VMs. Pair the integration with a dedicated key and sign in to eufy from Home Assistant.
- Added alarm control, camera battery readings, contact and motion sensors, and on-demand video from compatible cameras. The app stores the encrypted eufy session for reuse after restart.
