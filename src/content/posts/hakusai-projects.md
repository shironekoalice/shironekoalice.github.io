---
title: HakusAI：我在做的个人 AI 伴侣项目群
published: 2026-10-01
description: 从一个 QQ 机器人开始，一路演进到本地 Agent 框架和 3D 具身虚拟角色"羽汐"。介绍 HakusAI 项目群的整体架构与技术选型。
tags: [AI Agent, 具身智能, LLM, Live2D]
category: 项目介绍
draft: false
---

## 这是什么？

HakusAI 是我围绕个人 AI 伴侣「羽汐」做的一整套自研项目群。它从一个简陋的 QQ 机器人原型开始，一路演进到本地优先的 Agent 框架，再到低算力 3D 具身智能体。这篇文章做个整体介绍。

## HakusAgent：本地优先的 Agent 框架

HakusAgent（HakusAI 2.0）是项目群的核心——一个本地优先的 AI 工作台 / Agent 框架：

- **Python 核心运行时**：会话管理、权限控制、记忆系统、工具调用，以及 MCP / Skills 扩展体系
- **Rust 多 crate 终端客户端（HakusCLI）**：TUI 界面、执行沙箱、工作流引擎，由 20 多个 crate 组成（llm、mcp、execpolicy、workflow、secrets、telemetry 等）
- **跨平台**：支持 Windows / macOS / Linux / Android Termux 四平台，桌面端（Tauri）与「流程画布」可视化编排在计划中

一些设计上的亮点：

- 项目工作区绑定：本地 / SSH / WSL / Docker 都能接入
- 所有工具调用可审阅，权限体系独立成模块（permission、guardian）
- Termux 纯 Python 约束 + CI slim-import 检测，保证手机上也能跑

## HakusAE：低算力 3D 具身智能体

这是最有意思的部分：让「羽汐」以 VRM 虚拟形象的形式活在浏览器里。整体架构是：

- **云端 LLM 大脑 + 本地记忆**：语言理解放在云端，记忆和状态在本地
- **浏览器作为物理世界权威端**：Three.js 渲染 + Rapier（WASM）物理引擎，角色动作、碰撞都在浏览器内完成
- **动作驱动**：后端 FastAPI 通过 WebSocket 实时输出 18 维上半身控制点（协议 `hakus.upper_body.v1`），由 BVH 动捕数据训练的 ONNX 动作策略在 CPU 上推理驱动，异常时自动回退到程序化动作
- **语音链路**：FunASR 本地 ASR/VAD + CosyVoice 云端流式 TTS

还做了紧急停止、断网降级等安全设计。

### 数据飞轮

中文的「韵律-手势」映射数据几乎是缺失的，所以我自建了中文语音-动作数据集（BEAT2 兼容格式），用来自训动作策略——这也是整个项目最费时间但最有价值的部分。

## 周边小项目

- **hakus-hybrid**：一个小模型混合架构实验（attention + persistent state + learnable gate，主配置约 5.6M 参数，消融实验用 3.7M 配置），用来验证持久状态能在注意力窗口外携带信息——实验里 d=24 的配置窗外回忆得分 0.422，Transformer 基线只有 0.005，因果证据挺漂亮的
- **hakusaibot**：早期的 NoneBot2 QQ 机器人原型，整个项目群的起点（长期记忆图 LTMGraph 是同期的独立实验，因算力消耗过大已弃用，未集成进机器人）
- **live2dControl**：PSD 分层解析 → 自动深度合成 → 口型区域检测，Live2D 模型自动化制作工具箱

## 现状与计划

HakusAgent 处于活跃开发中（v0.4.x）；HakusAE 正在推进「VRM 室内房间闭环」的第一阶段；hakus-hybrid 已完成 0.1 实验报告。后续会陆续把各模块的实现细节写成文章，欢迎持续关注。

> 如果你对具身智能体、Agent 框架或者虚拟主播技术感兴趣，欢迎来 [GitHub](https://github.com/shironekoalice) 交流。
