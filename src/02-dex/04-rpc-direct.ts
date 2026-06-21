/**
 * 绕过 @solana/web3.js 的 Connection，直接用 HTTP 调 Solana RPC
 *
 * 为什么？
 *   Connection 类内部用 node-fetch@2.x，不支持注入代理
 *   在需要 HTTPS_PROXY 的环境下，所有请求必须显式传 agent
 *
 * 原理：
 *   Solana RPC 就是标准 JSON-RPC 2.0，POST 请求即可
 *   每个 Connection 方法都有对应的 RPC 方法名
 *
 * 对应关系：
 *   connection.getBalance(addr)          →  "getBalance"
 *   connection.getAccountInfo(addr)      →  "getAccountInfo"
 *   connection.getRecentBlockhash()      →  "getLatestBlockhash"
 *   connection.sendRawTransaction()      →  "sendTransaction"
 */

import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';

// ─── 配置 ──────────────────────────────────────────────

const RPC_URL = 'https://api.mainnet-beta.solana.com';
const PROXY_URL = process.env.HTTPS_PROXY || 'http://127.0.0.1:7890';
const agent = new HttpsProxyAgent(PROXY_URL);

// ─── 核心：一个通用的 RPC 调用函数 ──────────────────────

let rpcId = 1;

async function rpcCall(method: string, params: any[] = []): Promise<any> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    agent: agent as any,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: rpcId++,
      method,
      params,
    }),
  });

  const json = await res.json();

  if (json.error) {
    throw new Error(`RPC Error: ${json.error.message}`);
  }

  return json.result;
}

// ─── 示例 1：查询 SOL 余额 ─────────────────────────────

async function example_getBalance() {
  console.log('\n═══════════════════════════════════════');
  console.log('  1. getBalance — 查询 SOL 余额');
  console.log('═══════════════════════════════════════');

  const WALLET = 'EUiFrwRBgCoAeXWLFZUP1ZfFY7BuhY9bFznzbPygVt7A';

  const result = await rpcCall('getBalance', [WALLET]);

  const sol = result.value / 1e9;

  console.log(`  钱包: ${WALLET}`);
  console.log(`  余额: ${sol} SOL (${result.value} lamports)`);
  console.log(`  所在 Slot: ${result.context.slot}`);
}

// ─── 示例 2：读取账户原始数据 ──────────────────────────

async function example_getAccountInfo() {
  console.log('\n═══════════════════════════════════════');
  console.log('  2. getAccountInfo — 读取账户原始字节');
  console.log('═══════════════════════════════════════');

  // 读 SOL 铸币账户（系统程序，肯定存在）
  const SOL_MINT = 'So11111111111111111111111111111111111111112';

  const result = await rpcCall('getAccountInfo', [
    SOL_MINT,
    { encoding: 'base64' },
  ]);

  console.log(`  账户: ${SOL_MINT.slice(0, 20)}...`);
  console.log(`  所有者: ${result.value.owner}`);
  console.log(`  数据大小: ${result.value.data[0].length} 字节`);

  // base64 → Buffer，可以按字节解析
  const data = Buffer.from(result.value.data[0], 'base64');
  console.log(`  原始字节 (前 64): ${data.slice(0, 64).toString('hex')}`);

  // SPL Token Mint 结构（COption = 4 bytes prefix + 32 bytes pubkey）：
  // bytes 0-35:   mint_authority (COption<Pubkey>, 36 bytes)
  //   0-3: option prefix (0=None, 1=Some)
  //   4-35: pubkey (如果 option=Some)
  // bytes 36-43:  supply (u64, 8 bytes)
  // byte 44:      decimals (u8)
  // byte 45:      is_initialized (bool)
  // bytes 46-81:  freeze_authority (COption<Pubkey>, 36 bytes)
  const supply = data.readBigUInt64LE(36);
  const decimals = data[44];
  console.log(`  总供应量: ${Number(supply) / (10 ** decimals)} SOL`);
  console.log(`  小数位数: ${decimals}`);
}

// ─── 示例 3：获取最新区块哈希 ─────────────────────────

async function example_getLatestBlockhash() {
  console.log('\n═══════════════════════════════════════');
  console.log('  3. getLatestBlockhash — 最新区块哈希');
  console.log('═══════════════════════════════════════');

  const result = await rpcCall('getLatestBlockhash', [
    { commitment: 'confirmed' },
  ]);

  console.log(`  Blockhash: ${result.value.blockhash.slice(0, 32)}...`);
  console.log(`  最高可消费 Slot: ${result.value.lastValidBlockHeight}`);
}

// ─── 主流程 ────────────────────────────────────────────

async function main() {
  console.log('🚀 绕过 Connection，直接 HTTP 调 Solana RPC');
  console.log(`   RPC: ${RPC_URL}`);
  console.log(`   代理: ${PROXY_URL}`);

  await example_getBalance();
  await example_getAccountInfo();
  await example_getLatestBlockhash();

  console.log('\n═══════════════════════════════════════');
  console.log('  ✅ 核心思路');
  console.log('═══════════════════════════════════════');
  console.log('  1. 所有 RPC 调用 = POST JSON-RPC 2.0');
  console.log('  2. 每次 fetch 显式传 { agent } 走代理');
  console.log('  3. getAccountInfo 返回 base64 字节，按偏移量解析');
  console.log('  4. Connection 能做的，原生 HTTP 都能做');
}

main().catch(console.error);
