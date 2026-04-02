import type { StreamUsage } from '../types.js';

export class CostTracker {
  private inputTokens = 0;
  private outputTokens = 0;

  add(usage: StreamUsage): void {
    this.inputTokens += usage.input_tokens;
    this.outputTokens += usage.output_tokens;
  }

  getTotals(): { inputTokens: number; outputTokens: number; cost: number } {
    return {
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      cost: this.calculateCost(),
    };
  }

  private calculateCost(): number {
    // Claude Sonnet 4: $3/MTok input, $15/MTok output
    return (this.inputTokens / 1_000_000) * 3 + (this.outputTokens / 1_000_000) * 15;
  }
}
