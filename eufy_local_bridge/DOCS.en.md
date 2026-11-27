# Install Eufy Local Bridge on Home Assistant OS

[Français](https://github.com/TheUncas/ha-eufy-t9000/blob/main/eufy_local_bridge/DOCS.md) · [Changelog](https://github.com/TheUncas/ha-eufy-t9000/blob/main/eufy_local_bridge/CHANGELOG.md) · [Dependencies and licenses](https://github.com/TheUncas/ha-eufy-t9000/blob/main/eufy_local_bridge/THIRD_PARTY.en.md)

<a href="https://buymeacoffee.com/theuncas"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" width="180" alt="Buy me a coffee"></a>

The app connects to your eufy account and T9000 from Home Assistant OS on a **64-bit Intel or AMD PC or VM**. The integration makes the devices available to your dashboards and automations. The Windows PC that hosts the separate web interface can stay switched off. The VM must be able to reach the HomeBase on your LAN. In VMware, bridge its network adapter to that network.

## Install from the store

1. Add the repository to Home Assistant and confirm. To do this manually, open **Settings → Apps** (or **Add-ons**), then **Store → ⋮ → Repositories**, and enter `https://github.com/TheUncas/ha-eufy-t9000`. [Add the Eufy Local Bridge repository](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2FTheUncas%2Fha-eufy-t9000)
2. Open **Eufy Local Bridge T9000** in the store and select **Install**. The first build requires internet access. If the app does not appear, select **Check for updates** in the store menu. [Home Assistant app repositories](https://contributors.home-assistant.io/apps/guides/repository/)
3. Generate your pairing key, then paste it into **Pairing key** (`pairing_key`) on the app’s **Configuration** tab. Save, turn on **Start on boot**, and start the app. On its **Log** tab, check that the integration was installed and copy the public SHA-256 certificate fingerprint. [Generate the pairing key](#generate-the-pairing-key)
4. **Restart Home Assistant Core** when the app log asks you to. The app installs its files in `custom_components/eufy_local_bridge`. After an update, the log tells you whether Core needs another restart.

## Cameras and app settings

Open **Settings → Devices & services → Passerelle eufy locale → Devices**. Each camera reported by the HomeBase has its own device page. Open its camera entity to start a local live view. For a battery-powered camera, show disabled entities and enable its video entity if you want to use it. The HomeBase can stream one camera at a time.

To change the options, open **Settings → Apps → Eufy Local Bridge T9000 → Configuration**. Save your changes and restart the app.

| Option | Default | What it controls |
|---|---|---|
| **Refresh PoE camera images** (`poe_snapshots_enabled`) | Off | Captures one image from each supported Power over Ethernet (PoE) camera in turn. A live view takes priority. |
| **PoE image interval (seconds)** (`poe_snapshot_interval_seconds`) | 60 s | Choose 30–3,600 seconds. Thumbnails use the latest capture held in memory. Battery-powered cameras are excluded. |
| **Home Assistant state refresh interval (seconds)** (`state_poll_seconds`) | 10 s | Choose 5–120 seconds between reads of the app’s local state cache. |
| **HomeBase polling interval (seconds)** (`station_poll_seconds`) | 30 s | Choose 15–120 seconds between event queries to a connected HomeBase. A camera’s battery percentage changes when the camera reports a reading. |
| **Video startup timeout (seconds)** (`camera_start_timeout_seconds`) | 30 s | Allow 15–60 seconds for the first image to arrive while the HomeBase is online. |

Periodic images cover every recognized PoE camera that advertises live video, including cameras whose video entities are hidden or disabled in Home Assistant. Supported models are E40 (T8P00), E41 (T8P10), and S4 (T8E00). The app waits for the configured interval after each round of captures. While someone is viewing a live stream, other cameras keep their last available thumbnail. [HomeBase Professional S1 compatibility list](https://service.eufy.com/expertsecure-system/article-description/What-eufy-devices-are-compatible-with-HomeBase-Professional-S1)

To put a camera on a dashboard, add a **Picture entity** card, select the PoE camera, and leave **Camera view** set to **Auto**. Turn on PoE image refresh to populate the thumbnail. Tap the card to open live video. The card may be blank until the first capture. Home Assistant Core 2026.3 and later can display the eufy integration icon included in the app. [Local brand images for custom integrations](https://contributors.home-assistant.io/core/integrations/brands/#brand-images-for-custom-integrations)

### Check the HomeBase connection in 1.3.7

The regular command session now prefers the UDP path used by the diagnostic trial. The VM selects its outgoing IPv4 address for the route to the HomeBase and the first UDP port advertised for the HomeBase’s LAN address. It selects the pair again when renewing the session. If this path fails, a subsequent connection attempt can use automatic LAN candidate selection.

After updating, start the app and restart Home Assistant Core if the log requests it. In **Developer tools → States**, open the alarm panel (normally `alarm_control_panel.alarme_t9000`) and check that `homebase_online` changes to `true`. Check again about five minutes later, after the first automatic renewal. You can do this without changing the alarm mode. If the base remains offline after the reconnection attempt, record `connection_issue` and, if present, `last_ice_attempt`.

### Try Windows-style UDP selection in 1.3.6

Install the update, start the app, and restart **Home Assistant Core**. On the **HomeBase T9000** device page, press **Test UDP link** once. If the app sees the base as offline, it tries to open a command channel in a dedicated diagnostic session. The VM uses its outgoing IPv4 address for the route to the base and the first UDP candidate port advertised for the base’s LAN IPv4 address. Home Assistant runs this test locally. You can keep the Windows PC turned off and leave the alarm in its current mode.

After 90 seconds, open **Developer tools → States** and find the **UDP diagnostic** sensor. Its entity ID may be `sensor.homebase_t9000_udp_diagnostic` or `sensor.homebase_t9000_diagnostic_udp`, depending on the installation language and any renaming. Read the **`windows_lan_trial`** attribute.

| Value | Meaning |
|---|---|
| `connected` | The command channel opened on the expected UDP pair. The app then closes the test session. The alarm’s `homebase_online` attribute tracks the regular connection. |
| `failed` | The trial failed. Read `windows_lan_trial_reason` for the reason and `windows_lan_ice_attempt` for any recorded ICE observations. |
| `skipped_online` | The regular connection was available. The app could observe UDP traffic without opening a separate test session. |
| `running`, `busy` | The trial is in progress, or another trial is using the connector. |
| `error`, `inconclusive` | The trial was unavailable, or the capture ended before the app received a result. |

`route_unavailable` means the connector could not determine the outgoing local IPv4 address. With `pair_mismatch`, the observed pair differed from the expected pair. With `pair_unverified`, the connector could not verify the match. The sensor state, UDP/STUN counters, and `ice_attempts` describe the capture as a whole. Packet counts can include regular reconnections that occurred during the test.

### Find where ICE failed in 1.3.5

Update and start the app, then restart **Home Assistant Core**. Open the **HomeBase T9000** device page and press **Test UDP link** once. This can open a session with the base without sending an alarm command.

After 90 seconds, open **Developer tools → States** and select **UDP diagnostic**. Its `ice_attempts` attribute holds up to four timeouts reported by the connector during that capture, in chronological order. Later reconnections preserve that result. An empty list means the connector observed no timeout with an ICE report during the capture. Read `homebase_online` on **Alarme T9000** for the current connection state.

| Fields in the same `ice_attempts` entry | Interpretation |
|---|---|
| `reason: offer_unavailable` | The attempt timed out waiting for the session offer. |
| `local_udp_matches_route: false` | None of the advertised local candidates matched the IPv4 address the operating system would use to reach the base. On a VM with several interfaces, check the interface and source address of the route to the HomeBase. |
| `remote_udp_matches_station: false` | The engine received a remote UDP candidate, but the observed candidates did not match the LAN IPv4 address reported by the HomeBase. Check the **base’s** address in your router’s DHCP leases. |
| `ice_checking_seen: true` and `pair_seen: false` | ICE checks started. The connector did not observe a selected pair. An explicit failure sets `ice_failed_seen: true` even if the final state is `closed`. |
| `ice_connected: true` or `pair_seen: true` | The connector observed an ICE connection or a selected pair during the attempt. Read `reason` to see which stage subsequently timed out. |

The comparisons use UDP/IPv4 *host* candidates. A missing comparison field means the connector lacked the information to make that comparison. Two `true` values confirm that the expected addresses appeared among the candidates. Use the pair fields to see whether ICE selected a path. STUN counters cover the whole capture and may include other attempts. [ICE pair selection](https://www.rfc-editor.org/rfc/rfc8445.html#section-8.1.1)

To share these observations, copy just `ice_attempts`. It contains timestamps, states, and boolean flags. The address comparisons take place locally.

### Update to 1.3.4

Install the update from the store, start the app, and restart **Home Assistant Core** to load the updated integration.

- To open a HomeBase session, the app sends its session description (SDP answer) on signaling channel 0 and separately advertised ICE candidates on channel 1. To check the connection without operating the alarm, press **Test UDP link**. After 90 seconds, open **Alarme T9000** and check `homebase_online`. If it is `false`, read `connection_issue`.
- When two mode changes overlap, Home Assistant reports that the first is still in progress (HTTP 409). The gateway declines the second request. Wait for the first result. Before trying again, check the active mode in **Alarme T9000**, or in eufy Security if the panel still shows **Unknown**.

### Upgrade from an earlier installation

- **“Waiting for eufy” in 1.1.0** — Close the dialog. After updating to 1.1.1, start the app, confirm in its log that the integration was updated, and restart Home Assistant Core. Start pairing again from **Devices & services** with your pairing key and the fingerprint from the log.
- **Local app installed from a ZIP** — Home Assistant treats the local app and the store app as separate installations. They use the same ports. Stop the old app and turn off its **Start on boot** setting before starting the store app. The new installation has its own certificate and storage. Follow Home Assistant’s reauthentication prompt with the new fingerprint and your chosen key.
- **YAML integration connected to the Windows PC** — Remove the old `eufy_local_bridge:` block from `configuration.yaml`, check the configuration, and restart Core after the app’s first start. If you used the REST package, disable its declaration to avoid duplicate entities.
- The installer recognizes previously distributed releases. If it reports a conflict with customized files, back up your changes before deciding whether to replace them.

## Generate the pairing key

The `pairing_key` is a secret shared by the Home Assistant integration and the app. The integration presents it when reading state or sending alarm commands. The public SHA-256 fingerprint in the log lets the integration verify the app’s certificate.

Generate the key **once** and keep it in a password manager. You can use the manager’s generator and choose 32 to 128 characters from `A–Z`, `a–z`, `0–9`, `-`, and `_`. On Windows, this PowerShell example generates a 64-character key from 32 random bytes.

```powershell
$octets = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($octets)
$rng.Dispose()
[BitConverter]::ToString($octets).Replace('-', '').ToLowerInvariant()
```

## Connect your eufy account from Home Assistant

1. Open Home Assistant over **HTTPS** before entering your credentials. Your browser uses the connection to your Home Assistant installation.
2. In **Settings → Devices & services → Add integration**, search for **Passerelle eufy locale**, the integration’s registered name. Paste the **same key** you configured in the app into **App pairing key**. Paste the fingerprint from the app log into **Certificate SHA-256 fingerprint**.
3. Enter your eufy email address, password, and two-letter account country code, such as `FR`. Keep the dialog open. Home Assistant completes pairing automatically or shows the CAPTCHA or verification-code prompt requested by eufy. If there is no confirmation after 90 seconds, the sign-in form reappears with a message. Check the VM’s internet access and the country code before trying again.
4. Under **Entities**, look for **Alarme T9000** and **Eufy batterie**. Check a battery percentage and the HomeBase’s active mode. Depending on the modes the base advertises, the panel offers `alarm_control_panel.alarm_arm_home`, `alarm_control_panel.alarm_arm_away`, and `alarm_control_panel.alarm_disarm`. Its display updates when the base confirms the mode. Open a compatible camera for live video. Battery-powered cameras have their video entities disabled by default.

Devices that report opening or motion also provide binary sensors in Home Assistant. These sensors become unavailable if the connection to the base drops.

## Open all guard modes from the alarm tile

Since 1.2.0, **Mode de garde T9000** lists the modes your HomeBase advertises. These can include custom profiles, schedule, geofencing, and disarmed. Automations can call `select.select_option` with the exact option name in that list.

To display the confirmed alarm state and open the full list of modes with one tap, edit your dashboard, add a **Manual** card, and paste the following configuration. Replace all three `entity` values with your own IDs if they differ.

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

The tile shows the active state confirmed by the base. The selector shows the latest configured profile reported by eufy. For example, the selector can show “Geofencing” while the tile shows “Armed home”. The tile may show **Unknown** until the base confirms the active state.

## Troubleshoot the connection and live video

### Test the UDP link from Home Assistant

1. Start the app. After an update, restart **Home Assistant Core** if the app log requests it.
2. Go to **Settings → Devices & services → Passerelle eufy locale → HomeBase T9000**. Under **Diagnostic**, press **Test UDP link** once. [Open the integration](https://my.home-assistant.io/redirect/integration/?domain=eufy_local_bridge)
3. After **90 seconds**, open **Developer tools → States** and select **UDP diagnostic**. Search by entity name or by ID, such as `sensor.homebase_t9000_diagnostic_udp`. The test observes traffic. When the base is offline, it also attempts to open a command channel in a dedicated session. You can run it without operating the alarm.

| Result | What to check next |
|---|---|
| `windows_lan_trial: connected` | The test channel opened. Read `homebase_online` on `alarm_control_panel.alarme_t9000` to check the regular session. |
| `windows_lan_trial: skipped_online` | The regular session was available. Open a PoE camera’s live view separately to check video. |
| `bidirectional` with `windows_lan_trial: failed` | UDP packets flowed both ways. Read `windows_lan_trial_reason` and, if present, `windows_lan_ice_attempt` to find where the connection failed. |
| `outbound_only`, `inbound_only`, or `no_traffic` | Check the interfaces listed in `sent_by_interface` and `received_by_interface`, the VM’s network bridge, and the HomeBase’s LAN. |

**HomeBase online but no image?** Open a supported PoE camera’s live view and wait for the configured startup timeout. If live video works, check **Refresh PoE camera images**, its interval, and the entity selected on the dashboard card. Close the live view to let other PoE cameras refresh their images. A battery camera normally has an empty thumbnail. When reporting an issue, include the version, the UDP diagnostic result, `homebase_online`, and whether the live view, the thumbnail, or both are missing.

The sensor reports traffic in both directions, outgoing traffic only, incoming traffic only, or no traffic. Its attributes include per-interface counters and test times. If the test fails, check **Reason**. Bidirectional traffic confirms packet exchange with the HomeBase. The alarm’s `homebase_online` attribute tells you whether the regular eufy connection succeeded.

The app uses the LAN IPv4 address advertised by the HomeBase. With the Linux `NET_RAW` capability, a kernel filter examines packet headers for traffic exchanged with that address. The probe receives at most the first 20 bytes of the IPv4 header. The app keeps the last test’s counters in memory until the next test or an app restart.

Since **1.3.1**, the app waits up to 15 seconds for ICE candidate gathering to finish so it can include the candidates in its answer to the HomeBase. If that wait expires, the app sends the initial answer. Press **Test UDP link**, then read `homebase_online` on **Alarme T9000** to see whether the session opened.

### Diagnose an ICE failure when UDP traffic is present

After installing **1.3.2**, start the app and restart Home Assistant Core to load the new sensor attributes. Press **Test UDP link** and wait 90 seconds for the capture to finish. In **UDP diagnostic**, the six `stun_*` attributes count STUN Binding requests and success or error responses in each direction. “Sent” means a packet traveling toward the HomeBase. [ICE connectivity checks](https://www.rfc-editor.org/rfc/rfc8445.html#section-7)

| Observation during the test | Interpretation |
|---|---|
| UDP traffic is present but all six counters are zero | The probe recognized no STUN Binding checks for this IPv4 address. Check which UDP candidates the VM and the base advertised. |
| Requests go to the base, but no success or error responses return | The VM sent checks. No STUN response from the base was visible on the observed path. |
| Requests arrive from the base, but no response leaves | The checks reached the VM. Check whether the connector received them and could reply. |
| Error responses appear | At least one participant reported a STUN error. The direction identifies which side sent it. |
| Success responses appear and `homebase_online` remains `false` | Read `connection_issue`. If it is `ice_unavailable`, check whether ICE selected a usable pair. |

The counters cover STUN Binding messages in unfragmented UDP/IPv4 packets during the test. They include retransmissions and combine HomeBase traffic from all interfaces. They do not correlate individual responses with requests or sessions. To share the result, provide the six counts and `connection_issue`.

### Read the connector’s last ICE attempt

Version **1.3.3** fixed a case where an older attempt timing out could close the next connection. After updating, start the app, restart Home Assistant Core, and press **Test UDP link**. In **Developer tools → States**, open **Alarme T9000**. If the base remains offline, `connection_issue` gives the most recent reason. When an attempt with an ICE peer times out, `last_ice_attempt` records the connector’s observations.

| Field | Meaning |
|---|---|
| `finished_at` | UTC time of the timeout. Compare it with the start and finish times on **UDP diagnostic**, since automatic reconnects also produce attempts. |
| `local_udp_announced` / `remote_udp_submitted` | The connector advertised at least one local IPv4 UDP *host* candidate or submitted at least one such remote candidate to ICE without an immediate error, respectively. The flags alone do not identify which interface ICE selected. |
| `ice_state` | Native ICE state at timeout, such as `checking`, `failed`, or `completed`. |
| `ice_connected` / `pair_seen` | ICE reported a connection or the connector observed a selected pair at least once, respectively. |

If `ice_unavailable` appears and both `ice_connected` and `pair_seen` are `false`, the connector observed no usable pair during that attempt, even if STUN responses were present. With `ice_path_lost`, a path was observed and had been lost by the timeout. `secure_channel_unavailable` places the failure after evidence of ICE connectivity. With `command_channel_unavailable`, the transport was connected at timeout and the eufy command channel was still waiting to open.

### Read the reason for an alarm command error

In 1.1.1, HTTP 503 means Home Assistant reached the gateway. The outcome of the alarm command may still be unknown. Check the current mode in the eufy app before trying again.

Since 1.2.0, you can open **Developer tools → States** and search for `alarm_control_panel.alarme_t9000`. Read `homebase_online` to see whether the gateway has a connection to the base. While the base is offline, `connection_issue` can show the last known reason. Reading these attributes leaves the alarm in its current mode. The app log can also show the reason for a command failure.

- `no_lan_candidate` means the connector received no proposed direct path from the base. With `ice_unavailable`, it received a candidate and negotiation timed out before finding a usable path. In both cases, the failure occurred before the gateway sent the alarm command.
- `signaling_unavailable` means the connector could not reach the eufy signaling service needed to open a new connection. Check the VM’s internet access.
- `command_unconfirmed` means the gateway lost confirmation. Check the HomeBase’s current state before deciding whether to send another command.

Version 1.2.1 fixed the loss of a connection candidate received before transport initialization. If `ice_unavailable` persists under VMware, find the **HomeBase’s** IPv4 address in your router’s DHCP leases. Check that the VM’s bridge uses the physical adapter connected to that network. At the `ha >` prompt on the VMware console, enter `network info` to read the active interface’s IPv4 address and network prefix. [Home Assistant OS on VMware](https://www.home-assistant.io/installation/windows/)

## Session storage and restarts

The app uses your password to authenticate with eufy. It saves the encrypted session and its key in its private data. The integration stores the pairing key and the public certificate fingerprint. Protect Home Assistant backups that include these data. If eufy expires or revokes the session, sign in again from Home Assistant.

To verify that Home Assistant runs independently, leave the Windows PC off, restart the app, and check that entities update. Batteries show the last readings the cameras reported. Opening a **new T9000 connection** after an internet outage requires eufy signaling. Until internet access returns, the alarm may be unavailable and new readings or images may be missing.
