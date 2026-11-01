---
title: Jaume：一个给 Agent 用的 350M 句子嵌入模型
published: 2026-10-26
description: 从零训练一个双向 Transformer 编码器，走完 MLM、对比学习、硬负例、决策头全流程。附第一版技术报告和一篇负结果论文。
tags: [Embedding, 对比学习, 从零训练]
category: 大模型实践
draft: false
---

Jaume 是一个模型系列，每个成员解决一个方向的问题。做它的动机很实际：Agent 系统里需要一个又小又强的语义底座。

检索、去重、意图判断、判断"这句话到底有没有答案"——这些事如果每次都调大模型，成本会失控。一个 350M 的专用编码器能干完这些，而且推理快。

## 架构

双向 Transformer 编码器，用了 GQA、RoPE、RMSNorm 和 MoE。词表直接复用之前那个 MoE 小模型的 151646 BPE。

注意力部分换成 GQA 之后，KV 头数比 Q 头少，KV cache 的内存占用降下来了。这部分代码和之前写 decoder 时是同一套思路，只是方向反过来。

输出是池化后的单位向量，然后接三个决策头：多选一、打分、判断"无答案"。一次编码，多路决策。

## 训练走了六个阶段

一张 3080 Ti 12G 上跑完的，关键数字记在下面。

MLM 预训练用了英文和中文维基各四十万段，实际训练三十万句，一个 epoch，loss 从 11.9 降到 4.06。

对比学习阶段用 MNRL 加 Matryoshka 损失，STS-B 到了 0.6111。

硬负例重训是最有效的一步：从新编码器挖掘硬负例，覆盖率 70%，重训之后 STS-B 到 0.6223（512 维）/ 0.6108（128 维）。

Matryoshka 截断的衰减很小，512 维到 128 维只掉 0.012。

决策头换了一版。第一版是冻结骨干加线性头，第二版改成 MLP trunk 再解冻顶层四层，效果差别很大：

| 头 | v1 | v2 |
|---|---|---|
| 多选一 | 98.0%，ECE 0.070 | **99.75%，ECE 0.0017** |
| 无答案判断 | AUROC 0.608 | **AUROC 0.837** |
| 打分 | Pearson 0.253 | Pearson 0.286（仍然弱） |

打分头还是不行。0 到 5 分的 MOS 类任务，靠一个几百万参数的头很难做好，可能还得排序损失或者更长的输入上下文。

最后做了温度标定。多选一头天生校准正常；无答案判断过自信，标定温度 3.16，标完 ECE 降到 0.015。

## 几个值得单独讲的实践点

**MLM 初始化的收益比我预期大。** 随机初始化直接做对比学习，STS-B 只有 0.5451；先做 MLM 再做对比，是 0.6111。差 0.07，而后者只多跑了一个 epoch。

**单卡做大有效 batch 得靠 GradCache。** 对比学习需要大 batch，但 12G 显存塞不下。GradCache 两段式梯度是等价的（chunk 级逐位一致，有测试验证），配合关掉梯度检查点，实测能跑到有效 batch 256、每秒 52 对。

**评测必须 hold-out。** STS-B 自训自测会过拟合，我实测过虚高。所以模型卡上那些分数都标注了来源是历史训练管线，独立的 hold-out 复核按预注册协议走——这是给这个系列定的规矩。

**多语言退化的根因和我一开始想的相反。** 加了六种语言续训 MLM，STS22 一点没恢复。排查之后发现根因不在 MLM 语料，而在纯英文的 NLI 对比阶段冲刷了多语言对齐。修复路径应该是往对比阶段混多语言数据，不是改 MLM。

## 另一个成员：一个认真做的负结果

系列里还有个 Jaume-Memory，做的是给编码器加记忆：要么是可学习的记忆槽，要么是跨输入块传递的递归状态。

两个机制都在预注册的判据下失败了。

记忆槽比参数量对齐的注意力池化对照组低 0.0168 Spearman，大约是种子标准差的 3 倍。递归状态在五次运行里全部为负。

我还做了四阶段诊断，想看它到底卡在哪：输出从来没有读过携带的状态；加性更新把新输入稀释了（相对变化从 0.318 掉到 0.098）；门控退化成常数（标准差从 0.132 降到 0.006，尽管权重移动了 141%）；强制把门限制在 0.1 到 0.99 之间，也没有离开随机水平。

完整的诊断写成了技术报告，也做成了论文形式的 PDF：

- [中文技术报告](https://www.modelscope.cn/models/LightNeko/Jaume/resolve/master/docs/memory-report.md)
- [英文技术报告](https://www.modelscope.cn/models/LightNeko/Jaume/resolve/master/docs/memory-report.en.md)
- [论文 PDF：Why a Finite-Capacity Neural Memory Does Not Help](https://www.modelscope.cn/models/LightNeko/Jaume/resolve/master/docs/paper/Jaume-Memory-Technical-Report.pdf)（853 KB）

负结果也是结果。至少它证明了这个设计在这个规模下不值得继续烧卡。

## 接下来

独立 hold-out 复核 STS 分数；修复多语言退化（往对比阶段混多语言数据）；700M 规模看 350M 的结论再决定；打分头补排序损失。

权重、日志、报告都在 ModelScope 上：[LightNeko/Jaume](https://www.modelscope.cn/models/LightNeko/Jaume)。

这是第一版，指标可能随 hold-out 复核更新。
