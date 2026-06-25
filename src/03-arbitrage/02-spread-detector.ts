/**
 * 价差检测模块
 *
 * 功能：
 *   1. 监控多个 DEX 的同一交易对价格
 *   2. 检测价差超过阈值的套利机会
 *   3. 计算套利利润（扣除手续费、滑点）
 *   4. 输出套利信号
 *
 * 套利逻辑：
 *   如果 DEX_A 价格 > DEX_B 价格 + 成本
 *   → 在 DEX_B 买入，在 DEX_A 卖出
 *   → 利润 = 价差 - 手续费 - 滑点 - Priority Fee
 */

import { jupiterGet, TOKENS, LAMPORTS_PER_SOL } from '../utils';

// ─── 类型定义 ──────────────────────────────────────────

export interface DEXPrice {
  dex: string;
  pair: string;
  price: number;
  amount: number;          // 可交易数量
  priceImpact: number;     // 价格影响
  route?: string;
  timestamp: number;
}

export interface ArbitrageOpportunity {
  buyDEX: string;
  sellDEX: string;
  pair: string;
  buyPrice: number;
  sellPrice: number;
  spread: number;          // 价差百分比
  profit: number;          // 预估利润（美元）
  profitPercent: number;   // 利润百分比
  timestamp: number;
}

export interface SpreadConfig {
  minSpreadPercent: number;    // 最小价差阈值（%）
  tradeAmount: number;         // 交易金额（SOL）
  slippageTolerance: number;   // 滑点容忍度（%）
  priorityFee: number;         // Priority Fee（lamports）
}

const DEFAULT_CONFIG: SpreadConfig = {
  minSpreadPercent: 0.5,   // 0.5% 最小价差
  tradeAmount: 0.1,        // 0.1 SOL
  slippageTolerance: 0.5,  // 0.5% 滑点
  priorityFee: 10000,      // 0.00001 SOL
};

// ─── DEX 配置 ──────────────────────────────────────────

interface DEXConfig {
  name: string;
  getInputAmount: (solAmount: number) => string;
}

const DEX_CONFIGS: Record<string, DEXConfig> = {
  Jupiter: {
    name: 'Jupiter',
    getInputAmount: (sol) => (sol * LAMPORTS_PER_SOL).toString(),
  },
  // 可以添加更多 DEX
  // Raydium: { ... },
  // Orca: { ... },
};

// ─── 价差检测器 ────────────────────────────────────────

export class SpreadDetector {
  private config: SpreadConfig;
  private opportunities: ArbitrageOpportunity[] = [];
  private prices: Map<string, DEXPrice[]> = new Map();

  constructor(config: Partial<SpreadConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 从 Jupiter 获取价格（可配置路由偏好）
   */
  async fetchJupiterPrice(
    pair: string,
    route?: string
  ): Promise<DEXPrice> {
    const [base, quote] = pair.split('/');
    const inputMint = base === 'SOL' ? TOKENS.SOL : TOKENS.USDC;
    const outputMint = quote === 'USDC' ? TOKENS.USDC : TOKENS.SOL;

    const amount = (this.config.tradeAmount * LAMPORTS_PER_SOL).toString();

    const quoteResult = await jupiterGet('/swap/v1/quote', {
      inputMint,
      outputMint,
      amount,
      slippageBps: '0',
      // 如果指定路由，可以添加 onlyDirectRoutes 参数
      ...(route ? { onlyDirectRoutes: 'true' } : {}),
    });

    const decimals = quote === 'USDC' ? 6 : 9;
    const price = Number(quoteResult.outAmount) / Math.pow(10, decimals) / this.config.tradeAmount;

    return {
      dex: route || 'Jupiter',
      pair,
      price,
      amount: this.config.tradeAmount,
      priceImpact: parseFloat(quoteResult.priceImpactPct) || 0,
      route: quoteResult.routePlan.map((r: any) => r.swapInfo.label).join(' → '),
      timestamp: Date.now(),
    };
  }

  /**
   * 获取多个路由的价格
   */
  async fetchMultiplePrices(pair: string): Promise<DEXPrice[]> {
    const prices: DEXPrice[] = [];

    // 尝试获取不同路由的价格
    try {
      // 默认最优路由
      const bestPrice = await this.fetchJupiterPrice(pair);
      prices.push(bestPrice);

      // 尝试直接路由（不聚合）
      try {
        const directPrice = await this.fetchJupiterPrice(pair, 'direct');
        if (directPrice.route !== bestPrice.route) {
          prices.push(directPrice);
        }
      } catch {
        // 忽略错误
      }
    } catch (err: any) {
      console.error(`❌ 获取 ${pair} 价格失败:`, err.message);
    }

    return prices;
  }

  /**
   * 检测价差
   */
  async detectSpread(pair: string): Promise<ArbitrageOpportunity[]> {
    const prices = await this.fetchMultiplePrices(pair);
    this.prices.set(pair, prices);

    const opportunities: ArbitrageOpportunity[] = [];

    // 两两对比
    for (let i = 0; i < prices.length; i++) {
      for (let j = i + 1; j < prices.length; j++) {
        const p1 = prices[i];
        const p2 = prices[j];

        // 计算价差
        const spread = Math.abs(p1.price - p2.price) / Math.min(p1.price, p2.price) * 100;

        if (spread >= this.config.minSpreadPercent) {
          // 确定买卖方向
          const buyPrice = Math.min(p1.price, p2.price);
          const sellPrice = Math.max(p1.price, p2.price);
          const buyDEX = p1.price < p2.price ? p1.dex : p2.dex;
          const sellDEX = p1.price < p2.price ? p2.dex : p1.dex;

          // 计算利润
          const grossProfit = (sellPrice - buyPrice) * this.config.tradeAmount;
          const tradingFee = this.config.tradeAmount * buyPrice * 0.003 * 2; // 0.3% * 2 次交易
          const slippageCost = this.config.tradeAmount * buyPrice * (this.config.slippageTolerance / 100) * 2;
          const priorityFeeSOL = this.config.priorityFee / LAMPORTS_PER_SOL;
          const netProfit = grossProfit - tradingFee - slippageCost - priorityFeeSOL * buyPrice;

          const opportunity: ArbitrageOpportunity = {
            buyDEX,
            sellDEX,
            pair,
            buyPrice,
            sellPrice,
            spread,
            profit: netProfit,
            profitPercent: (netProfit / (this.config.tradeAmount * buyPrice)) * 100,
            timestamp: Date.now(),
          };

          opportunities.push(opportunity);
        }
      }
    }

    this.opportunities.push(...opportunities);
    return opportunities;
  }

  /**
   * 持续监控
   */
  async startMonitoring(
    pairs: string[],
    intervalMs: number = 10000,
    onOpportunity?: (opp: ArbitrageOpportunity) => void
  ): Promise<void> {
    console.log(`\n🔍 价差监控启动`);
    console.log(`   交易对: ${pairs.join(', ')}`);
    console.log(`   最小价差: ${this.config.minSpreadPercent}%`);
    console.log(`   交易金额: ${this.config.tradeAmount} SOL`);
    console.log(`   更新间隔: ${intervalMs}ms`);

    const monitor = async () => {
      for (const pair of pairs) {
        try {
          const opportunities = await this.detectSpread(pair);

          for (const opp of opportunities) {
            const msg = [
              `\n🎯 套利机会!`,
              `   交易对: ${opp.pair}`,
              `   买入: ${opp.buyDEX} @ $${opp.buyPrice.toFixed(4)}`,
              `   卖出: ${opp.sellDEX} @ $${opp.sellPrice.toFixed(4)}`,
              `   价差: ${opp.spread.toFixed(4)}%`,
              `   预估利润: $${opp.profit.toFixed(4)} (${opp.profitPercent.toFixed(4)}%)`,
            ].join('\n');

            console.log(msg);
            onOpportunity?.(opp);
          }
        } catch (err: any) {
          console.error(`❌ ${pair} 检测失败:`, err.message);
        }
      }
    };

    // 立即执行一次
    await monitor();

    // 定时执行
    setInterval(monitor, intervalMs);
  }

  /**
   * 获取所有历史机会
   */
  getOpportunities(): ArbitrageOpportunity[] {
    return this.opportunities;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalOpportunities: number;
    avgSpread: number;
    avgProfit: number;
    profitableCount: number;
  } {
    const opps = this.opportunities;
    if (opps.length === 0) {
      return { totalOpportunities: 0, avgSpread: 0, avgProfit: 0, profitableCount: 0 };
    }

    return {
      totalOpportunities: opps.length,
      avgSpread: opps.reduce((a, b) => a + b.spread, 0) / opps.length,
      avgProfit: opps.reduce((a, b) => a + b.profit, 0) / opps.length,
      profitableCount: opps.filter(o => o.profit > 0).length,
    };
  }
}

// ─── 主流程 ────────────────────────────────────────────

async function main() {
  console.log('📊 价差检测演示\n');

  const detector = new SpreadDetector({
    minSpreadPercent: 0.1,  // 0.1% 最小价差
    tradeAmount: 0.1,       // 0.1 SOL
  });

  // 监控 SOL/USDC 价差
  await detector.startMonitoring(
    ['SOL/USDC'],
    15000,  // 15 秒间隔
    (opp) => {
      // 可以在这里触发交易执行
      console.log(`\n💡 触发交易: 在 ${opp.buyDEX} 买入 → ${opp.sellDEX} 卖出`);
    }
  );

  // 运行 60 秒后停止并打印统计
  setTimeout(() => {
    console.log('\n📊 监控统计:');
    const stats = detector.getStats();
    console.log(`   总机会数: ${stats.totalOpportunities}`);
    console.log(`   平均价差: ${stats.avgSpread.toFixed(4)}%`);
    console.log(`   平均利润: $${stats.avgProfit.toFixed(4)}`);
    console.log(`   盈利机会: ${stats.profitableCount}`);

    process.exit(0);
  }, 60000);
}

if (require.main === module) {
  main().catch(console.error);
}
