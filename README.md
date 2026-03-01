# PaperPanda

面向科研场景的论文语义检索与知识库问答系统。  
项目采用前后端分离架构：`Next.js + FastAPI + PostgreSQL + Redis + Milvus`，支持论文检索、收藏管理、知识库 PDF 问答、账号体系与历史记录。

## 目录

- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [系统架构](#系统架构)
- [快速开始](#快速开始)
- [环境变量说明](#环境变量说明)
- [常用脚本](#常用脚本)
- [测试](#测试)
- [API 概览](#api-概览)
- [项目结构](#项目结构)
- [常见问题](#常见问题)
- [贡献指南](#贡献指南)
- [许可证](#许可证)

## 功能特性

- 语义检索：基于向量召回（Milvus）与过滤条件（来源、年份、分类）返回论文结果。
- 数据采集：支持 arXiv 增量爬取；支持 CCF 目录（DBLP）论文元信息抓取。
- 多语言处理：支持标题/摘要翻译流程，检索结果可切换翻译显示。
- 收藏管理：收藏夹创建、重命名、拖拽排序、导出（`json/csv/bibtex`）。
- 知识库问答：上传 PDF 或从论文加入知识库，分块向量化后进行检索问答。
- 用户系统：邮箱验证码注册、登录、刷新令牌、登出、重置密码。
- 历史记录：搜索历史与论文浏览历史记录。

## 技术栈

- 前端：`Next.js 14`、`React 18`、`TypeScript`、`Tailwind CSS`
- 后端：`FastAPI`、`SQLAlchemy (async)`、`Alembic`、`Celery`
- 存储与检索：`PostgreSQL`、`Redis`、`Milvus`
- AI 相关：本地/远程 Embedding；多 LLM Provider 路由（OpenAI 兼容、Gemini、Anthropic、本地 HF）
- 运维与环境：`Docker Compose`、`Conda (environment.yml)`

## 系统架构

- 前端通过 `/api/v1/*` 反向代理访问后端 API。
- 后端提供认证、检索、收藏、知识库、用户等 REST 接口。
- 论文摘要向量写入 Milvus；结构化数据写入 PostgreSQL；验证码和 token 状态写入 Redis。
- 爬虫与向量化流程可通过脚本手动触发，或通过 Celery 定时任务触发。

## 快速开始

### 1. 环境要求

- `Python 3.11+`
- `Node.js 18+`（建议 18/20 LTS）
- `Docker` + `Docker Compose`
- 可选：`Conda`（推荐，仓库提供 `environment.yml`）

### 2. 克隆与初始化

```bash
git clone https://github.com/Wenzhao299/PaperPanda.git
cd PaperPanda
cp .env.example .env
```

### 3. 安装依赖

方式 A（推荐，Conda）：

```bash
conda env create -f environment.yml
conda activate env_paper
cd frontend && npm install && cd ..
```

方式 B（venv）：

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
cd frontend && npm install && cd ..
```

### 4. 启动基础设施

```bash
docker compose up -d postgres redis etcd minio milvus meilisearch
```

### 5. 初始化数据库与向量集合

```bash
python scripts/init_db.py
python scripts/init_milvus.py
```

可选：写入演示账号与示例论文

```bash
python scripts/seed_data.py
```

演示账号（由 `seed_data.py` 创建）：

- 邮箱：`demo@paperpanda.ai`
- 密码：`Demo123456`

### 6. 启动后端

```bash
cd backend
PYTHONPATH=. python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

后端接口文档（`DEBUG=true` 时）：`http://127.0.0.1:8000/api/docs`

### 7. 启动前端

创建 `frontend/.env.local`：

```dotenv
NEXT_PUBLIC_API_BASE_URL=/api/v1
BACKEND_PROXY_TARGET=http://127.0.0.1:8000
```

启动：

```bash
cd frontend
npm run dev -- --hostname 0.0.0.0 --port 3000
```

访问：`http://127.0.0.1:3000`

## 环境变量说明

完整变量见根目录 [`.env.example`](./.env.example)。以下是最常用配置：

| 变量名 | 说明 | 默认值 |
| --- | --- | --- |
| `APP_ENV` | 运行环境 | `development` |
| `DEBUG` | 是否开启调试模式 | `true` |
| `POSTGRES_HOST` / `POSTGRES_PORT` | PostgreSQL 地址 | `localhost` / `5432` |
| `REDIS_HOST` / `REDIS_PORT` | Redis 地址 | `localhost` / `6379` |
| `MILVUS_HOST` / `MILVUS_PORT` | Milvus 地址 | `localhost` / `19530` |
| `DEFAULT_LLM_PROVIDER` | 默认对话模型提供方 | `deepseek` |
| `EMBEDDING_PROVIDER` | 向量模型提供方 | `local_bge` |
| `EMBEDDING_MODEL_NAME` | 本地 embedding 模型名 | `BAAI/bge-m3` |
| `UPLOAD_STORAGE_DIR` | 知识库上传目录 | `data/uploads` |
| `CORS_ORIGINS` | 允许跨域来源 | `http://localhost:3000,...` |

## 常用脚本

### 一键局域网启动（推荐本地联调）

```bash
# 若默认 Python 路径不适配，可显式传入
PY=/path/to/python bash scripts/start_lan.sh
```

停止：

```bash
bash scripts/stop_lan.sh
```

### 数据流水线

- arXiv 增量抓取 + 向量化 + 翻译：

```bash
bash scripts/run_phase2.sh
# 或
python scripts/run_phase2_pipeline.py
```

- CCF-2022 抓取（待实现） + 入库 + 向量化 + 翻译：

```bash
bash scripts/run_ccf2022.sh
# 或
python scripts/run_ccf2022_pipeline.py
```

## 测试

后端单元/接口冒烟：

```bash
cd backend
PYTHONPATH=. python -m pytest -q
```

## API 概览

统一前缀：`/api/v1`

- `auth`：`/auth/send-code`、`/auth/register`、`/auth/login`、`/auth/refresh`、`/auth/logout`
- `search`：`/search`、`/search/history`、`/search/history/views`
- `papers`：`/papers/{paper_id}`、`/papers/{paper_id}/fulltext`
- `favorites`：收藏夹增删改查、排序、导出
- `knowledge-bases`：知识库 CRUD、文档上传/移动/删除、问答
- `user`：`/user/profile`、`/user/settings`

## 项目结构

```text
PaperPanda/
├── backend/                  # FastAPI 后端
│   ├── app/
│   │   ├── api/v1/           # 业务 API 路由
│   │   ├── services/         # 领域服务（检索/收藏/知识库等）
│   │   ├── crawler/          # arXiv / CCF 抓取流程
│   │   ├── ai/               # LLM/Embedding/翻译相关
│   │   ├── db/               # 会话、Milvus、Alembic 迁移
│   │   └── tasks/            # Celery 任务
│   └── tests/                # 后端测试
├── frontend/                 # Next.js 前端
│   └── src/
│       ├── app/              # 路由页面
│       ├── components/       # 组件
│       ├── hooks/            # 业务 hooks
│       └── lib/              # API 客户端与工具库
├── scripts/                  # 启停、初始化、验收、数据流水线脚本
├── docker-compose.yml        # 基础设施编排（不包含前后端应用容器）
└── .env.example              # 环境变量模板
```

## 常见问题

### 1) 为什么 `docker compose up` 后前端/后端没有自动启动？

`docker-compose.yml` 只编排基础设施（PostgreSQL、Redis、Milvus、Meilisearch）。  
应用层请使用 `scripts/start_lan.sh` 或手动启动前后端进程。

### 2) 验证码发送成功但收不到邮件？

开发模式下若 SMTP 未配置，后端会跳过邮件发送流程。  
可通过 Redis 查看验证码键：`email:verify:<your_email>`。

### 3) 检索结果没有翻译或 LLM 回答为 `[mock-*]`？

说明当前未配置可用的远程密钥或本地模型路径。  
请在 `.env` 中配置对应 Provider 的密钥，或设置本地模型路径。

## 贡献指南

1. Fork 并创建特性分支。
2. 提交前运行 `pytest` 与前端构建/检查。
3. 提交 PR，并说明改动动机、影响范围与测试结果。

## 许可证
`MIT`
