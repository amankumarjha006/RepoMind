# RepoMind (Codebase Intelligence)

<div align="center">

[![CI](https://github.com/amankumarjha006/codebase-intellisense/actions/workflows/ci.yml/badge.svg)](https://github.com/amankumarjha006/codebase-intellisense/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![React 19](https://img.shields.io/badge/Frontend-React%2019%20%2B%20Vite-61DAFB.svg)](client/)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI%20%2B%20Python%203.11-009688.svg)](server/)
[![PostgreSQL](https://img.shields.io/badge/Vector%20Store-PostgreSQL%20%2B%20pgvector-336791.svg)](https://github.com/pgvector/pgvector)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-repomind--rouge.vercel.app-000000.svg)](https://repomind-rouge.vercel.app)

**Ask the repo. Get the line.**

An AI-powered GitHub repository intelligence platform that parses code structures, maps system architectures, and answers questions with verified line-level code citations.

[**Explore the Live App →**](https://repomind-rouge.vercel.app)

</div>

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [System Architecture](#system-architecture)
- [Tech Stack](#tech-stack)
- [Local Development Quickstart](#local-development-quickstart)
  - [1. Prerequisites](#1-prerequisites)
  - [2. Infrastructure (PostgreSQL + pgvector, Redis)](#2-infrastructure-postgresql--pgvector-redis)
  - [3. Backend Setup (FastAPI)](#3-backend-setup-fastapi)
  - [4. Frontend Setup (React 19 + Vite)](#4-frontend-setup-react-19--vite)
- [Usage Walkthrough](#usage-walkthrough)
- [Deployment Guide](#deployment-guide)
  - [Frontend Deployment (Vercel)](#frontend-deployment-vercel)
  - [Backend & Database Deployment](#backend--database-deployment)
  - [GitHub Actions CI/CD](#github-actions-cicd)
- [Testing](#testing)
- [License](#license)

---

## Overview

Generic AI chat tools often hallucinate functions, invent non-existent APIs, and fail when asked *"Where in the codebase is that actually implemented?"*.

**RepoMind** connects to public GitHub repositories, builds an Abstract Syntax Tree (AST) symbol graph, computes vector embeddings for code chunks, and runs a two-stage hybrid retrieval engine. When you ask a question in plain English, every factual claim is strictly grounded with clickable line-by-line code citations. If evidence is missing, the system explicitly declines to answer rather than guessing.

---

## Key Features

- **Exact Line-by-Line Citations:** Every answer cites the exact lines in the repository (e.g. `fastapi/routing.py#L146-L149`). Clicking a citation opens the code viewer focused directly on those lines.
- **Tree-sitter AST Symbol Analysis:** Parses code with language-aware Tree-sitter parsers instead of naive fixed-token splitting, preserving function signatures, class scopes, and import hierarchies.
- **Interactive System Architecture Map:** Visualizes directory modules, cross-component dependencies, and entrypoints with automated layout via ELK.js and React Flow.
- **Two-Stage Hybrid Retrieval:** Combines dense vector search (`pgvector` cosine similarity) with exact lexical path and symbol matching (`ts_rank_cd`).
- **Resilient Background Worker Pipeline:** Distributed indexing queue powered by Redis and Celery/async workers with lease management, crash protection, and orphaned job reconciliation.
- **Developer-First Design Craft:** Dual theme support (dark-first aesthetic & paper-and-ink light mode), keyboard navigation, sub-second streaming answers via Server-Sent Events (SSE), and Anime.js motion graphics.

---

## System Architecture

```text
┌────────────────────────────────────────────────────────────────────────┐
│                          Client (React 19 + Vite)                      │
│   Landing Page  •  System Architecture Map  •  Source Viewer  •  Chat  │
└────────────────────────────────────▲───────────────────────────────────┘
                                     │ HTTP / REST / SSE Streaming
┌────────────────────────────────────▼───────────────────────────────────┐
│                          Backend (FastAPI Python)                      │
│   Auth & GitHub OAuth  •  Hybrid Retrieval  •  Architecture Reader    │
│   Rate Limiting (Redis) •  Provenance & Citations  •  LLM Service      │
└──────────────┬──────────────────────────────────────────┬──────────────┘
               │                                          │
               ▼                                          ▼
┌──────────────────────────────┐        ┌────────────────────────────────┐
│   PostgreSQL + pgvector      │        │          Redis Queue           │
│   - Users & Repositories     │        │   - Indexing Job Queue         │
│   - Files, Symbols, Chunks   │        │   - Worker Leases & Locks      │
│   - Vector Embeddings (768d) │        │   - Rate Limit Counters        │
└──────────────────────────────┘        └────────────────┬───────────────┘
                                                         │
                                                         ▼
                                        ┌────────────────────────────────┐
                                        │    Indexing Worker (Python)    │
                                        │   - Git Clone (ephemeral)      │
                                        │   - Tree-sitter AST Parse      │
                                        │   - Chunking & Embedding       │
                                        └────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4, Motion (Framer), Anime.js v4, React Flow, ELK.js, Shiki |
| **Backend** | Python 3.11+, FastAPI, Pydantic v2, Pydantic-Settings, SQLAlchemy 2, Alembic, Uvicorn |
| **Data & Vectors** | PostgreSQL 16 + `pgvector`, BAAI/bge-base-en-v1.5 embeddings |
| **Queues & Cache** | Redis 7 |
| **Parsing & AI** | Tree-sitter AST parsers, Google Gemini API, Workers AI |
| **Deployment** | Vercel (Frontend), Docker, Docker Compose, GitHub Actions |

---

## Local Development Quickstart

### 1. Prerequisites

- **Node.js:** 20.x or higher
- **Python:** 3.11 or higher
- **Docker & Docker Compose:** Installed and running
- **Git CLI:** Available on your system `PATH`

---

### 2. Infrastructure (PostgreSQL + pgvector, Redis)

Start the database with `pgvector` extension and the Redis queue using Docker Compose:

```bash
docker compose up -d
```

- **PostgreSQL:** `localhost:5433` (Database: `codebase_intellisense`)
- **Redis:** `localhost:6379`

---

### 3. Backend Setup (FastAPI)

1. Navigate to the `server/` directory:
   ```bash
   cd server
   ```

2. Create and activate a Python virtual environment:
   ```bash
   # Windows PowerShell:
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1

   # Linux / macOS:
   python -m venv .venv
   source .venv/bin/activate
   ```

3. Install required dependencies:
   ```bash
   pip install --upgrade pip
   pip install -r requirements.txt -c constraints.txt
   ```

4. Configure environment variables by copying `.env.example`:
   ```bash
   cp ../.env.example .env
   ```

5. Run database migrations:
   ```bash
   alembic upgrade head
   ```

6. Start the development API server:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```

- **API Root:** `http://localhost:8000`
- **Swagger Documentation:** `http://localhost:8000/docs`
- **Health Check:** `http://localhost:8000/ready`

---

### 4. Frontend Setup (React 19 + Vite)

1. Open a new terminal and navigate to `client/`:
   ```bash
   cd client
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the Vite development server:
   ```bash
   npm run dev
   ```

- **Web Application:** `http://localhost:3000`

---

## Usage Walkthrough

1. **Connect a Repository:** Click **"Connect GitHub"** or paste any public GitHub repository URL (e.g. `fastapi/fastapi` or `pallets/flask`).
2. **Background Ingestion:** The background worker clones the immutable commit SHA, parses files using Tree-sitter, extracts symbols, and indexes vectors into PostgreSQL.
3. **Explore System Architecture:** Visit the **Architecture** tab to view auto-generated component boundaries, cross-module import weights, and dependency flow charts.
4. **Ask Questions:** Use the **Chat** interface to query the codebase in natural language.
5. **Inspect Verified Citations:** Click on citations inside the chat response to jump directly to the exact file and lines in the built-in code viewer.

---

## Deployment Guide

### Frontend Deployment (Vercel)

The client application is deployed at: **https://repomind-rouge.vercel.app**

To deploy your own instance to Vercel:
1. Connect your GitHub repository to [Vercel](https://vercel.com).
2. Set the **Root Directory** to `client`.
3. Set the build command to `npm run build` and output directory to `dist`.
4. Add the following environment variable in the Vercel dashboard:
   - `VITE_API_URL`: The public HTTPS URL of your deployed FastAPI backend.
5. Deploy. The included `client/vercel.json` ensures client-side routing works seamlessly.

---

### Backend & Database Deployment

The backend can be deployed using the production Docker configuration:

```bash
docker compose -f infrastructure/docker-compose.prod.yml up -d
```

#### Production Environment Variables
Set the following keys in your deployment provider (Render, Railway, Fly.io, or AWS ECS):
- `DATABASE_URL`: `postgresql+psycopg://user:password@host:5432/dbname`
- `REDIS_URL`: `redis://:password@host:6379/0`
- `SECRET_KEY`: Random 32+ character hex string for JWT sessions.
- `ENCRYPTION_KEY`: Fernet key for encrypting GitHub access tokens at rest.
- `GEMINI_API_KEY`: API key for Google Gemini model inference.
- `CORS_ORIGINS`: `["https://repomind-rouge.vercel.app"]`
- `ENVIRONMENT`: `production`

---

### GitHub Actions CI/CD

Continuous Integration and Continuous Deployment workflows are configured in `.github/workflows/`:

- **[ci.yml](.github/workflows/ci.yml):** Automatically triggers on pull requests and pushes to `main`. Runs typechecking, client build, vitest suite, and backend unit test suite.
- **[deploy.yml](.github/workflows/deploy.yml):** Builds and publishes the backend Docker image to GitHub Container Registry (`ghcr.io`) and deploys the frontend.

---

## Testing

### Client Tests
Run the Vitest test suite (includes component data integrity, ELK layout, theme, and API adapters):
```bash
cd client
npm test
```

### Backend Tests
Run the pytest test suite:
```bash
cd server
pytest -m "not integration"
```

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
