---
title: Jaume：给 Agent 用的 350M 句子嵌入模型（v0.1 发布）
published: 2026-10-26
description: 从零训练一个面向 Agent 的双向 Transformer Encoder 句子嵌入模型：MLM 基座 → 对比学习 → 硬负例 → 决策头，全流程记录与第一版技术报告。
tags: [Embedding, 对比学习, LLM, 从零训练]
category: 大模型实践
draft: false
---

## Jaume 是什么

Jaume（玖沫）是我做的一个轻量级、面向 Agent 的模型系列。每个成员是一个独立模型、解决一个方向的问题，目前规划了三个成员：

| 成员 | 方向 | 状态 |
|---|---|---|
| **Jaume-Embedding** | 文本语义表示 + 结构化决策 | v0.1 已发布（350M 全流程） |
| **Jaume-Memory** | 记忆槽池化 / 跨输入记忆 | 已评估，两机制未通过预注册判据（负结果报告已发布） |
| **Jaume-Temporal** | 时序骨架估计与控制 | 任务定义阶段 |

为什么做这个？Agent 系统里需要一个又小又强的语义底座：检索、去重、意图判断、"这句话到底有没有答案"（Noul）这些决策，用 350M 的专用 encoder 比每次都调大模型便宜得多。

## Jaume-Embedding 架构

双向 Transformer Encoder（GQA + RoPE + RMSNorm + MoE）——把 Loftey 那套 decoder 组件反过来用在了 encoder 上，词表也直接复用 Loftey 的 151646 BPE。整体流程：

**Pooling → Projection → L2 Normalize** 输出单位向量；同一个 encoder 表征上挂三个决策头：

- **Choice**：多选一
- **Score**：打分
- **Noul**：判断"无答案"

一次编码，多路决策。

## 训练全流程（350M）

在一张 RTX 3080 Ti 12GB 上完成，每个 stage 的关键数字：

| Stage | 内容 | 结果 |
|---|---|---|
| 1 | MLM 预训练（英/中 wiki 30 万句） | loss 11.9 → 4.06 |
| 2 | 对比学习（MNRL/InfoNCE + MatryoshkaLoss） | STS-B 0.6111 @512D |
| 3 | 硬负例重训（70% 覆盖率挖掘） | **STS-B 0.6223 @512D / 0.6108 @128D** |
| 4 | Matryoshka 截断 | 512D→128D 只掉 0.012 |
| 5 | 决策头 v2（MLP trunk + 解冻顶层 4 层） | Choice 99.75%（ECE 0.0017），Noul AUROC 0.608→0.837 |
| 6 | 温度标定 | Noul 过自信 T=3.16，标定后 ECE 0.015 |

### 几个值得一提的实践点

**MLM 初始化收益巨大**：随机初始化直接做对比学习（旧 stage2，STS-B 0.5451），比先 MLM 预训练再对比（0.6111）差 0.07——一个 epoch 就拉开了差距。

**GradCache 是单卡救命稻草**：对比学习要大有效 batch，但 12GB 显存塞不下。GradCache 两段式梯度等价（chunk 级逐位一致，有测试验证），配合关掉 gradient checkpointing，实测 350M 跑到 52 pairs/s、有效 batch 256。

**评测必须 hold-out**：STS-B 自训自测会过拟合，实测能虚高。所以模型卡上的分数标注了"历史训练管线"来源，独立 holdout 复核按预注册协议走——这也是我给这个系列定的规矩。

**多语言退化的根因排查**：加 6 种语言继续 MLM 没用（STS22 没恢复），排查后确认根因是纯英文 NLI 对比阶段冲刷了多语言对齐——修复路径应该是往 Stage 2 混多语言对比数据，而不是改 MLM 语料。这是这篇第一版报告里我认为最有价值的认知修正。

## Jaume-Memory：一个认真做出来的负结果

系列里另一个成员 Jaume-Memory 做完了完整评估：给 encoder 加「可学习记忆槽（JM-S）」或「跨 chunk 递归状态（JM-R）」，两个机制都在预注册判据下**失败了**：

- JM-S 比参数量对齐的 attention pooling 对照组低 0.0168 Spearman（约 3 倍种子标准差）
- JM-R 携带状态 vs 静态：5/5 次运行为负
- 四阶段诊断显示：输出从不读取携带状态、加性更新稀释新输入（相对变化 0.318→0.098）、门控退化成常数

完整的诊断过程写成了第一版技术报告（论文形式的 PDF 已经挂在 ModelScope 仓库上）。负结果也是结果——它至少证明了这个设计在这个规模下不值得继续烧卡。

## 后续计划

- 独立 holdout 复核 STS 分数（评测协议已预注册）
- v0.2 修复多语言退化：多语言对比数据混入 Stage 2
- 700M 规模视 350M 实验结论再启动
- Score 头补排序损失（当前 Pearson 0.29 还太弱）

权重、日志、报告都在 ModelScope：[LightNeko/Jaume](https://www.modelscope.cn/models/LightNeko/Jaume)，代码镜像在 [GitHub](https://github.com/modemneko/Jaume)。

> 这是第一版发布，文中指标可能随 holdout 复核更新，有建议欢迎交流。
