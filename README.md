# 分级列表制作器

一个零依赖、纯前端的 Tier List 制作器。左侧是可编辑的红到绿渐变分级色块，右侧是横向排列的角色头像列表；可导入自己的图片，并导出为高清 PNG。

初始角色头像快照：**2026-10-24**，对应原神 **7.1**、崩坏：星穹铁道 **4.6**、绝区零 **3.3**。

| 游戏 | 初始角色数 |
| --- | --- |
| 原神 | 124 |
| 崩坏：星穹铁道 | 98 |
| 绝区零 | 62 |
| 合计 | 284 |

启用下方 GitHub Actions 自动更新后，角色数量可能增加；实际状态以 `data/characters.js` 和页面页脚为准。

## 功能

- 两列 N 行表格：左侧方形纯色分级块，右侧黑色横向头像列表。
- 分级色块颜色按行数在红色到绿色之间自动渐变，分隔线为黑色。
- 右侧行间为灰色分隔线；同一行内的头像仅通过间距区分，没有任何额外界隔。
- 默认分级为 `S / A / B / C / D`，可直接点击色块文字修改，最多 12 个字符，字号自动适配。
- 可添加/删除行，默认最多 20 行。
- 内置原神、崩坏：星穹铁道、绝区零全部当前角色头像，按游戏分页、支持中英文搜索。
- 点击头像加入当前目标行，或直接拖拽到任意位置；行内拖动排序，跨行拖动移动。
- 导入本地图片（PNG / JPG / WebP / GIF / SVG 等），自动压缩到最大 512px 并存入浏览器本地存储。
- 一键导出 2 倍分辨率 PNG，不含工具栏、删除按钮和编辑态高亮。
- 状态自动保存在 `localStorage`，刷新后恢复。

## 启动

项目没有运行时依赖，无需 `npm install`。

```bash
cd rank
npm start
```

然后打开 <http://127.0.0.1:8000>。

也可以直接运行：

```bash
node server.js
```

或使用任意静态服务器：

```bash
python3 -m http.server 8000
```

> 请务必通过 HTTP 服务打开，不要直接双击 `index.html`。浏览器会因本地文件安全策略污染 Canvas，导致导出的 PNG 失败。页面在 `file://` 模式下会显示提示。

## 部署到 GitHub Pages

可以。项目完全静态，资源和脚本均使用相对路径；GitHub Pages 的 HTTPS 同源环境不会污染 Canvas，导出功能正常。

已附带 `.github/workflows/pages.yml`，通过 Actions 发布时只部署成品文件，不会公开 `server.js`、`scripts/` 或 README。

1. 将项目推送到 GitHub，默认分支为 `main`。
2. 进入仓库 **Settings → Pages → Build and deployment**，把 **Source** 设为 **GitHub Actions**。
3. 向 `main` 推送一次，或在 Actions 页手动运行 **Deploy static site to GitHub Pages**。
4. 打开 `https://<用户名>.github.io/<仓库名>/`。

补充说明：

- 如果默认分支是 `master`，把 workflow 中的 `branches: [main]` 改为 `master`。
- 也可以不用 Actions：将 Pages 的 Source 设为 **Deploy from a branch**，选择 `main` / `(root)`。根目录已有 `.nojekyll`；这种模式会一并公开 `server.js` 和 `scripts/`，推荐使用 Actions。
- 站点约 18 MB，远低于 GitHub Pages 的容量限制。
- 本地模拟项目站点子路径：

  ```bash
  npm run build:site
  python3 -m http.server 8080
  # 打开 http://localhost:8080/_site/
  ```

## 使用说明

1. 在右上角「添加到」选择目标行，或点击列表中的任意一行。
2. 在下方头像库切换游戏、搜索角色，点击头像加入目标行；也可以把头像拖到某一行。
3. 拖动行内头像可以调整顺序；双击头像或点击悬停出现的叉号可以移除。
4. 点击左侧色块中的文字可直接改名，例如把 `S` 改成「神」或「T0」。
5. 悬停色块右上角的叉号可删除整行（有内容时会确认）；工具栏「添加行」增加新行。
6. 点击「导出 PNG」下载当前列表。导出尺寸为逻辑尺寸的 2 倍。

## 项目结构

```text
.
├── index.html               页面结构
├── styles.css               布局与视觉样式
├── app.js                   状态、编辑、拖拽、导入与本地存储
├── export.js                Canvas 导出渲染器
├── server.js                本地零依赖静态文件服务器
├── data/
│   └── characters.js        生成的角色清单（284 条）
├── assets/
│   ├── gi/                  原神头像（256×256 PNG）
│   ├── hsr/                 星穹铁道头像（256×256 PNG）
│   └── zzz/                 绝区零头像（256×250 WebP）
├── scripts/
│   ├── build-library.mjs    角色数据与头像更新脚本
│   └── build-site.mjs       生成 GitHub Pages 成品目录 _site/
├── .github/
│   └── workflows/
│       ├── pages.yml        GitHub Pages 发布流程
│       └── update-library.yml  定时角色库更新流程
└── .nojekyll                禁止 Jekyll 处理静态站
```

## 角色数据与更新

头像与名称来自社区维护的公开游戏数据镜像：

- 原神：Project Amber（`gi.yatta.moe`）中文/英文角色数据与 256×256 头像。
- 崩坏：星穹铁道：Project Amber 中文/英文数据，头像优先使用 StarRailRes 的 256×256 版本，失败时回退到 Project Amber。
- 绝区零：Enka.Network 的角色清单/本地化数据，头像使用 Nanoka 的 256×250 角色半身图。

本地手动更新角色列表：

```bash
npm run build:library          # 只下载缺失头像，适合日常更新
npm run build:library -- --force  # 强制重下全部头像
```

脚本会重新读取上述数据源、下载缺失的头像并重建 `data/characters.js`。需要联网。已有头像默认跳过下载；加 `--force` 会覆盖全部图片。如果没有角色变化，脚本会保留原来的快照日期，不会产生仅时间戳变化的文件；若有头像下载失败，则拒绝写入不完整清单。

### GitHub Actions 自动更新

仓库附带 `.github/workflows/update-library.yml`，每天 03:17 UTC（GitHub 可能延迟）运行，也可在 Actions 页手动触发（手动触发即使没有数据变化也会重新部署当前站点）。它会：

1. 执行 `npm run build:library`，拉取最新角色并下载缺失头像。
2. 仅在 `data/characters.js` 或 `assets/` 确实有变化时，以 `github-actions[bot]` 身份提交并推送。
3. 在同一次运行中构建 `_site` 并部署 GitHub Pages。使用默认 `GITHUB_TOKEN` 产生的提交不会再次触发 `pages.yml`，所以这里直接部署，避免站点落后。
4. 数据源不可用或头像缺失时停止，不提交或发布不完整数据；下次定时任务或手动重跑会重试。

前提与注意：

- Pages 的 Source 必须设置为 **GitHub Actions**（见上节）。
- 工作流声明了 `contents: write`；如果组织策略或 `main` 分支保护禁止 bot 直接推送，需要允许 GitHub Actions 推送，或改为由 bot 创建 PR 后人工合并。
- 自动更新只提交数据和 `assets/`，不会改写 README 中的初始数量与版本号；实际状态以 `data/characters.js` 的 `generatedAt` 和页面页脚为准。
- 想调整频率，修改 workflow 中的 cron 表达式即可。

数据说明：

- 原神、星穹铁道按数据源中的 release 时间戳过滤已发布角色；绝区零使用 Enka 的当前角色清单。
- 同一头像对应的多个「旅行者」元素形态会合并为一个头像；「开拓者」的不同命途/性别使用不同头像，名称中会标注命途和性别。
- 如果数据源结构变化，脚本会报错并保留已有文件，不会清空本地头像。

## 限制

- 行数上限 20，每行上限 200 个头像，分级文字上限 12 个字符。
- 导入图片会压缩到最长边 512px；受 `localStorage` 容量限制，大量导入可能需要清理站点数据后才能继续保存。
- 拖拽排序依赖桌面浏览器的 HTML5 Drag & Drop；触屏上仍可通过点击头像添加到目标行，删除使用叉号。
- 导出图片的字体取决于系统已安装字体；页面与导出使用同一字体栈和字号计算。

## 版权

角色图片、名称及相关素材版权归 miHoYo / HoYoverse 所有。本项目仅用于个人学习与粉丝创作，请勿用于商业用途。
