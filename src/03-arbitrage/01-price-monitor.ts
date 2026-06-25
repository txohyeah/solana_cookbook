/**
 * 价格监控模块
 *
 * 功能：
 *   1. 从 Jupiter API 获取实时价格
 *   2. 支持多个交易对同时监控
 *   3. 价格变动超过阈值时触发回调
 *   4. 记录价格历史用于分析
 *
 * 使用方式：
 *   const monitor = new PriceMonitor();
 *   monitor.addPair('SOL/USDC');
 *   monitor.onPriceChange((pair, oldPrice, newPrice) => { ... });
 *   await monitor.start(5000); // 每 5 秒更新一次
 */

import { jupiterGet, TOKENS, LAMPORTS_PER_SOL } from '../utils';

// ─── 类型定义 ──────────────────────────────────────────

export interface PriceData {
  pair: string;
  price: number;           // 当前价格
  timestamp: number;       // 更新时间
  route?: string;          // 路由信息
  priceImpact?: number;    // 价格影响
}

export interface PriceChange {
  pair: string;
  oldPrice: number;
  newPrice: number;
  change: number;          // 变化百分比
  changeAbs: number;       // 变化绝对值
}

export type PriceCallback = (change: PriceChange) => void;

// ─── 交易对配置 ────────────────────────────────────────

const TOKEN_MAP: Record<string, string> = {
  SOL: TOKENS.SOL,
  USDC: TOKENS.USDC,
  USDT: TOKENS.USDT,
  ETH: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
  BTC: '9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E',
};

interface PairConfig {
  inputMint: string;
  outputMint: string;
  decimals: number;        // 输出代币小数位数
}

// ─── 价格监控器 ────────────────────────────────────────

export class PriceMonitor {
  private prices: Map<string, PriceData> = new Map();
  private history: Map<string, PriceData[]> = new Map();
  private callbacks: PriceCallback[] = [];
  private interval: NodeJS.Timeout | null = null;
  private pairConfigs: Map<string, PairConfig> = new Map();

  /**
   * 添加监控交易对
   * @param pair - 交易对名称，如 "SOL/USDC"
   */
  addPair(pair: string): void {
    const [base, quote] = pair.split('/');
    const baseMint = TOKEN_MAP[base];
    const quoteMint = TOKEN_MAP[quote];

    if (!baseMint || !quoteMint) {
      throw new Error(`未知代币: ${base} 或 ${quote}`);
    }

    const decimals = quote === 'USDC' || quote === 'USDT' ? 6 : 9;

    this.pairConfigs.set(pair, {
      inputMint: baseMint,
      outputMint: quoteMint,
      decimals,
    });

    this.history.set(pair, []);
    console.log(`✅ 添加监控: ${pair}`);
  }

  /**
   * 添加价格变动回调
   */
  onPriceChange(callback: PriceCallback): void {
    this.callbacks.push(callback);
  }

  /**
   * 获取单个交易对价格
   */
  async fetchPrice(pair: string): Promise<PriceData> {
    const config = this.pairConfigs.get(pair);
    if (!config) {
      throw new Error(`未配置交易对: ${pair}`);
    }

    // 用 1 单位基础代币查询价格
    const amount = config.inputMint === TOKENS.SOL
      ? LAMPORTS_PER_SOL.toString()  // 1 SOL
      : '1000000';                    // 1 USDC/USDT

    const quote = await jupiterGet('/swap/v1/quote', {
      inputMint: config.inputMint,
      outputMint: config.outputMint,
      amount,
      slippageBps: '0',
    });

    const price = Number(quote.outAmount) / Math.pow(10, config.decimals);
    const route = quote.routePlan
      .map((r: any) => r.swapInfo.label)
      .join(' → ');

    return {
      pair,
      price,
      timestamp: Date.now(),
      route,
      priceImpact: quote.priceImpactPct,
    };
  }

  /**
   * 更新所有交易对价格
   */
  async updateAll(): Promise<PriceData[]> {
    const results: PriceData[] = [];

    for (const pair of this.pairConfigs.keys()) {
      try {
        const newPrice = await this.fetchPrice(pair);
        const oldPrice = this.prices.get(pair);

        results.push(newPrice);
        this.prices.set(pair, newPrice);

        // 记录历史
        const history = this.history.get(pair) || [];
        history.push(newPrice);
        if (history.length > 100) history.shift(); // 保留最近 100 条
        this.history.set(pair, history);

        // 检查价格变动
        if (oldPrice) {
          const change = ((newPrice.price - oldPrice.price) / oldPrice.price) * 100;
          if (Math.abs(change) > 0.01) { // 超过 0.01% 触发回调
            const changeData: PriceChange = {
              pair,
              oldPrice: oldPrice.price,
              newPrice: newPrice.price,
              change,
              changeAbs: newPrice.price - oldPrice.price,
            };

            for (const cb of this.callbacks) {
              cb(changeData);
            }
          }
        }
      } catch (err: any) {
        console.error(`❌ 获取 ${pair} 价格失败:`, err.message);
      }
    }

    return results;
  }

  /**
   * 启动定时监控
   * @param intervalMs - 更新间隔（毫秒）
   */
  async start(intervalMs: number = 5000): Promise<void> {
    console.log(`\n🚀 价格监控启动 (间隔: ${intervalMs}ms)`);

    // 立即更新一次
    await this.updateAll();

    // 定时更新
    this.interval = setInterval(async () => {
      await this.updateAll();
    }, intervalMs);
  }

  /**
   * 停止监控
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log('⏹️  价格监控已停止');
    }
  }

  /**
   * 获取当前价格
   */
  getPrice(pair: string): PriceData | undefined {
    return this.prices.get(pair);
  }

  /**
   * 获取价格历史
   */
  getHistory(pair: string, limit: number = 10): PriceData[] {
    const history = this.history.get(pair) || [];
    return history.slice(-limit);
  }

  /**
   * 获取价格统计
   */
  getStats(pair: string): {
    current: number;
    high: number;
    low: number;
    avg: number;
    change24h: number;
  } | null {
    const history = this.history.get(pair);
    if (!history || history.length === 0) return null;

    const prices = history.map(p => p.price);
    const current = prices[prices.length - 1];
    const high = Math.max(...prices);
    const low = Math.min(...prices);
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;

    // 24 小时变化（如果有足够数据）
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const oldPrice = history.find(p => p.timestamp >= oneDayAgo);
    const change24h = oldPrice
      ? ((current - oldPrice.price) / oldPrice.price) * 100
      : 0;

    return { current, high, low, avg, change24h };
  }
}

// ─── 主流程（独立运行时） ──────────────────────────────

async function main() {
  console.log('📊 价格监控演示\n');

  const monitor = new PriceMonitor();

  // 添加监控交易对
  monitor.addPair('SOL/USDC');
  monitor.addPair('ETH/USDC');

  // 监听价格变动
  monitor.onPriceChange((change) => {
    const arrow = change.change > 0 ? '📈' : '📉';
    console.log(
      `${arrow} ${change.pair}: ` +
      `$${change.oldPrice.toFixed(4)} → $${change.newPrice.toFixed(4)} ` +
      `(${change.change > 0 ? '+' : ''}${change.change.toFixed(4)}%)`
    );
  });

  // 启动监控（每 10 秒更新）
  await monitor.start(10000);

  // 运行 30 秒后停止
  setTimeout(() => {
    monitor.stop();

    // 打印统计
    console.log('\n📊 价格统计:');
    for (const pair of ['SOL/USDC', 'ETH/USDC']) {
      const stats = monitor.getStats(pair);
      if (stats) {
        console.log(`\n${pair}:`);
        console.log(`  当前: $${stats.current.toFixed(4)}`);
        console.log(`  最高: $${stats.high.toFixed(4)}`);
        console.log(`  最低: $${stats.low.toFixed(4)}`);
        console.log(`  平均: $${stats.avg.toFixed(4)}`);
      }
    }

    process.exit(0);
  }, 30000);
}

// 直接运行时执行
if (require.main === module) {
  main().catch(console.error);
}
