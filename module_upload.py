import os
import uuid
import re
import requests
import pandas as pd
from flask import Blueprint, request, jsonify
from werkzeug.utils import secure_filename
from config import UPLOAD_FOLDER, OUTPUT_FOLDER, MINERU_URL, TEMP_DATA
from utils import read_md_content, parse_md_tables, get_valid_images, auto_map_columns, get_template_columns

# 注册蓝图
upload_bp = Blueprint('upload', __name__)

@upload_bp.route('/upload', methods=['POST'])
def upload():
    try:
        if 'pdf_file' not in request.files:
            return jsonify({"code": 1, "msg": "请选择PDF文件"})
        
        file = request.files['pdf_file']
        if not file.filename.lower().endswith('.pdf'):
            return jsonify({"code": 1, "msg": "仅支持PDF文件"})

        # 生成唯一ID，保存PDF
        fid = str(uuid.uuid4())
        pdf_path = os.path.join(UPLOAD_FOLDER, f"{fid}.pdf")
        file.save(pdf_path)

        # 调用MinerU接口解析PDF
        output_dir = os.path.join(OUTPUT_FOLDER, fid)
        os.makedirs(output_dir, exist_ok=True)
        
        filenames = [pdf_path]
        files = []
        for idx, filename in enumerate(filenames):
            files.append(("files", (os.path.basename(filename), open(filename, 'rb'))))

        data = {
            "backend": "pipeline", 
            "output_dir": os.path.abspath(OUTPUT_FOLDER),
            "return_md": True, 
            "return_middle_json": False,
            'return_model_output': False,
            'return_content_list': False, 
            'return_images': False, 
            'lang_list': 'ch'
        }
        r = requests.post(MINERU_URL, files=files, data=data)
        
        if r.status_code != 200:
            return jsonify({
                "code": 1,
                "msg": f"mineru 解析失败：{r.text}",
                "fid": fid
            }), 500

        # 解析结果处理
        md_text = read_md_content(fid)
        raw_tables = parse_md_tables(md_text)
        
        # 提取DOI和年份
        doi = "no_doi"
        year = ""
        doi_match = re.search(r"10\.[0-9a-zA-Z\/\.]+", md_text)
        if doi_match:
            doi = doi_match.group(0).strip().rstrip(".")
        year_match = re.search(r"\b\d{4}\b", md_text)
        if year_match:
            year = year_match.group(0)

        # 提取图片、模板列
        images = get_valid_images(fid)
        template_cols = get_template_columns()
        
        # 自动列映射
        for t in raw_tables:
            t["auto_map"] = auto_map_columns(t["headers"], template_cols)
            t["manual_map"] = {}

        # 存储到全局
        TEMP_DATA[fid] = {
            "pdf_path": pdf_path,
            "doi": doi,
            "year": year,
            "tables": raw_tables,
            "images": images,
            "template_cols": template_cols,
            "custom": {}
        }

        return jsonify({
            "code": 0,
            "fid": fid,
            "msg": "解析完成",
            "doi": doi,
            "year": year,
            "tables": raw_tables,
            "images": images,
            "template_cols": template_cols
        })

    except Exception as e:
        return jsonify({"code": 1, "msg": f"解析失败：{str(e)}"})