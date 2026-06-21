import fetch from "node-fetch";
import { HttpsProxyAgent } from "https-proxy-agent";
import {
  Connection,
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";
import * as fs from "fs";

// 代理配置
const agent = new HttpsProxyAgent("http://127.0.0.1:7890");

async function main() {
  console.log("💸 Solana 转账示例\n");

  // 1. 连接 devnet
  const connection = new Connection(clusterApiUrl("devnet"), {
    commitment: "confirmed",
    fetchMiddleware: (url, options, next) => {
      return next(url, { ...options, agent: agent as any });
    },
  });

  // 2. 加载钱包
  const senderKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync("/root/.config/solana/id.json", "utf-8")))
  );
  const recipientAddress = "9gfG9qJpPoyCLZg72Ai12n718xZUnUthP6xi1z54qpQ9";
  const recipientPublicKey = new PublicKey(recipientAddress);

  console.log(`📤 发送方: ${senderKeypair.publicKey.toBase58()}`);
  console.log(`📥 接收方: ${recipientAddress}`);

  // 3. 查询转账前余额
  const senderBalanceBefore = await connection.getBalance(senderKeypair.publicKey);
  const recipientBalanceBefore = await connection.getBalance(recipientPublicKey);
  console.log(`\n--- 转账前 ---`);
  console.log(`发送方余额: ${senderBalanceBefore / LAMPORTS_PER_SOL} SOL`);
  console.log(`接收方余额: ${recipientBalanceBefore / LAMPORTS_PER_SOL} SOL`);

  // 4. 构建交易
  const transferAmount = 0.1 * LAMPORTS_PER_SOL; // 0.1 SOL

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: senderKeypair.publicKey,
      toPubkey: recipientPublicKey,
      lamports: transferAmount,
    })
  );

  // 5. 获取最新 blockhash（交易必须包含）
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = senderKeypair.publicKey;

  // 6. 签名并发送
  console.log(`\n📝 正在签名并发送交易...`);
  const signature = await connection.sendTransaction(transaction, [senderKeypair]);
  console.log(`✅ 交易签名: ${signature}`);

  // 7. 等待确认（轮询方式，不依赖 WebSocket）
  console.log(`⏳ 等待确认...`);
  const startTime = Date.now();
  const timeout = 60000; // 60 秒超时

  while (Date.now() - startTime < timeout) {
    const status = await connection.getSignatureStatus(signature);
    if (status && status.value) {
      if (status.value.err) {
        console.error(`❌ 交易失败: ${status.value.err}`);
        return;
      }
      if (status.value.confirmationStatus === "confirmed" || status.value.confirmationStatus === "finalized") {
        console.log(`✅ 交易已确认！(${status.value.confirmationStatus})`);
        break;
      }
    }
    // 等 1 秒再查
    await new Promise((resolve) => setTimeout(resolve, 1000));
    process.stdout.write(".");
  }
  console.log("");

  // 8. 查询转账后余额
  const senderBalanceAfter = await connection.getBalance(senderKeypair.publicKey);
  const recipientBalanceAfter = await connection.getBalance(recipientPublicKey);
  console.log(`\n--- 转账后 ---`);
  console.log(`发送方余额: ${senderBalanceAfter / LAMPORTS_PER_SOL} SOL`);
  console.log(`接收方余额: ${recipientBalanceAfter / LAMPORTS_PER_SOL} SOL`);

  // 9. 计算花费（转账金额 + 手续费）
  const fee = (senderBalanceBefore - senderBalanceAfter - transferAmount) / LAMPORTS_PER_SOL;
  console.log(`\n--- 费用明细 ---`);
  console.log(`转账金额: ${transferAmount / LAMPORTS_PER_SOL} SOL`);
  console.log(`交易手续费: ${fee} SOL`);
  console.log(`总花费: ${(transferAmount / LAMPORTS_PER_SOL + fee).toFixed(9)} SOL`);

  // 10. 查看交易详情
  console.log(`\n🔍 交易详情:`);
  console.log(`https://explorer.solana.com/tx/${signature}?cluster=devnet`);
}

main().catch(console.error);
