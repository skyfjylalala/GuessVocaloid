# 新版开发、部署和迁移

## 结构

```text
src/                    React 界面
shared/                 运行环境无关的类型、比较和搜索
server/api.ts           标准 Request / Response 的游戏 API
server/session.ts       Web Crypto 加密会话
server/repository.ts    数据访问接口及 SQL 实现
server/worker.ts        Cloudflare D1 适配
server/node.ts          Node HTTP + 标准 SQLite 适配
migrations/             SQL 表结构
data/catalog.json       可重建数据库的精简数据源（受版本控制）
data/aliases.json       独立维护的中文等别名覆盖
data/vocalist-groups.json 常见声库版本到角色身份的归并规则
data/import-report.json 筛选及缺失字段统计
scripts/                可复现导入和迁移工具
```

本地启动步骤见仓库根目录 README。`.dev.vars` 只供本地使用且不提交；生产密钥用 Wrangler secret 设置。开发配置中的数据库 UUID 是占位符，部署前需要替换。

Windows PowerShell 若找不到 `pnpm`，运行 `.\dev.cmd` 即可。启动器会优先使用正常安装的 Node 和 pnpm，也支持本机已有的 Codex 运行时，无需修改全局 PATH。迁移到其他电脑时，安装正常的 Node/pnpm 后仍可使用同一启动器。

## 第一版的范围

难度：初级 Top 50、中级 Top 200、高级 Top 1,000，均按当前曲库的原投稿再生数快照排名。答案、搜索和浏览曲库使用同一范围；默认初级。切换难度会新开一局，刷新保留当前难度和进度，成绩按难度分别统计。旧版本的千首进度按高级继续。

自动部署配置和首次授权步骤见 [`../docs/cicd.zh-CN.md`](../docs/cicd.zh-CN.md)。推送 `dev` 可触发测试、构建与部署，首次需要配置 GitHub 的 Cloudflare CI 凭据。

当前只有无限练习，没有每日题目、账户、排行、多人模式或云端个人进度。个人成绩和进度在当前浏览器保存，清理浏览器数据就会丢失。会话有效期七天，曲库版本变化后需要新开一局。

会话令牌加密答案和已猜 ID，服务器验证输入、重复猜测和机会次数；主动揭晓也会结束会话。不包含竞争性排行，旧令牌可被重放，因此不将其视为强防作弊系统。公开前可按实际流量在 Cloudflare 配置规则限流。客户端显示的猜测结果不作为后端事实来源。

## Cloudflare 部署

只需 GitHub 和 Cloudflare 账号；无需其他数据库服务。以下命令在 `web/` 执行：

```sh
pnpm exec wrangler login
pnpm exec wrangler d1 create guess-vocaloid
```

将返回的 `database_id` 填入 `wrangler.jsonc`，然后：

```sh
pnpm data:import
pnpm exec wrangler d1 migrations apply guess-vocaloid --remote
pnpm exec wrangler d1 execute guess-vocaloid --remote --file=data/seed.sql
pnpm exec wrangler secret put SESSION_SECRET
pnpm deploy
```

`SESSION_SECRET` 使用密码管理器生成的至少 32 字符随机值。在 Wrangler 提示中输入，避免写进 shell 参数或文件。所有部署操作都由你自己的账号执行，默认使用平台子域名。Vite 插件会生成部署入口配置，静态目录是 `dist/client`，Worker 产物放在独立目录。不要将整个 `dist/` 作为公开静态目录。

`seed.sql` 会替换歌曲和元数据表中的现有内容；更新线上曲库前先导出备份。当前不在这些表存玩家数据。曲库变更后重新部署，刷新 Worker 的内存缓存；接口客户端缓存最长五分钟。

当前配置启用 Cloudflare 可观测性；API 不打印请求体、会话令牌或答案。免费额度不是无限容量，公开后观察 CPU、请求量和 D1 扫描行数。歌曲索引加载后在浏览器检索，不会每次按键查数据库。

## 数据及可复现导入

随仓库提供的 `data/catalog.json` 足够本地开发和部署，不必下载原始大文件：

```sh
pnpm data:import
pnpm db:local
```

`data:import` 生成忽略提交的 `data/seed.sql`。默认不会重新采集数据。质量报告中的 BPM 缺失真实保留为未知，绝不使用零冒充。

需要重新筛选全量快照时：

1. 从 Hugging Face 的 `amiadesu/VocaDBSongs` 下载 `songs/train` 的四个 Parquet 文件，保存为 `data/raw/0000.parquet` 至 `0003.parquet`。本次使用的转换版本为 `87d68d26e0e12c4206d5946d6d5766fe6f89324c`，固定版本地址格式为 `https://huggingface.co/datasets/amiadesu/VocaDBSongs/resolve/87d68d26e0e12c4206d5946d6d5766fe6f89324c/songs/train/0000.parquet`。这是第三方离线快照，不代表当日最新数据。
2. 为数据处理 Python 安装 `duckdb`，执行 `python scripts/extract-snapshot.py`。
3. 执行 `node scripts/build-catalog.mjs --snapshot`。它按 Original、主唱、主要作者、原投稿百万再生筛选，按单个原投稿最大播放量取前 1,000 首，并生成质量报告。不累加平台或转载播放量。
4. 核对差异后重新运行数据库导入，保留线上备份。

`additionalNames` 和 `views` 等嵌套字段通过 JSON 解析。PV 与播放量按原投稿视频标识匹配，移除伴唱和纯画师；P 主包含作曲、编曲、调声。常见声库版本通过 `vocalist-groups.json` 归并为同一角色（如初音 Append/V4X、重音 UTAU/SV），未归并的艺人保留原始 ID；通用 TTS 不进入本版曲库。元数据的缺失、错误及第三方快照的旧记录仍可能影响游戏。别名覆盖保存在单独文件中；重新筛选时会自动应用。

来源：VocaDB 数据库，[许可说明](https://wiki.vocadb.net/docs/license)；快照：[amiadesu/VocaDBSongs](https://huggingface.co/datasets/amiadesu/VocaDBSongs)。署名、来源链接及许可链接保留在页面和数据文件中。此项目未包含媒体文件。

## 迁移：先证明能离开 Cloudflare

无需更换业务代码即可用普通 Node + SQLite 运行：

```sh
pnpm data:import
pnpm build
pnpm start:node
```

访问 `http://127.0.0.1:4180`。首次运行会自动创建 `.local/catalog.sqlite`，已有数据库不会重置。可以通过 `HOST`、`PORT`、`DATABASE_PATH`、`SESSION_SECRET` 环境变量配置；未设置密钥时生成本次进程专用密钥，重启会使旧局失效。生产使用固定密钥和反向代理 HTTPS，并将 `PUBLIC_ORIGIN` 设置为公开站点地址（如 `https://example.com`），使来源校验与 HTTPS 一致。Node 默认仅监听本机；容器内可显式设 `HOST=0.0.0.0`。

从 D1 导出至标准 SQLite：

```sh
pnpm exec wrangler d1 export guess-vocaloid --remote --output=data/export.sql
node scripts/restore-sqlite.mjs data/export.sql .local/migrated.sqlite
```

然后把 `DATABASE_PATH` 指向新文件并启动 Node 服务。恢复脚本拒绝覆盖已有数据库。曲库源 JSON 是另一份跨数据库可复建备份。

换 PostgreSQL 时，SQLite 导出的 SQL 不是直接无修改导入：需要调整类型和占位符，编写 PostgreSQL `SqlDriver`，并以相同 `CatalogRepository` 接口接入。纯判题、搜索、会话和前端不需改变。客户端进度保留在同一域名才会自然延续；更换域名或密钥会影响旧局，但歌曲数据不受影响。

访问量增加时先根据指标判断瓶颈。此版本每局没有数据库写入，歌曲按主键取值，因此可先扩大 Workers／D1 额度；不必因首次走出免费额度就迁移架构。

## 验证

`pnpm test` 覆盖集合比较、箭头方向、BPM 区间、缺失值、别名搜索、加密会话篡改／过期、重复猜测、八次失败、揭晓后恢复、版本变化、请求校验、离线筛选与真实曲库在标准 SQLite 中运行。`pnpm build` 包含 TypeScript 检查和前后端生产构建。
