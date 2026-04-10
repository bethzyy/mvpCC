import { describe, it, expect } from 'vitest';
import { CostTracker } from '../../src/cost/tracker.js';

describe('CostTracker', () => {
  it('应从零开始累计 token', () => {
    const tracker = new CostTracker();
    const t = tracker.getTotals();
    expect(t.inputTokens).toBe(0);
    expect(t.outputTokens).toBe(0);
    expect(t.cost).toBe(0);
  });

  it('应正确累积多次 add', () => {
    const tracker = new CostTracker();
    tracker.add({ type: 'usage', input_tokens: 100, output_tokens: 50 });
    tracker.add({ type: 'usage', input_tokens: 200, output_tokens: 150 });
    const t = tracker.getTotals();
    expect(t.inputTokens).toBe(300);
    expect(t.outputTokens).toBe(200);
  });

  it('应正确计算费用 ($3/MTok in, $15/MTok out)', () => {
    const tracker = new CostTracker();
    tracker.add({ type: 'usage', input_tokens: 1_000_000, output_tokens: 1_000_000 });
    const t = tracker.getTotals();
    expect(t.cost).toBe(18); // $3 + $15
  });

  it('应处理零 token', () => {
    const tracker = new CostTracker();
    tracker.add({ type: 'usage', input_tokens: 0, output_tokens: 0 });
    expect(tracker.getTotals().cost).toBe(0);
  });
});
