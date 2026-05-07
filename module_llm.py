import os
import base64
import re
from openai import OpenAI
from flask import Blueprint, request, jsonify
from config import OUTPUT_FOLDER, LLM_BASE_URL, LLM_MODEL, LLM_API_KEY, TEMPLATE_PATH
import pandas as pd

llm_bp = Blueprint('llm', __name__, url_prefix='/llm')

def get_template_cols():
    """获取模板列名"""
    df = pd.read_csv(TEMPLATE_PATH, encoding="utf-8-sig")
    return df.columns.tolist()

def get_openai_client():
    return OpenAI(base_url=LLM_BASE_URL, api_key="dummy_key")

def encode_image(img_path):
    with open(img_path, "rb") as f:
        return base64.b64encode(f.read()).decode()

def llm_analyse_with_inputs(fid, img_name=None, note_text="", custom_prompt="", return_json=False):
    content = []

    if img_name:
        img_path = os.path.join(OUTPUT_FOLDER, fid, "auto", "images", img_name)
        if os.path.exists(img_path):
            b64 = encode_image(img_path)
            content.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{b64}"}
            })

    template_cols = get_template_cols()
    prompt_parts = []
    if note_text and note_text != "无表注":
        prompt_parts.append(f"表注信息：{note_text}")
    if custom_prompt:
        prompt_parts.append(custom_prompt)
    if not prompt_parts:
        prompt_parts.append("分析化学反应条件、催化剂、温度、时间、溶剂。")

    if return_json:
        # 添加JSON格式要求
        json_cols = [col for col in template_cols[4:]]  # 排除前四列
        prompt_parts.append(f"""
请以JSON数组格式返回数据，每个对象对应一行数据。
列名按以下顺序（只包含其中找到的：{json_cols}
只返回纯JSON数组，不要Markdown格式说明。
示例：
[
    {{
        "Column1": "value1", "Column2": "value2"}},
    {{
        "Column1": "value3", "Column2": "value4"}}
]
""")

    full_prompt = "。".join(prompt_parts)
    content.insert(0, {"type": "text", "text": full_prompt})

    try:
        client = get_openai_client()
        response = client.chat.completions.create(
            model=LLM_MODEL,
            messages=[{"role": "user", "content": content}],
            max_tokens=3000,
            temperature=0
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"分析失败：{str(e)}"

@llm_bp.route('/analyse', methods=['POST'])
def analyse():
    data = request.json
    fid = data.get("fid", "")
    img = data.get("img", "")
    note = data.get("note", "")
    custom = data.get("custom_prompt", "")
    # 检测是否需要JSON格式
    return_json = "JSON" in (custom or "")

    result = llm_analyse_with_inputs(fid, img, note, custom, return_json=return_json)
    return jsonify({"result": result})

@llm_bp.route('/batch_analyse', methods=['POST'])
def batch_analyse():
    data = request.json
    fid = data.get("fid", "")
    imgs = data.get("imgs", [])
    note = data.get("note", "")
    custom = data.get("custom_prompt", "")

    if not fid or not imgs:
        return jsonify({"result": "参数错误：fid或图片列表不能为空"}), 400

    results = []
    for img_name in imgs:
        results.append(f"【{img_name}】\n{llm_analyse_with_inputs(fid, img_name, note, custom)}")

    return jsonify({"result": "\n\n".join(results)})

@llm_bp.route("/chat", methods=["POST"])
def chat():
    data = request.json
    fid = data.get("fid", "")
    prompt = data.get("prompt", "")
    img_name = data.get("img", "")

    md_content = ""
    md_path = os.path.join(OUTPUT_FOLDER, fid, "auto", f"{fid}.md")
    if os.path.exists(md_path):
        with open(md_path, "r", encoding="utf-8") as f:
            md_content = f.read()[:5000]

    system_prompt = f"""你是一位专业的化学文献分析助手。以下是从PDF提取的Markdown内容，请基于此内容回答问题：

---
{md_content}
---

请根据以上内容回答问题，如果内容中没有相关信息，请说明"根据当前文档，无法回答此问题。"。
"""

    content = [{"type": "text", "text": system_prompt + "\n\n问题：" + prompt}]
    if img_name:
        img_path = os.path.join(OUTPUT_FOLDER, fid, "auto", "images", img_name)
        if os.path.exists(img_path):
            b64 = encode_image(img_path)
            content.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{b64}"}
            })

    try:
        client = get_openai_client()
        response = client.chat.completions.create(
            model=LLM_MODEL,
            messages=[{"role": "user", "content": content}],
            max_tokens=2000,
            temperature=0
        )
        reply = response.choices[0].message.content
        return jsonify({"reply": reply})
    except Exception as e:
        return jsonify({"reply": f"对话失败：{str(e)}"})

@llm_bp.route('/extract_from_note', methods=['POST'])
def extract_from_note():
    data = request.json
    note_text = data.get("note_text", "")
    custom_prompt = data.get("custom_prompt", "")

    template_cols = get_template_cols()
    prompt_parts = ["从以下表注中提取化学反应条件："]
    if note_text:
        prompt_parts.append(f"\n表注内容：{note_text}")
    if custom_prompt:
        prompt_parts.append(f"\n额外要求：{custom_prompt}")

    prompt_parts.append(f"""
可用的列名有：{[col for col in template_cols[4:]]}
请以JSON数组格式返回数据。
""")

    try:
        client = get_openai_client()
        response = client.chat.completions.create(
            model=LLM_MODEL,
            messages=[{"role": "user", "content": "".join(prompt_parts)}],
            max_tokens=3000,
            temperature=0
        )
        return jsonify({"result": response.choices[0].message.content})
    except Exception as e:
        return jsonify({"result": f"提取失败：{str(e)}"})


def extract_conditions_from_note(note_text):
    """从表注中提取固定条件"""
    conditions = {}
    
    note_text = note_text.replace('；', ';').replace('，', ',').replace('。', '.')
    
    # 提取压力 (bar/atm/psi)
    pressure_match = re.search(r'(\d+\.?\d*)\s*(bar|atm|psi)', note_text, re.IGNORECASE)
    if pressure_match:
        value = float(pressure_match.group(1))
        unit = pressure_match.group(2).lower()
        # 转换为 atm
        if unit == 'bar':
            value = value * 0.986923
        elif unit == 'psi':
            value = value * 0.068046
        conditions['Step Pressure (atm) 1'] = f"{value:.2f}"
    
    # 提取温度 (°C/C/k/K)
    temp_match = re.search(r'(\d+)\s*°?\s*[CcKk]', note_text)
    if temp_match:
        temp_value = temp_match.group(1)
        conditions['Step Temperature (C) 1'] = temp_value
    
    # 提取时间 (h/min/s)
    time_match = re.search(r'(\d+\.?\d*)\s*(h|hour|min|minute|s|second)', note_text, re.IGNORECASE)
    if time_match:
        time_value = time_match.group(1)
        time_unit = time_match.group(2).lower()
        if time_unit in ['min', 'minute']:
            time_value = str(float(time_value) / 60)
        elif time_unit in ['s', 'second']:
            time_value = str(float(time_value) / 3600)
        conditions['Step Reaction Time (h) 1'] = time_value
    
    # 提取气氛 (H2/N2/Ar/空气等)
    atmosphere_patterns = ['H2', 'hydrogen', 'N2', 'nitrogen', 'Ar', 'argon', 'air', 'O2', 'oxygen']
    for gas in atmosphere_patterns:
        if gas.lower() in note_text.lower():
            conditions['Step Atmosphere 1'] = gas
            break
    
    # 提取溶剂
    solvent_match = re.search(r'solvent\s*[::=]\s*([^;,.]+)', note_text, re.IGNORECASE)
    if not solvent_match:
        solvent_match = re.search(r'solvent:\s*([^;,.]+)', note_text, re.IGNORECASE)
    if not solvent_match:
        solvent_match = re.search(r';\s*([^;,.]+solvent[^;,.]+)', note_text, re.IGNORECASE)
    if solvent_match:
        conditions['Solvent Name 1'] = solvent_match.group(1).strip()
    
    # 提取催化剂
    catalyst_match = re.search(r'(catalyst|cat)\s*[::=]\s*([^;,.]+)', note_text, re.IGNORECASE)
    if catalyst_match:
        conditions['Catalyst Name 1'] = catalyst_match.group(2).strip()
    
    # 提取配体
    ligand_match = re.search(r'(ligand|L)\s*[::=]\s*([^;,.]+)', note_text, re.IGNORECASE)
    if ligand_match:
        conditions['Catalyst Ligand Name 1'] = ligand_match.group(2).strip()
    
    return conditions

@llm_bp.route('/generate_supplement_table', methods=['POST'])
def generate_supplement_table():
    """生成补充表格：从表注中提取固定条件"""
    data = request.json
    fid = data.get("fid", "")
    tid = data.get("tid", 0)
    note_text = data.get("note_text", "")
    custom_prompt = data.get("custom_prompt", "")
    row_count = data.get("row_count", 0)

    from config import TEMP_DATA
    temp_data = TEMP_DATA.get(fid)
    if not temp_data:
        return jsonify({"status": "error", "msg": "数据不存在"}), 400

    conditions = extract_conditions_from_note(note_text)
    
    if not conditions:
        return jsonify({"status": "error", "msg": "未能从表注中提取到任何条件"})
    
    supplement_columns = list(conditions.keys())
    supplement_values = conditions
    
    # 生成补充表格数据
    supplement_data = []
    for _ in range(row_count):
        row = {}
        for col in supplement_columns:
            row[col] = supplement_values.get(col, "")
        supplement_data.append(row)

    # 获取模板列名用于自动映射
    template_cols = get_template_cols()
    
    # 自动映射：如果补充列名在模板列中存在，则自动映射
    supplement_auto_map = {}
    for col in supplement_columns:
        if col in template_cols:
            supplement_auto_map[col] = col
    
    # 保存到临时数据中
    for t in temp_data.get("tables", []):
        if t.get("table_id") == tid:
            t["supplement_headers"] = supplement_columns
            t["supplement_data_rows"] = supplement_data
            t["supplement_auto_map"] = supplement_auto_map  # 自动映射
            t["supplement_manual_map"] = {}  # 补充表的手动映射
            break

    return jsonify({
        "status": "success",
        "supplement_headers": supplement_columns,
        "supplement_data": supplement_data,
        "supplement_auto_map": supplement_auto_map
    })
