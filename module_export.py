import os
import re
import pandas as pd
from flask import Blueprint, request, jsonify, send_file
from config import OUTPUT_FOLDER, TEMP_DATA, UPLOAD_FOLDER, TEMPLATE_PATH

export_bp = Blueprint('export', __name__, url_prefix='/export')

def clean_markdown_format(text):
    if not text or not isinstance(text, str):
        return text

    cleaned = text.strip()

    cleaned = re.sub(r'^\$|\$$', '', cleaned)
    cleaned = re.sub(r'\${|}\$', '', cleaned)

    cleaned = re.sub(r'\\sf\s+', '', cleaned)
    cleaned = re.sub(r'\\[a-zA-Z]+', '', cleaned)

    cleaned = re.sub(r'_\s*\{(\d+)\}', r'\1', cleaned)
    cleaned = re.sub(r'_(\d+)', r'\1', cleaned)
    cleaned = re.sub(r'\{\s*([A-Za-z0-9]+)\s*\}', r'\1', cleaned)

    cleaned = re.sub(r'\s+', '', cleaned)

    return cleaned

@export_bp.route('/generate', methods=['POST'])
def generate():
    fid = request.form['fid']
    data = TEMP_DATA.get(fid)
    if not data:
        return jsonify({"status": "error", "msg": "数据不存在"}), 400

    df_temp = pd.read_csv(TEMPLATE_PATH, encoding="utf-8-sig")
    cols = df_temp.columns.tolist()
    all_rows = []

    for table in data["tables"]:
        final_map = {
            **table.get("auto_map", {}), 
            **table.get("manual_map", {}),
            **table.get("supplement_auto_map", {}), 
            **table.get("supplement_manual_map", {})
        }
        
        manual_supplements = table.get("manual_supplements", [])
        
        use_original = table.get("use_original", False)
        if use_original and "original_headers" in table and "original_data_rows" in table:
            original_headers = table["original_headers"]
            original_data_rows = table["original_data_rows"]
            
            for idx, data_list in enumerate(original_data_rows, 1):
                row = {}
                for i, h in enumerate(original_headers):
                    if i < len(data_list):
                        row[h] = data_list[i]
                    else:
                        row[h] = ""
                
                if "supplement_data_rows" in table and idx <= len(table["supplement_data_rows"]):
                    supp_row = table["supplement_data_rows"][idx - 1]
                    if isinstance(supp_row, dict):
                        row.update(supp_row)
                
                out_row = {c: "" for c in cols}
                out_row["Reaction ID"] = f"T{table['table_id']}_{idx}"
                out_row["Reaction DOI"] = data["doi"]
                out_row["Reaction Year"] = data["year"]

                for table_col, template_col in final_map.items():
                    if table_col in row and template_col in cols:
                        out_row[template_col] = clean_markdown_format(row[table_col])

                for supp in manual_supplements:
                    if supp["column"] in cols:
                        out_row[supp["column"]] = supp["value"]

                all_rows.append(out_row)
        else:
            for idx, row in enumerate(table["data_rows"], 1):
                if "supplement_data_rows" in table and idx <= len(table["supplement_data_rows"]):
                    supp_row = table["supplement_data_rows"][idx - 1]
                    if isinstance(supp_row, dict):
                        row = {**row, **supp_row}
                
                out_row = {c: "" for c in cols}
                out_row["Reaction ID"] = f"T{table['table_id']}_{idx}"
                out_row["Reaction DOI"] = data["doi"]
                out_row["Reaction Year"] = data["year"]

                for table_col, template_col in final_map.items():
                    if table_col in row and template_col in cols:
                        out_row[template_col] = clean_markdown_format(row[table_col])

                for supp in manual_supplements:
                    if supp["column"] in cols:
                        out_row[supp["column"]] = supp["value"]

                all_rows.append(out_row)

    out_path = os.path.join(UPLOAD_FOLDER, f"{fid[:8]}_result.csv")
    pd.DataFrame(all_rows).to_csv(out_path, index=False, encoding="utf-8-sig")
    return send_file(out_path, as_attachment=True)
