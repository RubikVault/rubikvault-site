# Main vs Local Decision Table

| Bereich | Auf `main`? | Einfache Entscheidungshilfe | Vorteil | Nachteil |
|---|---|---|---|---|
| Öffentliche HTML-Seiten (`public/*.html`) | Ja | Wenn Besucher die Seite direkt öffnen oder von `index.html` dorthin verlinkt wird | Sichtbare Website-Funktion sofort live | UI ist im öffentlichen Repo sichtbar |
| Öffentliche UI-JS-Dateien (`public/js/*`) | Ja | Wenn sie direkt von `public/*.html` geladen werden | Browser-UI funktioniert vollständig | Client-Logik ist öffentlich |
| Öffentliche aktuelle Snapshot-Daten (`public/data/snapshots/*`) | Ja | Wenn eine Live-Seite oder ein Besucher-Endpoint die Datei direkt liest | Website zeigt aktuelle Analysen und Rankings | Daten sind kopierbar |
| Besucher-APIs (`functions/api/*`) | Ja | Wenn sie direkt von `stock.html`, `index.html` oder einer öffentlichen UI verwendet werden | Live-Funktionalität für Besucher | Serverlogik ist im Repo lesbar |
| Laufzeit-Konfiguration für Besucher-APIs (`config/*`) | Ja | Wenn die API ohne diese Datei nicht korrekt antwortet | Stabile Runtime und nachvollziehbare Defaults | Teile der Betriebslogik werden sichtbar |
| Dashboard-/Ops-UI für öffentliche Ansicht | Ja | Wenn sie unter `rubikvault.com` oder per Redirect erreichbar ist | Vollständige öffentliche Transparenz | Interne Betriebsdetails werden sichtbarer |
| Trainingsdaten, Lernhistorien, Outcome-Ledger | Nein | Wenn der Inhalt nur Training, Kalibrierung oder Rücktests verbessert | Kein IP-Abfluss | Kein direkter Mehrwert für Besucher |
| QuantLab-Code und Reports | Nein | Wenn der Code nur Forschung, Backtests, Agenten oder Modellsteuerung betrifft | Proprietäre Logik bleibt lokal | Keine Reproduzierbarkeit über `main` |
| Agenten-, Orchestrierungs- und Fusionslogik | Nein | Wenn sie nicht direkt von öffentlicher UI oder Besucher-API gebraucht wird | Schutz von IP und Arbeitsweise | Mehr lokaler Pflegeaufwand |
| Experimente, Scratch-Skripte, Diagnose-Tools | Nein | Wenn Besucher nichts davon sehen oder konsumieren | Repo bleibt fokussiert | Lokale Helfer bleiben unversioniert |
| Build-/Generator-Skripte für öffentliche Daten | Nur wenn nötig | Nur auf `main`, wenn CI oder Team sie braucht, um öffentliche Daten neu zu erzeugen | Reproduzierbare Public-Pipeline | Mehr Logik öffentlich |

## Default-Regel

| Frage | Entscheidung |
|---|---|
| Wird es direkt von einer öffentlichen Seite, einem öffentlichen Asset oder einem Besucher-Endpoint benutzt? | Auf `main` |
| Verbessert es nur Training, Historie, Agenten, Forschung oder interne Diagnose? | Lokal |
| Enthält es proprietäre Logik ohne sichtbaren Mehrwert für Besucher? | Lokal |
| Enthält es aktuelle öffentliche Daten, die die Website sofort besser machen? | Auf `main` |
