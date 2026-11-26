<div align="center">

# Vatary Desk

**A document workspace with AI built in.**
<img width="1269" height="952" alt="image" src="https://github.com/user-attachments/assets/cf2059a0-6108-4e67-ab61-dbb1b604b88b" />

Open almost any file, edit PDFs in place, keep everything in folders with full version history, and share it with your team. All in one browser tab.

**[Open Vatary Desk →](https://vatarydesk.com)** · **[AI console live demo →](https://demo-ai-staging.vatarydesk.com/)**

[Features](#what-you-can-do) · [Architecture](#technical-architecture) · [Author](https://andrii.tech)

</div>

---

## Try it

| | |
|---|---|
| 🖥 **The product** | [vatarydesk.com](https://vatarydesk.com): the live workspace |
| 📊 **AI operations console** | [demo-ai-staging.vatarydesk.com](https://demo-ai-staging.vatarydesk.com/): explore the LLM gateway's console with sample traffic. No account needed |

## The idea

Work documents are spread across too many tools. One app opens the PDF, another edits it, a third converts it to Word, a cloud drive stores it, and a chat app is where people send it around. Each move between them loses context, versions and access rules.

Vatary Desk puts that whole loop on one desk. You upload a file once. From then on you can read it, edit it, convert it, ask AI about it, see who changed what, and share it, all without leaving the workspace or downloading a copy.

## What you can do

| Area | Feature | What it does |
|---|---|---|
| 🖥 **Desk** | Tiles on a desk | Files, pages, tables, boards and widgets live as tiles. Drag, resize, drop into folders, undo with Ctrl+Z |
| | Several desktops | Keep separate desks per project, copy a desk, export it as a ZIP or import a ZIP onto it |
| | Same layout on any screen | The desk scales to every monitor; pick a size per device |
| | Heat map | Highlight tiles by when their documents were added or last edited |
| | Paste a link | A pasted link becomes a tile with a preview; videos play right on the desk |
| | Split view | Open a second page, table or file side by side, like a split editor in an IDE |
| 📄 **PDF** | Edit text in place | Change words in an existing PDF and keep its fonts, size and layout; text reflows inside its block |
| | Edit images and layout | Replace pictures, move objects, adjust the page |
| | Organize pages | Rotate, delete, reorder and insert pages |
| | Split, extract, merge | Cut a PDF into parts, pull out pages, merge several files into one |
| | Compose a new PDF | Build a document from pages of other files on the desk |
| | Protection | Owner-protected PDFs open normally; on save you choose to keep or remove the protection |
| | Live PDFs | Video, page transitions and buttons inside a PDF; files of hundreds of megabytes |
| ✍️ **Pages** | Rich editor | Headings, lists, tasks, tables, images, code blocks, colours, 80+ fonts |
| | Block templates | Insert a ready pattern: a tasks table, a schedule, contacts, Q&A |
| | Charts and diagrams | Bar, line, area and pie charts; flowcharts and diagrams drawn the same on every surface |
| | Import | Make a page from Word, OpenDocument, RTF, PDF, Markdown, HTML, EPUB, Jupyter and more |
| | Export | Save a page as PDF, DOCX, ODT, Markdown, HTML or TXT |
| | Real-time co-editing | See who else is in the document; simultaneous edits merge automatically |
| 📊 **Tables** | Spreadsheets | Sheets, formulas, number formats, templates, header colours |
| | Import | Excel, OpenDocument, CSV and TSV become editable tables |
| | Charts | A chart lives inside its table and updates with the data |
| 🗂 **Boards** | Kanban | Boards, columns and cards with descriptions, attachments and links; each board is a tile |
| 🎞 **Presentations** | Edit PowerPoint | Edit text, arrange shapes with a grid and smart guides, present full screen |
| | Export | PDF, PNG images or ODP; bring back an earlier version |
| 🧾 **Formats** | Documents | DOCX, DOC, ODT, RTF, Apple Pages, PDF, TXT, Markdown, HTML, AsciiDoc, Org, Jupyter, XML |
| | Books | EPUB, FB2, Kindle (MOBI / AZW3), CBZ comics |
| | Spreadsheets | XLSX, XLS, ODS, CSV, TSV |
| | Images | PNG, JPG, WebP, AVIF, GIF, BMP, SVG, **HEIC / HEIF**, with a photo editor |
| | Audio and video | MP3, WAV, M4A, OGG, FLAC, MP4, WebM, MOV and more |
| | 3D models | STL, 3MF, OBJ, glTF / GLB, PLY, rotated right in the browser |
| | Archives | Unpack ZIP, TAR, TAR.GZ and GZ into a folder; download any folder as a ZIP |
| | Conversion | DOCX → PDF, PDF → DOCX with editable paragraphs and tables, PDF → Markdown, HEIC → JPG and more |
| 📁 **Files** | File system | Nested folders, a file tree, tags, a trash you can restore from |
| | Large uploads | Big files upload in parts, straight to storage |
| | Search | Fast search across files, pages, tables and boards; semantic search with embeddings |
| | Links and backlinks | Link any document from another one and see "Referenced by" on the target |
| 🕓 **History** | Version timeline | Every page and table keeps its versions |
| | Compare | Two versions side by side with highlighted changes |
| | Restore | Bring back a whole version or only the part you need |
| | Journal | A timeline of what happened on your desk |
| 🤖 **AI** | Ask a document | Answers grounded in the content, even for very long files: the AI reads the outline and pulls only the sections it needs |
| | Desk AI | Ask about everything on the desk; the result is created as a page or table and fills in while you watch |
| | Edit part of a page | The AI rewrites one section and leaves the rest alone |
| | Recipes | Ready scenarios: a summary, a merged table, a task board, a report, run on chosen materials |
| | Tidy the desk | The AI suggests one to three ways to organize a desk; choose, change or undo |
| | Web research | Answers that combine your documents with sources from the web |
| | Voice input | Speak instead of typing; speech is transcribed |
| | Credits and budgets | AI usage is metered per plan, so spend stays predictable |
| 🤝 **Sharing** | Roles | Owner, Manager, Editor, Viewer on a file, folder, page or desk; folder access applies to everything inside |
| | Public links | View-only links anyone can open without signing up |
| | Organizations | Teams with a shared workspace, switch between personal and team space |
| | Notifications | An email when someone gives you access |
| 🧩 **Widgets** | Desk widgets | Notes, to-dos, calculator, currency, world clock, pomodoro, bookmarks, audio, password and random value generator, file shortcuts |
| 📝 **Surveys** | Polls and feedback | Ask questions and collect answers in the app |
| 🌍 **Platform** | PWA | Installable, caches what you opened, works through short network drops |
| | Languages | Ukrainian and English |
| | Library | Built-in help articles with screenshots, in both languages |

---

## Technical architecture

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/architecture-dark.png">
  <img alt="Vatary Desk architecture: a React PWA behind nginx, a NestJS API, a workflow orchestrator calling a document service and an AI gateway over gRPC, PostgreSQL with pgvector, Cloudflare R2, LLM providers, and Sentry, Microsoft Clarity, Grafana and Loki for observability" src="docs/architecture-light.png">
</picture>

A service-oriented system in **TypeScript, Go and Python**, each language used where it is strongest. One repository, every service in its own Docker container.

```
browser (React PWA)
      │ HTTPS / WebSocket
      ▼
nginx reverse proxy ──► NestJS API ──► PostgreSQL + pgvector
                             │   └──► Cloudflare R2 (signed links)
                             │ gRPC
                             ▼
                   Workflow orchestrator (Go)
                      │ gRPC          │ gRPC
                      ▼               ▼
          Document service (Python)   AI runtime (Go) ──► LLM providers
```

### Infrastructure

| Piece | Technology | Role |
|---|---|---|
| **Containers** | Docker, Docker Compose | Every service is an image; one compose file for development, one for deployment |
| **Reverse proxy** | nginx | TLS, static files, HTTP and WebSocket routing to the API |
| **Database** | PostgreSQL + pgvector | Relational data and vector search in one database |
| **Object storage** | Cloudflare R2 (S3 API) | Files, versions and temporary job files |
| **Backups** | Scheduled database dumps | Kept locally and copied off-site |
| **Service contracts** | Protocol Buffers, gRPC, buf | One `proto/` directory is the only source of truth for every internal API |
| **CI** | GitHub Actions | Tests per service, contract freshness and breaking-change checks, a changelog check per PR |

### Frontend

| Topic | Technology |
|---|---|
| **Core** | React, TypeScript, Vite |
| **UI** | MUI, Emotion, a shared design-token system, Lucide icons, Framer Motion |
| **Server state** | TanStack Query with an IndexedDB-persisted cache and offline-first mutations |
| **Client state** | Zustand, Immer, undo history with Zundo |
| **Desk layout** | react-grid-layout, dnd-kit |
| **Page editor** | Tiptap (ProseMirror), Yjs for real-time collaboration |
| **Spreadsheets** | IronCalc (WebAssembly) formula engine, SheetJS, PapaParse |
| **PDF and documents** | pdf.js, Mammoth, docx, epub.js, AsciiDoctor |
| **Graphics** | Konva, Three.js for 3D models, Recharts, d3-force |
| **Code and data** | Monaco editor |
| **Validation** | Zod, shared with the API contracts |
| **i18n** | i18next (Ukrainian, English) |
| **PWA** | Service worker, installable app, cached assets |
| **Monitoring** | Sentry, PostHog, Microsoft Clarity (content masked) |

### API server

| Topic | Technology |
|---|---|
| **Framework** | NestJS, TypeScript |
| **Data access** | Prisma with versioned migrations; raw SQL only through parameter-bound builders tested against a real Postgres |
| **Auth and access** | Sign-in, organizations, roles and grants; one access resolver for every resource |
| **Files** | S3 SDK with presigned upload and download links; multipart uploads |
| **Real-time** | WebSocket gateway for Yjs document rooms |
| **Documents** | One HTML sanitizer for every imported or AI-written fragment |
| **Search and links** | Search across documents, vector search with pgvector embeddings; a link graph for backlinks |
| **Billing** | Plans, quotas and AI credits; every AI call recorded with its cost |
| **Background jobs** | Scheduled tasks with NestJS Schedule |
| **Protection** | Helmet, rate limiting, request validation with Zod |
| **Talks to** | The orchestrator over gRPC; never to an LLM provider directly |

### Workflow orchestrator (Go)

- Runs every heavy operation as a **workflow**: named steps, retries, progress and an event log.
- **Fast jobs are synchronous** with a deadline; long jobs start, run in the background and are polled.
- Retry rules come from gRPC status codes: "will never work" fails at once, "try again" retries.
- Workflows include document import and conversion, PDF editing, document outlines for AI, AI generation, transcription, embeddings and image generation.
- State in SQLite; its own console for jobs and step graphs, plus metrics.

### Document service (Python)

- **FastAPI + gRPC** in one process.
- **LibreOffice** for office formats, **PyMuPDF** and **pikepdf** for PDF reading and editing, **pdf2docx** for PDF → Word, **pi-heif / Pillow** for images, **fontTools** for fonts.
- Splits, rasterizes, optimizes, chunks and compresses documents, and builds a document outline for AI.
- Stateless: it downloads inputs and uploads results through presigned links and holds no storage credentials.

### AI runtime (Go)

- The **only** process that holds LLM provider keys.
- A **prompt registry**: every prompt is versioned and answers JSON validated against a strict schema.
- **Model routing**: a model chain per task, with fallback to another provider on rate limits and errors.
- Providers: OpenAI, Anthropic, DeepSeek and OpenAI-compatible APIs for text; transcription, embeddings and image generation.
- **Cost tracking** per call, returned to the API for billing.
- Its own operations console: per-call traces, latency, cost, fallback and error rates, and a graph of all model calls behind one user action. [Live demo →](https://demo-ai-staging.vatarydesk.com/)

### Observability

Every user action gets one **correlation id** that travels through the API, the orchestrator, every AI call and the document service, so one click can be traced end to end.

| Tool | What it covers |
|---|---|
| **Sentry** | Errors, performance and releases in the web app and the API |
| **Microsoft Clarity** | Session replays and heatmaps, with document content masked |
| **PostHog** | Product analytics |
| **Grafana + Loki** | Logs from every container, dashboards and alerts |
| **Service consoles** | Orchestrator jobs and the AI runtime console |

### Engineering decisions

- **Files never pass through the API.** The browser uploads straight to object storage with signed links, and services exchange links instead of bytes. Large PDFs never sit in application memory.
- **Heavy work runs outside the request path.** Conversion, PDF edits and AI pipelines run as orchestrated workflows with retries and progress, so a slow job never blocks the interface.
- **Strict contracts between services.** Every boundary is a versioned gRPC contract shared by the TypeScript, Go and Python code; generated code is committed and checked in CI.
- **AI under control.** Only one service holds provider keys. It picks a model per task, falls back on errors, validates every answer against a schema and records the cost of each call.
- **Billing stays in one place.** Quotas and credits live in the API; every workflow result carries a usage block the API records.
- **Long documents without huge prompts.** The AI reads the outline first and pulls only the sections it needs. Tables reach the model whole.
- **Collaboration without conflicts.** Pages sync in real time through CRDTs, so simultaneous edits merge instead of overwriting each other.
- **Decisions on record.** Each architecture decision is written down as an ADR.
- **Quality gates in the build.** Over 1,100 test files across the stack. Tests run inside the Docker build, so a failing build never produces an image.

---

<div align="center">

Built by **[Andrii Slipchenko](https://andrii.tech)**, product engineer, Kyiv.
[GitHub](https://github.com/AndrewSl105) · [LinkedIn](https://www.linkedin.com/in/andrii-s-284690117/)

</div>
