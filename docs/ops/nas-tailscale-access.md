# NAS Tailscale Access

Generated: 2026-04-14

## Goal

Bring the Synology NAS into a state where remote access works safely over Tailscale, without exposing DSM or SSH publicly.

## Current Verified Facts

### MacBook

Verified locally on 2026-04-14:

- Tailscale binary exists: `/usr/local/bin/tailscale`
- Tailscale version: `1.96.2`
- Backend state: `Running`
- This Mac is in tailnet: `macbook-air.taila2701e.ts.net.`
- Tailscale IPs: `100.72.162.95`, `fd7a:115c:a1e0::1801:a2af`
- Current visible peer count from this Mac: `1`
- Visible peer: `bsi.taila2701e.ts.net.`

Implication:

- The Mac is already joined to the tailnet.
- The NAS is not currently visible as a Tailscale device from this Mac.

### NAS

Verified live over SSH on 2026-04-14:

- Hostname: `NeoNAS`
- Model kernel string: `Linux NeoNAS 4.4.302+ ... synology_geminilake_720+`
- This is the Synology `DS720+` family
- SSH is enabled and reachable on `192.168.188.21:2222`
- `sshd` listener is running
- Login user used successfully: `neoboy`
- `sudo -n` is not available for `neoboy`
- Tailscale package is installed:
  - package: `Tailscale-1.58.2-700058002`
  - daemon: `/volume1/@appstore/Tailscale/bin/tailscaled`
  - socket: `/volume1/@appdata/Tailscale/tailscaled.sock`
- Tailscale daemon state is **not logged in**:
  - `BackendState=NeedsLogin`
  - `TailscaleIPs=null`
  - `CurrentTailnet=null`
  - `DNSName=""`
  - `AuthURL=""`
  - `TUN=false`
- Git in PATH: not present
- Existing repo-related paths:
  - `/volume1/homes/neoboy/Dev/rubikvault-site`
  - `/volume1/homes/neoboy/RepoOps/rubikvault-site`
  - `/volume1/homes/neoboy/git`

### Current Blocker

The NAS package is installed and a node now exists in the tailnet control plane, but the NAS-side daemon still reports `NeedsLogin`.

Observed state on 2026-04-14:

- Mac tailnet sees NAS node:
  - name: `neonas.taila2701e.ts.net`
  - IPv4: `100.98.90.69`
  - IPv6: `fd7a:115c:a1e0::e235:5a45`
- NAS local daemon still reports:
  - `BackendState=NeedsLogin`
  - `no current Tailscale IPs`
  - `Log in at: https://login.tailscale.com/a/10aa44801ff01`
- SSH over Tailscale hostname still times out

Implication:

- The node registration has started, but the NAS-side state is not yet cleanly finalized for usable remote SSH access.
- The next step is still DSM-side completion/confirmation in the Tailscale app, followed by the DSM7 `configure-host` boot task and a reboot.

## Recommended Activation Path

Use the already installed Synology Tailscale package and complete login/activation.

Official basis:

- Tailscale recommends the Synology package path.
- Tailscale documents Synology DSM7 `configure-host`.
- Tailscale documents that Tailscale SSH does not run on Synology.

## Minimal Manual DSM Steps

### 1. Open the already installed Tailscale package and sign in

DSM clicks:

1. Open `Package Center`
2. Open `Installed`
3. Open `Tailscale`
4. Click `Open`
5. Sign in with the same Tailscale account/tailnet already used by the MacBook

Expected result:

- The NAS appears in the Tailscale admin console
- The NAS receives a Tailscale IPv4 address in `100.64.0.0/10`
- The NAS receives a MagicDNS name
- The NAS local Tailscale app no longer shows `NeedsLogin`

### 2. Enable outbound host integration on DSM 7

Only needed because this is Synology DSM 7.x behavior.

DSM clicks:

1. Open `Control Panel`
2. Open `Task Scheduler`
3. Click `Create`
4. Select `Triggered Task`
5. Select `User-defined script`
6. In `General`:
   - Task name: `tailscale-configure-host`
   - User: `root`
   - Event: `Boot-up`
   - Enabled: yes
7. In `Task Settings`, set script to:

```sh
/var/packages/Tailscale/target/bin/tailscale configure-host; synosystemctl restart pkgctl-Tailscale.service
```

8. Save
9. Reboot the NAS once

Expected result:

- Other apps and processes on the NAS can make outbound connections over Tailscale
- The setting persists across reboot

### 3. Firewall rule, only if Synology firewall is enabled

DSM clicks:

1. Open `Control Panel`
2. Open `Security`
3. Open `Firewall`
4. Edit the active/default profile
5. Add an allow rule for source subnet:
   - IP: `100.64.0.0`
   - Mask: `255.192.0.0`

Do not change any public port forwards for this.

## What Not To Do

- Do not expose DSM to the public internet
- Do not expose SSH publicly
- Do not use Tailscale SSH on Synology; use DSM's normal SSH server over the Tailscale network
- Do not change SSH password-login settings until Tailscale access is confirmed working

## Safe SSH / Repo Baseline

Already true or prepared:

- SSH service is active
- Repo workspaces already exist
- No public Git service has to be exposed

Still missing before a proper internal Git-over-SSH path:

- Confirm whether Git should run from a package/container or remain out of scope
- Create a dedicated non-admin repo user only after Tailscale access is verified
- Do not hard-disable password login yet

## Exact Mac Tests After NAS Joins Tailscale

Run these from the MacBook after the NAS login is completed in the Tailscale app:

```sh
tailscale status
```

Look for a new Synology/NAS device entry in the same tailnet.

Then:

```sh
tailscale ping <nas-magicdns-name>
```

Then:

```sh
ssh -p 2222 neoboy@<nas-tailscale-ip> hostname
```

or, if MagicDNS works:

```sh
ssh -p 2222 neoboy@<nas-magicdns-name> hostname
```

Then:

```sh
ssh -p 2222 neoboy@<nas-magicdns-name> 'command -v tailscale && tailscale ip -4'
```

Then:

```sh
ssh -p 2222 neoboy@<nas-magicdns-name> 'tailscale status'
```

Success criteria:

- `tailscale ping` works
- SSH works over the Tailscale path
- The NAS reports its own Tailscale IP
- The NAS shows as connected to the same tailnet

## Clear Next Step

Smallest correct next step:

1. Open the already installed Tailscale package in DSM
2. Sign the NAS into the same tailnet
3. Add the DSM7 `configure-host` boot task
4. Reboot once
5. Run the Mac tests above
