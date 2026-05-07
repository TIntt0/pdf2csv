import os
import re
import pandas as pd
from flask import Blueprint, request, jsonify, send_file
from config import OUTPUT_FOLDER, TEMP_DATA, UPLOAD_FOLDER, TEMPLATE_PATH

export_bp = Blueprint('export', __name__, url_prefix='/export')

def clean_markdown_format(text):
    """清理Markdown/LaTeX格式，还原为普通文本"""
    if not text or not isinstance(text, str):
        return text

    # 清理 ${ ... }$ 或 $ ... $ 格式
    # 模式1: ${ \sf K } _ { 2 } { \sf C } 0 _ { 3 }$
    cleaned = text.strip()

    # 移除开头结尾的 $
    cleaned = re.sub(r'^\$|\$$', '', cleaned)
    # 移除 ${ 和 }$ 标记
    cleaned = re.sub(r'\${|}\$', '', cleaned)

    # 移除 \sf 等LaTeX命令
    cleaned = re.sub(r'\\sf\s+', '', cleaned)
    cleaned = re.sub(r'\\[a-zA-Z]+', '', cleaned)

    # 处理下标 _ { 2 } -> 2
    cleaned = re.sub(r'_\s*\{(\d+)\}', r'\1', cleaned)
    # 处理下标 _2 -> 2
    cleaned = re.sub(r'_(\d+)', r'\1', cleaned)
    # 处理空格大括号 { K } -> K
    cleaned = re.sub(r'\{\s*([A-Za-z0-9]+)\s*\}', r'\1', cleaned)

    # 移除多余空格
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
        final_map = {**table["auto_map"], **table.get("manual_map", {})}
        
        # 合并补充表的映射
        supplement_map = {}
        if "supplement_auto_map" in table:
            supplement_map.update(table["supplement_auto_map"])
        if "supplement_manual_map" in table:
            supplement_map.update(table["supplement_manual_map"])
        
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
                
                out_row = {c: "" for c in cols}
                out_row["Reaction ID"] = f"T{table['table_id']}_{idx}"
                out_row["Reaction DOI"] = data["doi"]
                out_row["Reaction Year"] = data["year"]

                # 处理原表数据
                for table_col, template_col in final_map.items():
                    if table_col in row and template_col in cols:
                        out_row[template_col] = clean_markdown_format(row[table_col])

                # 处理补充表数据
                if "supplement_data_rows" in table and idx <= len(table["supplement_data_rows"]):
                    supp_row = table["supplement_data_rows"][idx - 1]
                    for supp_col, template_col in supplement_map.items():
                        if supp_col in supp_row and template_col in cols:
                            # 如果原表没有数据，或者补充表有数据，使用补充表数据
                            if not out_row.get(template_col) or supp_row.get(supp_col):
                                out_row[template_col] = clean_markdown_format(supp_row[supp_col])

                all_rows.append(out_row)
        else:
            # 使用拆分后的数据
            for idx, row in enumerate(table["data_rows"], 1):
                out_row = {c: "" for c in cols}
                out_row["Reaction ID"] = f"T{table['table_id']}_{idx}"
                out_row["Reaction DOI"] = data["doi"]
                out_row["Reaction Year"] = data["year"]

                # 处理原表数据
                for table_col, template_col in final_map.items():
                    if table_col in row and template_col in cols:
                        out_row[template_col] = clean_markdown_format(row[table_col])

                # 处理补充表数据
                if "supplement_data_rows" in table and idx <= len(table["supplement_data_rows"]):
                    supp_row = table["supplement_data_rows"][idx - 1]
                    for supp_col, template_col in supplement_map.items():
                        # 如果原表没有数据，或者补充表有数据，使用补充表数据
                        if not out_row.get(template_col) or supp_row.get(supp_col):
                            out_row[template_col] = clean_markdown_format(supp_row[supp_col])

                all_rows.append(out_row)

    out_path = os.path.join(UPLOAD_FOLDER, f"{fid[:8]}_result.csv")
    pd.DataFrame(all_rows).to_csv(out_path, index=False, encoding="utf-8-sig")
    return send_file(out_path, as_attachment=True)
