---
title: Armavoke：基于 Arc 引擎的 RTS + 自动化游戏开发日志（一）
published: 2026-10-05
description: AKA 十一舰队——一款基于 Mindustry 同源引擎 Arc 的 RTS + 自动化游戏。介绍技术选型、自研 ECS 框架和世界观设定，这是一个长期项目。
tags: [游戏开发, Java, RTS, LibGDX]
category: 游戏开发
draft: false
---

## 项目是什么

Armavoke（AKA 十一舰队）是一款以 Arc 引擎（Mindustry 的底层引擎，Anuken 出品）为基础的 **RTS + 自动化** 类游戏。这是一个我计划长期开发的项目——非常长期的那种，目前仍处于早期阶段。

## 为什么选 Arc

直接从零写引擎不现实，而 Arc 给了很好的起点：

- Mindustry 同源，经过大规模验证的 2D 游戏引擎
- Java 生态，跨平台（桌面 + 安卓）开箱即用
- 轻量、无侵入，允许我在它之上自建游戏框架

## 技术架构

项目采用 Java + Gradle 多模块构建：

- `core`：全平台共享的主逻辑
- `desktop` / `android`：启动器
- `android-old`：专门兼容 Android SDK 14 的老旧设备
- `tools`：构建工具

### 自研 ECS

在 Arc 之上我自建了一套 ECS 系统架构，`system/` 下按职责划分为 game / input / render / world 四类子系统，`System.java` / `Systems.java` 作为基类与统一访问点。

配套了一些零 GC 导向的基础设施：`EntityAr`、`FloatAr`、`IntAr` 等自定义容器，避免游戏循环中的垃圾回收停顿。

### 渲染与内容

- 自定义 LibGDX/GLSL Shader：模糊效果、星空背景（SpaceShader）
- 科技树 + 战役系统（TechTree / TechNode）
- 静态内容注册体系：Blocks、Items、UnitTypes、Techs 等统一注册

### 世界观

docs 里写了游戏的世界观设定：派系、战舰与武器设定、伤害与防御数值体系（部分设定已放弃迭代）。这部分以后会单独发文章讲。

## AI 协作开发

值得一提的是，这个项目大量使用了 AI 代理辅助开发（仓库里的 `ai-using/` 目录就是协作开发说明）——设计文档由人把控，实现迭代效率提升非常明显。以后会专门写一篇 AI 协作开发的工作流分享。

## 现状

当前还在非常早期的阶段（代码里还有不少 test 变量和占位方法），git 历史里清一色的 "updata" 也说明这是个持续滚动迭代的项目。这个系列会不定期更新开发日志，记录从零到能玩的全过程。

> 仓库地址：[caliniya/Armavoke](https://github.com/caliniya/Armavoke)
