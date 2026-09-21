
## DMS Application 

=====================================================================
### 1. launch vllm engine


```shell
#### activate ubuntu env:
wsl -d Ubuntu
```



```shell

#### activate venv:
source .venv/bin/activate

# Launch vLLM model server
## dots.ocr-1.5	
CUDA_VISIBLE_DEVICES=0 vllm serve kristaller486/dots.ocr-1.5   --tensor-parallel-size 1   --gpu-memory-utilization 0.9   --chat-template-content-format string   --served-model-name model   --trust-remote-code   --port 8001
```


Wait until engine start complete 
```shell
(APIServer pid=1460) INFO:     Started server process [1460]
(APIServer pid=1460) INFO:     Waiting for application startup.
(APIServer pid=1460) INFO:     Application startup complete.
```