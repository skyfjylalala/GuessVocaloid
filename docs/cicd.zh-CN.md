# GitHub 自动检查和部署

当前约定：推送 `dev` 更新现有 `guess-vocaloid.skyfjy.workers.dev` 网站；提交到 `dev` 或 `main` 的 Pull Request 只运行检查。`main` 暂不发布。

工作流文件：`.github/workflows/deploy.yml`。

## 一次性配置

1. 将本地新版本提交并推送到 GitHub 的 `dev` 分支。本机 Git 需要先完成 GitHub 登录，Cloudflare 的 Wrangler 登录不包含 GitHub 授权。
2. 在 Cloudflare 创建专门用于本仓库部署的 API Token。限制到部署使用的账号，权限为 Account / Workers Scripts / Edit、Account / D1 / Edit，以及 Account / Account Settings / Read。不要把 Wrangler 的个人 OAuth 令牌复制到 CI。
3. 在 [仓库 Actions Secrets](https://github.com/skyfjylalala/GuessVocaloid/settings/secrets/actions) 添加 `CLOUDFLARE_API_TOKEN`，值是上一步的令牌。令牌只输入 GitHub 的 Secret 表单，不发到聊天，也不写进代码。
4. 在同一设置页面的 Variables 标签添加 `CLOUDFLARE_ACCOUNT_ID`，值为 `ad322e43fa18e355ddc6adf77893f488`。账号 ID 是配置标识，不是密钥。
5. 推送一次 `dev`，或在首次失败的 Actions 运行中点击 Re-run all jobs。检查 Test and build 与 Deploy dev to current website 两个 job 都通过。

Cloudflare 已有的 `SESSION_SECRET` 保留在 Worker 中，不需要再上传到 GitHub。

## 每次代码更新

在本地 `dev` 修改后提交并推送：

```powershell
git add web .github docs README.md .gitignore
git commit -m "Describe this change"
git push origin dev
```

之后 GitHub 会自动安装依赖、生成测试用 SQL、运行测试、构建生产版本，通过后应用增量 schema migrations 并部署。部署串行执行，并跳过已经落后于远端 dev 的提交，避免旧代码覆盖新版本。失败时线上保持上一个已部署的应用版本；数据库迁移本身应保持向后兼容。

当前难度功能不修改数据库表或曲库内容，部署即可生效。不需要重新建 D1、重新登录或重新设置会话密钥。

## 曲库更新与代码更新的区别

工作流不会每次推送都清空并重写曲库。以后修改 `web/data/catalog.json` 时，按 `web/README.md` 的数据更新步骤先备份、生成 seed 并导入线上 D1，再部署代码。`pnpm data:import` 只在本地生成 SQL，不会单独更新线上数据库。

## 常见失败

- Test 失败：修好测试再推送；部署 job 不会运行。
- 提示未配置 CI 凭据：检查 Secret 与 Variable 的名字，注意大小写。
- Cloudflare 403：检查令牌的账号范围与 Workers Scripts / D1 权限。
- `pnpm install --frozen-lockfile` 失败：本地执行安装更新锁文件，将 `web/pnpm-lock.yaml` 与依赖变更一起提交。

这是 GitHub Actions 与 Cloudflare 官方支持的外部 CI/CD 方式：[GitHub Actions 文档](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)。尚未完成一次真实 Actions 运行前，不把本地构建通过等同于 CI/CD 已启用。
