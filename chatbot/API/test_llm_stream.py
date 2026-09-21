from llama_cpp import Llama

# 加载模型（推荐使用 GPU）
llm = Llama(
    model_path="./DeepSeek-R1-Distill-Llama-70B-Q4_K_M.gguf",
    n_gpu_layers=-1,
    n_ctx=8192,
    flash_attn=True,
    n_threads=8,
    verbose=False,
)

# 调用时添加 reasoning_budget=0
response = llm.create_chat_completion(
    messages=[{"role": "user", "content": "What is machine learning?"}],
    max_tokens=1000,
    temperature=0.7,
    reasoning_budget=0,   # 禁用思考
)

# 提取回答
answer = response['choices'][0]['message']['content']
print(answer)  # 不会包含 <think> 标签