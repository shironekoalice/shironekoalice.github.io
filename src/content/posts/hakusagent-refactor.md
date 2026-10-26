---
title: HakusAgent 重构记：把三套会话事实源收敛成一条事件账本
published: 2026-10-26
description: 我的 AI 工作台项目同时存在 Python AgentCore、Rust runtime、checkpoint、rollout 四套"真相"，重构要解决的就是这件事。记录这次重构的产品定义、事件账本契约和迁移路线。
tags: [AI Agent, Rust, 架构设计, 重构]
category: 项目介绍
draft: false
---

## 为什么要重构

HakusAgent 是我做了一年多的本地优先 AI 工作台。它能跑：桌面端、终端、Android Termux，支持 SSH/WSL/Docker 远程工作区，带语音、Live2D、VTuber、流程画布。但功能堆得越快，架构债就越明显。

最要命的一条是：**这个项目同时有四个地方能声称自己是"会话真相"**。

- Python 的 `session_store` 里有消息行和事件行
- Rust runtime 有自己的事件表
- checkpoint 文件是一种恢复快照
- 还有 rollout 日志和 long-task 的 JSON 状态文件

这四套东西彼此重叠，谁也不服谁。结果就是：恢复会话时可能拼出两个版本的对话历史；桌面端改了状态但侧边栏没跟上；同一个工具调用在 A 界面显示成功、在 B 界面显示还在跑。

于是我暂停了功能开发，写了两份文档：`ARCHITECTURE_TARGET.md`（方向）和 `REFACTOR_SPEC.md`（可执行的契约，4 万多字）。这篇文章讲这次重构的核心决策。

## 决策一：Rust 是唯一执行平面，Python 降级为扩展

重构前，Python AgentCore 和 Rust runtime 都能"跑一轮对话"。这就是双权威，是所有状态不一致的根源。

新边界：

| 平面 | 职责 | 禁止事项 |
| --- | --- | --- |
| **Rust** | 进程生命周期、工作区传输、文件与命令执行、沙箱、会话持久化、事件排序、HTTP/SSE 边界 | — |
| **TypeScript** | 桌面与 Web 呈现、面板编排、provider/插件管理 UX、工作流编写 | 不得自行执行工作区工具 |
| **Python** | 语音、VTuber、旧模型适配器、领域插件（可选扩展） | 不在默认编码路径上、不得直接改会话存储 |

Python 曾经是主力，现在退到扩展层。这不是否定它——语音和 Live2D 那些能力确实更适合 Python 生态，但它们不该压在"启动 → 选工作区 → 跑一个任务"这条关键路径上。

## 决策二：事件账本是唯一事实源

这是整个重构的地基。所有模型可见的状态，必须先变成一条事件，才允许发给 provider。

事件信封长这样：

```json
{
  "schema_version": 1,
  "event_id": "evt_01J...",
  "event_type": "tool_call_started",
  "session_id": "ses_01J...",
  "workspace_id": "ws_01J...",
  "turn_id": "turn_01J...",
  "correlation_id": "corr_01J...",
  "parent_event_id": null,
  "seq": 42,
  "timestamp": "2026-10-02T12:00:00.123Z",
  "actor": { "kind": "runtime", "id": "runtime" },
  "visibility": "model_and_ui",
  "payload": {}
}
```

几条硬约束，我觉得是这套设计的价值所在：

1. **`seq` 只能由追加操作在单个 SQLite 事务里分配**，客户端永不生成序号。追加失败就意味着动作"没有被报告为开始"——不允许出现"界面显示已开始但账本里没有"的情况。
2. **`timestamp` 不参与排序**。墙钟时间会跳（时区、NTP 校正、系统休眠），排序一律用 `seq`。
3. **`visibility` 只影响投影，不影响执行**。模型看得见什么、UI 显示什么，是投影层的事，不能反过来改变运行时行为。
4. **核心事件类型是封闭集合**，扩展要用命名空间声明自己的事件类型——避免随便加事件把账本变成垃圾场。

核心事件表我列了 27 种：从 `session_created`、`user_input_submitted`、`turn_started`、`model_delta`，到 `approval_requested` / `approval_decided`、`tool_call_started` / `tool_call_finished`，再到 `turn_paused` / `turn_resumed` / `turn_cancelled` / `turn_completed`。

关键点：消息面板、任务看板、Review 面板、用量统计、恢复摘要，**全部是投影**（projection）。每个投影记录自己已应用到哪个 `seq`，随时可以删掉重建，不影响模型可见的历史。桌面端可以做乐观渲染缓冲区压延迟，但重连时必须按 `event_id` 对齐并丢弃——它永远不能当恢复来源。

## 决策三：能力与权限走同一个边界

重构前 Python 有一套 Guardian 权限、Rust 有一套 `execpolicy`，两边的词表和行为都不一样。同一个危险命令，走不同路径可能得到不同结论。

新的模型：工具、provider、工作区传输、沙箱、MCP、Skills、子代理，全部是**能力（capability）**，每个能力必须声明自己的副作用范围、风险等级、所需审批模式和支持的工作区类型。

权限决策集中在一处，只返回三种结果：`allow` / `ask` / `deny`，附带稳定的规则 id 和人类可读的理由。桌面、TUI、远程 worker、Python 扩展全部调用这个边界，**任何适配器都不得静默绕过**。

另外把几种危险操作做了独立分类：破坏性操作、工作区逃逸、凭据访问、网络出口、远程进程控制——它们各自可独立判定，不会因为"整体模式宽松"就被一起放行。

## 决策四：所有工作区实现同一个传输契约

本地文件夹、SSH 主机、WSL 发行版、Docker 容器，走同一条生命周期：

```text
discover -> prepare -> connect -> execute/read/write -> observe -> stop -> dispose
```

具体进展：

- **WSL**：通过 `wsl.exe` 启动 worker，保留审批边界，自动把 `C:\...` 映射成 `/mnt/...`
- **Docker**：用受限的 `docker run` 参数构造、allowlist 环境注入、显式 stop/rm 清理；现有容器 attach、bind-mount 预设、Compose 项目支持留到下一增量
- 传输层拥有远程进程边界，**Agent 运行时里不允许出现 SSH/WSL/Docker 的分支判断**

## 非功能性预算（这是发布门槛，不是愿望）

我给自己定了几个可测量的硬指标：

| 指标 | 要求 |
| --- | --- |
| 冷启动 | 主窗口 5 秒内可用（10 次干净启动的 p95） |
| 空闲内存 | ≤ 450 MB（不含模型服务/容器） |
| 本地首事件延迟 | 提交后 ≤ 300 ms |
| 事件排序 | 无重复、无递减（协议一致性测试） |
| 取消语义 | 确认取消后，工具不得继续修改工作区 |
| 恢复一致性 | 重放产生完全相同的模型可见历史 |
| Provider 健康检查 | 响应/日志/事件中不出现凭据 |
| 远程重连 | 重连不得分叉会话历史 |

"取消后不得继续修改工作区"这条特别难做——因为子进程可能已经跑起来了。要做 kill + trace 测试来验证。

## 迁移顺序

我把它拆成了六步，顺序不能乱：

1. **稳定运行时边界**：Runtime API、事件信封，先给本地工作区和 provider 健康检查补契约测试
2. **工作区适配器**：SSH → WSL → Docker，每个都要先过 hermetic fake 测试，再上一个真实 smoke 环境
3. **会话收敛**：TUI、桌面、Web 全部只消费同一个 ledger，冻结新的 Python 会话格式
4. **桌面工作台**：把页面式布局换成分栏式工作台，但保持 runtime 协议不变
5. **扩展平面**：语音、VTuber、旧 provider、Android 全部挪到带版本的可选协议后面
6. **退休**：垂直切片和迁移诊断都通过后，删掉旧 Python AgentCore、重复的 session store、旧 Vue 路径

## 学到的几件事

**先写契约再写代码**。这次我先写了 4 万字的 SPEC，把事件信封、状态机、迁移门槛、删除规则全定下来。写文档的过程本身就暴露了三处设计矛盾——如果直接写代码，这些矛盾会变成三个月后的 bug。

**"保留功能"和"收敛架构"要分开做**。第 5 步之前，一个旧功能都不能删；第 6 步才开始删。中间任何时刻主分支都要能跑。

**参考别人的架构，但别抄目录结构**。这份重构的边界设计参考了 DeepSeek Harness 的事件/能力/审批三契约，交互和工作区参考了 ZCode。但我没有照搬它们的插件目录组织——那套东西是为纯 runtime 设计的，套到有桌面、语音、VTuber 的产品上会畸形。

---

项目还在重构中（README 里写着预计 10 月中完成）。等垂直切片跑通、旧路径退休完成，我再写一篇收尾的复盘。
