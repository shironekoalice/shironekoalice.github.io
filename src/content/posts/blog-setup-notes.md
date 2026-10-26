---
title: 建站记：这个博客是怎么搭起来的
published: 2026-10-26
description: 用 Fuwari 模板 + GitHub Actions 自动部署，从零把个人博客搭到了 shironekoalice.github.io。记录完整流程和一些小坑。
tags: [博客, Astro, GitHub Pages]
category: 建站
draft: false
---

## 为什么又搭博客

之前一直在公众号写东西（希赛克珑CylonX），但公众号的文章只能活在微信生态里，代码块的排版也不友好。技术文章还是需要一个自己能完全掌控的地方，于是有了这个站。

## 技术选型

- **模板**：[Fuwari](https://github.com/saicaca/fuwari)——Astro + Svelte 的博客模板，颜值在线，Markdown 写作体验好，代码高亮（Expressive Code）、全文搜索（Pagefind）、TOC、RSS 全都自带
- **托管**：GitHub Pages，用户主页仓库 `shironekoalice.github.io`
- **部署**：GitHub Actions，push 到 main 自动构建发布，零成本

试过给 GitHub 换个更顺眼的名字（AliceCharlotte），结果那个用户名被占用了，最后改名成了现在的 shironekoalice，也挺好。

## 搭建过程

全程大概半小时：

1. 克隆 Fuwari 模板，改 `astro.config.mjs` 里的站点地址
2. 改 `src/config.ts`：站名、作者、语言 zh_CN、社交链接
3. 写一个 GitHub Actions 工作流：checkout → pnpm install → astro build → 部署到 Pages
4. 用 orphan 分支把模板的几千条提交历史丢掉，只留一个干净的初始提交，force push 上去
5. 改名后把本地 6 个项目的 remote 从旧用户名批量更新到新用户名（GitHub 虽然有重定向，但重定向随时可能失效）

## 坑

- **GitHub 用户名**：API 查询显示 404 的用户名不一定能注册，可能是被平台保留的不活跃账号，以改名页面的实测为准
- **公众号搬运**：公众号图片有防盗链，文章里的图搬不过来，要么下载后放本地，要么就先不放
- **Pages 仓库命名**：用户主页站点必须叫 `<username>.github.io`，改名后仓库名也要跟着改

## 以后写什么

这边主要放技术向的长文：大模型训练复现笔记、Agent 开发、游戏开发日志，公众号的文章也会陆续同步过来。欢迎订阅 RSS（右上角就有）。
