## DMS Deployment Steps

=====================================================================

### 0. Services and Ports

- OpenSearch: 9200
- OpenSearch Dashboards: 5601
- vLLM model server: 8001
- dots OCR API: 9000
- Chatbot API (FastAPI): 5100
- DMS backend (Spring Boot): 8080
- DMS frontend (Vite dev): 5173

Start order:
1. OpenSearch
2. vLLM
3. dots OCR API
4. Chatbot API
5. DMS backend
6. DMS frontend

=====================================================================

### 1. Launch OpenSearch (Windows PowerShell)

Use your existing compose file in OpenSearch folder.

```powershell
cd C:\Users\aslps\for_gem\Uenv\OpenSearch
```

Start cluster:

```powershell
docker compose up -d
```

Quick checks:
```powershell
docker compose ps
curl.exe -k -u admin:your_admin_password_here https://localhost:9200
```

Dashboards:

- https://localhost:5601

=====================================================================

### 2. Launch vLLM Engine (WSL Ubuntu)

```bash
wsl -d Ubuntu
```

```bash
cd /path/to/your/vllm-env
source .venv/bin/activate

CUDA_VISIBLE_DEVICES=0 vllm serve kristaller486/dots.ocr-1.5 \
  --tensor-parallel-size 1 \
  --gpu-memory-utilization 0.9 \
  --chat-template-content-format string \
  --served-model-name model \
  --trust-remote-code \
  --port 8001
```

Wait until startup is complete:
```text
INFO:     Started server process [...]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
```

Health check:
```bash
curl http://127.0.0.1:8001/v1/models
```

=====================================================================

### 3. Launch dots OCR API (WSL Ubuntu)

Open a second WSL terminal:

```bash
wsl -d Ubuntu
cd /mnt/c/Users/aslps/for_gem/Uenv/dots.ocr

source .venv/bin/activate
pip install -r requirements.txt
pip install fastapi uvicorn python-multipart

python API/pdf_ocr_api.py
```

Health check:
```bash
curl http://127.0.0.1:9000/health
```

=====================================================================

### 4. Launch Chatbot API (Windows PowerShell, Python 3.13)

Open a new PowerShell terminal:

```powershell
cd C:\Users\aslps\for_gem\Uenv\chatbot
```

Create and activate a Python 3.13 virtual environment (first time only):

```powershell
py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1
```

Install dependencies:

```powershell
pip install -r requirements.txt
pip install fastapi uvicorn python-dotenv opensearch-py requests sentence-transformers
```

Run API:

```powershell
python API/chatbot_agent_api.py
```

Health check:
```powershell
curl http://localhost:5100/health
```

=====================================================================

### 5. Launch DMS Backend (Windows PowerShell)

Open a new PowerShell terminal:

```powershell
cd C:\Users\aslps\for_gem\Uenv\DMS\backend
```

Run backend:

```powershell
.\mvnw.cmd spring-boot:run
```

Health check:
```powershell
curl http://localhost:8080/api/documents
```

=====================================================================

### 6. Launch DMS Frontend (Windows PowerShell)

Open another PowerShell terminal:

```powershell
cd C:\Users\aslps\for_gem\Uenv\DMS\frontend
npm install
npm run dev
```

Open in browser:

- http://localhost:5173

=====================================================================

### 7. Smoke Test Workflow

1. Open DMS UI
2. Upload one PDF
3. Run OCR on the document
4. Confirm OCR result appears in Rendered and Raw tabs
5. Verify document list and detail APIs still work

=====================================================================

### 8. Optional Production Build

Backend jar:
```powershell
cd C:\Users\aslps\for_gem\Uenv\DMS\backend
.\mvnw.cmd clean package -DskipTests
java -jar target\backend-0.0.1-SNAPSHOT.jar
```

Frontend build:
```powershell
cd C:\Users\aslps\for_gem\Uenv\DMS\frontend
npm run build
npm run preview
```

=====================================================================

### 9. Troubleshooting

- If backend OCR calls fail: check DOTSOCR_BASE_URL and OCR API health endpoint
- If OCR API fails: confirm vLLM is running and model name matches DOTSOCR_VLLM_MODEL_NAME
- If backend chatbot calls fail: confirm Chatbot API is running on port 5100 and /health returns OK
- If OpenSearch auth/SSL errors appear: verify OPENSEARCH_HTTPS=true, admin credentials, and compose containers are healthy
- If frontend cannot call backend in dev mode: confirm backend is listening on 8080 and frontend dev server is running
