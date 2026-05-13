# KU Compass

一个面向小红书电子商品的哈利法大学研究生申请测评页。用户输入本科/硕士背景、专业方向、GPA、语言、GRE、科研和文书状态后，页面会输出：

- 适合申请的 Khalifa University 项目方向
- 非官方录取概率区间
- 硬性门槛检查
- 下一步提升建议

## 本地运行

```bash
npm test
python3 -m http.server 4173
```

然后打开 `http://localhost:4173`。

当前本地验证码会写入 `.seller/current-code.txt`，公开验证码会写入 `current-code.txt`。`.seller/` 已加入 `.gitignore`。

## 数据来源

项目列表和录取门槛以 Khalifa University 官方页面为基线：

- Graduate Programs: https://www.ku.ac.ae/academics/graduate-programs
- Postgraduate Admissions: https://www.ku.ac.ae/postgraduate-admissions
- Graduate Scholarships Catalog: https://ku-ae.smartcatalogiq.com/en/2025-2026/graduate-catalog/graduate-admission-and-scholarships/scholarships

## 验证码轮换

`scripts/rotate-code.mjs` 会生成 10 位验证码，把明文写到本地 `.seller/current-code.txt` 和公开文件 `current-code.txt`，并把哈希写入 `data/access-code.json`。网页读取哈希进行校验。

```bash
npm run rotate-code
```

GitHub Actions 工作流 `.github/workflows/rotate-access-code.yml` 每两天运行一次，并提交新的 `data/access-code.json` 和 `current-code.txt`，随后重新部署 GitHub Pages。它也支持手动运行：

1. 打开 GitHub 仓库的 `Actions`
2. 选择 `Rotate access code`
3. 点击 `Run workflow`
4. `custom_code` 留空会自动生成；填写则使用你指定的验证码

如果你要自动把新验证码发到发货系统，配置仓库 Secret：

- `FULFILLMENT_WEBHOOK_URL`: 接收验证码的 HTTPS webhook
- `FULFILLMENT_WEBHOOK_TOKEN`: 可选 Bearer Token

仓库 Variable：

- `ACCESS_URL`: 你的小红书发货链接，例如 `https://yourname.github.io/ku-compass/`
- `CODE_URL`: 公开验证码链接，例如 `https://yourname.github.io/ku-compass/current-code.txt`

工作流也支持手动运行时把明文验证码显示在 summary 中，但只建议在私有仓库使用。

## 发货链接

给买家发两个链接即可：

- 问卷链接：`https://yourname.github.io/ku-compass/`
- 验证码链接：`https://yourname.github.io/ku-compass/current-code.txt`

`current-code.txt` 会显示当前验证码和北京时间有效期。注意：这个验证码链接是公开文件，如果买家同时泄露问卷链接和验证码链接，其他人也可以访问。

## GitHub Pages

`.github/workflows/pages.yml` 会把当前静态站和 `current-code.txt` 部署到 GitHub Pages。发布前在 GitHub 仓库设置中启用 Pages，并选择 GitHub Actions 作为发布来源。

## 重要限制

纯 GitHub Pages 是静态前端，不能做到真正的服务端鉴权。当前方案能防止普通买家直接把链接发到评论区，但不能抵御懂前端的人绕过页面。后续如果销量上来，建议把验证码校验迁移到 Cloudflare Workers、Vercel Serverless 或自己的后端。
