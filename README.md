<!-- 项目配图占位，后续补充 -->

<h1 align="center">Hanime1 Hover Preview</h1>

<p align="center">为 Hanime1 视频卡片提供静音悬停预览，沿视频时间轴抽取短片段，并将每轮片段播放总时长限制在约 10 秒以内。</p>

<p align="center">
  <a href="./README.en.md">English</a> | <a href="./README.md">简体中文</a>
</p>

<p align="center">
  <a href="https://github.com/napstablook666/hanime1-hover-preview/blob/main/hanime1-hover-preview.user.js"><img src="https://img.shields.io/badge/JavaScript-userscript-3776AB?style=flat-square" alt="JavaScript userscript"></a>
  <a href="https://github.com/napstablook666/hanime1-hover-preview"><img src="https://img.shields.io/github/stars/napstablook666/hanime1-hover-preview?style=flat-square" alt="GitHub stars"></a>
</p>

## 核心亮点

| 能力 | 说明 |
|---|---|
| 静音悬停预览 | 悬停视频缩略图时播放短片段，移开鼠标后停止 |
| 时间轴采样 | 在视频时间轴上均匀分布采样点 |
| 预览时长预算 | 每轮采样片段的播放总时长最多约 10 秒 |
| 可调设置 | 调整片段长度、悬停延迟、采样间隔和画质 |

## 快速安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)。
2. 打开[原始脚本](https://raw.githubusercontent.com/napstablook666/hanime1-hover-preview/main/hanime1-hover-preview.user.js)，并按 Tampermonkey 提示确认安装。参见 [Tampermonkey 安装脚本说明](https://www.tampermonkey.net/faq.php?locale=en&q=Q102)。

## 快速开始

1. 打开 `hanime1.me` 或 `www.hanime1.me` 上包含视频卡片的页面。
2. 将鼠标悬停在视频缩略图上开始预览；移开鼠标后预览停止。
3. 点击页面右下角的 `Preview` 按钮打开设置。

## 设置

| 设置 | 默认值 | 范围或选项 |
|---|---:|---|
| 片段长度 | 1 秒 | 0.1–10 秒 |
| 悬停延迟 | 50 毫秒 | 0–2000 毫秒 |
| 采样间隔 | 8% | 1–100% |
| 画质 | 360p | 360p、480p、720p、1080p |

设置保存在当前站点的 `localStorage` 中。

## 发布

将与脚本 `@version` 相符的版本标签（例如 `v1.0.0`）推送到 GitHub 后，工作流会检查脚本语法，并将 `.user.js` 作为 GitHub Release 附件。
