import os
from flask import Flask, render_template
from config import FLASK_SECRET_KEY, UPLOAD_FOLDER, OUTPUT_FOLDER
from module_upload import upload_bp
from module_table import table_bp
from module_preview import preview_bp
from module_llm import llm_bp
from module_export import export_bp
from module_edit import edit_bp

import sys
sys.stdout.reconfigure(encoding='utf-8')
sys.stdin.reconfigure(encoding='utf-8')
app = Flask(__name__)
app.secret_key = FLASK_SECRET_KEY

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

app.register_blueprint(upload_bp)
app.register_blueprint(table_bp)
app.register_blueprint(preview_bp)
app.register_blueprint(llm_bp)
app.register_blueprint(export_bp)
app.register_blueprint(edit_bp)

# 主页面
@app.route('/', methods=['GET'])
def index():
    return render_template('index.html')

# 启动应用
if __name__ == '__main__':
    print("系统已启动：http://127.0.0.1:18000")
    app.run(debug=False, host='127.0.0.1', port=18000)