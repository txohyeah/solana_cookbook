/**
 * 原生 HTTP RPC 工具
 *
 * 绕过 @solana/web3.js 的 Connection 类代理问题
 * 所有 RPC 调用通过 fetch + agent 显式走代理
 */

import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';

// ─── 配置 ──────────────────────────────────────────────

export const RPC_URL = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
export const PROXY_URL = process.env.HTTPS_PROXY || 'http://127.0.0.1:7890';

const agent = new HttpsProxyAgent(PROXY_URL);

// ─── 核心 RPC 调用 ─────────────────────────────────────

let rpcId = 1;

/**
 * 通用 JSON-RPC 2.0 调用
 *
 * @param method - RPC 方法名（如 "getBalance", "getAccountInfo"）
 * @param params - 方法参数数组
 * @returns RPC 返回的 result 字段
 */
export async function rpcCall(method: string, params: any[] = []): Promise<any> {
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
    throw new Error(`RPC Error [${method}]: ${json.error.message}`);
  }

  return json.result;
}

// ─── 常用 RPC 方法封装 ─────────────────────────────────

/**
 * 查询 SOL 余额
 * @param address - 钱包地址
 * @returns lamports 数量（1 SOL = 10^9 lamports）
 */
export async function getBalance(address: string): Promise<number> {
  const result = await rpcCall('getBalance', [address]);
  return result.value;
}

/**
 * 读取账户原始数据
 * @param address - 账户地址
 * @returns base64 编码的字节数据
 */
export async function getAccountInfo(address: string): Promise<Buffer | null> {
  const result = await rpcCall('getAccountInfo', [
    address,
    { encoding: 'base64' },
  ]);

  if (!result.value) {
    return null;
  }

  return Buffer.from(result.value.data[0], 'base64');
}

/**
 * 查询 Token 余额
 * @param tokenAccount - Token 账户地址（ATA）
 * @returns { amount, decimals, uiAmount }
 */
export async function getTokenBalance(tokenAccount: string) {
  const result = await rpcCall('getTokenAccountBalance', [tokenAccount]);
  return {
    amount: result.value.amount,
    decimals: result.value.decimals,
    uiAmount: result.value.uiAmount,
  };
}

/**
 * 获取最新区块哈希
 */
export async function getLatestBlockhash() {
  const result = await rpcCall('getLatestBlockhash', [
    { commitment: 'confirmed' },
  ]);
  return result.value.blockhash;
}

/**
 * 发送原始交易
 * @param signedTransaction - 签名后的交易（base64 或 Buffer）
 */
export async function sendRawTransaction(signedTransaction: Buffer | string): Promise<string> {
  const encoded = typeof signedTransaction === 'string'
    ? signedTransaction
    : signedTransaction.toString('base64');

  const result = await rpcCall('sendRawTransaction', [
    encoded,
    { skipPreflight: false, encoding: 'base64' },
  ]);

  return result;
}

/**
 * 查询交易状态
 * @param signature - 交易签名
 */
export async function getSignatureStatus(signature: string) {
  const result = await rpcCall('getSignatureStatuses', [
    [signature],
    { searchTransactionHistory: false },
  ]);

  return result.value[0];
}

// ─── Jupiter API 工具 ──────────────────────────────────

const JUPITER_API = 'https://api.jup.ag';

/**
 * Jupiter API GET 请求
 */
export async function jupiterGet(path: string, params?: Record<string, string>): Promise<any> {
  const url = new URL(`${JUPITER_API}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), { agent: agent as any });
  if (!res.ok) {
    throw new Error(`Jupiter API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

/**
 * Jupiter API POST 请求
 */
export async function jupiterPost(path: string, body: any): Promise<any> {
  const res = await fetch(`${JUPITER_API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    agent: agent as any,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Jupiter API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

// ─── 常用地址 ──────────────────────────────────────────

export const TOKENS = {
  SOL:  'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
};

export const LAMPORTS_PER_SOL = 1_000_000_000;
