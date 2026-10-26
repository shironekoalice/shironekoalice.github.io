---
title: 复现大模型算法：我这一年攒下的 28 个小实验
published: 2026-10-12
description: 从零实现 SFT/DPO、一整套 RLHF 强化学习算法、MoE/多模态从零训练、跨 tokenizer 知识蒸馏……盘点我复现各种大模型算法的学习笔记仓库。
tags: [LLM, 强化学习, RLHF, PyTorch]
category: 大模型实践
draft: false
---

## 为什么要自己复现

看论文和看别人代码总觉得懂了，自己动手才知道哪里会卡住。所以我攒了一个仓库，专门用来「复现各种大模型相关算法」——每个子项目都是一个独立可运行的小实验，技术栈以 PyTorch + HuggingFace 为主。

目前大约 28 个子项目，这里挑重点聊聊。

## 强化学习算法全家桶

复现占比最大的一块，基本把主流 RLHF 算法都写了一遍：

- **GRPO / DAPO**：DeepSeek 带火的 critic-free 方法
- **PPO / ReMax / RLOO / Reinforce++**：各种 baseline 处理方式的对比
- **Training-free GRPO**：不训练的 GRPO 变体
- 结合 verl（code-r1）做了代码推理方向的后训练实验

亲手实现之后才发现，这些算法的核心差异往往就在 advantage 估计和 loss 聚合的几行代码上，但效果差异巨大。

## 从零训练系列

- **train_llm_from_scratch**：从零实现 SFT / DPO 全流程
- MoE、多模态、SigLIP、Qwen3-Next 的从零训练
- 同策略知识蒸馏，包括跨 tokenizer 的蒸馏（师生模型词表不同时怎么蒸馏，这个问题比想象中有意思）

## Agent 与 RAG

- RAG 与表格 RAG（结构化数据检索）
- 深度研究 agent（结合 langgraph + MCP + searxng）
- PDF 转 Markdown 管线（LLM 时代的数据预处理，脏活但绕不开）

## 训练产物

配合这些脚本，我在 AutoDL 上跑过 SFT 微调，本地留了几个 checkpoint（step 2000/2500，loss ~2.65 时刚训了 0.13 个 epoch 就停了——云端成本所限，但足够验证管线正确性）。

## 一点体会

1. **复现是最好的学习**：每复现一个算法，对原论文的理解都会翻新一遍
2. **小模型跑通优先**：先用 0.1B 级别的模型验证管线，再放大，省时省钱
3. **工程细节决定成败**：数据过滤、collator 的 labels 处理这些"脏细节"出问题的概率远大于算法本身（这个坑我在另一篇文章里详细写过）

这些子项目的笔记会陆续整理成文章发出来，每篇聚焦一个算法。

> 如果你也想动手复现，欢迎来 [GitHub](https://github.com/shironekoalice) 交流讨论。
