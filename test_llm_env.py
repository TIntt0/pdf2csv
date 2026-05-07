import os
from openai import OpenAI
from dotenv import load_dotenv

def test_llm_connection():
    load_dotenv()

    base_url = os.getenv("LLM_BASE_URL")
    model_name = os.getenv("LLM_MODEL")

    print(f"🔍 正在测试连接...")
    print(f"Base URL: {base_url}")
    print(f"Model: {model_name}")

    try:
        client = OpenAI(
            base_url=base_url,
            api_key="dummy_key"
        )

        # 强制让模型说话，绝不空返回！
        response = client.chat.completions.create(
            model=model_name,
            messages=[{"role": "user", "content": "请回答：连接成功。"}],
            max_tokens=2000,
            temperature=0
        )

        reply = response.choices[0].message.content
        print("\n✅ 连接成功！模型返回：")
        print(f"💬 {reply}")

    except Exception as e:
        print(f"\n❌ 错误：{e}")

if __name__ == "__main__":
    test_llm_connection()