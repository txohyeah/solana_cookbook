/**
 * 完整 Swap 流程：Quote → Swap → 签名 → 发送 → 确认
 *
 * 主网 + 极小金额测试（约 $0.07）
 * Jupiter 只在主网有流动性
 *
 * 注意：由于 @solana/web3.js@1.73.0 的 Connection 不支持代理，
 * 本示例用原生 HTTP 直接调 Solana RPC（JSON-RPC 2.0）。
 *
 * 流程：
 *   1. /quote  — 获取最优报价
 *   2. /swap   — 生成可签名的交易（base64）
 *   3. 签名    — 用钱包私钥签名
 *   4. 发送    — 推到链上
 *   5. 确认    — 等待交易被确认
 */

import { Keypair, VersionedTransaction } from '@solana/web3.js';
import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';

// ─── 配置 ──────────────────────────────────────────────

const RPC_URL = 'https://api.mainnet-beta.solana.com';
const JUPITER_API = 'https://api.jup.ag';
const PROXY_URL = process.env.HTTPS_PROXY || 'http://127.0.0.1:7890';
const agent = new HttpsProxyAgent(PROXY_URL);

// 主网代币
const TOKENS = {
  SOL:  'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
};

// ─── 原生 RPC 调用 ──────────────────────────────────────

let rpcRequestId = 0;

async function rpcCall(method: string, params: any[] = []): Promise<any> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcRequestId, method, params }),
    agent: agent as any,
  });
  const json = await res.json();
  if (json.error) throw new Error(`RPC Error: ${json.error.message}`);
  return json.result;
}

// ─── Jupiter API ────────────────────────────────────────

async function jupiterGet(path: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`${JUPITER_API}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { agent: agent as any });
  if (!res.ok) throw new Error(`Jupiter GET ${res.status}: ${await res.text()}`);
  return res.json();
}

async function jupiterPost(path: string, body: Record<string, any>): Promise<any> {
  const res = await fetch(`${JUPITER_API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    agent: agent as any,
  });
  if (!res.ok) throw new Error(`Jupiter POST ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── 辅助 ──────────────────────────────────────────────

async function loadWallet(): Promise<Keypair> {
  const keyPath = join(homedir(), '.config', 'solana', 'id.json');
  const secret = JSON.parse(await readFile(keyPath, 'utf-8'));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function fmt(raw: string, decimals: number): string {
  const n = BigInt(raw);
  return `${(Number(n) / 10 ** decimals).toFixed(4)}`;
}

// ─── 主流程 ────────────────────────────────────────────

async function main() {
  console.log('🚀 完整 Swap 流程 (主网)\n');

  const wallet = await loadWallet();
  const addr = wallet.publicKey.toBase58();
  console.log(`  钱包: ${addr}`);

  const { value: lamports } = await rpcCall('getBalance', [addr]);
  const sol = lamports / 1e9;
  console.log(`  余额: ${sol.toFixed(4)} SOL\n`);

  const canSend = sol >= 0.01;
  if (!canSend) {
    console.log('  ⚠️  余额不足，演示 Step 1-3（不发送交易）\n');
  }

  try {
    // ─── Step 1: 获取报价 ─────────────────────────────
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Step 1: /quote — 获取最优报价');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const amount = '1000000'; // 0.001 SOL ≈ $0.07

    const quote = await jupiterGet('/swap/v1/quote', {
      inputMint: TOKENS.SOL,
      outputMint: TOKENS.USDC,
      amount,
      slippageBps: '100',
    });

    console.log(`  输入:     ${fmt(amount, 9)} SOL`);
    console.log(`  输出:     ${fmt(quote.outAmount, 6)} USDC`);
    console.log(`  价格影响: ${quote.priceImpactPct}%`);
    console.log(`  路由:     ${quote.routePlan.map((r: any) => r.swapInfo.label).join(' → ')}`);

    // ─── Step 2: 生成交易 ─────────────────────────────
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Step 2: /swap — 生成可签名交易');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const swapResult = await jupiterPost('/swap/v1/swap', {
      quoteResponse: quote,
      userPublicKey: addr,
      dynamicComputeUnitLimit: true,
      dynamicSlippage: true,
    });

    console.log(`  交易大小: ${(swapResult.swapTransaction.length / 1024).toFixed(1)} KB`);
    console.log(`  最新区块: ${swapResult.lastValidBlockHeight}`);

    // ─── Step 3: 签名交易 ─────────────────────────────
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Step 3: 签名交易');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const txBuf = Buffer.from(swapResult.swapTransaction, 'base64');
    const tx = VersionedTransaction.deserialize(txBuf);
    tx.sign([wallet]);

    console.log(`  ✅ 签名完成`);
    console.log(`  签名者: ${addr}`);

    if (!canSend) {
      // 余额不足，到此为止
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('  Step 4-5: 跳过（余额不足）');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('  💡 要实际执行 swap，请:');
      console.log('     1. 往钱包转入至少 0.01 SOL');
      console.log('     2. 再次运行 npm run swap');
    } else {
      // ─── Step 4: 发送交易 ─────────────────────────────
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('  Step 4: 发送到链上');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      const rawTx = tx.serialize();
      const signature = await rpcCall('sendRawTransaction', [
        Buffer.from(rawTx).toString('base64'),
        { skipPreflight: false, maxRetries: 3 },
      ]);

      console.log(`  签名: ${signature}`);
      console.log(`  查看: https://explorer.solana.com/tx/${signature}`);

      // ─── Step 5: 确认交易 ─────────────────────────────
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('  Step 5: 等待确认...');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      const startTime = Date.now();
      while (Date.now() - startTime < 60000) {
        const { value } = await rpcCall('getSignatureStatuses', [[signature]]);
        const s = value?.[0];

        if (s?.confirmationStatus === 'confirmed' || s?.confirmationStatus === 'finalized') {
          console.log(`  ✅ 确认! (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
          console.log(`  状态: ${s.confirmationStatus}`);
          const { value: newBal } = await rpcCall('getBalance', [addr]);
          console.log(`  花费: ${(sol - newBal.value / 1e9).toFixed(6)} SOL`);
          break;
        }
        if (s?.err) { console.log(`  ❌ 失败: ${JSON.stringify(s.err)}`); break; }
        process.stdout.write('.');
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    // ─── 汇总 ─────────────────────────────────────────
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  📊 流程总结');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  /quote  → 拿到最优报价（含路由、滑点）');
    console.log('  /swap   → 生成可执行交易（base64）');
    console.log('  签名    → VersionedTransaction.sign()');
    console.log('  发送    → sendRawTransaction()');
    console.log('  确认    → 轮询 getSignatureStatuses()');

  } catch (err: any) {
    console.error(`\n❌ 错误: ${err.message}`);
  }
}

main();
