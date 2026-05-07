import os
import re
import pandas as pd
from flask import Blueprint, request, jsonify, send_file
from config import OUTPUT_FOLDER, TEMP_DATA, UPLOAD_FOLDER, TEMPLATE_PATH

edit_bp = Blueprint('edit', __name__, url_prefix='/edit')

def get_unmapped_columns(table_data, template_cols):
    """获取未映射的列（排除前四列）"""
    auto_map = table_data.get("auto_map", {})
    manual_map = table_data.get("manual_map", {})
    mapped = set(auto_map.values()) | set(manual_map.values())

    unmapped = [col for col in template_cols[4:] if col not in mapped]
    return unmapped

@edit_bp.route('/unmapped', methods=['POST'])
def get_unmapped():
    data = request.get_json()
    fid = data.get("fid")
    table_id = int(data.get("table_id", 0))

    if not fid or fid not in TEMP_DATA:
        return jsonify({"status": "error", "msg": "数据不存在"}), 400

    tables = TEMP_DATA[fid]["tables"]
    target_table = None
    for t in tables:
        if t.get("table_id") == table_id:
            target_table = t
            break

    if not target_table:
        return jsonify({"status": "error", "msg": "表格不存在"}), 400

    template_cols = TEMP_DATA[fid]["template_cols"]
    unmapped = get_unmapped_columns(target_table, template_cols)

    return jsonify({
        "status": "success",
        "unmapped": unmapped,
        "table": target_table
    })

@edit_bp.route('/save', methods=['POST'])
def save_edited_data():
    data = request.get_json()
    fid = data.get("fid")
    table_id = int(data.get("table_id", 0))
    edited_rows = data.get("rows", [])

    if not fid or fid not in TEMP_DATA:
        return jsonify({"status": "error", "msg": "数据不存在"}), 400

    if "edited_data" not in TEMP_DATA[fid]:
        TEMP_DATA[fid]["edited_data"] = {}

    TEMP_DATA[fid]["edited_data"][f"table_{table_id}"] = edited_rows

    return jsonify({"status": "success"})

@edit_bp.route('/generate', methods=['POST'])
def generate_from_edited():
    if request.is_json:
        data = request.get_json()
        fid = data.get("fid")
    else:
        fid = request.form.get("fid")

    if not fid or fid not in TEMP_DATA:
        return jsonify({"status": "error", "msg": "数据不存在"}), 400

    df_temp = pd.read_csv(TEMPLATE_PATH, encoding="utf-8-sig")
    cols = df_temp.columns.tolist()
    all_rows = []

    edited_data = TEMP_DATA[fid].get("edited_data", {})

    for table in TEMP_DATA[fid]["tables"]:
        table_id = table["table_id"]
        manual_supplements = table.get("manual_supplements", [])

        edited_key = f"table_{table_id}"
        if edited_key in edited_data:
            for row in edited_data[edited_key]:
                out_row = {c: "" for c in cols}
                out_row["Reaction ID"] = row.get("Reaction ID", f"T{table_id}_0")
                out_row["Reaction DOI"] = TEMP_DATA[fid]["doi"]
                out_row["Reaction Year"] = TEMP_DATA[fid]["year"]

                for col in cols[4:]:
                    out_row[col] = row.get(col, "")
                
                # 应用手动补充列
                for supp in manual_supplements:
                    if supp["column"] in cols:
                        out_row[supp["column"]] = supp["value"]

                all_rows.append(out_row)
        else:
            final_map = {
                **table.get("auto_map", {}),
                **table.get("manual_map", {}),
                **table.get("supplement_auto_map", {}),
                **table.get("supplement_manual_map", {})
            }
            
            # 确定使用哪个版本的数据
            use_original = table.get("use_original", False)
            if use_original and "original_headers" in table and "original_data_rows" in table:
                # 使用原始数据
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
                    
                    entry_value = ""
                    for h in original_headers:
                        if "entry" in h.lower():
                            entry_value = row.get(h, "")
                            break
                    
                    out_row["Reaction ID"] = entry_value if entry_value else f"T{table_id}_{idx}"
                    out_row["Reaction DOI"] = TEMP_DATA[fid]["doi"]
                    out_row["Reaction Year"] = TEMP_DATA[fid]["year"]

                    for table_col, template_col in final_map.items():
                        if table_col in row and template_col in cols:
                            text = row[table_col]
                            cleaned = re.sub(r"^\$|\$$", "", str(text) if text else "")
                            cleaned = re.sub(r"\${|}\$", "", cleaned)
                            cleaned = re.sub(r"\\sf\s+", "", cleaned)
                            cleaned = re.sub(r"\\[a-zA-Z]+", "", cleaned)
                            cleaned = re.sub(r"_\s*\{(\d+)\}", r"\1", cleaned)
                            cleaned = re.sub(r"_(\d+)", r"\1", cleaned)
                            cleaned = re.sub(r"\{\s*([A-Za-z0-9]+)\s*\}", r"\1", cleaned)
                            cleaned = re.sub(r"\s+", "", cleaned)

                            out_row[template_col] = cleaned
                    
                    for supp in manual_supplements:
                        if supp["column"] in cols:
                            out_row[supp["column"]] = supp["value"]

                    all_rows.append(out_row)
            else:
                # 使用拆分后的数据
                for idx, row in enumerate(table["data_rows"], 1):
                    if "supplement_data_rows" in table and idx <= len(table["supplement_data_rows"]):
                        supp_row = table["supplement_data_rows"][idx - 1]
                        if isinstance(supp_row, dict):
                            row = {**row, **supp_row}
                    
                    out_row = {c: "" for c in cols}
                    
                    entry_value = ""
                    for h in table["headers"]:
                        if "entry" in h.lower():
                            entry_value = row.get(h, "")
                            break
                    
                    out_row["Reaction ID"] = entry_value if entry_value else f"T{table_id}_{idx}"
                    out_row["Reaction DOI"] = TEMP_DATA[fid]["doi"]
                    out_row["Reaction Year"] = TEMP_DATA[fid]["year"]

                    for table_col, template_col in final_map.items():
                        if table_col in row and template_col in cols:
                            text = row[table_col]
                            cleaned = re.sub(r"^\$|\$$", "", str(text) if text else "")
                            cleaned = re.sub(r"\${|}\$", "", cleaned)
                            cleaned = re.sub(r"\\sf\s+", "", cleaned)
                            cleaned = re.sub(r"\\[a-zA-Z]+", "", cleaned)
                            cleaned = re.sub(r"_\s*\{(\d+)\}", r"\1", cleaned)
                            cleaned = re.sub(r"_(\d+)", r"\1", cleaned)
                            cleaned = re.sub(r"\{\s*([A-Za-z0-9]+)\s*\}", r"\1", cleaned)
                            cleaned = re.sub(r"\s+", "", cleaned)

                            out_row[template_col] = cleaned
                    
                    for supp in manual_supplements:
                        if supp["column"] in cols:
                            out_row[supp["column"]] = supp["value"]

                    all_rows.append(out_row)

    out_path = os.path.join(UPLOAD_FOLDER, f"{fid[:8]}_result.csv")
    pd.DataFrame(all_rows).to_csv(out_path, index=False, encoding="utf-8-sig")
    return send_file(out_path, as_attachment=True)
