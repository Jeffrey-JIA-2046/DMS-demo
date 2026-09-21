# Document Management Solution

A full-stack workspace for ingesting, organizing, and retrieving business-critical documents. The backend is a Spring Boot REST API backed by MySQL, while the frontend is a React + Vite dashboard optimized for triaging documents, pushing new versions, and downloading historical revisions.

## Architecture

| Layer | Technology | Notes |
| --- | --- | --- |
| Frontend | React 19 + Vite | Bold dashboard layout with filters, list, detail, and upload overlay. Dev server proxies `/api` to `localhost:8080`. |
| Backend | Spring Boot 3.3, Java 21 | REST controllers + service layer, MySQL via Spring Data JPA, bean-validated DTOs, global exception handling. |
| Database | MySQL 8+ | Stores documents, tags, and file versions (binary payload stored as `LONGBLOB`). |

## Prerequisites

- Node.js **20.19** or newer (Vite enforces this) and npm 10+
- Java **21** JDK
- Maven 3.9+ (or use the included `mvnw` wrapper)
- MySQL 8+ instance (local or remote)

## Backend Setup

1. Update connection details via environment variables or edit `backend/src/main/resources/application.properties`:
   - `SPRING_DATASOURCE_URL` (default `jdbc:mysql://localhost:3306/dms?createDatabaseIfNotExist=true`)
   - `SPRING_DATASOURCE_USERNAME`
   - `SPRING_DATASOURCE_PASSWORD`
   - Optional: `APP_CORS_ALLOWED_ORIGINS` comma-separated list for production origins.
2. From the project root:
   ```bash
   cd backend
   ./mvnw spring-boot:run
   ```
   The API listens on `http://localhost:8080` by default.

### Key API Endpoints

- `GET /api/documents` — paginated search with `q`, `owner`, `category`, `status`, repeated `tags`, and optional `folderId`
- `POST /api/documents` — multipart upload with a `metadata` JSON part and a `file` part
- `POST /api/documents/{id}/versions` — upload a new version for an existing document
- `PUT /api/documents/{id}` — mutate title/description/category/tags/status
- `DELETE /api/documents/{id}` — archive (soft delete) a document
- `GET /api/documents/{id}` — document details with version history
- `GET /api/documents/{id}/download` & `/versions/{versionId}/download` — download latest or specific versions
- `GET /api/folders/tree` — fetch the hierarchical folder tree for populating pickers
- `POST /api/folders` — create a folder optionally nested beneath an existing folder

### AI Copilot (DeepSeek)

- `POST /api/chatbot/search` — accepts `{ "prompt": "need onboarding playbook" }` and returns top document hits plus a DeepSeek-generated overview.
- `POST /api/chatbot/documents/{id}/summary` — produces a concise summary by streaming the latest version into DeepSeek.
- `POST /api/chatbot/documents/{id}/qa` — accepts `{ "question": "What changed in version 3?" }` and returns an answer grounded in that document.
- Streaming variants live under `/summary/stream` and `/qa/stream` (same payloads, `text/plain` chunks) and drive the in-app “Document Concierge” live typing experience.

Configuration is controlled via the following properties/environment variables (defaults assume an Ollama instance on the workstation):

| Property | Environment Variable | Default |
| --- | --- | --- |
| `app.ai.deepseek.base-url` | `DEEPSEEK_BASE_URL` | `http://localhost:11434` |
| `app.ai.deepseek.chat-path` | `DEEPSEEK_CHAT_PATH` | `/api/chat` |
| `app.ai.deepseek.model` | `DEEPSEEK_MODEL` | `deepseek-r1:1.5b` |
| `app.ai.deepseek.timeout` | `DEEPSEEK_TIMEOUT` | `60s` |

Point the backend at any other DeepSeek/Ollama endpoint by overriding these variables before launching Spring Boot. The React workspace embeds a “Document Concierge” panel inside the document details column so users can search, summarize, and interrogate files without leaving the page.

### Knowledge Collaboration

Spin up collaborative knowledge topics that stitch together narrative updates, linked DMS documents, and ad-hoc attachments:

- `GET /api/knowledge/topics` — search topics by query, tags, favorite (starred) state, or membership. Returns paged summaries with counts.
- `POST /api/knowledge/topics` / `PUT /api/knowledge/topics/{id}` — create or evolve a topic with tags that drive discovery.
- `POST /api/knowledge/topics/{id}/join` — opt into a topic before contributing, uploading, or linking evidence.
- `POST /api/knowledge/topics/{id}/contributions` — append timeline updates with optional document references.
- `POST /api/knowledge/topics/{id}/links` & `/{id}/links/{linkId}` — attach existing documents (and remove when stale) with lightweight context notes.
- `POST /api/knowledge/topics/{id}/documents` / `GET /documents/{uploadId}/download` — upload fresh artifacts directly to the topic and download them later.
- `POST /api/knowledge/topics/{id}/share` — invite other licensed users (auto-joining them) while logging a share trail.
- `POST|DELETE /api/knowledge/topics/{id}/stars` — personal favorites for quick recall inside the dashboard nav.
- `GET /api/knowledge/topics/{id}/chain/download` — export the full knowledge chain as Markdown for audits or knowledge bases.

The React `Knowledge Collaboration` surface (available wherever Document Management is visible) mirrors these workflows: it lists recent topics, surfaces stats, enforces join-before-contribute, and lets users download the entire knowledge chain without leaving the UI.

## Frontend Setup

1. Install dependencies and start the dev server (the proxy forwards `/api` calls to `localhost:8080`):
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
2. Build for production:
   ```bash
   npm run build
   npm run preview
   ```
3. Environment:
   - `VITE_API_BASE_URL` (optional) points the UI to a deployed API. Leave unset for same-origin/proxy usage.

## Usage Flow

1. Use the folder browser to select (or create) the workspace you’d like to browse; “All documents” clears the filter.
2. Use the filter “Control Tower” to narrow results by owner, category, status, or tags within the chosen folder.
3. Select a document from the workspace list to view metadata, tags, and version history.
4. Upload new documents or additional versions via the inline actions; pick (or create) a folder in the tree selector before choosing the file (25 MB max).
5. Archive documents to remove them from active workflows while retaining their entire history.

## Testing & Quality

- Backend DTOs enforce length and presence constraints; global handlers surface actionable error messages.
- Service layer keeps mutations transactional and normalizes tags to lowercase to guarantee consistent filtering.
- The frontend surfaces error banners, disables actions while mutations are in flight, and defaults document listings to the most recently updated files.

## Next Steps

- Add authentication/authorization (e.g., Azure AD, Auth0) for multi-tenant deployments.
- Connect to Azure Blob Storage for large-file offloading while keeping Cosmos DB or MySQL for metadata.
- Extend the React app with optimistic UI updates and toast notifications for long-running uploads.
