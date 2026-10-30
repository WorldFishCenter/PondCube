# An .xlsx as openpyxl reads it, as JSON, for scripts/check-workbook.ts: per sheet its frozen panes, merges,
# tables and cells ([kind, value, number format, fill, bold, comment]). Usage: xlsx-dump.py <file> [max rows]
import datetime
import json
import sys

import openpyxl

path, max_rows = sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else None


def cell(c):
    v = c.value
    kind = "date" if isinstance(v, datetime.datetime) else type(v).__name__
    fill = (c.fill.fgColor.rgb or "")[-6:] if c.fill.fill_type == "solid" else ""
    return [kind, v.strftime("%Y%m%d") if kind == "date" else v, c.number_format, fill, bool(c.font.b),
            c.comment.text if c.comment else None]


print(json.dumps([{
    "name": ws.title,
    "freeze": ws.freeze_panes,
    "merges": len(ws.merged_cells.ranges),
    "tables": [[t.name, t.ref, t.tableStyleInfo.name] for t in ws.tables.values()],
    "rows": [[cell(c) for c in row] for row in ws.iter_rows(max_row=max_rows)],
} for ws in openpyxl.load_workbook(path).worksheets]))
