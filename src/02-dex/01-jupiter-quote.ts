/**
 * Jupiter API 常用接口示例
 *
 * Jupiter 是 Solana 上最大的 DEX 聚合器：
 * - 自己没有流动性池
 * - 自动在多个 DEX（Raydium、Orca、Meteora 等）之间找最优路由
 *
 * 核心 API（无需注册、无需 API Key）：
 *   /swap/v1/quote  — 获取最优报价（推荐，最新版）
 *   /swap/v1/swap   — 基于报价生成可执行交易
 *   /tokens/all     — 查询所有支持的代币列表
 *
 * 文档：https://station.jup.ag/docs/apis/swap-api
 */

import fetch from 'node-fetch';
import HttpsProxyAgent from 'https-proxy-agent';

// ─── 常量 ──────────────────────────────────────────────

const JUPITER_API = 'https://api.jup.ag';

/** 常用代币 Mint 地址 */
const TOKENS = {
  SOL:  'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
};

/** 代理（用于国内服务器访问） */
const PROXY_URL = process.env.HTTPS_PROXY || 'http://127.0.0.1:7890';
const agent = new HttpsProxyAgent.HttpsProxyAgent(PROXY_URL);

// ─── 辅助函数 ──────────────────────────────────────────

/** GET 请求 */
async function jupiterGet(path: string, params?: Record<string, string>): Promise<any> {
  const url = new URL(`${JUPITER_API}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), { agent: agent as any });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jupiter GET ${res.status}: ${text}`);
  }
  return res.json();
}

/** POST 请求 */
async function jupiterPost(path: string, body: Record<string, any>): Promise<any> {
  const url = `${JUPITER_API}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    agent: agent as any,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jupiter POST ${res.status}: ${text}`);
  }
  return res.json();
}

/** 人类可读的数字格式化 */
function formatAmount(raw: string, decimals: number): string {
  const num = BigInt(raw);
  const whole = num / BigInt(10 ** decimals);
  const frac = num % BigInt(10 ** decimals);
  return `${whole.toLocaleString()}.${frac.toString().padStart(decimals, '0')}`;
}

/** SOL 的 decimals = 9，USDC 的 decimals = 6 */
const DECIMALS: Record<string, number> = {
  SOL: 9,
  USDC: 6,
  BONK: 9,
};

// ─── 接口 1: 获取代币价格 ───────────────────────────────

/**
 * 通过 /quote 获取价格
 *
 * 用法：查 1 SOL 能换多少 USDC，反过来算出价格
 * 这比直接的价格 API 更灵活，因为能同时拿到路由信息
 */
async function getTokenPrice() {
  console.log('\n═══════════════════════════════════════');
  console.log('  1. 查询 SOL/USDC 价格');
  console.log('═══════════════════════════════════════');

  // 1 SOL = 1_000_000_000 lamports
  const amountInLamports = '1000000000';

  const quote = await jupiterGet('/swap/v1/quote', {
    inputMint: TOKENS.SOL,
    outputMint: TOKENS.USDC,
    amount: amountInLamports,
    slippageBps: '50',       // 0.5% 滑点容差
  });

  const solAmount = Number(amountInLamports) / 1e9;
  const usdcAmount = Number(quote.outAmount) / 1e6;
  const price = usdcAmount / solAmount;

  console.log(`  输入:  ${solAmount} SOL`);
  console.log(`  输出:  ${formatAmount(quote.outAmount, 6)} USDC`);
  console.log(`  价格:  1 SOL = $${price.toFixed(2)} USDC`);
  console.log(`  滑点:  ${quote.slippageBps / 100}%`);
  console.log(`  路径:  经过 ${quote.routePlan.length} 个 DEX`);

  return quote;
}

// ─── 接口 2: 获取最优路由报价 ────────────────────────────

/**
 * /quote 的完整参数说明：
 *
 * 必填:
 *   inputMint   — 输入代币的 Mint 地址
 *   outputMint  — 输出代币的 Mint 地址
 *   amount      — 输入数量（最小单位，如 lamports）
 *
 * 可选:
 *   slippageBps — 滑点容差，单位 basis points (100 = 1%)
 *   swapMode    — "ExactIn"（固定输入量）或 "ExactOut"（固定输出量）
 *   onlyDirectRoutes — true 则只返回单跳路由（更快但可能不是最优）
 *   asLegacyTransaction — true 则返回 Legacy 格式（非 Versioned）
 */
async function getSwapQuote() {
  console.log('\n═══════════════════════════════════════');
  console.log('  2. 获取最优路由报价');
  console.log('═══════════════════════════════════════');

  // 用 10 USDC 买 SOL
  const amount = '10000000'; // 10 USDC = 10 * 1e6

  const quote = await jupiterGet('/swap/v1/quote', {
    inputMint: TOKENS.USDC,
    outputMint: TOKENS.SOL,
    amount,
    slippageBps: '100',  // 1% 滑点
    swapMode: 'ExactIn',
  });

  console.log(`  输入:   ${formatAmount(quote.inputMint === TOKENS.USDC ? amount : quote.inAmount, 6)} USDC`);
  console.log(`  输出:   ${formatAmount(quote.outAmount, 9)} SOL`);
  console.log(`  最低收到: ${formatAmount(quote.otherAmountThreshold, 9)} SOL (扣除滑点)`);
  console.log(`  价格影响: ${quote.priceImpactPct}%`);
  console.log(`  耗时:   ${quote.timeTaken.toFixed(4)}s`);

  // 打印路由详情
  console.log('\n  📍 路由计划:');
  for (const [i, step] of quote.routePlan.entries()) {
    const { swapInfo } = step;
    const inputToken = Object.entries(TOKENS).find(([, v]) => v === swapInfo.inputMint)?.[0] || swapInfo.inputMint.slice(0, 8);
    const outputToken = Object.entries(TOKENS).find(([, v]) => v === swapInfo.outputMint)?.[0] || swapInfo.outputMint.slice(0, 8);

    console.log(`    ${i + 1}. [${swapInfo.label}] ${inputToken} → ${outputToken}`);
    console.log(`       数量: ${swapInfo.inAmount} → ${swapInfo.outAmount}`);
  }

  return quote;
}

// ─── 接口 3: 生成可执行交易 ─────────────────────────────

/**
 * /swap — 把报价变成一笔可签名的交易
 *
 * 输入: /quote 返回的完整 quote 对象
 * 输出: { swapTransaction, lastValidBlockHeight }
 *
 * 注意:
 *   - 返回的 swapTransaction 是 base64 编码的序列化交易
 *   - 需要用 wallet 签名后才能发送到链上
 *   - 这里只演示生成交易，不实际签名发送（避免消耗真实 SOL）
 */
async function getSwapTransaction(quote: any) {
  console.log('\n═══════════════════════════════════════');
  console.log('  3. 生成可执行交易');
  console.log('═══════════════════════════════════════');

  const walletAddress = process.env.WALLET_ADDRESS || 'EUiFrwRBgCoAeXWLFZUP1ZfFY7BuhY9bFznzbPygVt7A';

  const result = await jupiterPost('/swap/v1/swap', {
    quoteResponse: quote,
    userPublicKey: walletAddress,
    dynamicComputeUnitLimit: true,
    dynamicSlippage: true,
  });

  console.log(`  交易大小: ${(result.swapTransaction.length / 1024).toFixed(1)} KB`);
  console.log(`  最新区块: ${result.lastValidBlockHeight}`);
  console.log('\n  ✅ 交易已生成，base64 格式，可用以下代码签名并发送:');

  return result;
}

// ─── 主流程 ────────────────────────────────────────────

async function main() {
  console.log('🚀 Jupiter API 示例');
  console.log('代理:', PROXY_URL);

  try {
    // 1. 查价格
    const quote = await getTokenPrice();

    // 2. 查路由
    const detailedQuote = await getSwapQuote();

    // 3. 生成交易（用第 2 步的报价）
    const swapResult = await getSwapTransaction(detailedQuote);

    // 4. 汇总
    console.log('\n═══════════════════════════════════════');
    console.log('  📊 汇总');
    console.log('═══════════════════════════════════════');
    console.log('  ✅ 价格查询: OK');
    console.log('  ✅ 路由报价: OK');
    console.log('  ✅ 交易生成: OK');
    console.log('\n  下一步: 签名 + 发送交易 = 完成 swap');
    console.log('  （需要 @solana/wallet-adapter 或手动用 KeyPair 签名）');

  } catch (err: any) {
    console.error('\n❌ 错误:', err.message);
    console.error('\n排查步骤:');
    console.error('  1. 检查代理是否运行: curl -x http://127.0.0.1:7890 https://api.jup.ag');
    console.error('  2. 检查网络: ping api.jup.ag');
    console.error('  3. Jupiter API 可能有版本更新，检查文档: https://station.jup.ag');
  }
}

main();
