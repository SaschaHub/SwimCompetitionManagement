# Copilot / Agent Hinweise

Kurz: Dieses Repo ist eine kleine FastAPI-Anwendung zum Hochladen und Parsen von PDF-Startlisten; Frontend in `web/static`, Backend in `web/main.py`, Persistenz: lokale `uploads/` (in-memory index in `documents`).

- **Quick start (Docker)**
  - `docker-compose up --build` startet `web` und `db` (MariaDB). Die Web-App ist unter `http://localhost:8000` erreichbar.

- **Lokale Entwicklung (ohne Docker)**
  - Wechsle in `web/`, installiere Abhängigkeiten: `pip install -r requirements.txt` (Python 3.11 empfohlen).
  - Starten: `uvicorn main:app --host 0.0.0.0 --port 8000 --reload`.

- **Wichtige Dateien / Bereiche**
  - `web/main.py` — FastAPI-App, wichtigste Endpunkte und Parser (`parse_document_text`, Regex-Muster `bahn_re`).
  - `web/static/` — Single-page UI (`index.html`, `app.js`) nutzt `fetch()` auf die API-Endpunkte.
  - `uploads/` — gemountetes Volume für hochgeladene PDFs; `docker-compose.yml` bindet `./uploads:/app/uploads`.
  - `web/Dockerfile`, `docker-compose.yml` — Container-Start, `uvicorn --reload` ist in CMD gesetzt (Hot-reload in Kombination mit dem Volumen).

- **API-Übersicht (konkrete Beispiele)**
  - POST `/upload` — multipart/form-data `file` (siehe `app.js` Upload). Beispiel mit curl:
    - `curl -F "file=@file.pdf" http://localhost:8000/upload`
  - GET `/documents` — Liste aller aktuell im RAM registrierten Dokumente.
  - DELETE `/documents/{doc_id}` — löscht Eintrag + Datei.
  - GET `/search/{doc_id}?vorname=&nachname=&verein=` — parser-basierte Suche; Sortierung in `main.py`.
  - GET `/autocomplete/{doc_id}?field=vorname&q=foo` — Autocomplete für `vorname|nachname|verein`.

- **Projekt-spezifische Hinweise**
  - Die Anwendung speichert nur einen in-memory-Index (`documents` in `web/main.py`); ein Prozess-Neustart leert diesen Index, zurückgehaltene Dateien bleiben in `uploads/` (es gibt eine `cleanup_orphan_files()`-Funktion).
  - `web/main.py` enthält robusten, aber heuristischen Text-Parser (mehrere reguläre Ausdrücke). Änderungen an Parsing-Logik sollten mit echten PDFs getestet werden.
  - `docker-compose.yml` definiert eine MariaDB, aber aktuell nutzt `web/main.py` die DB-Umgebungsvariablen nicht — überprüfe, ob DB-Integration geplant ist, bevor Du DB-bezogene Änderungen vornimmst.
  - Frontend generiert Export (CSV/PDF) clientseitig; die temporäre PDF-Erzeugung verwendet `html2pdf` via CDN in der Ergebnis-Popup-Seite (`web/static/app.js`).

- **Konventionen / häufige Patterns**
  - Dateien werden unter ihrem originalen Dateinamen gespeichert; `documents` enthält Metadaten mit `id` (UUID) und `filename`.
  - Parser nutzt Zustandsvariablen (`current_abschnitt`, `current_wettkampf`, `current_lauf`) beim Durchlaufen der Textzeilen — ändere Reihenfolge oder greedy-RegEx mit Vorsicht.
  - UI → API Kommunikation verwendet relative Pfade (`/upload`, `/documents`, `/search/...`), daher teste im Root-/Proxy-Kontext (z. B. `http://localhost:8000`).

- **Developing / Debugging Tipps**
  - Wegen Volumen-Mounts (`./web:/app`) reichen Code-Änderungen in `web/` meist ohne Rebuild; für neue Python-Abhängigkeiten Rebuild des Containers erforderlich.
  - Um Parser-Probleme zu debuggen, lade PDFs lokal, starte die App mit `--reload` und füge temporäre `print()`- oder Logging-Ausgaben in `parse_document_text()` ein.
  - Es gibt keine Tests im Repo — schreib einfache Integrationstests gegen die HTTP-Endpoints wenn Du größere Parser-Änderungen machst.

- **Was ein Agent vorsichtig beachten sollte**
  - Änderungen an `documents`-Handling beeinflussen Datei-Cleanup; entferne niemals Dateien ohne Prüfung auf `documents`-Index.
  - DB-Umgebungsvariablen deuten auf geplante Persistenz; vermeide Annahmen über schema/Tabellen (keine DB-Modelle im Code).
  - Parser-Änderungen müssen mit mehreren realen PDF-Beispielen validiert werden (Text-Extraktion ist fehleranfällig).

Wenn Du möchtest, kann ich diese Anleitung um konkrete Parser-Beispiele (Zeilenausschnitte aus `main.py`) oder eine kurze Checkliste für DB-Integration erweitern — sag mir, welche Details Du brauchst.
