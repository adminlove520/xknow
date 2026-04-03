---
name: xknow-cli
description: "Xknow-CLI - AI-First Knowledge Management for OpenClaw Lobsters. Used for compiling wiki, Q&A queries, and health checks. Based on Karpathy's LLM KB concept. Keywords: knowledge management, wiki, compile, lint, xknow-cli, knowledge-base"
---

# Xknow-CLI - OpenClaw Lobster Knowledge Management

> Based on Karpathy LLM Knowledge Bases concept: LLM writes the Wiki, Humans ask and discover.

## Configuration

### 1. LLM API (OpenClaw Bridge & Overrides)

xknow-cli automatically bridges your existing OpenClaw configuration. You can also manually override these via CLI options or environment variables.

**Supported Overrides**:
- `--api-key <key>` or `OPENAI_API_KEY`
- `--base-url <url>` or `OPENAI_BASE_URL`
- `--model <model>` or `OPENAI_MODEL`
- `--api-type <type>` (openai|anthropic) or `OPENAI_API_TYPE`

### 2. Obsidian Vault

```bash
# Initialize (Create a standalone Vault)
xknow-cli init

# List current configuration
xknow-cli config --list
```

**Vault Location**: `~/Obsidian/Xknow-Wiki/` (default)

**Directory Structure**:
```text
~/Obsidian/Xknow-Wiki/
├── raw/               # Raw input (articles, papers, repos, notes)
├── INDEX.md          # Auto-generated navigation index
├── .xknow-history.json # Incremental compilation history
└── wiki/              # LLM-compiled structured wiki pages
```

## CLI Commands

### init - Initialize Vault
```bash
xknow-cli init              # Create base directory structure
xknow-cli init --force      # Force reset everything
```

### compile - Incremental Compilation
```bash
xknow-cli compile                  # Compile raw -> wiki (incremental)
xknow-cli compile --force          # Force full recompile
xknow-cli compile --source notes   # Compile notes only
# Example with explicit LLM:
xknow-cli compile --model deepseek/deepseek-chat --base-url https://api.deepseek.com
```

### query - Intelligent Q&A (Synthesis)
```bash
xknow-cli query "What are the key design choices?" --format slides --save
```
*Tip: Use `--save` to persist the synthesis back into your KB. Agents can pass `--base-url` and `--api-key` to ensure correct LLM connectivity.*

### search - Fast Local Search
```bash
xknow-cli search "vector-db"  # Fast offline keyword lookup
```

### lint - AI Health Check
```bash
xknow-cli lint  # AI audit. Generates LIBRARIAN_REPORT.md in your Wiki.
```

### doctor - Setup Diagnosis
```bash
xknow-cli doctor  # Diagnose environment, network, and config
```

## Karpathy Methodology Implementation

| Design Pillar | Implementation Details |
|---------------|------------------------|
| **Ingest**    | Chaos `raw/` data is compiled by LLM into ordered `wiki/` pages. |
| **Wiki**      | Rarely edited manually; LLM manages summaries, links, and updates. |
| **Q&A**       | For smaller KBs (<100k tokens), uses full context for deep queries. |
| **Index**     | Auto-generated `INDEX.md` provides global navigation. |

## Practical Scenarios

### Scene 1: Input New Knowledge
1. User puts random notes or research papers into `raw/notes/`.
2. Agent runs `xknow-cli compile`.
3. LLM automatically creates structured articles, Wikilinks, and summaries in `wiki/`.

### Scene 2: Deep Q&A on Knowledge Base
1. User asks: "Have we ever discussed Agent memory consolidation mechanisms?"
2. Agent runs `xknow-cli query "Summary of Agent memory consolidation discussions"`.
3. LLM reads all `wiki/` files and provides a cross-document deep summary.

### Scene 3: Maintain KB Health
1. Agent regularly runs `xknow-cli lint`.
2. LLM identifies content overlaps or missing connections.
3. Suggests new conceptual articles or merges redundant pages.

## Privacy & Principles

- **Local First**: Wiki content is stored locally in your Obsidian directory.
- **Zero Config**: Bridges OpenClaw permissions automatically.
- **Transparency**: Every step is recorded in `.xknow-history.json`.
