---
title: 分享初次构建一个 MoE 大语言模型的部分过程
published: 2025-09-11
description: 目标是构建一个 ~0.8B 参数的 Decoder-only 语言模型，融入 GQA、RoPE、MoE 等当前主流设计。记录踩过的坑：数据污染、模型"假死"、被忽略的传参。
tags: [LLM, MoE, Transformer, 训练踩坑]
category: 大模型实践
draft: false
---

在开始之前，我先快速介绍一下模型所选择的技术栈。我的目标是构建一个 ~0.8B 参数的 Decoder-only 语言模型，并融入一些当前主流的设计。

- **核心架构**：Decoder-only Transformer，类似 GPT 和 Llama。
- **超参数**：
  - 隐藏层维度 hidden_size = 2048
  - 隐藏层数量 num_hidden_layers = 8
  - 中间层维度 intermediate_size = 5632
  - 词表 vocab_size = 6400
- **核心组件**：
  - **注意力机制 (Attention)**：我选择了**分组查询注意力 (GQA)**（num_attention_heads=16, num_key_value_heads=8）。这是一个在性能和推理效率之间取得绝佳平衡的选择，可以显著降低 KV 缓存的显存占用。同时，加入了 Flash Attention。
  - **位置编码 (RotaryEmbedding)**：我采用了旋转位置编码 **(RoPE)**。其优秀的长度外推性和对相对位置的建模能力，使其成为当前 Decoder-only 模型的标配。
  - **混合专家 (MoE)**：采用了 **MLP 层与 MoE 层交替** 的结构。我的模型中，偶数层是标准的门控线性单元（SwiGLU）MLP，奇数层则是 MoE 层。每个 MoE 层包含 4 个专家，并在推理时选择 Top-2。这种设计能在不显著增加推理计算量（FLOPs）的前提下，大幅扩充模型的总参数量，提升其知识容量。

先说说我目前遇到的一些问题吧。

## 1. ValueError 与长度不匹配

我一开始让 LLMDataset 只对文本进行编码和截断，而将填充（Padding）的任务交给了 DataCollatorForLanguageModeling。这是一个理论上最高效的"动态填充"方案。

训练启动时，遇到了：

```text
ValueError: expected sequence of length X at dim 1 (got Y)
```

经过排查，发现是 LLMDataset 返回的字典中包含了 `labels` 键，这与 DataCollatorForLanguageModeling 的内部期望产生了冲突，导致其填充逻辑失败。

为了快速让训练跑起来，我采取了一种最稳健但效率较低的策略：在 LLMDataset 的 `__getitem__` 中，就强制对所有样本进行 `padding='max_length'`，并换回了简单的 DefaultDataCollator。这确保了每个样本长度绝对一致，虽然牺牲了效率，但保证了稳定性。

## 2. 模型"假死"

在训练了 2 万步后，我尝试了一下推理。然而，模型对任何输入都只会回答句号、逗号或换行符。eval_loss 看起来很不错，我猜测模型实际上已经"崩溃"了。

感觉可能是数据集的问题。通过审查 LLMDataset 和 DefaultDataCollator 的组合，我发现了两个潜在的问题：

- **数据污染**：数据集中可能存在大量空文本行，导致模型学到了"无输入即无输出"的模式。
- **错误的训练目标**：我的 labels 与 input_ids 完全相同，这**强迫模型去预测句首的 `<s>` (BOS) token**。这是一个不可能完成的任务（因为 `<s>` 前没有任何上下文），这种错误的梯度信号很可能污染了整个学习过程，让模型最终选择了输出高频标点这种"躺平"策略来最小化平均损失。

**解决方案**：

- **重写 LLMDataset**：加入了严格的文本过滤逻辑，去除所有空行和过短的文本。
- **回归 DataCollatorForLanguageModeling**：确保 LLMDataset 只返回 `{"input_ids": ...}`，将 labels 的创建和正确的左移操作，完全交给这个专业的 DataCollator。这个组合最终被证明是**既高效又正确**的。

## 3. 一个被意外忽略的传参

我的 DecoderLayer.forward 的签名：

```python
# 错误的 DecoderLayer.forward 签名
def forward(self,
            hidden_states: torch.Tensor,
            past_key_value: Optional[Tuple[torch.Tensor, torch.Tensor]] = None,
            use_cache: bool = False
            ) -> Tuple[torch.Tensor, ...]:
    # ...
    # 它只接收了最基本的三个参数
    # ...
```

它在内部调用 self.self_attn 时，自然也是这样传递的:

```python
hidden_states, present_key_value = self.self_attn(
    hidden_states=hidden_states,
    past_key_value=past_key_value,
    use_cache=use_cache
)
```

而 `generate` 函数在工作时，还依赖 `attention_mask` 和 `position_ids` 这两个参数来正确管理 KV 缓存。

此时 DecoderLayer.forward **没有**在其参数签名中接收 `attention_mask` 和 `position_ids`，更没有把它们传递给底层的 Attention.forward。

因为 Attention 层没有收到正确的 attention_mask 和 position_ids，它内部的 KV 缓存行为在 generate 的复杂调用流程中出现了未定义的行为，最终在某个环节返回了 (None, None)。都加上就解决了：

- **attention_mask**：在 generate 的每一步，这个 mask 都会被重新计算和传递，以确保新生成的 token 不会关注到未来的 token，同时所有 token 都不会关注到 padding 位。
- **position_ids**：这对于 KV 缓存至关重要。它告诉模型当前正在计算的 token 在整个序列中的**绝对位置**。例如，在生成第 10 个 token 时，position_ids 会告诉 RotaryEmbedding (RoPE) 应该使用第 10 个位置的旋转矩阵，并告诉 Attention 层应该将新的 Key 和 Value 存放到缓存的第 10 个位置。

---

暂时没发现其他问题了，目前在训练中，未完待续~

就先这样，欢迎讨论~

> 本文同步自我的微信公众号「希赛克珑CylonX」，如果觉得有帮助，欢迎点赞、在看、转发。
