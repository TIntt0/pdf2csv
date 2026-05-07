from flask import Blueprint, request, jsonify
from config import TEMP_DATA

table_bp = Blueprint('table', __name__, url_prefix='/table')

@table_bp.route('/save_map', methods=['POST'])
def save_map():
    """保存表格列映射（自动+手动）"""
    fid = request.form.get('fid', '')
    tid = request.form.get('tid', 0)
    try:
        tid = int(tid)
    except:
        tid = 0

    data = TEMP_DATA.get(fid)
    if not data:
        return jsonify({"status": "error", "msg": "数据不存在"})

    manual_map = {}
    for key, val in request.form.items():
        if key.startswith("map_"):
            table_col = key.replace("map_", "")
            if val:  # 只保存非空的映射
                manual_map[table_col] = val

    supplement_manual_map = {}
    for key, val in request.form.items():
        if key.startswith("supp_map_"):
            table_col = key.replace("supp_map_", "")
            if val:  # 只保存非空的映射
                supplement_manual_map[table_col] = val

    # 安全遍历
    for t in data.get("tables", []):
        if t.get("table_id") == tid:
            t["manual_map"] = manual_map
            t["supplement_manual_map"] = supplement_manual_map
            break

    return jsonify({"status": "success", "msg": "映射保存成功"})


@table_bp.route('/save_supplements', methods=['POST'])
def save_supplements():
    """保存手动补充列和补充表格数据"""
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"status": "error", "msg": "参数错误"})

    fid = data.get("fid", "")
    tid = data.get("tid", 0)
    supplements = data.get("supplements", [])
    supplement_data_rows = data.get("supplement_data_rows", [])
    supplement_headers = data.get("supplement_headers", [])
    supplement_auto_map = data.get("supplement_auto_map", {})
    supplement_manual_map = data.get("supplement_manual_map", {})

    if not fid or fid not in TEMP_DATA:
        return jsonify({"status": "error", "msg": "文件不存在"})

    # 安全遍历
    for t in TEMP_DATA[fid].get("tables", []):
        if t.get("table_id") == tid:
            t["manual_supplements"] = supplements
            if supplement_data_rows is not None:
                t["supplement_data_rows"] = supplement_data_rows
            if supplement_headers is not None:
                t["supplement_headers"] = supplement_headers
            if supplement_auto_map is not None:
                t["supplement_auto_map"] = supplement_auto_map
            if supplement_manual_map is not None:
                t["supplement_manual_map"] = supplement_manual_map
            break

    return jsonify({"status": "success", "msg": "补充列保存成功"})

@table_bp.route('/save_custom', methods=['POST'])
def save_custom():
    """保存自定义字段（催化剂/溶剂等）"""
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"status": "error", "msg": "参数错误"})

    fid = data.get("fid", "")
    custom_data = data.get("custom", {})

    if not fid or fid not in TEMP_DATA:
        return jsonify({"status": "error", "msg": "文件不存在"})

    TEMP_DATA[fid]["custom"] = custom_data
    return jsonify({"status": "success"})

@table_bp.route('/debug_supplement', methods=['GET'])
def debug_supplement():
    fid = request.args.get('fid', '')
    if not fid or fid not in TEMP_DATA:
        return jsonify({"status": "error", "msg": "文件不存在"})
    result = []
    for t in TEMP_DATA[fid].get("tables", []):
        info = {
            "table_id": t.get("table_id"),
            "has_supplement_data_rows": "supplement_data_rows" in t,
            "supplement_data_rows_count": len(t.get("supplement_data_rows", [])),
            "supplement_headers": t.get("supplement_headers", []),
            "supplement_auto_map": t.get("supplement_auto_map", {}),
            "supplement_manual_map": t.get("supplement_manual_map", {}),
        }
        if t.get("supplement_data_rows"):
            info["supplement_data_rows_first"] = t["supplement_data_rows"][0]
        result.append(info)
    return jsonify({"fid": fid, "tables": result})