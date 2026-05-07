import os
import re
import base64
import pandas as pd
from bs4 import BeautifulSoup
from config import OUTPUT_FOLDER, FILTER_SIZE, TEMPLATE_PATH

def get_valid_images(fid):
    """获取有效提取的图片（模块3用）"""
    img_dir = os.path.join(OUTPUT_FOLDER, fid, 'auto', "images")
    valid = []
    if not os.path.exists(img_dir):
        return valid
    for f in sorted(os.listdir(img_dir)):
        p = os.path.join(img_dir, f)
        if os.path.isfile(p) and os.path.getsize(p) >= FILTER_SIZE:
            valid.append(f)
    return valid

def read_md_content(fid):
    """读取mineru输出的md文件（模块1用）"""
    md_name = f'{fid}.md'
    md_path = os.path.join(OUTPUT_FOLDER, fid, 'auto', md_name)
    if not os.path.exists(md_path):
        return ""
    with open(md_path, "r", encoding="utf-8") as f:
        return f.read()



import re
from bs4 import BeautifulSoup

def parse_md_tables(md_text):
    """从 MD 文本解析表格（模块1/2用）- 适配你的MD格式提取标题和表注，自动剔除列数异常行并提示删除行数"""
    tables = []
    table_id = 1

    # 先把整个MD按行拆分，保留行号
    lines = md_text.splitlines()

    # 1. 解析 HTML 表格
    soup = BeautifulSoup(md_text, "html.parser")
    html_tables = soup.find_all("table")
    for table in html_tables:
        rows = []
        for tr in table.find_all("tr"):
            cells = []
            for td in tr.find_all(["td", "th"]):
                cell_text = td.get_text(strip=True).strip("[]{}()")
                cells.append(cell_text)
            if cells:
                rows.append(cells)

        # 只保留 Entry 开头的表格
        entry_idx = -1
        for i, row in enumerate(rows):
            if row and "Entry" in row[0]:
                entry_idx = i
                break
        if entry_idx == -1:
            continue
        rows = rows[entry_idx:]

        def final_perfect_split(text, is_header=False):
            """
            终极规则：
            1. $...$ 公式 → 整块保留
            2. ( 和 [ 前面空格不拆分
            3. ) 和 ] 后面空格要拆分
            4. 表头行（is_header=True）中间空格不拆分
            """
            if not text.strip():
                return []

            blocks = []
            def replace_block(match):
                blocks.append(match.group(0))
                return f"@@{len(blocks)-1}@@"
            processed = re.sub(r'\$[^$]+\$', replace_block, text)

            result = []
            current = ""
            i = 0
            while i < len(processed):
                if processed[i] == ' ':
                    if i + 1 < len(processed) and processed[i+1] in '([':
                        current += ' '
                        i += 1
                    elif i > 0 and processed[i-1] in ')]':
                        if current.strip():
                            result.append(current.strip())
                        current = ""
                        i += 1
                    elif is_header and current and current[-1] != ' ':
                        if current.strip():
                            result.append(current.strip())
                        current = ""
                        i += 1
                    else:
                        current += ' '
                        i += 1
                else:
                    current += processed[i]
                    i += 1
            if current.strip():
                result.append(current.strip())

            final_result = []
            for piece in result:
                for idx, b in enumerate(blocks):
                    piece = piece.replace(f"@@{idx}@@", b)
                final_result.append(piece.strip())
            return [p for p in final_result if p]

        # 处理所有行（先保存原始数据）
        original_headers = [cell for cell in rows[0]] if rows else []
        original_data_rows = []
        for row in rows:
            original_data_rows.append([cell for cell in row])

        final_rows = []
        for idx, row in enumerate(rows):
            nr = []
            for cell in row:
                nr.extend(final_perfect_split(cell, is_header=(idx == 0)))
            final_rows.append(nr)
        rows = final_rows

        # ===================== 过滤列数不一致的行 + 统计删除行数 =====================
        del_cnt = 0
        standard_col_count = 0
        origin_row_cnt = 0
        if len(rows) > 0:
            standard_col_count = len(rows[0])
            origin_row_cnt = len(rows)
            valid_rows = [rows[0]]  # 保留表头
            del_cnt = 0
            for row in rows[1:]:
                if len(row) == standard_col_count:
                    valid_rows.append(row)
                else:
                    del_cnt += 1
            rows = valid_rows
            print(f"【HTML表格 table_id:{table_id}】标准列数:{standard_col_count}，原始行数:{origin_row_cnt}，删除畸形行:{del_cnt} 行")
        # ======================================================================

        # ===================== 行号定位法：无视空行提取标题 + 表注 =====================
        caption = "无标题"
        note = "无表注"

        # 找到 <table> 所在行号
        table_html = str(table)
        table_line_idx = -1
        for idx, line in enumerate(lines):
            if table_html in line:
                table_line_idx = idx
                break

        if table_line_idx != -1:
            # 向上找标题（跳过空行）
            for i in range(table_line_idx - 1, max(-1, table_line_idx - 10), -1):
                line = lines[i].strip()
                if not line:
                    continue
                if re.match(r"Table\s+\d+[.:]?\s*", line, re.IGNORECASE):
                    caption = line
                    break

            # 向下找表注（跳过空行）
            note_parts = []
            for i in range(table_line_idx + 1, min(len(lines), table_line_idx + 10)):
                line = lines[i].strip()
                if not line:
                    continue
                if re.match(r"^[a-z](\s|\)|\.)", line, re.IGNORECASE) or \
                   re.match(r"^\([a-z]\)", line, re.IGNORECASE) or \
                   re.match(r"^\[[a-z]\]", line, re.IGNORECASE) or \
                   re.match(r"^[*_][a-z][*_](\s|\)|\.)", line, re.IGNORECASE) or \
                   re.match(r"^\$[a-z]\$(\s|\)|\.)", line) or \
                   re.match(r"^\\text[a-z]*\{[a-z]\}(\s|\)|\.)", line):
                    note_parts.append(line)
            if note_parts:
                note = "\n".join(note_parts)
        # ==================================================================================

        if len(rows) >= 1:
            headers = rows[0]
            data_rows = []
            for r in rows[1:]:
                row_dict = {}
                for i, h in enumerate(headers):
                    row_dict[h] = r[i] if i < len(r) else ""
                data_rows.append(row_dict)
            tables.append({
                "table_id": table_id,
                "caption": caption if caption else "无标题",
                "note": note if note else "无表注",
                "headers": headers,
                "data_rows": data_rows,
                "original_headers": original_headers,
                "original_data_rows": [[cell for cell in r] for r in original_data_rows[1:]] if len(original_data_rows) > 1 else [],
                "auto_map": {},
                "manual_map": {},
                "standard_col_count": standard_col_count if len(rows) > 0 else 0,
                "original_row_count": origin_row_cnt if len(rows) > 0 else 0,
                "deleted_row_count": del_cnt
            })
            table_id += 1

    # 2. 解析 Markdown 表格
    lines = md_text.splitlines()
    current_table = []
    in_table = False
    table_start_line = -1
    for i, line in enumerate(lines):
        line_strip = line.strip()
        if line_strip.startswith("|") and line_strip.endswith("|"):
            if not in_table:
                in_table = True
                table_start_line = i
            current_table.append(line_strip)
        else:
            if in_table and len(current_table) > 0:
                md_rows = []
                for tr in current_table:
                    cells = [c.strip() for c in tr.split("|")[1:-1]]
                    if all(c in "-:" for c in cells[:1]):
                        continue
                    md_rows.append(cells)
                
                # ===================== 过滤列数不一致的行 + 统计删除行数 =====================
                del_cnt = 0
                standard_col_count = 0
                origin_row_cnt = 0
                original_md_headers = [cell for cell in md_rows[0]] if md_rows else []
                original_md_data_rows = [[cell for cell in r] for r in md_rows[1:]] if len(md_rows) > 1 else []
                if len(md_rows) > 0:
                    standard_col_count = len(md_rows[0])
                    origin_row_cnt = len(md_rows)
                    valid_md_rows = [md_rows[0]]
                    del_cnt = 0
                    for row in md_rows[1:]:
                        if len(row) == standard_col_count:
                            valid_md_rows.append(row)
                        else:
                            del_cnt += 1
                    md_rows = valid_md_rows
                    print(f"【MD表格 table_id:{table_id}】标准列数:{standard_col_count}，原始行数:{origin_row_cnt}，删除畸形行:{del_cnt} 行")
                # ======================================================================

                if len(md_rows) >= 1:
                    # 行号定位：向上找标题
                    caption = "无标题"
                    for j in range(table_start_line - 1, max(-1, table_start_line - 10), -1):
                        l = lines[j].strip()
                        if not l:
                            continue
                        if re.match(r"Table\s+\d+[.:]?\s*", l, re.IGNORECASE):
                            caption = l
                            break

                    # 行号定位：向下找表注
                    note_parts = []
                    table_end_line = i
                    for j in range(table_end_line + 1, min(len(lines), table_end_line + 10)):
                        l = lines[j].strip()
                        if not l:
                            continue
                        if re.match(r"^[a-z](\s|\)|\.)", l, re.IGNORECASE) or \
                           re.match(r"^\([a-z]\)", l, re.IGNORECASE) or \
                           re.match(r"^\[[a-z]\]", l, re.IGNORECASE) or \
                           re.match(r"^[*_][a-z][*_](\s|\)|\.)", l, re.IGNORECASE) or \
                           re.match(r"^\$[a-z]\$(\s|\)|\.)", l) or \
                           re.match(r"^\\text[a-z]*\{[a-z]\}(\s|\)|\.)", l):
                            note_parts.append(l)
                    note = "\n".join(note_parts) if note_parts else "无表注"

                    headers = md_rows[0]
                    data_rows = []
                    for r in md_rows[1:]:
                        row_dict = {}
                        for k, h in enumerate(headers):
                            row_dict[h] = r[k] if k < len(r) else ""
                        data_rows.append(row_dict)
                    tables.append({
                        "table_id": table_id,
                        "caption": caption if caption else "无标题",
                        "note": note if note else "无表注",
                        "headers": headers,
                        "data_rows": data_rows,
                        "original_headers": original_md_headers,
                        "original_data_rows": [[cell for cell in r] for r in original_md_data_rows],
                        "auto_map": {},
                        "manual_map": {},
                        "standard_col_count": standard_col_count,
                        "original_row_count": origin_row_cnt,
                        "deleted_row_count": del_cnt
                    })
                    table_id += 1
                current_table = []
                in_table = False
                table_start_line = -1
    return tables

import re

def auto_map_columns(headers, template_cols):
    """自动列映射（模块2用）—— 已升级：新增配体、底物、产物、碱、压力映射 + 压力自动换算为 atm"""
    auto_map = {}
    
    # 压力单位换算系数（全部转为 atm）
    PRESSURE_UNITS = {
        "atm": 1.0,
        "bar": 0.986923,  # 1 bar = 0.986923 atm
        "psi": 0.068046,  # 1 psi = 0.068046 atm
        "mmhg": 0.00131579,# 1 mmHg = 0.00131579 atm
        "torr": 0.00131579
    }

    for header in headers:
        h_clean = re.sub(r"\(.*?\)|\[.*?\]|\s+", "", header).lower()
        h_full = header.strip().lower()  # 保留完整内容，用于压力判断

        # ===================== 跳过不需要映射的列 =====================
        # 防止entry、index这类通用列被误匹配
        if any(keyword in h_clean for keyword in ["entry", "index", "no", "num"]):
            continue

        # ===================== 1. 优先匹配ee，避免被yield误匹配 =====================
        if "ee" in h_clean or "enantiomeric" in h_clean:
            for col in template_cols:
                col_lower = col.lower()
                # 必须同时包含ee和%，且不能包含yield，避免交叉匹配
                if "ee" in col_lower and "%" in col_lower and "yield" not in col_lower:
                    auto_map[header] = col
                    break

        # ===================== 2. 再匹配yield =====================
        elif "yield" in h_clean or ("%" in header and "product" in h_clean):
            for col in template_cols:
                col_lower = col.lower()
                # 必须同时包含yield和%，且不能包含ee，避免交叉匹配
                if "yield" in col_lower and "%" in col_lower and "ee" not in col_lower:
                    auto_map[header] = col
                    break

        # ===================== 3. 其他原有映射（温度、时间） =====================
        elif "temp" in h_clean or "°c" in header or "k" in header:
            for col in template_cols:
                if "temperature" in col.lower() and "c" in col.lower():
                    auto_map[header] = col
                    break

        elif "time" in h_clean or "h" in header:
            for col in template_cols:
                if "reaction time" in col.lower() and "h" in col.lower():
                    auto_map[header] = col
                    break

        # ===================== 宽松匹配：配体 / 底物 / 产物 / 碱 =====================
        # L / Ligand → 只要模板列包含 catalyst ligand name 就映射
        elif any(k in h_clean for k in ["ligand", "l", "l1", "l2", "l3"]):
            for col in template_cols:
                col_lower = col.lower()
                if "catalyst" in col_lower and "ligand" in col_lower and "name" in col_lower:
                    auto_map[header] = col
                    break

        # Substrate / S / Reactant → 模板列包含 reactant name 就映射
        elif any(k in h_clean for k in ["substrate", "s", "reactant"]):
            for col in template_cols:
                col_lower = col.lower()
                if "reactant" in col_lower and "name" in col_lower:
                    auto_map[header] = col
                    break

        # Product → 模板列包含 product name 就映射
        elif "product" in h_clean and "yield" not in h_clean:
            for col in template_cols:
                col_lower = col.lower()
                if "product" in col_lower and "name" in col_lower:
                    auto_map[header] = col
                    break

        # Base → 模板列包含 additive name 就映射
        elif "base" in h_clean:
            for col in template_cols:
                col_lower = col.lower()
                if "additive" in col_lower and "name" in col_lower:
                    auto_map[header] = col
                    break

        # ===================== 压力映射（宽松匹配） =====================
        elif any(k in h_full for k in ["pressure", "p", "atm", "bar", "psi", "mmhg", "torr"]):
            for col in template_cols:
                col_lower = col.lower()
                if "pressure" in col_lower and "atm" in col_lower:
                    auto_map[header] = col
                    break

    return auto_map
def get_template_columns():
    """获取模板CSV的列名（通用）"""
    df_temp = pd.read_csv(TEMPLATE_PATH, encoding="utf-8-sig")
    return df_temp.columns.tolist()