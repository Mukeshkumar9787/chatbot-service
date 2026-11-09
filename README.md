# SMK AI Assistant & Qdrant Knowledge Hub (`chatbot-service`)

Autonomous, document-grounded Retrieval-Augmented Generation (RAG) assistant and enterprise knowledge management service powered by **Next.js 14**, **Qdrant Vector Database**, **PostgreSQL (Sequelize ORM)**, and **Google Gemini AI**.

---

## 🌟 Key Features

- **Dense Semantic Retrieval**: Powered by Qdrant Vector DB with cosine similarity metric, semantic filtering, and payload indexing.
- **Strict Storage Separation**:
  - **Qdrant**: Stores 100% of document embeddings, chunk payloads, and document metadata. Zero document rows in PostgreSQL.
  - **PostgreSQL**: Stores relational chat sessions, conversation messages, administrator accounts, and token revocation blacklists via **Sequelize ORM** with idempotent, rerunnable DDL.
- **Enterprise Admin Dashboard**:
  - **Sidebar Navigation**: Clean responsive sidebar with navigation across all knowledge pages and live database status.
  - **📁 Document Hub** (`/admin/documents`): Ingest PDF, DOCX, TXT, MD, CSV files with automatic chunking and vector indexing.
  - **🔍 RAG Playground** (`/admin/playground`): Inspect dense similarity scores, cosine distance metrics, and prompt context grounding in real time.
  - **👥 Team Management** (`/admin/team`): Modal-driven administrator provisioning keyed strictly by email (no legacy user IDs).
  - **🚪 Server-Side Token Invalidation**: Instant logout with token blacklisting in PostgreSQL.
- **Universal Multi-Platform Integration**: Embeddable via a single `<script>` tag, responsive `<iframe>`, or headless REST API.

---

## 🏗️ Architecture Overview

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                CLIENT PLATFORMS                                        │
│  Storefront (Next.js) │ Mobile Apps │ Shopify / WordPress │ Admin Panels │ Headless    │
└─────────────────────────────────┬──────────────────────────────────────────────────────┘
                                  │
                   1. Embed Script / REST API / Iframe
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        CHATBOT SERVICE (Next.js / Port 8005)                           │
│                                                                                        │
│  [POST /api/chat]        [POST /api/sync/user-role]       [POST /api/documents/upload] │
│  - Session tracking      - Authenticated sync via key     - Text parser & chunker      │
│  - Context grounding     - Email-based identification     - Dense vector generator     │
└───────────────┬────────────────────────────────────────────────────────┬───────────────┘
                │                                                        │
         Relational Data                                           Vector & Docs
                │                                                        │
                ▼                                                        ▼
┌───────────────────────────────┐                        ┌───────────────────────────────┐
│     POSTGRESQL DATABASE       │                        │     QDRANT VECTOR DB          │
│  (Sequelize ORM / Idempotent) │                        │  (store_knowledge_base)       │
│                               │                        │                               │
│  - users (Support Admins)     │                        │  - Vectors (768-dim Cosine)   │
│  - tokens_blacklist           │                        │  - Document chunks & metadata │
│  - conversations              │                        │  - doc_id keyword index       │
│  - messages                   │                        │  - File attributes & payloads │
└───────────────────────────────┘                        └───────────────────────────────┘
```

---

## 🔌 Multi-Platform Integration Guide

The chatbot service is designed to seamlessly integrate into any architecture, technology stack, or content management system using 4 primary integration methods:

### Option 1: Universal Embed Script (One-Line Integration)
Recommended for web storefronts, CMS platforms (Shopify, WordPress, Webflow, Magento), and single-page apps (React, Vue, Angular).

Add this single `<script>` tag before the closing `</body>` tag of any HTML page:

```html
<script 
  src="https://your-chatbot-domain.com/embed.js" 
  data-theme="light" 
  defer>
</script>
```

#### How it works:
- Automatically injects a floating, mobile-responsive chat widget bubble into the bottom-right corner of the host site.
- Creates an isolated iframe pointing to `/widget` to prevent CSS and JavaScript style conflicts with the host website.
- Supports window resizing, animated open/close transitions, and persistent chat sessions via localStorage.

#### Framework Examples:

**Next.js (App Router / Pages Router):**
```tsx
import Script from "next/script";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        {children}
        <Script 
          src="http://localhost:8005/embed.js" 
          strategy="lazyOnload" 
        />
      </body>
    </html>
  );
}
```

**React / Vite / Vue / Plain HTML:**
```html
<!DOCTYPE html>
<html>
  <head><title>My Store</title></head>
  <body>
    <h1>Welcome to My Store</h1>
    <!-- Chatbot Widget Embed -->
    <script src="http://localhost:8005/embed.js" defer></script>
  </body>
</html>
```

---

### Option 2: Direct Responsive Iframe Integration
Embed the chatbot as a dedicated component inside an existing customer portal, admin dashboard, or modal drawer.

```html
<iframe 
  src="http://localhost:8005/widget"
  width="100%" 
  height="600" 
  frameborder="0"
  style="border-radius: 16px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1);"
  allow="clipboard-write">
</iframe>
```

---

### Option 3: Headless REST API Integration
For mobile applications (React Native, Flutter, iOS, Android), desktop clients, or automated bots (WhatsApp, Slack, Discord).

#### 1. Ask a Question / Stream Response (`POST /api/chat`)
```bash
curl -X POST http://localhost:8005/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is the return window for electronics?",
    "conversationId": "optional-uuid-to-continue-thread",
    "sessionId": "client-browser-session-id"
  }'
```

**Response Format:**
```json
{
  "conversationId": "550e8400-e29b-41d4-a716-446655440000",
  "answer": "Our return policy allows 30 days for electronics in original packaging with proof of purchase.",
  "sources": [
    {
      "id": "point-id-uuid",
      "score": 0.892,
      "filename": "smk_return_policy.txt",
      "chunk_index": 0,
      "total_chunks": 2,
      "content": "Return Policy: Customers have 30 days from the delivery date..."
    }
  ]
}
```

#### 2. System Health Check (`GET /api/health`)
Monitors uptime and connection to PostgreSQL and Qdrant:
```bash
curl http://localhost:8005/api/health
```

---

### Option 4: Backend Role & User Synchronization
Synchronize user roles from an e-commerce backend (e.g. `smk/server`) to automatically grant or revoke knowledge base permissions.

#### Sync Request (`POST /api/sync/user-role`):
```bash
curl -X POST http://localhost:8005/api/sync/user-role \
  -H "Content-Type: application/json" \
  -H "X-Internal-Service-Key: <INTERNAL_SERVICE_KEY>" \
  -d '{
    "email": "promoted_admin@smk.store",
    "role": "ADMIN",
    "status": "ACTIVE",
    "name": "Jane Doe"
  }'
```

- When `role` is `ADMIN` / `SUPER_ADMIN` and `status` is `ACTIVE`, the user is granted `SUPPORT_ADMIN` privileges.
- When demoted or deactivated, RAG administrative access is immediately revoked.
- Users are keyed strictly by **email** address.

---

## 🛠️ Environment Configuration

Create a `.env` file in `chatbot-service/`:

```ini
PORT=8005

# PostgreSQL Connection (Relational transactional data)
DATABASE_URL=postgres://user:password@hostname:5432/chatbot_db?sslmode=require

# Qdrant Vector Database (Document chunks, metadata, dense embeddings)
QDRANT_URL=https://your-cluster-id.qdrant.io
QDRANT_API_KEY=your_qdrant_api_key
QDRANT_COLLECTION=store_knowledge_base

# Google Gemini API
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
GEMINI_EMBEDDING_MODEL=text-embedding-004

# JWT Authentication
JWT_SECRET=your_super_secret_jwt_key

# Internal Service Synchronization
INTERNAL_SERVICE_KEY=your_internal_service_sync_key

# Seed Admin Credentials (Optional defaults for seeding)
ADMIN_EMAIL=admin@smk.internal
ADMIN_PASSWORD=SupportAdmin@123
ADMIN_NAME=Primary Support Admin
```

---

## 🚀 Getting Started (Development & Production)

### 1. Install Dependencies
```bash
cd chatbot-service
npm install
```

### 2. Run Database Migrations (Idempotent DDL)
```bash
npm run migrate
```
*Applies rerunnable, idempotent schema queries without migration tracking tables.*

### 3. Seed Default Administrators
```bash
npm run seed
```
*Provisions initial admin accounts (`admin@smk.internal`, `admin@smk.com`) directly in PostgreSQL.*

### 4. Build and Run
```bash
# Build production bundle
npm run build

# Start production server on port 8005
npm run start
```

Access the dashboard:
- **Admin Hub**: [http://localhost:8005/admin/documents](http://localhost:8005/admin/documents)
- **Live Widget Preview**: [http://localhost:8005/widget](http://localhost:8005/widget)
- **Health Telemetry**: [http://localhost:8005/api/health](http://localhost:8005/api/health)

