# Solana 第一阶段学习路径

> 目标：用 TypeScript 在 Solana 上跑通全链路，不碰 Rust
> 预计周期：8 周
> 前提：熟悉 JS/TS，有基本 web3 概念

### Solana CLI vs Anchor CLI（你可能想问）

| 工具 | 用途 | 第一阶段需要？ |
|------|------|--------------|
| **Solana CLI** | 链操作：钱包、转账、部署、本地验证器 | ✅ 必装 |
| **Anchor CLI** | 合约开发脚手架：初始化项目、编译 Rust 合约 | ❌ Week 7+ 按需装 |

> 第一阶段全链路用 TypeScript 完成，不需要写合约，所以只装 Solana CLI。
> Anchor 留到发现需要自定义合约时再装。

---

## Week 1-2: Solana 基础环境 + 链上交互

### 目标
搭建本地开发环境，理解 Solana 核心概念，用 TS 完成基本链上操作。

### 环境搭建
- [ ] 安装 Solana CLI (`sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"`)
- [ ] 安装 Node.js + npm/pnpm
- [ ] 启动本地验证器 `solana-test-validator`
- [ ] 创建开发钱包 `solana-keygen new`
- [ ] 配置 CLI 指向本地验证器 `solana config set --url localhost`
- [ ] 领取测试 SOL `solana airdrop 2`

### 链上操作（TypeScript）
- [ ] 初始化 TS 项目 `npm init -y`
- [ ] 安装 `@solana/web3.js`
- [ ] 连接本地 Solana 集群
- [ ] 创建钱包并查看余额
- [ ] 发送一笔 SOL 转账
- [ ] 查询交易签名详情
- [ ] 理解 Blockhash / Signature / Account 概念

### 学习资源
- [ ] 阅读 [Solana 官方文档 - Intro](https://solana.com/docs/intro)
- [ ] 跑通 [Cookbook - Development](https://solana.com/developers/cookbook) 前 5 个示例
- [ ] 理解 Solana 账户模型（Account Model）vs 以太坊合约模型

---

## Week 3-4: DEX 交互 + 价格数据

### 目标
接入主流 DEX，读取价格数据，理解流动性池机制。

### Jupiter Aggregator
- [ ] 注册 [Jupiter API](https://station.jup.ag/docs/apis/swap-api)（免费）
- [ ] 用 TS 调用 Jupiter 价格查询 API
- [ ] 用 TS 调用 Jupiter Swap API 完成一笔 swap
- [ ] 理解 Jupiter 聚合路由原理

### Raydium
- [ ] 安装 `@raydium-io/raydium-sdk`
- [ ] 查询 Raydium 流动池列表
- [ ] 读取特定交易对的储备量和价格
- [ ] 理解 AMM 恒定乘积公式（x * y = k）

### 价格监控 Bot
- [ ] 用 WebSocket 订阅链上交易（Helius / QuickNode）
- [ ] 监听特定 DEX 交易对的实时价格
- [ ] 实现简单的价格报警逻辑
- [ ] 输出到终端 / 日志文件

### 学习资源
- [ ] [Jupiter 文档](https://station.jup.ag)
- [ ] [Raydium 文档](https://docs.raydium.io)
- [ ] [Helius 文档](https://docs.helius.dev)

---

## Week 5-6: 套利框架搭建

### 目标
搭建可运行的套利机器人框架，理解 Solana 交易原子性和优先级机制。

### 核心机制
- [ ] 理解 Solana 交易原子性（同一笔 tx 内完成多步操作）
- [ ] 理解 Priority Fee / Compute Unit 机制
- [ ] 理解 Transaction 追加签名和多指令（Instructions）
- [ ] 理解 Recent Blockhash 过期机制

### 套利框架
- [ ] 实现价格差检测模块（监控 2+ DEX 价格）
- [ ] 实现套利执行模块（原子交易：A 买入 + B 卖出）
- [ ] 加入滑点保护（slippage tolerance）
- [ ] 加入交易失败重试逻辑
- [ ] 记录每笔交易的 PnL（盈亏）

### 基础设施
- [ ] 注册 RPC 节点服务（Helius 免费层 / QuickNode）
- [ ] 配置 WebSocket 实时数据流
- [ ] 实现基本日志系统
- [ ] 考虑：是否需要多钱包管理

---

## Week 7-8: 实战 + 进阶准备

### 目标
在 devnet 跑通全流程，分析真实主网机会，评估下一步方向。

### Devnet 全流程测试
- [ ] 切换到 Solana Devnet
- [ ] 在 Jupiter / Raydium Devnet 上完成模拟套利
- [ ] 验证整个流程：监控 → 发现 → 执行 → 结算
- [ ] 压力测试：并发交易、失败处理

### 主网分析
- [ ] 分析主网真实 DEX 价差数据（不交易，只观察）
- [ ] 统计套利机会的频率、持续时间、利润空间
- [ ] 了解当前主流套利策略（跨 DEX、三明治攻击等）
- [ ] 评估竞争格局：现有机器人在做什么

### 进阶方向评估
- [ ] 是否需要学习 Rust + Anchor 写自定义合约？
  - 如果需要：`cargo install --git https://github.com/coral-xyz/anchor avm --locked`
  - 何时装：当你发现 TS 搞不定的场景（自定义 AMM、复杂链上逻辑）
- [ ] 是否接入 Jito MEV Bundle（进阶套利方式）？
- [ ] Base 空投交互脚本（并行任务）
- [ ] TON Telegram Bot Demo（并行任务）

---

## 项目结构（预期）

```
solana_cookbook/
├── TODO.md              ← 本文件
├── package.json
├── tsconfig.json
├── src/
│   ├── 01-basics/       ← Week 1-2 基础操作
│   ├── 02-dex/          ← Week 3-4 DEX 交互
│   ├── 03-arbitrage/    ← Week 5-6 套利框架
│   └── utils/           ← 工具函数（RPC、钱包、日志）
├── config/              ← RPC 节点、钱包路径等配置
└── .env.example         ← 环境变量模板
```

---

## 里程碑检查

| 时间 | 检查点 | 通过标准 |
|------|--------|---------|
| Week 2 末 | 能发一笔 SOL 转账 | TS 代码成功发送并确认 |
| Week 4 末 | 能查任意代币价格 | 读取 Jupiter/Raydium 价格并展示 |
| Week 6 末 | 能跑套利框架 | Devnet 上完成一笔模拟套利 |
| Week 8 末 | 有完整的主网分析报告 | 了解真实市场机会和竞争格局 |

---

## 注意事项

1. **先跑通再优化** — 别一上来就搞完美架构，先让代码能工作
2. **用 devnet 测试** — 任何涉及真金白银的操作前，必须在 devnet 验证
3. **私钥安全** — 永远不要把私钥提交到 git，用 `.env` 管理
4. **记录踩坑** — 每个解决的问题都记下来，未来会省很多时间
5. **别贪多** — 8 周只聚焦 Solana，Base/TON 的事情 Week 8 再说
