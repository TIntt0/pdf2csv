import os
from dotenv import load_dotenv

# 初始化环境变量
load_dotenv()

# Flask 基础配置
FLASK_SECRET_KEY = os.getenv('FLASK_SECRET_KEY', 'ultimate_2026')
UPLOAD_FOLDER = 'uploads'
OUTPUT_FOLDER = 'output'
FILTER_SIZE = 10 * 1024  # 图片过滤大小

# 业务配置
TEMPLATE_PATH = "template.csv"
LLM_BASE_URL = os.getenv("LLM_BASE_URL")
LLM_MODEL = os.getenv("LLM_MODEL")
LLM_API_KEY = os.getenv("LLM_API_KEY", "sk-xxx")
MINERU_URL = os.getenv("MINERU_URL")

# 全局存储（替代原 TEMP_DATA）
TEMP_DATA = {}