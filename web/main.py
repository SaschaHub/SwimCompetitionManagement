from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.staticfiles import StaticFiles
import os
import uuid
from PyPDF2 import PdfReader
import re

app = FastAPI(debug=True)

documents = []

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

app.mount("/static", StaticFiles(directory="static"), name="static")


def cleanup_orphan_files():
    existing_files = set(os.listdir(UPLOAD_DIR))
    registered_files = set(doc["filename"] for doc in documents)
    orphan_files = existing_files - registered_files

    for filename in orphan_files:
        try:
            os.remove(os.path.join(UPLOAD_DIR, filename))
        except:
            pass


def parse_document_text(text: str):
    lines = text.split("\n")

    current_abschnitt = None
    current_wettkampf = None
    current_lauf = None

    results = []

    abschnitt_re = re.compile(r"Abschnitt\s+(\d+)\s*-\s*(.+)")
    wettkampf_re = re.compile(r"Wettkampf\s+(\d+)\s*-\s*(.+)")
    lauf_re = re.compile(r"Lauf\s+(\d+)\/(\d+)")

    bahn_re = re.compile(
        r"Bahn\s+(\d+)\s+"
        r"([A-Za-zÄÖÜäöüß\- ]+),"
        r"\s*([A-Za-zÄÖÜäöüß\- ]+)\s+"
        r"(\d{4})\s+"
        r"(.+?)\s+"
        r"(\d{2}:\d{2}[,\.]\d{2})"
    )

    for raw_line in lines:
        line = " ".join(raw_line.split())

        if not line:
            continue

        m = abschnitt_re.search(line)
        if m:
            current_abschnitt = {"nummer": m.group(1), "datum": m.group(2)}
            continue

        m = wettkampf_re.search(line)
        if m:
            current_wettkampf = {"nummer": m.group(1), "bezeichnung": m.group(2)}
            continue

        m = lauf_re.search(line)
        if m:
            current_lauf = {"lauf_nr": m.group(1), "lauf_gesamt": m.group(2)}
            continue

        m = bahn_re.search(line)
        if m and current_wettkampf and current_lauf:
            results.append({
                "abschnitt": current_abschnitt,
                "wettkampf": current_wettkampf,
                "lauf": current_lauf,
                "bahn": m.group(1),
                "nachname": m.group(2).strip(),
                "vorname": m.group(3).strip(),
                "jahrgang": m.group(4),
                "verein": m.group(5).strip(),
                "meldezeit": m.group(6)
            })

    return results


@app.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    file_id = str(uuid.uuid4())
    save_path = os.path.join(UPLOAD_DIR, file.filename)

    with open(save_path, "wb") as buffer:
        buffer.write(await file.read())

    try:
        reader = PdfReader(save_path)
        text = ""
        for page in reader.pages:
            text += (page.extract_text() or "") + "\n"
    except:
        text = ""

    documents.append({
        "id": file_id,
        "filename": file.filename,
        "text": text
    })

    return {"message": "Upload erfolgreich", "id": file_id}


@app.get("/documents")
def list_documents():
    return documents


@app.delete("/documents/{doc_id}")
def delete_document(doc_id: str):
    global documents

    doc = next((d for d in documents if d["id"] == doc_id), None)
    if not doc:
        raise HTTPException(status_code=404, detail="Dokument nicht gefunden")

    try:
        os.remove(os.path.join(UPLOAD_DIR, doc["filename"]))
    except:
        pass

    documents = [d for d in documents if d["id"] != doc_id]

    cleanup_orphan_files()

    return {"message": "Dokument gelöscht"}


@app.get("/search/{doc_id}")
def search_in_document(doc_id: str, vorname: str = "", nachname: str = "", verein: str = ""):
    doc = next((d for d in documents if d["id"] == doc_id), None)
    if not doc:
        raise HTTPException(status_code=404, detail="Dokument nicht gefunden")

    parsed = parse_document_text(doc["text"])

    v = vorname.lower().strip()
    n = nachname.lower().strip()
    ve = verein.lower().strip()

    def match(entry):
        if v and v not in entry["vorname"].lower():
            return False
        if n and n not in entry["nachname"].lower():
            return False
        if ve and ve not in entry["verein"].lower():
            return False
        return True

    results = [e for e in parsed if match(e)]

    # Sortierung: Verein, Nachname, Vorname, Datum, Abschnitt, Wettkampf
    results.sort(key=lambda x: (
        x["verein"].lower(),
        x["nachname"].lower(),
        x["vorname"].lower(),
        x["abschnitt"]["datum"] if x["abschnitt"] else "",
        x["abschnitt"]["nummer"] if x["abschnitt"] else "",
        x["wettkampf"]["nummer"] if x["wettkampf"] else ""
    ))

    return {
        "vorname": vorname,
        "nachname": nachname,
        "verein": verein,
        "results": results
    }


@app.get("/autocomplete/{doc_id}")
def autocomplete(doc_id: str, field: str, q: str = ""):
    """
    Autovervollständigung für vorname / nachname / verein
    """
    doc = next((d for d in documents if d["id"] == doc_id), None)
    if not doc:
        raise HTTPException(status_code=404, detail="Dokument nicht gefunden")

    parsed = parse_document_text(doc["text"])

    field = field.lower()
    if field not in ["vorname", "nachname", "verein"]:
        raise HTTPException(status_code=400, detail="Ungültiges Feld")

    values = {entry[field] for entry in parsed if entry.get(field)}

    q = q.lower().strip()
    if q:
        values = {v for v in values if q in v.lower()}

    return sorted(values)


cleanup_orphan_files()



