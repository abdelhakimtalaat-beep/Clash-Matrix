"""Generate a SYNTHETIC clash matrix for development and tests.

This is not a real project matrix. It only exercises importer features:
merged discipline headers, Arabic + English labels, fill colours, blank cells,
a formula cell, an unknown code, a duplicate system label and a title block
above the header row.
"""
import sys
from openpyxl import Workbook
from openpyxl.styles import PatternFill, Alignment, Font

out = sys.argv[1] if len(sys.argv) > 1 else "sample-matrix.xlsx"

# (discipline, label)
systems = [
    ("Architecture", "Walls"),
    ("Architecture", "Floors"),
    ("Structure", "Beams"),
    ("Structure", "Columns"),
    ("Mechanical", "Large Ducts"),
    ("Mechanical", "Chilled Water Pipes"),
    ("Fire", "Main Fire Pipes"),
    ("Electrical", "Cable Trays and Conduits"),
    ("Electrical", "أنظمة الإنارة"),  # Arabic label
    ("Electrical", "Walls"),  # duplicate label under another discipline
]
n = len(systems)

# code, fill colour (None = no fill)
FILL = {"H": "FFC7CE", "C": "FFEB9C", "S": "C6EFCE", "X": "D9D9D9"}

wb = Workbook()
ws = wb.active
ws.title = "Clash Matrix"
ws["A1"] = "PROJECT CLASH MATRIX (SYNTHETIC SAMPLE)"
ws["A1"].font = Font(bold=True, size=14)
ws["A2"] = "Legend: H = hard, C = clearance, S = soft/skip, X = no test"

HEADER_ROW = 5
DISC_ROW = 4
LABEL_COL = 2  # B
DISC_COL = 1  # A
FIRST_DATA_COL = 3  # C

# discipline merged header over columns
def merge_runs(items):
    runs, start = [], 0
    for i in range(1, len(items) + 1):
        if i == len(items) or items[i][0] != items[start][0]:
            runs.append((items[start][0], start, i - 1))
            start = i
    return runs

for disc, s, e in merge_runs(systems):
    c1 = FIRST_DATA_COL + s
    c2 = FIRST_DATA_COL + e
    ws.cell(row=DISC_ROW, column=c1, value=disc)
    if c2 > c1:
        ws.merge_cells(start_row=DISC_ROW, start_column=c1, end_row=DISC_ROW, end_column=c2)
    ws.cell(row=DISC_ROW, column=c1).alignment = Alignment(horizontal="center")

for j, (_, label) in enumerate(systems):
    ws.cell(row=HEADER_ROW, column=FIRST_DATA_COL + j, value=label).alignment = Alignment(
        text_rotation=90, horizontal="center"
    )

for disc, s, e in merge_runs(systems):
    r1 = HEADER_ROW + 1 + s
    r2 = HEADER_ROW + 1 + e
    ws.cell(row=r1, column=DISC_COL, value=disc)
    if r2 > r1:
        ws.merge_cells(start_row=r1, start_column=DISC_COL, end_row=r2, end_column=DISC_COL)

for i, (_, label) in enumerate(systems):
    ws.cell(row=HEADER_ROW + 1 + i, column=LABEL_COL, value=label)

# upper triangle relationships, rest blank (asymmetric on purpose in two spots)
rel = {
    (0, 2): "H", (0, 3): "H", (0, 4): "H", (0, 5): "C", (0, 6): "H", (0, 7): "C",
    (1, 2): "H", (1, 4): "H", (1, 6): "H",
    (2, 3): "S", (2, 4): "H", (2, 5): "H", (2, 6): "H", (2, 7): "C",
    (3, 4): "H", (3, 6): "H",
    (4, 5): "C", (4, 6): "H", (4, 7): "C", (4, 8): "C",
    (5, 6): "H", (5, 7): "C",
    (6, 7): "H",
    (7, 8): "X",
    (3, 5): "Q",          # unknown code on purpose
    (8, 9): "=\"C\"",     # formula cell
}
for (i, j), code in rel.items():
    c = ws.cell(row=HEADER_ROW + 1 + i, column=FIRST_DATA_COL + j, value=code)
    c.alignment = Alignment(horizontal="center")
    fill = FILL.get(code)
    if fill:
        c.fill = PatternFill("solid", fgColor=fill)
# directional pair on purpose: (4,2) mirrors (2,4) with a different code
ws.cell(row=HEADER_ROW + 1 + 4, column=FIRST_DATA_COL + 2, value="C").fill = PatternFill(
    "solid", fgColor=FILL["C"]
)

ws.column_dimensions["B"].width = 30
wb.save(out)
print("wrote", out)
