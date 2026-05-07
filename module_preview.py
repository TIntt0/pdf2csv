import os
from flask import Blueprint, send_file, send_from_directory
from config import UPLOAD_FOLDER, OUTPUT_FOLDER, TEMP_DATA

# 注册蓝图
preview_bp = Blueprint('preview', __name__)

@preview_bp.route('/pdf/<fid>')
def pdf_view(fid):
    """PDF预览"""
    data = TEMP_DATA.get(fid)
    if not data:
        return "PDF不存在", 404
    return send_file(data["pdf_path"], mimetype="application/pdf")

@preview_bp.route('/img/<fid>/<filename>')
def img_view(fid, filename):
    """提取图片预览"""
    img_dir = os.path.join(OUTPUT_FOLDER, fid, "auto", "images")
    return send_from_directory(img_dir, filename)