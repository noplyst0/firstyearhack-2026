# Snowflake: what it is and how we can use it (side prize: best use of Snowflake)

## What it is
Cloud data platform. Load data (tables, CSV, JSON, PDFs, images) and query it with SQL.
Storage and compute are separate: a "warehouse" is compute you switch on, use and off, billed per second.
Use it through the web console (Snowsight), SQL, Python connector, Snowpark or the REST API.

## Features worth using
| Feature | What it does | Use for |
|---|---|---|
| Cortex AI functions (AI_COMPLETE etc.) | Call an LLM from SQL on your rows: summarise, classify, extract, translate, analyse images (video added Nov 2026) | AI over a whole dataset in one query |
| Cortex Search | Hybrid keyword + vector search over documents, with reranking | RAG: "chat with these docs" |
| Cortex Analyst (semantic views) | Plain-English question -> SQL over tables | "Ask your data" |
| Cortex Agents | One agent combining Analyst (tables) + Search (docs), optional tools: code exec, web search, MCP | Strongest "best use" story |
| Streamlit in Snowflake | Python web apps hosted inside Snowflake | Fast demo UI, no extra hosting |
| Snowpark | Python on Snowflake compute | Cleaning data, ML |
| Marketplace | Ready-made datasets, query instantly | Real data in minutes |

## How it fits our stack
Data -> Snowflake tables or a stage -> Cortex Search / Analyst / Agents -> our frontend via REST API or Python connector
(or the whole UI in Streamlit inside Snowflake).

## For the pitch
Show Snowflake doing the AI work on real data, not just storage. Name which Cortex feature does what.
Governance angle: the data never leaves Snowflake.

## Practical
- Free trial: sign up early (credit amount not verified, check the sign-up page).
- Cortex is billed per token: test on small data first.
- Some Agent tools (web search, code exec) must be enabled at account level.
- Credentials go in `.env` (gitignored). NEVER commit them. Share them with the team privately.

## Sources
- https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents
- https://docs.snowflake.com/en/user-guide/snowflake-cortex/aisql
- https://www.snowflake.com/en/developers/guides/getting-started-with-cortex-agents/
