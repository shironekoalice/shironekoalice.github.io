---
title: QuantMind：一个 AI 原生量化交易平台的整体设计
published: 2026-10-08
description: 深度集成 Qlib 与 RD-Agent 的一体化 AI 量化平台：数据底座 → 因子挖掘 → 模型训练 → 回测 → 模拟盘 → 监控全流程闭环，支持五大市场，还能用微信一句话远程选股。
tags: [量化交易, LLM, Qlib, FastAPI]
category: 项目介绍
draft: false
---

## QuantMind 是什么

QuantMind（量化大脑）是我做的一个面向个人与机构的一体化 **AI 原生量化交易平台**，深度集成了微软的 Qlib 量化框架与 RD-Agent（AutoAlpha 2.0）因子自动进化智能体，覆盖：

**数据底座 → 因子挖掘 → 模型训练 → 批量推理 → Qlib 回测 → 模拟交易 → 生产监控**

全流程闭环。支持 A 股、港股、美股、期货、区块链五大市场。项目以 AGPL v3 开源。

## 核心亮点

### 对话式量化机器人

核心入口是 QuantBot：可以绑定微信 / QQ / 飞书 / 钉钉等 17 类 IM 渠道。手机上发一句话，就能远程完成选股、回测、复盘，然后自动把研报推回来——量化分析从"坐在电脑前跑脚本"变成了"随口一问"。

### LLM 因子进化

接入 RD-Agent 做 AutoAlpha：LLM 自主完成「提出假设 → 合成因子公式 → 遗传演化 → 回测验证 → 入库」的因子挖掘闭环，人只负责最后把关。

### 模型工场

内置 13 种模型：LightGBM / XGBoost / CatBoost / GRU / LSTM / ALSTM / Transformer / TabNet / TCN / NativeTFT 等，支持 Stacking 集成与 AutoDL GPU 远程训练。

### 贴近 A 股规则的模拟撮合

本地 T+1 模拟撮合完整还原 A 股规则：涨跌停、停牌、整手交易、佣金 / 印花税 / 滑点。每日 Rank IC 回填 + SHAP 归因 + PSI 漂移告警，策略失效能第一时间知道。

## 技术栈

- **后端**：Python 3.10+，FastAPI 微服务单镜像四端口（网关 8000 / 回测 8001 / 交易 8002 / 行情 8003），Docker Compose 一键部署
- **前端**：TypeScript + Electron + Vite + Tailwind
- **数据层**：Parquet + DuckDB 列式存算，300+ 维预计算特征，秒级查询
- **舆情**：7x24 RSS 抓取 + FinBERT 中文金融情感模型，把新闻情绪量化进因子

## 配套设施

成熟度上花了不少功夫：一键部署脚本、预构建镜像与预训练模型、ModelScope 离线数据包、全套中文文档（部署指南、策略手册、50 个策略模板、通达信实盘桥参考实现等）。

## 后续计划

这个项目可写的细节很多，后面计划分几篇展开：

1. Qlib + RD-Agent 因子进化的接入实践
2. DuckDB 列式存算的数据底座设计
3. IM 远程指令系统的实现

> 仓库地址：[qusong0627/quantmind](https://github.com/qusong0627/quantmind)（AGPL v3）
