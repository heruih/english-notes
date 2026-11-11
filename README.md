# 英语学习笔记（english-notes）

单文件移动端 Web App：看电影/短视频截图学英语，把生词、例句、复习串成闭环。

- **当前构建候选**：`dist/英语学习笔记.html`（649,031 字节，Sitecase 真机待验）
- **源码**：`src/index.html`、`src/style.css`、`src/js/*.js`
- **基线 tag**：`v2026.11.08`（提交 `34d2dad`）
- **线上预览**：https://heruih.github.io/english-notes/ （需能访问 github.io；数据与本地文件不互通）
- **使用者**：只有作者本人（1 人）
- **状态**：**在用，已冻结**。30 天自用期到 2026-12-09，期间不加功能。

## 交接看这里

- 第一次接手 → 读 [`docs/交接说明.md`](docs/交接说明.md)（可整段复制给任何 AI）
- 具体现状与坑 → [`HANDOFF.md`](HANDOFF.md)

## 目录

```
src/index.html          ← 页面外壳源码
src/style.css           ← 样式源码
src/js/*.js             ← 按职责拆分的脚本源码
dist/英语学习笔记.html  ← `node scripts/build.mjs` 生成的单文件交付物
archive/               ← 历史版本（网页版 405KB，2026-11-07，仅存档）
docs/                  ← 需求 · 数据模型 · 决策 · 交接说明 · 项目通用准则
AGENTS.md              ← 给 AI 的规矩（改之前先读）
DEVLOG.md              ← 改了什么、怎么验的
TESTING.md             ← 怎么算通过
HANDOFF.md             ← 交接单
```

## 怎么用

**没有第三方依赖。** 修改源码后运行 `node scripts/build.mjs`，再打开 `dist/英语学习笔记.html`。

线上那份是 `gh-pages` 分支的 `index.html`，内容与 `src/` 同文件。

## 关键约定

1. **数据只在浏览器本地**（主键 `english-notes-app-v1`）。不许动已有结构，新功能一律用独立 key。
2. **源码按职责拆分**：只改 `src/`，不要直接改 `dist/`。
3. **交付物仍是单文件**：构建会把源码拼回单文件，页面和功能保持不变。
4. **备份是唯一保证**：标亮 / 设置 / 截图不在"同步码"里，只有「完整备份」能完整带走。

## 历史

豆包生成初版 → WorkBuddy 迭代（曾拆过模块）→ Codex 继续迭代 → 2026-11 收进本仓库 → 2026-11-10 恢复模块化源码并保留单文件产物。中间靠文件传递、没有版本控制，导致反复重写；这个仓库就是为了终结这件事。
