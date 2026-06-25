/**
 * 套利机器人框架
 *
 * 完整流程：
 *   1. 价格监控 → 发现价差
 *   2. 利润计算 → 扣除成本后是否盈利
 *   3. 交易执行 → 原子交易（如果资金到位）
 *   4. 结果记录 → PnL 日志
 *
 * 注意：当前为模拟模式，不执行真实交易
 * 真实交易需要：
 *   1. 钱包有足够 SOL
 *   2. 取消模拟模式
 *   3. 注册 Helius RPC（WebSocket 支持）
 */

import { SpreadDetector, ArbitrageOpportunity } from './02-spread-detector';
import { TOKENS, LAMPORTS_PER_SOL } from '../utils';

// ─── 类型定义 ──────────────────────────────────────────

interface TradeRecord {
  id: string;
  timestamp: number;
  pair: string;
  buyDEX: string;
  sellDEX: string;
  buyPrice: number;
  sellPrice: number;
  amount: number;
  expectedProfit: number;
  actualProfit: number;
  status: 'simulated' | 'executed' | 'failed';
  txSignature?: string;
  error?: string;
}

interface BotConfig {
  pairs: string[];
  tradeAmount: number;        // SOL
  minProfitPercent: number;   // 最小利润百分比
  maxSlippage: number;        // 最大滑点容忍度
  dryRun: boolean;            // 模拟模式
  rpcUrl?: string;
}

// ─── 套利机器人 ────────────────────────────────────────

export class ArbitrageBot {
  private config: BotConfig;
  private detector: SpreadDetector;
  private trades: TradeRecord[] = [];
  private isRunning: boolean = false;
  private tradeCounter: number = 0;

  constructor(config: BotConfig) {
    this.config = config;
    this.detector = new SpreadDetector({
      minSpreadPercent: 0.1,
      tradeAmount: config.tradeAmount,
      slippageTolerance: config.maxSlippage,
    });
  }

  /**
   * 启动机器人
   */
  async start(intervalMs: number = 15000): Promise<void> {
    this.isRunning = true;

    console.log('\n🤖 套利机器人启动');
    console.log('═══════════════════════════════════════');
    console.log(`  模式: ${this.config.dryRun ? '🔬 模拟' : '💰 实盘'}`);
    console.log(`  交易对: ${this.config.pairs.join(', ')}`);
    console.log(`  交易金额: ${this.config.tradeAmount} SOL`);
    console.log(`  最小利润: ${this.config.minProfitPercent}%`);
    console.log(`  最大滑点: ${this.config.maxSlippage}%`);
    console.log('═══════════════════════════════════════\n');

    // 启动监控
    await this.detector.startMonitoring(
      this.config.pairs,
      intervalMs,
      (opp) => this.handleOpportunity(opp)
    );
  }

  /**
   * 处理套利机会
   */
  private async handleOpportunity(opp: ArbitrageOpportunity): Promise<void> {
    // 检查利润是否达标
    if (opp.profitPercent < this.config.minProfitPercent) {
      console.log(`\n⏭️  利润不足 (${opp.profitPercent.toFixed(4)}% < ${this.config.minProfitPercent}%)，跳过`);
      return;
    }

    // 创建交易记录
    const trade: TradeRecord = {
      id: `TX-${++this.tradeCounter}`,
      timestamp: Date.now(),
      pair: opp.pair,
      buyDEX: opp.buyDEX,
      sellDEX: opp.sellDEX,
      buyPrice: opp.buyPrice,
      sellPrice: opp.sellPrice,
      amount: this.config.tradeAmount,
      expectedProfit: opp.profit,
      actualProfit: 0,
      status: 'simulated',
    };

    if (this.config.dryRun) {
      // 模拟模式
      console.log(`\n📝 模拟交易 #${trade.id}`);
      console.log(`   买入: ${trade.buyDEX} @ $${trade.buyPrice.toFixed(4)}`);
      console.log(`   卖出: ${trade.sellDEX} @ $${trade.sellPrice.toFixed(4)}`);
      console.log(`   预期利润: $${trade.expectedProfit.toFixed(4)}`);

      trade.actualProfit = trade.expectedProfit;
      trade.status = 'simulated';
    } else {
      // 实盘模式（当前未实现）
      console.log(`\n🚀 执行交易 #${trade.id}...`);
      trade.status = 'failed';
      trade.error = '实盘交易尚未实现';
      console.log('   ⚠️  实盘交易尚未实现');
    }

    this.trades.push(trade);
    this.printTradeSummary(trade);
  }

  /**
   * 打印交易摘要
   */
  private printTradeSummary(trade: TradeRecord): void {
    console.log(`\n┌─────────────────────────────────────┐`);
    console.log(`│  交易 #${trade.id.padEnd(25)}│`);
    console.log(`├─────────────────────────────────────┤`);
    console.log(`│  状态: ${trade.status.padEnd(27)}│`);
    console.log(`│  交易对: ${trade.pair.padEnd(23)}│`);
    console.log(`│  买入: ${trade.buyDEX.padEnd(27)}│`);
    console.log(`│  卖出: ${trade.sellDEX.padEnd(27)}│`);
    console.log(`│  金额: ${trade.amount} SOL${' '.repeat(20 - trade.amount.toString().length)}│`);
    console.log(`│  利润: $${trade.actualProfit.toFixed(4).padEnd(23)}│`);
    console.log(`└─────────────────────────────────────┘`);
  }

  /**
   * 停止机器人
   */
  stop(): void {
    this.isRunning = false;
    console.log('\n⏹️  套利机器人已停止');
  }

  /**
   * 获取交易历史
   */
  getTrades(): TradeRecord[] {
    return this.trades;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalTrades: number;
    simulatedTrades: number;
    executedTrades: number;
    failedTrades: number;
    totalProfit: number;
    winRate: number;
  } {
    const trades = this.trades;
    return {
      totalTrades: trades.length,
      simulatedTrades: trades.filter(t => t.status === 'simulated').length,
      executedTrades: trades.filter(t => t.status === 'executed').length,
      failedTrades: trades.filter(t => t.status === 'failed').length,
      totalProfit: trades.reduce((a, b) => a + b.actualProfit, 0),
      winRate: trades.length > 0
        ? (trades.filter(t => t.actualProfit > 0).length / trades.length) * 100
        : 0,
    };
  }

  /**
   * 打印最终报告
   */
  printReport(): void {
    const stats = this.getStats();

    console.log('\n═══════════════════════════════════════');
    console.log('  📊 套利机器人报告');
    console.log('═══════════════════════════════════════');
    console.log(`  总交易数: ${stats.totalTrades}`);
    console.log(`  模拟交易: ${stats.simulatedTrades}`);
    console.log(`  执行交易: ${stats.executedTrades}`);
    console.log(`  失败交易: ${stats.failedTrades}`);
    console.log(`  总利润: $${stats.totalProfit.toFixed(4)}`);
    console.log(`  胜率: ${stats.winRate.toFixed(2)}%`);
    console.log('═══════════════════════════════════════\n');
  }
}

// ─── 主流程 ────────────────────────────────────────────

async function main() {
  const bot = new ArbitrageBot({
    pairs: ['SOL/USDC'],
    tradeAmount: 0.1,
    minProfitPercent: 0.1,
    maxSlippage: 0.5,
    dryRun: true,  // 模拟模式
  });

  // 启动机器人（每 15 秒检测一次）
  await bot.start(15000);

  // 运行 60 秒后停止
  setTimeout(() => {
    bot.stop();
    bot.printReport();
    process.exit(0);
  }, 60000);
}

if (require.main === module) {
  main().catch(console.error);
}
