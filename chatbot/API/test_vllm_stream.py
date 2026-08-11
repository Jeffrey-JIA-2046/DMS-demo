import requests
import json
import re
import sys

def remove_think(text: str) -> str:
    # 移除 <think>...</think> 及其内容（如果完整）
    # 同时移除孤立的 <think> 或 </think> 标签
    text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL)
    text = re.sub(r'</?think>', '', text)  # 移除所有单独的 <think> 或 </think>
    return text.strip()

def test_vllm_stream(prompt: str = "Tell me a short joke", model: str = "./DeepSeek-R1-Distill-Qwen-32B"):
    url = "http://172.20.10.9:8000/v1/chat/completions"
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": True,
        "max_tokens": 2000,
        "temperature": 0.7
    }

    print(f"🔄 发送流式请求到 vLLM... (prompt: {prompt[:30]}...)")
    print("=" * 60)

    full_response = ""
    try:
        with requests.post(url, json=payload, stream=True) as response:
            if response.status_code != 200:
                print(f"❌ 请求失败，HTTP {response.status_code}")
                print(response.text)
                return

            for line in response.iter_lines():
                if not line:
                    continue

                decoded = line.decode('utf-8')
                if decoded.startswith('data: '):
                    data_str = decoded[6:]  # 去掉 "data: " 前缀

                    if data_str == '[DONE]':
                        print("\n" + "=" * 60)
                        break

                    try:
                        data = json.loads(data_str)
                        delta = data['choices'][0].get('delta', {})
                        content = delta.get('content', '')
                        if content:
                            # 实时打印原始内容（含 think）
                            print(content, end='', flush=True)
                            full_response += content
                    except json.JSONDecodeError:
                        pass

        # 去除 think 标签
        cleaned = remove_think(full_response).strip()

        print("\n\n🧹 去除 <think> 后的完整回答：")
        print("-" * 60)
        print(cleaned)
        print("-" * 60)

        # 可选：显示原始长度和清理后长度
        print(f"\n📊 原始长度: {len(full_response)} 字符")
        print(f"📊 清理后长度: {len(cleaned)} 字符")

    except requests.exceptions.ConnectionError:
        print("❌ 无法连接到 vLLM 服务，请确认服务已启动且端口正确。")
    except Exception as e:
        print(f"❌ 发生错误: {e}")

if __name__ == "__main__":
    # 你可以修改这里的 prompt
    test_vllm_stream("講一個200字的笑話")