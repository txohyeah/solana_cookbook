# Solana Cookbook

学习 Solana 开发的个人练习仓库。

## 学习路径

详见 [TODO.md](./TODO.md) — 8 周 TypeScript + Solana 全链路学习计划。

## 目录结构

```
src/
├── 01-basics/       ← 链上基础操作（转账、查询、钱包）
├── 02-dex/          ← DEX 交互（Jupiter、Raydium）
├── 03-arbitrage/    ← 套利机器人框架
└── utils/           ← 工具函数
config/              ← 配置文件
```

## 快速开始

```bash
# 1. 安装依赖
npm install @solana/web3.js

# 2. 复制环境变量
cp .env.example .env

# 3. 启动本地验证器
solana-test-validator

# 4. 开始学习
# 按 TODO.md 的 Week 1 开始
```
