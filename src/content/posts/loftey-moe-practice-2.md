---
title: Loftey：MoE 语言模型的实践记录（下）
published: 2026-01-30
description: 分享我最近折腾的一个小项目 —— Loftey，一个基于 MoE 的 235M 参数轻量级语言模型，从架构到训练的完整实践记录。
tags: [LLM, MoE, Transformer, 深度学习]
category: 大模型实践
draft: false
---

## 前言

上回我们聊了聊混合专家的原理，很多朋友留言说想看看实际代码怎么实现。这篇文章就分享一下我最近折腾的一个小项目 —— Loftey，一个基于 MoE 的轻量级语言模型。

这是一个 235M 参数的小模型，主要是用来学习和实验的。

## 为什么做这个？

起因很简单，就是想学习和研究一下大模型。市面上开源的大模型很多，但直接看代码有时候挺吃力的，不如自己写一个简单的，从零开始理解每个部分。

另外，小模型也有小模型的好处：

- 训练快，单卡就能跑
- 调试方便，改了代码很快能看到效果
- 可以大胆尝试各种想法

## 模型架构概览

Loftey 的整体结构就是一个标准的 Transformer decoder，主要改动在前馈网络（FFN）部分，换成了 MoE。

```text
Input Tokens
    │
    ▼
Embedding Layer
    │
    ▼
┌─────────────────────────────────────┐
│ Transformer Layers (×6)             │
│ ┌─────────────────────────────┐     │
│ │ 1. RMSNorm                  │     │
│ │ 2. Self-Attention (GQA)     │     │
│ │ 3. RMSNorm                  │     │
│ │ 4. MoE FeedForward          │     │
│ └─────────────────────────────┘     │
└─────────────────────────────────────┘
    │
    ▼
Output Logits
```

参数配置：

- `hidden_size: 512`
- `num_layers: 6`
- `num_attention_heads: 16`
- `num_key_value_heads: 8` (GQA)
- `expert_num: 4`
- `topk: 2`

## 核心代码实现

### 1. 配置类

先定义一个配置类，把所有参数都放在一起：

```python
class Config:
    model_type = "loftey"
    def __init__(self,
                 vocab_size: int = 151646,
                 hidden_size: int = 512,
                 intermediate_size: int = 2048,
                 num_layers: int = 6,
                 num_attention_heads: int = 16,
                 num_key_value_heads: int = 8,
                 max_seq_len: int = 512,
                 expert_num: int = 4,
                 topk: int = 2,
                 mlp_bias: bool = False,
                 use_moe: bool = True,
                 **kwargs):
        self.vocab_size = vocab_size
        self.hidden_size = hidden_size
        self.intermediate_size = intermediate_size
        self.num_layers = num_layers
        self.num_attention_heads = num_attention_heads
        self.num_key_value_heads = num_key_value_heads
        self.max_seq_len = max_seq_len
        self.expert_num = expert_num
        self.topk = topk
        self.mlp_bias = mlp_bias
        self.use_moe = use_moe
```

这里 `num_key_value_heads` 小于 `num_attention_heads`，就是 GQA（Grouped Query Attention），可以减少 KV cache 的内存占用。

### 2. RMSNorm

RMSNorm 是现在大模型常用的归一化方法，比 LayerNorm 简单一点：

```python
class RMSNorm(nn.Module):
    def __init__(self, hidden_size, eps=1e-6):
        super().__init__()
        self.weight = nn.Parameter(torch.ones(hidden_size))
        self.eps = eps

    def forward(self, x):
        variance = x.pow(2).mean(-1, keepdim=True)
        x = x * torch.rsqrt(variance + self.eps)
        return self.weight * x
```

其实就是计算均方根，然后归一化，没有减去均值那一步。

### 3. 标准前馈网络

先看普通的 FFN，用的是 SwiGLU 激活：

```python
class FeedForward(nn.Module):
    def __init__(self, config):
        super().__init__()
        self.gate_proj = nn.Linear(config.hidden_size, config.intermediate_size, bias=config.mlp_bias)
        self.up_proj = nn.Linear(config.hidden_size, config.intermediate_size, bias=config.mlp_bias)
        self.down_proj = nn.Linear(config.intermediate_size, config.hidden_size, bias=config.mlp_bias)

    def forward(self, x):
        gate = F.silu(self.gate_proj(x))
        up = self.up_proj(x)
        return self.down_proj(gate * up)
```

SwiGLU 就是两个线性投影，一个走 SiLU 激活，然后相乘。

### 4. MoE 前馈网络

这是重点，上回讲原理的时候说过，MoE 的核心是路由器：

```python
class MoEFeedForward(nn.Module):
    def __init__(self, config):
        super().__init__()
        self.config = config
        self.expert_num = config.expert_num
        self.topk = config.topk

        # 路由器：一个简单的线性层
        self.gate = nn.Linear(config.hidden_size, self.expert_num, bias=False)
        # 专家列表：每个专家都是一个 FFN
        self.experts = nn.ModuleList([FeedForward(config) for _ in range(self.expert_num)])

    def forward(self, x):
        batch_size, seq_len, hidden_size = x.shape
        x_flat = x.view(-1, hidden_size)

        # 计算路由分数
        router_logits = self.gate(x_flat)
        router_probs = F.softmax(router_logits, dim=-1)

        # 选择 top-k 专家
        topk_probs, topk_indices = torch.topk(router_probs, self.topk, dim=-1)

        output = torch.zeros_like(x_flat)

        # 分配给专家
        for i in range(self.expert_num):
            expert_mask = (topk_indices == i).any(dim=-1)
            if expert_mask.sum() > 0:
                expert_input = x_flat[expert_mask]
                expert_output = self.experts[i](expert_input)
                # 获取权重
                expert_positions = (topk_indices[expert_mask] == i).nonzero(as_tuple=True)[1]
                expert_weights = topk_probs[expert_mask, expert_positions]
                # 加权求和
                output[expert_mask] += expert_output * expert_weights.unsqueeze(-1)

        return output.view(batch_size, seq_len, hidden_size)
```

这个实现有几个关键点：

- **路由器**：就是一个线性层，输出每个专家的分数
- **Top-k 选择**：只激活分数最高的 k 个专家
- **加权输出**：每个专家的输出乘以路由权重，然后求和

### 5. 注意力层

注意力部分用的是 GQA，KV 头数比 Q 头数少：

```python
class Attention(nn.Module):
    def __init__(self, config):
        super().__init__()
        self.hidden_size = config.hidden_size
        self.num_heads = config.num_attention_heads
        self.head_dim = self.hidden_size // self.num_heads
        self.num_key_value_heads = config.num_key_value_heads

        self.q_proj = nn.Linear(config.hidden_size, self.num_heads * self.head_dim, bias=False)
        self.k_proj = nn.Linear(config.hidden_size, self.num_key_value_heads * self.head_dim, bias=False)
        self.v_proj = nn.Linear(config.hidden_size, self.num_key_value_heads * self.head_dim, bias=False)
        self.o_proj = nn.Linear(self.num_heads * self.head_dim, config.hidden_size, bias=False)

    def forward(self, x, attention_mask=None):
        batch_size, seq_len, _ = x.shape

        q = self.q_proj(x).view(batch_size, seq_len, self.num_heads, self.head_dim).transpose(1, 2)
        k = self.k_proj(x).view(batch_size, seq_len, self.num_key_value_heads, self.head_dim).transpose(1, 2)
        v = self.v_proj(x).view(batch_size, seq_len, self.num_key_value_heads, self.head_dim).transpose(1, 2)

        # 重复 KV 头
        k = self.repeat_kv(k, self.num_heads // self.num_key_value_heads)
        v = self.repeat_kv(v, self.num_heads // self.num_key_value_heads)

        scores = torch.matmul(q, k.transpose(-2, -1)) / (self.head_dim ** 0.5)
        if attention_mask is not None:
            scores = scores + attention_mask

        attn_weights = F.softmax(scores, dim=-1)
        output = torch.matmul(attn_weights, v)
        output = output.transpose(1, 2).contiguous().view(batch_size, seq_len, self.hidden_size)
        return self.o_proj(output)

    def repeat_kv(self, x, n_rep):
        batch_size, n_kv_h, seq_len, head_dim = x.shape
        if n_rep == 1:
            return x
        return x[:, :, None, :, :].expand(batch_size, n_kv_h, n_rep, seq_len, head_dim).reshape(
            batch_size, n_kv_h * n_rep, seq_len, head_dim
        )
```

`repeat_kv` 就是把 KV 复制多份，匹配 Q 的头数。

### 6. Decoder Layer

把注意力层和 MoE 层组合起来：

```python
class DecoderLayer(nn.Module):
    def __init__(self, config):
        super().__init__()
        self.config = config
        self.self_attn = Attention(config)
        self.input_layernorm = RMSNorm(config.hidden_size)
        self.post_attention_layernorm = RMSNorm(config.hidden_size)
        self.mlp = MoEFeedForward(config) if config.use_moe else FeedForward(config)

    def forward(self, x, attention_mask=None):
        residual = x
        x = self.input_layernorm(x)
        x = self.self_attn(x, attention_mask)
        x = residual + x

        residual = x
        x = self.post_attention_layernorm(x)
        x = self.mlp(x)
        x = residual + x
        return x
```

就是标准的 Pre-LN 结构。

## 训练记录

### 数据和配置

- **Tokenizer**：用了 Qwen 的 tokenizer，词汇量 151646
- **训练数据**：预训练和 SFT 都用 minimind 的中文数据集
- **设备**：单张 RTX 4080 (32GB)
- **训练时间**：大概两天

### 训练过程

（训练过程图请参考公众号原文，或后续补充到博客）

### 效果

说实话，效果一般般。毕竟是 235M 的小模型，不能指望太多。但基本的对话还是能进行的，而且推理速度还不错。

## 性能数据

| 项目 | 数值 |
| ---- | ---- |
| 参数量 | 235M |
| FP32 内存 | ~900MB |
| FP16 内存 | ~450MB |
| CPU 推理 | ~30 tokens/s |
| GPU 推理 | ~200 tokens/s |

## 如何使用

### 安装

```bash
git clone https://github.com/shironekoalice/loftey.git
cd loftey
pip install -r requirements.txt
```

### 下载模型

ModelScope：

```python
from modelscope import snapshot_download
model_dir = snapshot_download('LightNeko/loftey-mini-235m')
```

HuggingFace：

```python
from huggingface_hub import snapshot_download
model_dir = snapshot_download(repo_id='Zeppesey/loftey-mini-235m')
```

### 推理示例

```python
from transformers import AutoTokenizer
from model import LofteyForCausalLM

model = LofteyForCausalLM.from_pretrained('models')
tokenizer = AutoTokenizer.from_pretrained('models')

prompt = "<|im_start|>user\n你好<|im_end|>\n<|im_start|>assistant\n"
input_ids = tokenizer.encode(prompt, return_tensors='pt')
output = model.generate(
    input_ids,
    max_new_tokens=100,
    temperature=0.7,
    top_k=50,
    top_p=0.95
)
response = tokenizer.decode(output[0], skip_special_tokens=True)
print(response)
```

## 开源地址

- GitHub: https://github.com/modemneko/loftey
- ModelScope: https://www.modelscope.cn/models/LightNeko/loftey-mini-235m
- HuggingFace: https://huggingface.co/Zeppesey/loftey-mini-235m

## 总结

这个项目主要是为了学习。如果你也在学习大模型，希望这篇文章能给你一些参考。

> 本文同步自我的微信公众号「希赛克珑CylonX」，如果觉得有帮助，欢迎点赞、在看、转发。
