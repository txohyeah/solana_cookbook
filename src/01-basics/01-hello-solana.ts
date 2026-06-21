import fetch from "node-fetch";
import { HttpsProxyAgent } from "https-proxy-agent";
import { Connection, PublicKey, LAMPORTS_PER_SOL, clusterApiUrl } from "@solana/web3.js";

// 创建代理 agent
const agent = new HttpsProxyAgent("http://127.0.0.1:7890");

async function main() {
  console.log("🔗 连接 Solana Devnet...\n");

  // 1. 连接 devnet（使用自定义 fetch）
  const connection = new Connection(clusterApiUrl("devnet"), {
    commitment: "confirmed",
    fetchMiddleware: (url, options, next) => {
      return next(url, { ...options, agent: agent as any });
    },
  });

  // 2. 你的钱包地址
  const walletAddress = "EUiFrwRBgCoAeXWLFZUP1ZfFY7BuhY9bFznzbPygVt7A";
  const publicKey = new PublicKey(walletAddress);

  // 3. 查询余额
  console.log(`📋 钱包地址: ${walletAddress}`);
  const balance = await connection.getBalance(publicKey);
  console.log(`💰 余额: ${balance / LAMPORTS_PER_SOL} SOL`);
  console.log(`💰 余额（lamport）: ${balance} lamport\n`);

  // 4. 查询网络信息
  const version = await connection.getVersion();
  console.log(`🌐 Solana 版本: ${JSON.stringify(version)}`);

  const slot = await connection.getSlot();
  console.log(`📦 当前 Slot: ${slot}`);

  const blockHeight = await connection.getBlockHeight();
  console.log(`🏗️  区块高度: ${blockHeight}`);

  console.log("\n✅ Hello Solana! 环境搭建成功！");
}

main().catch(console.error);
