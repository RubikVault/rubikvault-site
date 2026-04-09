# NAS Monitoring Runbook

## Ziel

Leichtgewichtiges Health-Monitoring fuer die Synology DS720+ mit:

- Daily Health Report um `09:00`
- Weekly Trend Report am Sonntag um `08:00`
- Sofort-Alerts alle `5` Minuten per Watch-Skript
- Browser-Link unter `http://192.168.188.21/monitoring/`
- Repo-/Job-Korrelation fuer Lastspitzen
- Self-Healing-Supervisor mit `3` Prueflaufen pro Tag

## Repo-Dateien

- `scripts/nas/monitoring/common.sh`
- `scripts/nas/monitoring/health_watch.sh`
- `scripts/nas/monitoring/daily_health.sh`
- `scripts/nas/monitoring/weekly_report.sh`
- `scripts/nas/monitoring/report_supervisor.sh`
- `scripts/nas/monitoring/deploy.sh`
- `scripts/nas/monitoring/ingest_snapshot.mjs`
- `scripts/nas/monitoring/build_weekly_report.mjs`
- `scripts/nas/monitoring/send_mail.mjs`
- `config/nas-monitoring.env.example`

## Deploy

Vom Mac:

```bash
cd /Users/michaelpuchowezki/Dev/rubikvault-site
bash scripts/nas/monitoring/deploy.sh
```

Das Deployment legt auf der NAS an:

```text
/volume1/monitoring/
  config/
  data/
  dashboard/
  docs/
  logs/
  reports/daily/
  reports/weekly/
  scripts/
```

Und DSM-Task-Definitionen als Symlinks:

```text
/usr/syno/etc/synoschedule.d/root/90.task -> /volume1/homes/neoboy/monitoring-task-backup/scheduler/90.task
...
/usr/syno/etc/synoschedule.d/root/95.task -> /volume1/homes/neoboy/monitoring-task-backup/scheduler/95.task
```

## Konfiguration auf der NAS

Datei:

```text
/volume1/monitoring/config/monitoring.env
```

Wichtige Felder:

- `EMAIL_TO`
- `SMTP_FROM`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_SECURE`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `NODE_BIN`
- `SMARTCTL_BIN`
- `SYSTEM_LOG_FILES`

Empfehlung:

- Browser-only Betrieb: `EMAIL_REPORTS_ENABLED=0` und `TELEGRAM_ALERTS_ENABLED=0`
- DSM Notification Center fuer Hardware-/System-Alerts aktiv lassen
- SMTP nur setzen, wenn `sendmail` auf der NAS nicht verfuegbar oder nicht konfiguriert ist

## DSM Notification Center

In DSM aktiv lassen oder aktivieren:

- RAID degraded
- SMART Fehler
- Volume fast voll
- Temperaturwarnungen
- Systemfehler

Diese Alerts bleiben primaer. Das Skript-System ergaenzt nur eigene CRIT-Warnungen und Reports.

## Task Scheduler

`deploy.sh` legt die Root-Jobs automatisch an. Die folgenden Kommandos sind die laufenden Ziel-Skripte.

### 1. Health Watch

- Typ: `Triggered Task` -> `User-defined script`
- Benutzer: `root`
- Zeitplan: alle `5` Minuten
- Befehl:

```bash
/bin/bash /volume1/monitoring/scripts/health_watch.sh
```

### 2. Daily Health

- Typ: `Scheduled Task` -> `User-defined script`
- Benutzer: `root`
- Zeitplan: taeglich `09:00`
- Befehl:

```bash
/bin/bash /volume1/monitoring/scripts/daily_health.sh
```

### 3. Weekly Trend

- Typ: `Scheduled Task` -> `User-defined script`
- Benutzer: `root`
- Zeitplan: Sonntag `08:00`
- Befehl:

```bash
/bin/bash /volume1/monitoring/scripts/weekly_report.sh
```

### 4. Supervisor

- Typ: `Scheduled Task` -> `User-defined script`
- Benutzer: `root`
- Zeitplan: taeglich `09:15`, `13:15`, `18:15`
- Befehl:

```bash
/bin/bash /volume1/monitoring/scripts/report_supervisor.sh
```

## E-Mail Setup

Option A:

- DSM Email-Benachrichtigungen konfigurieren
- `sendmail` der NAS verwenden

Option B:

- SMTP-Daten in `/volume1/monitoring/config/monitoring.env` setzen
- `send_mail.mjs` uebernimmt den Versand

## Telegram Setup

1. Bot mit `@BotFather` anlegen
2. `TELEGRAM_BOT_TOKEN` in die Config eintragen
3. Chat-ID des Ziel-Chats eintragen
4. Optional Bot in eigenen privaten Monitoring-Chat einladen

Die angegebene Handynummer wird nicht direkt benoetigt.

## Dashboard

Link:

```text
http://192.168.188.21/monitoring/
```

Datei-Root:

```text
/volume1/web/monitoring/index.html
```

Moeglichkeiten:

- direkt per SMB oder Synology Drive oeffnen
- via Root-Task nach `/volume1/web/monitoring` gespiegelt

Wichtige Datenquellen:

- `/volume1/monitoring/data/daily.json`
- `/volume1/monitoring/data/history.csv`
- `/volume1/monitoring/data/events.log`
- `/volume1/monitoring/data/process.log`
- `/volume1/monitoring/dashboard/data.js`

## Wo sehe ich was?

Aktueller Zustand:

- `http://192.168.188.21/monitoring/`
- `/volume1/monitoring/data/daily.json`
- aktueller Daily Report unter `/volume1/monitoring/reports/daily/`

Probleme + Uhrzeit:

- `events.log`
- Abschnitt `Logs` und `Event Timeline` im Daily Report

Trends:

- Dashboard Charts fuer `7/30 Tage`
- Weekly Report unter `/volume1/monitoring/reports/weekly/`

Repo-/Job-Korrelation:

- Dashboard Abschnitt `Zu diesen Zeiten Repo-/Jobs pruefen`
- Weekly Report Abschnitt `Korrelation`
- Rohdaten in `process.log`

## Schwellenwerte anpassen

In `/volume1/monitoring/config/monitoring.env`:

- `CPU_WARN_PER_CORE`
- `CPU_CRIT_PER_CORE`
- `CPU_CRIT5_PER_CORE`
- `RAM_WARN_PCT`
- `RAM_CRIT_PCT`
- `VOLUME_WARN_PCT`
- `VOLUME_CRIT_PCT`
- `DISK_TEMP_WARN_C`
- `DISK_TEMP_CRIT_C`
- `ALERT_COOLDOWN_SEC`

Danach den betroffenen Task einmal manuell ausfuehren oder auf den naechsten Scheduler-Lauf warten.
