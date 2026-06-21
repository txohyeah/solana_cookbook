# Solana Cookbook — 技术备忘

> 项目运行环境和关键技术决策的速查记录。

## 环境

| 项目 | 值 |
|------|-----|
| Solana CLI | v1.18.26（手动安装 `/opt/solana-v1.18.26/`） |
| Node.js | v20.11.1 LTS |
| TypeScript | v6.0.3 |
| @solana/web3.js | **v1.73.0**（降级，最新版 ESM 不兼容 ts-node） |
| node-fetch | v2.7.0（v2 CommonJS） |
| https-proxy-agent | v7.x（命名导出 `{ HttpsProxyAgent }`） |
| 钱包地址 | `EUiFrwRBgCoAeXWLFZUP1ZfFY7BuhY9bFznzbPygVt7A` |
| 网络 | devnet（基础操作）/ mainnet（Jupiter API） |
| 代理 | Clash `127.0.0.1:7890`（写在 `~/.bashrc`） |

## 运行命令

```bash
npm run hello      # 连接、余额、网络信息
npm run transfer   # SOL 转账
npm run jupiter    # Jupiter API 调用（quote/price/swap 生成）
npm run swap       # 完整 swap 流程（quote → swap → sign）
npm run raydium    # AMM 原理 + 链上数据
```

## 关键坑

### 代理
- `node-fetch@2.x` 不读 `HTTPS_PROXY` → 必须每个 fetch 显式传 `{ agent }`
- `@solana/web3.js` Connection 不支持代理 → 绕过 Connection 用原生 HTTP
- 所有 HTTP 请求都需要显式 `HttpsProxyAgent`

### 版本
- `@solana/web3.js` 最新版（1.98.x）依赖 ESM（uuid）→ 降级到 1.73.0
- `https-proxy-agent` v5 默认导出，v7 命名导出
- v5 和 v7 都不继承 `https.Agent`（只继承 `http.Agent`）

### API 稳定性
- Jupiter `/quote` → 已改为 `/swap/v1/quote`
- Jupiter `/price/v2` → 已 404
- Raydium `/pools` → 已 404
- **经验：写代码前先 curl 测试最新端点**
