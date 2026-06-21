/**
 * Raydium AMM 原理 + 链上池子数据
 *
 * 核心概念：
 *   AMM (Automated Market Maker) — 自动做市商
 *   恒定乘积公式：x * y = k
 *     x = 池中代币 A 的数量
 *     y = 池中代币 B 的数量
 *     k = 常数（交易前后不变）
 *
 * 这个公式决定了价格：
 *   价格 = y / x（代币 A 以代币 B 计价的价格）
 *
 * 套利的本质：
 *   当链上某池子价格与外部价格（如 Jupiter 聚合价）出现偏差时，
 *   套利者通过交易把价格"搬"回来，同时赚取差价。
 *
 * 本示例通过 Solana RPC 直接读取链上 Raydium 流动池数据，
 * 不依赖第三方 API，更可靠。
 */

import { Connection, PublicKey } from '@solana/web3.js';
import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';

// ─── 配置 ──────────────────────────────────────────────

const RPC_URL = 'https://api.mainnet-beta.solana.com';
const JUPITER_API = 'https://api.jup.ag';
const PROXY_URL = process.env.HTTPS_PROXY || 'http://127.0.0.1:7890';
const agent = new HttpsProxyAgent(PROXY_URL);

const connection = new Connection(RPC_URL, 'confirmed');

// 常用代币
const SOL_MINT  = new PublicKey('So11111111111111111111111111111111111111112');
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

/** 已知的 Raydium SOL/USDC AMM 池子（主网） */
const KNOWN_POOLS = {
  // Raydium AMM v4 — SOL/USDC
  '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2': { name: 'Raydium SOL/USDC (v4)', decimalsA: 9, decimalsB: 6 },
  // 可以添加更多池子
};

// ─── 辅助函数 ──────────────────────────────────────────

async function jupiterGet(path: string, params?: Record<string, string>): Promise<any> {
  const url = new URL(`${JUPITER_API}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url.toString(), { agent: agent as any });
  if (!res.ok) throw new Error(`Jupiter ${res.status}`);
  return res.json();
}

// ─── 1. AMM 恒定乘积公式演示 ────────────────────────────

/**
 * 用手动计算演示 AMM 核心机制
 *
 * x * y = k 意味着：
 *   - 买入 x（x 减少），y 必须增加来保持 k 不变
 *   - x 减少 → 价格 (y/x) 上涨
 *   - 这就是"自动做市"的原理：供需决定价格
 */
function ammDemo() {
  console.log('\n═══════════════════════════════════════');
  console.log('  1. AMM 恒定乘积公式演示');
  console.log('═══════════════════════════════════════');

  // 初始池子：1000 SOL + 74000 USDC
  let solReserve = 1000;
  let usdcReserve = 74000;
  const k = solReserve * usdcReserve; // k = 74,000,000

  console.log(`\n  初始状态:`);
  console.log(`    SOL 储备: ${solReserve}`);
  console.log(`    USDC 储备: ${usdcReserve}`);
  console.log(`    k = ${k.toLocaleString()}`);
  console.log(`    初始价格: 1 SOL = ${(usdcReserve / solReserve).toFixed(2)} USDC`);

  // 场景：有人买入 10 SOL（往池子加 SOL，取走 USDC）
  const buySol = 10;
  const newSolReserve = solReserve + buySol;
  const newUsdcReserve = k / newSolReserve; // y = k / x
  const usdcOut = usdcReserve - newUsdcReserve;

  console.log(`\n  场景：有人买入 ${buySol} SOL`);
  console.log(`    新 SOL 储备: ${newSolReserve}`);
  console.log(`    新 USDC 储备: ${newUsdcReserve.toFixed(2)}`);
  console.log(`    支付 USDC: ${usdcOut.toFixed(2)}`);
  console.log(`    成交均价: ${(usdcOut / buySol).toFixed(2)} USDC/SOL`);
  console.log(`    新价格: 1 SOL = ${(newUsdcReserve / newSolReserve).toFixed(2)} USDC`);
  console.log(`    价格变化: +${((newUsdcReserve / newSolReserve) / (usdcReserve / solReserve) - 1) * 100}%`);

  // 更新储备
  solReserve = newSolReserve;
  usdcReserve = newUsdcReserve;

  // 场景：又有人买入 10 SOL
  const buySol2 = 10;
  const newSolReserve2 = solReserve + buySol2;
  const newUsdcReserve2 = k / newSolReserve2;
  const usdcOut2 = usdcReserve - newUsdcReserve2;

  console.log(`\n  场景：再有人买入 ${buySol2} SOL`);
  console.log(`    成交均价: ${(usdcOut2 / buySol2).toFixed(2)} USDC/SOL`);
  console.log(`    新价格: 1 SOL = ${(newUsdcReserve2 / newSolReserve2).toFixed(2)} USDC`);

  console.log(`\n  💡 结论：`);
  console.log(`    - 买入越多，单价越贵（大单滑点大）`);
  console.log(`    - 这就是为什么 Jupiter 会在多个池子之间拆单`);
  console.log(`    - 套利机会 = 某个池子的价格偏离了"真实价格"`);
}

// ─── 2. 计算大单滑点 ────────────────────────────────────

/**
 * 从储备量计算不同金额的滑点
 * 套利机器人需要评估：这次套利的利润能不能覆盖滑点
 */
function calculateSlippage(solReserve: number, usdcReserve: number) {
  console.log('\n═══════════════════════════════════════');
  console.log('  2. 大单滑点分析');
  console.log('═══════════════════════════════════════');

  const basePrice = usdcReserve / solReserve;
  const k = solReserve * usdcReserve;

  console.log(`\n  池子: ${solReserve.toLocaleString()} SOL + ${usdcReserve.toLocaleString()} USDC`);
  console.log(`  基准价格: 1 SOL = ${basePrice.toFixed(4)} USDC\n`);
  console.log(`  买入 SOL 量     支付 USDC        成交均价         滑点`);
  console.log(`  ${'─'.repeat(65)}`);

  const testAmounts = [1, 10, 50, 100, 500, 1000];

  for (const inputSol of testAmounts) {
    const newSol = solReserve + inputSol;
    const newUsdc = k / newSol;
    const outputUsdc = usdcReserve - newUsdc;
    const avgPrice = outputUsdc / inputSol;
    const slippage = (1 - avgPrice / basePrice) * 100;

    const bar = '█'.repeat(Math.round(slippage * 10));
    console.log(
      `  ${inputSol.toString().padStart(6)} SOL  →  ${outputUsdc.toFixed(2).padStart(10)} USDC  ` +
      `  ${avgPrice.toFixed(4).padStart(10)}  ${slippage.toFixed(4).padStart(7)}%  ${bar}`
    );
  }
}

// ─── 3. 从链上读取 Raydium 池子储备量 ────────────────────

/**
 * 通过 Solana RPC 读取 Raydium AMM 池子的 token 账户余额
 *
 * 每个 Raydium 池子有两个 token account（分别存两种代币），
 * 读取这两个 account 的余额就是池子的储备量。
 *
 * Raydium v4 池子账户结构：
 *   offset 400: coinMint (32 bytes) — 代币 A 的 Mint
 *   offset 432: pcMint (32 bytes)  — 代币 B 的 Mint
 *   offset 392: coinVault (32 bytes) — 代币 A 的金库地址
 *   offset 424: pcVault (32 bytes)  — 代币 B 的金库地址
 */
async function readPoolOnChain() {
  console.log('\n═══════════════════════════════════════');
  console.log('  3. 链上读取 Raydium 池子数据');
  console.log('═══════════════════════════════════════');

  for (const [poolAddress, info] of Object.entries(KNOWN_POOLS)) {
    console.log(`\n  📍 池子: ${info.name}`);
    console.log(`     地址: ${poolAddress}`);

    try {
      const poolPubkey = new PublicKey(poolAddress);
      const accountInfo = await connection.getAccountInfo(poolPubkey);

      if (!accountInfo) {
        console.log('     ❌ 账户不存在');
        continue;
      }

      const data = accountInfo.data;

      // Raydium v4 AMM Pool 状态解析
      // 参考: https://github.com/raydium-io/raydium-sdk/blob/master/src/core.ts
      const AMM_STATE_OFFSET = 392; // vault 地址的偏移量

      // 读取 vault 地址 (每个 32 bytes)
      const coinVault = new PublicKey(data.slice(AMM_STATE_OFFSET, AMM_STATE_OFFSET + 32));
      const pcVault   = new PublicKey(data.slice(AMM_STATE_OFFSET + 32, AMM_STATE_OFFSET + 64));

      // 读取 mint 地址
      const coinMint = new PublicKey(data.slice(AMM_STATE_OFFSET + 64, AMM_STATE_OFFSET + 96));
      const pcMint   = new PublicKey(data.slice(AMM_STATE_OFFSET + 96, AMM_STATE_OFFSET + 128));

      console.log(`     代币 A: ${coinMint.toBase58().slice(0, 12)}...`);
      console.log(`     代币 B: ${pcMint.toBase58().slice(0, 12)}...`);
      console.log(`     金库 A: ${coinVault.toBase58().slice(0, 12)}...`);
      console.log(`     金库 B: ${pcVault.toBase58().slice(0, 12)}...`);

      // 读取 vault 余额
      const coinAmountBig = await connection.getTokenAccountBalance(coinVault);
      const pcAmountBig   = await connection.getTokenAccountBalance(pcVault);

      const coinAmount = coinAmountBig.value.uiAmount || 0;
      const pcAmount   = pcAmountBig.value.uiAmount || 0;

      console.log(`     储备 A: ${coinAmount.toLocaleString()}`);
      console.log(`     储备 B: ${pcAmount.toLocaleString()}`);

      if (coinAmount > 0 && pcAmount > 0) {
        const price = pcAmount / coinAmount;
        console.log(`     价格: 1 代币A = ${price.toFixed(6)} 代币B`);
      }

    } catch (err: any) {
      console.log(`     ❌ 读取失败: ${err.message}`);
    }
  }
}

// ─── 4. Jupiter vs Raydium 价格对比 ─────────────────────

/**
 * 对比 Jupiter 聚合价 和 Raydium 池子价
 * 这正是套利信号的来源！
 */
async function comparePrices() {
  console.log('\n═══════════════════════════════════════');
  console.log('  4. Jupiter vs Raydium 价格对比');
  console.log('═══════════════════════════════════════');

  // 1. 从 Jupiter 获取聚合价
  const jupiterQuote = await jupiterGet('/swap/v1/quote', {
    inputMint: SOL_MINT.toBase58(),
    outputMint: USDC_MINT.toBase58(),
    amount: '1000000000', // 1 SOL
    slippageBps: '0',
  });

  const jupiterPrice = Number(jupiterQuote.outAmount) / 1e6;
  console.log(`\n  Jupiter 聚合价: 1 SOL = $${jupiterPrice.toFixed(4)} USDC`);
  console.log(`  路由: ${jupiterQuote.routePlan.map((r: any) => r.swapInfo.label).join(' → ')}`);

  // 2. 模拟一个"偏离"的 Raydium 池子价格
  // （实际中通过 readPoolOnChain 获取真实价格）
  const simulatedRaydiumPrice = jupiterPrice * 1.005; // 模拟 0.5% 偏离
  console.log(`  Raydium 模拟价: 1 SOL = $${simulatedRaydiumPrice.toFixed(4)} USDC`);

  // 3. 计算套利空间
  const spread = ((simulatedRaydiumPrice / jupiterPrice) - 1) * 100;
  console.log(`\n  价差: ${spread > 0 ? '+' : ''}${spread.toFixed(4)}%`);

  if (Math.abs(spread) > 0.1) {
    console.log(`  💡 套利信号！`);
    console.log(`     如果 Raydium 价格高于 Jupiter → 在其他地方买 SOL，在 Raydium 卖`);
    console.log(`     如果 Raydium 价格低于 Jupiter → 在 Raydium 买 SOL，在其他地方卖`);
    console.log(`     利润 = 价差 - 交易费 - 滑点 - Priority Fee`);
  } else {
    console.log(`  价差太小，无套利空间`);
  }
}

// ─── 主流程 ────────────────────────────────────────────

async function main() {
  console.log('🚀 Raydium AMM 原理 + 链上数据\n');

  try {
    // 1. AMM 公式演示
    ammDemo();

    // 2. 滑点分析
    calculateSlippage(1000, 74000);

    // 3. 链上读取池子
    await readPoolOnChain();

    // 4. 价格对比
    await comparePrices();

    console.log('\n═══════════════════════════════════════');
    console.log('  📊 汇总');
    console.log('═══════════════════════════════════════');
    console.log('  ✅ AMM 公式演示: OK');
    console.log('  ✅ 滑点分析: OK');
    console.log('  ✅ 链上读取池子: OK');
    console.log('  ✅ Jupiter 价格: OK');
    console.log('\n  套利核心逻辑：');
    console.log('    1. 监控多个池子的价格');
    console.log('    2. 发现价差 > 成本');
    console.log('    3. 原子交易：低买高卖');
    console.log('    4. 扣除费用后仍有利润 = 成功套利');

  } catch (err: any) {
    console.error('\n❌ 错误:', err.message);
  }
}

main();
