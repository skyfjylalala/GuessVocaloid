# Guess Vocaloid

根据歌手、P 主、发表年份、BPM 和时长，在八次机会内猜出一首术曲。

新版在 [`web/`](web/)，旧 Next.js Demo 保留在 [`guessmiku/`](guessmiku/)。

## 本地启动

Windows 上若提示找不到 `pnpm`，在项目中执行：

```powershell
cd G:\guessvocaloid\web
.\dev.cmd
```

启动器优先使用已安装的工具，也能使用本机现有的 Codex Node/pnpm 运行时；只在当前进程内配置 PATH，不修改系统设置。首次运行会准备依赖和本地曲库。按 Ctrl+C 停止服务。

需要 Node.js 22.13+（建议 Node 24 LTS）及 pnpm。

```sh
cd web
pnpm install
pnpm data:import
pnpm db:local
```

将 `.dev.vars.example` 复制为 `.dev.vars`，然后运行：

```sh
pnpm dev
```

访问终端输出的本地地址。开发时使用本地 Workers 和 D1 模拟器，无需 Cloudflare 账号。

## 当前功能

- 1,000 首真实曲库，按原投稿百万再生筛选；不会实时查询 VocaDB。
- 初级 Top 50、中级 Top 200、高级 Top 1,000；答案、搜索和成绩跟随难度。
- 无限练习，八次机会，主唱与作者部分匹配、数字方向、BPM 区间和缺失数据提示。
- 中、日、英界面；原题、英文、罗马字、已收录中文别名及 P 主搜索。
- 刷新续玩、揭晓答案、原投稿链接、无剧透分享、浏览器个人统计。
- 答案在后端判定，会话使用 AES-GCM 加密，前端搜索索引不包含答案选择。
- Worker / D1 与 Node / SQLite 两个运行入口，共享同一套游戏逻辑。

部署及迁移见 [`web/README.md`](web/README.md)。原型评估见 [`docs/restart-assessment.zh-CN.md`](docs/restart-assessment.zh-CN.md)。
GitHub 自动部署见 [`docs/cicd.zh-CN.md`](docs/cicd.zh-CN.md)。

## 验证

```sh
cd web
pnpm test
pnpm build
```

## 数据来源

歌曲元数据来自 [VocaDB](https://vocadb.net)，初始离线数据来自 [amiadesu/VocaDBSongs](https://huggingface.co/datasets/amiadesu/VocaDBSongs)。VocaDB 数据按其 [CC BY 许可说明](https://wiki.vocadb.net/docs/license) 使用。筛选和别名补充记录在 `web/data/`；没有包含音频、歌词或第三方图片。
