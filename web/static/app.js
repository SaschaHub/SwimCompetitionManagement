let selectedDocumentId = null;
// ------------------------------
// DARK MODE
// ------------------------------
function applyTheme() {
    const theme = localStorage.getItem("theme") || "auto";
    if (theme === "dark") {
        document.body.classList.add("dark");
    } else if (theme === "light") {
        document.body.classList.remove("dark");
    } else {
        if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
            document.body.classList.add("dark");
        } else {
            document.body.classList.remove("dark");
        }
    }
}
function toggleTheme() {
    const current = localStorage.getItem("theme") || "auto";
    if (current === "auto") {
        localStorage.setItem("theme", "dark");
    } else if (current === "dark") {
        localStorage.setItem("theme", "light");
    } else {
        localStorage.setItem("theme", "auto");
    }
    applyTheme();
}
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);
// ---------------------------------------
// Hilfsfunktionen: Suchfelder / Vorschläge
// ---------------------------------------
function clearSearchFields() {
    document.getElementById("vornameInput").value = "";
    document.getElementById("nachnameInput").value = "";
    document.getElementById("vereinInput").value = "";
    clearSuggestions("vorname");
    clearSuggestions("nachname");
    clearSuggestions("verein");
}
function clearSuggestions(field) {
    const box = document.getElementById(field + "Suggestions");
    if (box) {
        box.innerHTML = "";
    }
}
// ---------------------------------------
// Dokumentliste laden
// ---------------------------------------
async function loadDocuments() {
    const res = await fetch("/documents");
    const docs = await res.json();
    const list = document.getElementById("documentList");
    list.innerHTML = "";
    const stillExists = docs.some(d => d.id === selectedDocumentId);
    if (!stillExists) {
        selectedDocumentId = null;
        enableSearch(false);
        document.getElementById("deleteButton").disabled = true;
        clearSearchFields();
    }
    docs.forEach(doc => {
        const li = document.createElement("li");
        li.textContent = doc.filename;
        li.onclick = () => {
            selectedDocumentId = doc.id;
            updateSelection(list, li);
            enableSearch(true);
            clearSearchFields();
        };
        list.appendChild(li);
    });
}
function updateSelection(list, selectedLi) {
    Array.from(list.children).forEach(li => {
        li.style.fontWeight = "normal";
        li.style.backgroundColor = "";
    });
    selectedLi.style.fontWeight = "bold";
    selectedLi.style.backgroundColor = "#eef";
    document.getElementById("deleteButton").disabled = false;
}
function enableSearch(enabled) {
    document.getElementById("vornameInput").disabled = !enabled;
    document.getElementById("nachnameInput").disabled = !enabled;
    document.getElementById("vereinInput").disabled = !enabled;
    document.getElementById("searchButton").disabled = !enabled;
    if (!enabled) {
        clearSearchFields();
    }
}
// ---------------------------------------
// Upload
// ---------------------------------------
async function uploadFile() {
    const input = document.getElementById("fileInput");
    if (!input.files.length) {
        alert("Bitte eine Datei auswählen.");
        return;
    }
    const formData = new FormData();
    formData.append("file", input.files[0]);
    const res = await fetch("/upload", {
        method: "POST",
        body: formData
    });
    if (!res.ok) {
        alert("Fehler beim Upload.");
        return;
    }
    await loadDocuments();
    input.value = "";
}
// ---------------------------------------
// Löschen
// ---------------------------------------
async function deleteSelected() {
    if (!selectedDocumentId) {
        alert("Bitte zuerst ein Dokument auswählen.");
        return;
    }
    if (!confirm("Dokument wirklich löschen?")) {
        return;
    }
    const res = await fetch(`/documents/${selectedDocumentId}`, {
        method: "DELETE"
    });
    if (!res.ok) {
        alert("Fehler beim Löschen.");
        return;
    }
    selectedDocumentId = null;
    enableSearch(false);
    clearSearchFields();
    await loadDocuments();
}
// ---------------------------------------
// Suche + Ergebnisfenster (ENDGÜLTIGE VERSION: ALLE SEITEN GEFÜLLT IM PDF)
// ---------------------------------------
async function searchDocument() {
    if (!selectedDocumentId) {
        alert("Bitte zuerst ein Dokument auswählen.");
        return;
    }

    const vorname = document.getElementById("vornameInput").value.trim();
    const nachname = document.getElementById("nachnameInput").value.trim();
    const verein = document.getElementById("vereinInput").value.trim();
    const params = new URLSearchParams({ vorname, nachname, verein });

    const win = window.open("", "_blank");
    if (!win) {
        alert("Pop-up wurde blockiert. Bitte erlaube Pop-ups für diese Seite in deinem Browser.");
        return;
    }

    win.document.write(`
        <html>
        <head><meta charset="UTF-8"><title>Suchergebnisse werden geladen...</title></head>
        <body style="font-family:Arial;margin:40px;"><h2>Suche läuft... Bitte warten.</h2></body>
        </html>
    `);
    win.document.close();

    try {
        const res = await fetch(`/search/${selectedDocumentId}?${params.toString()}`);
        if (!res.ok) {
            win.document.write("<h2>Fehler bei der Suche (Server-Fehler).</h2>");
            win.document.close();
            return;
        }

        const data = await res.json();
        const results = data.results || [];

        win.document.write(`
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Suchergebnisse</title>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
                <style>
                    body { font-family: Arial; margin: 20px; }
                    table { border-collapse: collapse; width: 100%; font-size: 9pt; page-break-inside: auto; }
                    tr { page-break-inside: avoid; page-break-after: auto; }
                    th, td { border: 1px solid #ccc; padding: 4px; text-align: left; vertical-align: top; }
                    th { cursor: pointer; background: #eee; user-select: none; white-space: nowrap; }
                    th:hover { background: #ddd; }
                    .export-buttons { margin: 15px 0; }
                    button { padding: 6px 12px; margin-right: 10px; cursor: pointer; }
                    .pagination { margin-top: 15px; }
                    .pagination button { padding: 6px 12px; margin-right: 10px; }
                    @media print {
                        .export-buttons, .pagination { display: none !important; }
                        th { background: #fff !important; }
                        td { border: 1px solid #000; }
                    }
                </style>
            </head>
            <body>
                <h1>Suchergebnisse</h1>
                <div class="export-buttons">
                    <button onclick="exportCSV()">CSV herunterladen</button>
                    <button onclick="downloadPDF()">PDF herunterladen</button>
                    <button onclick="printAll()">Drucken</button>
                </div>
                <table id="resultTable">
                    <thead>
                        <tr>
                            <th onclick="sortTable(0)">Verein</th>
                            <th onclick="sortTable(1)">Nachname</th>
                            <th onclick="sortTable(2)">Vorname</th>
                            <th onclick="sortTable(3)">Datum</th>
                            <th onclick="sortTable(4)">Abschnitt</th>
                            <th onclick="sortTable(5)">Wettkampf</th>
                            <th onclick="sortTable(6)">Lauf</th>
                            <th onclick="sortTable(7)">Bahn</th>
                            <th onclick="sortTable(8)">Jahrgang</th>
                            <th onclick="sortTable(9)">Meldezeit</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
                <div class="pagination">
                    <button onclick="prevPage()">◀ Vorherige Seite</button>
                    <button onclick="nextPage()">Nächste Seite ▶</button>
                    <span id="pageInfo"></span>
                </div>
                <script>
                    let sortDirection = true;
                    let lastSortedColumn = -1;
                    let allResults = ${JSON.stringify(results)};
                    let currentPage = 1;
                    const pageSize = 20;

                    function esc(value) {
                        if (value === null || value === undefined) return "";
                        return String(value)
                            .replace(/&/g, "&amp;")
                            .replace(/</g, "&lt;")
                            .replace(/>/g, "&gt;")
                            .replace(/"/g, "&quot;")
                            .replace(/'/g, "&#039;");
                    }

                    function renderPage() {
                        const tbody = document.querySelector("#resultTable tbody");
                        tbody.innerHTML = "";
                        const start = (currentPage - 1) * pageSize;
                        const end = start + pageSize;
                        const pageData = allResults.slice(start, end);
                        pageData.forEach(r => {
                            const row = document.createElement("tr");
                            const laufText = (r.lauf && r.lauf.lauf_nr && r.lauf.lauf_gesamt)
                                ? (r.lauf.lauf_nr + "/" + r.lauf.lauf_gesamt)
                                : "";
                            row.innerHTML = \`
                                <td>\${esc(r.verein)}</td>
                                <td>\${esc(r.nachname)}</td>
                                <td>\${esc(r.vorname)}</td>
                                <td>\${esc(r.abschnitt && r.abschnitt.datum)}</td>
                                <td>\${esc(r.abschnitt && r.abschnitt.nummer)}</td>
                                <td>\${esc(r.wettkampf && r.wettkampf.nummer)}</td>
                                <td>\${esc(laufText)}</td>
                                <td>\${esc(r.bahn)}</td>
                                <td>\${esc(r.jahrgang)}</td>
                                <td>\${esc(r.meldezeit)}</td>
                            \`;
                            tbody.appendChild(row);
                        });
                        const totalPages = Math.ceil(allResults.length / pageSize) || 1;
                        document.getElementById("pageInfo").innerText =
                            "Seite " + currentPage + " von " + totalPages;
                    }

                    function nextPage() {
                        const totalPages = Math.ceil(allResults.length / pageSize) || 1;
                        if (currentPage < totalPages) {
                            currentPage++;
                            renderPage();
                        }
                    }

                    function prevPage() {
                        if (currentPage > 1) {
                            currentPage--;
                            renderPage();
                        }
                    }

                    function sortTable(colIndex) {
                        if (lastSortedColumn === colIndex) {
                            sortDirection = !sortDirection;
                        } else {
                            sortDirection = true;
                            lastSortedColumn = colIndex;
                        }
                        allResults.sort((a, b) => {
                            function getColValue(obj, index) {
                                switch (index) {
                                    case 0: return (obj.verein || "").toLowerCase();
                                    case 1: return (obj.nachname || "").toLowerCase();
                                    case 2: return (obj.vorname || "").toLowerCase();
                                    case 3: return (obj.abschnitt && obj.abschnitt.datum || "").toLowerCase();
                                    case 4: return (obj.abschnitt && obj.abschnitt.nummer || "").toLowerCase();
                                    case 5: return (obj.wettkampf && obj.wettkampf.nummer || "").toLowerCase();
                                    case 6:
                                        if (obj.lauf && obj.lauf.lauf_nr && obj.lauf.lauf_gesamt) {
                                            return (obj.lauf.lauf_nr + "/" + obj.lauf.lauf_gesamt).toLowerCase();
                                        }
                                        return "";
                                    case 7: return (obj.bahn || "").toLowerCase();
                                    case 8: return (obj.jahrgang || "").toLowerCase();
                                    case 9: return (obj.meldezeit || "").toLowerCase();
                                    default: return "";
                                }
                            }
                            const A = getColValue(a, colIndex);
                            const B = getColValue(b, colIndex);
                            return sortDirection ? A.localeCompare(B) : B.localeCompare(A);
                        });
                        updateSortArrows(colIndex);
                        renderPage();
                    }

                    function updateSortArrows(colIndex) {
                        const headers = document.querySelectorAll("th");
                        headers.forEach((h, i) => {
                            h.innerText = h.innerText.replace(/ ▲| ▼/g, "");
                            if (i === colIndex) {
                                h.innerText += sortDirection ? " ▲" : " ▼";
                            }
                        });
                    }

                    function exportCSV() {
                        let csv = "Verein;Nachname;Vorname;Datum;Abschnitt;Wettkampf;Lauf;Bahn;Jahrgang;Meldezeit\\n";
                        allResults.forEach(r => {
                            const laufText = r.lauf ? \`\${r.lauf.lauf_nr}/\${r.lauf.lauf_gesamt}\` : "";
                            const row = [
                                r.verein || "",
                                r.nachname || "",
                                r.vorname || "",
                                r.abschnitt?.datum || "",
                                r.abschnitt?.nummer || "",
                                r.wettkampf?.nummer || "",
                                laufText,
                                r.bahn || "",
                                r.jahrgang || "",
                                r.meldezeit || ""
                            ].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(";");
                            csv += row + "\\n";
                        });
                        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = "ergebnisse.csv";
                        a.click();
                    }

                    // ENDLICH: PERFEKTER PDF-EXPORT MIT ALLEN SEITEN GEFÜLLT
                    function downloadPDF() {
                        const table = document.getElementById("resultTable");
                        const tbody = table.querySelector("tbody");
                        const originalHTML = tbody.innerHTML;

                        tbody.innerHTML = "";

                        allResults.forEach(r => {
                            const laufText = r.lauf ? \`\${r.lauf.lauf_nr}/\${r.lauf.lauf_gesamt}\` : "";
                            const row = document.createElement("tr");
                            row.innerHTML = \`
                                <td>\${esc(r.verein || "")}</td>
                                <td>\${esc(r.nachname || "")}</td>
                                <td>\${esc(r.vorname || "")}</td>
                                <td>\${esc(r.abschnitt?.datum || "")}</td>
                                <td>\${esc(r.abschnitt?.nummer || "")}</td>
                                <td>\${esc(r.wettkampf?.nummer || "")}</td>
                                <td>\${esc(laufText)}</td>
                                <td>\${esc(r.bahn || "")}</td>
                                <td>\${esc(r.jahrgang || "")}</td>
                                <td>\${esc(r.meldezeit || "")}</td>
                            \`;
                            tbody.appendChild(row);
                        });

                        // Wichtig für korrekte Seitenumbrüche
                        table.style.pageBreakInside = "auto";

                        setTimeout(() => {
                            html2pdf()
                                .from(table)
                                .set({
                                    margin: [5, 5, 10, 5],
                                    filename: "ergebnisse.pdf",
                                    html2canvas: { 
                                        scale: 2,
                                        useCORS: true,
                                        scrollY: 0,
                                        scrollX: 0,
                                        windowWidth: document.documentElement.offsetWidth,
                                        windowHeight: document.documentElement.offsetHeight
                                    },
                                    jsPDF: { 
                                        unit: "mm", 
                                        format: "a4", 
                                        orientation: "landscape"
                                    }
                                })
                                .save()
                                .then(() => {
                                    tbody.innerHTML = originalHTML;
                                    renderPage();
                                })
                                .catch(err => {
                                    console.error("PDF-Fehler:", err);
                                    alert("Fehler beim PDF-Export. Siehe Konsole.");
                                    tbody.innerHTML = originalHTML;
                                });
                        }, 2000); // 2 Sekunden warten – sicherheitshalber
                    }

                    function printAll() {
                        const tbody = document.querySelector("#resultTable tbody");
                        const original = tbody.innerHTML;
                        tbody.innerHTML = "";
                        allResults.forEach(r => {
                            const laufText = r.lauf ? \`\${r.lauf.lauf_nr}/\${r.lauf.lauf_gesamt}\` : "";
                            const row = document.createElement("tr");
                            row.innerHTML = \`
                                <td>\${esc(r.verein || "")}</td>
                                <td>\${esc(r.nachname || "")}</td>
                                <td>\${esc(r.vorname || "")}</td>
                                <td>\${esc(r.abschnitt?.datum || "")}</td>
                                <td>\${esc(r.abschnitt?.nummer || "")}</td>
                                <td>\${esc(r.wettkampf?.nummer || "")}</td>
                                <td>\${esc(laufText)}</td>
                                <td>\${esc(r.bahn || "")}</td>
                                <td>\${esc(r.jahrgang || "")}</td>
                                <td>\${esc(r.meldezeit || "")}</td>
                            \`;
                            tbody.appendChild(row);
                        });
                        window.print();
                        tbody.innerHTML = original;
                    }

                    renderPage();
                </script>
            </body>
            </html>
        `);
        win.document.close();
        clearSearchFields();

    } catch (error) {
        console.error("Fehler bei der Suche:", error);
        win.document.write("<h2>Technischer Fehler bei der Suche.</h2>");
        win.document.close();
    }
}
// ---------------------------------------
// Autovervollständigung
// ---------------------------------------
let autocompleteTimeout = null;
async function autocompleteField(field) {
    if (!selectedDocumentId) return;
    const input = document.getElementById(field + "Input");
    const box = document.getElementById(field + "Suggestions");
    const query = input.value.trim();
    clearTimeout(autocompleteTimeout);
    if (query.length < 1) {
        box.innerHTML = "";
        return;
    }
    autocompleteTimeout = setTimeout(async () => {
        const res = await fetch(`/autocomplete/${selectedDocumentId}?field=${field}&q=${encodeURIComponent(query)}`);
        if (!res.ok) {
            box.innerHTML = "";
            return;
        }
        const suggestions = await res.json();
        box.innerHTML = "";
        suggestions.forEach(value => {
            const div = document.createElement("div");
            div.textContent = value;
            div.onclick = () => {
                input.value = value;
                box.innerHTML = "";
            };
            box.appendChild(div);
        });
    }, 200);
}
// ---------------------------------------
// Seite geladen
// ---------------------------------------
window.onload = () => {
    applyTheme();
    loadDocuments();
    clearSearchFields();

    const searchButton = document.getElementById("searchButton");
    if (searchButton) {
        searchButton.addEventListener("click", searchDocument);
    }

    ["vornameInput", "nachnameInput", "vereinInput"].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener("keypress", (e) => {
                if (e.key === "Enter") {
                    searchDocument();
                }
            });
        }
    });
};
