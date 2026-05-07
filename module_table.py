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
            manual_map[table_col] = val

    supplement_manual_map = {}
    for key, val in request.form.items():
        if key.startswith("supp_map_"):
            table_col = key.replace("supp_map_", "")
            supplement_manual_map[table_col] = val

    # 安全遍历
    for t in data.get("tables", []):
        if t.get("table_id") == tid:
            t["manual_map"] = manual_map
            if supplement_manual_map:
                t["supplement_manual_map"] = supplement_manual_map
            break

    return jsonify({"status": "success", "msg": "映射保存成功"})


@table_bp.route('/save_supplements', methods=['POST'])
def save_supplements():
    """保存手动补充列"""
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"status": "error", "msg": "参数错误"})

    fid = data.get("fid", "")
    tid = data.get("tid", 0)
    supplements = data.get("supplements", [])

    if not fid or fid not in TEMP_DATA:
        return jsonify({"status": "error", "msg": "文件不存在"})

    # 安全遍历
    for t in TEMP_DATA[fid].get("tables", []):
        if t.get("table_id") == tid:
            t["manual_supplements"] = supplements
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