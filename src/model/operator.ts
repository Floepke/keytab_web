/** Threshold-based comparisons for musical time values. */
export class Operator {
  readonly threshold: number;

  constructor(threshold = 0.000001) {
    this.threshold = Math.abs(threshold);
  }

  eq(left: number, right: number, threshold = this.threshold): boolean {
    return Math.abs(left - right) <= Math.abs(threshold);
  }

  ne(left: number, right: number): boolean {
    return !this.eq(left, right);
  }

  gt(left: number, right: number, threshold = this.threshold): boolean {
    return left - right > Math.abs(threshold);
  }

  lt(left: number, right: number, threshold = this.threshold): boolean {
    return right - left > Math.abs(threshold);
  }

  ge(left: number, right: number, threshold = this.threshold): boolean {
    return left >= right - Math.abs(threshold);
  }

  le(left: number, right: number, threshold = this.threshold): boolean {
    return left <= right + Math.abs(threshold);
  }
}
