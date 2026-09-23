import type { BaseGrid } from "./types";

export interface TimeSignatureIndicator {
  grid: BaseGrid;
  startTick: number;
}

export function createBaseGrid(): BaseGrid {
  return {
    numerator: 4,
    denominator: 4,
    beat_grouping: [1, 2, 3, 4],
    measure_amount: 8,
    indicator_enabled: true,
  };
}

export function validateBaseGrid(grid: BaseGrid): void {
  if (!Number.isInteger(grid.numerator) || grid.numerator < 1) {
    throw new Error("Base-grid numerator must be positive");
  }
  if (
    !Number.isInteger(grid.denominator)
    || grid.denominator < 1
    || (grid.denominator & (grid.denominator - 1)) !== 0
  ) {
    throw new Error("Base-grid denominator must be a positive power of two");
  }
  if (!Number.isInteger(grid.measure_amount) || grid.measure_amount < 1) {
    throw new Error("Base-grid measure_amount must be positive");
  }
  if (
    !grid.beat_grouping.length
    || !grid.beat_grouping.every((beat) => Number.isInteger(beat) && beat > 0)
  ) {
    throw new Error("Base-grid beat_grouping must contain positive integer markers");
  }
}

export function beatDuration(grid: BaseGrid, timePerQuarter: number): number {
  return (timePerQuarter * 4) / grid.denominator;
}

export function measureDuration(grid: BaseGrid, timePerQuarter: number): number {
  return grid.numerator * beatDuration(grid, timePerQuarter);
}

export function totalDuration(grids: BaseGrid[], timePerQuarter: number): number {
  return grids.reduce(
    (total, grid) => total + grid.measure_amount * measureDuration(grid, timePerQuarter),
    0,
  );
}

export function timeSignatureIndicators(grids: BaseGrid[], timePerQuarter: number): TimeSignatureIndicator[] {
  const indicators: TimeSignatureIndicator[] = [];
  let startTick = 0;
  for (const grid of grids) {
    if (grid.indicator_enabled) indicators.push({ grid, startTick });
    startTick += grid.measure_amount * measureDuration(grid, timePerQuarter);
  }
  return indicators;
}

export function gridBoundaries(grids: BaseGrid[], timePerQuarter: number): { measures: number[]; groups: number[] } {
  const measures: number[] = [];
  const groups: number[] = [];
  let tick = 0;
  for (const grid of grids) {
    const measure = measureDuration(grid, timePerQuarter);
    const beats = grid.beat_grouping.filter(
      (beat) => beat > 1 && beat <= grid.numerator,
    );
    const offsets = [...new Set(beats)]
      .sort((left, right) => left - right)
      .map((beat) => (beat - 1) * beatDuration(grid, timePerQuarter));

    for (let index = 0; index < grid.measure_amount; index += 1) {
      measures.push(tick);
      groups.push(...offsets.map((offset) => tick + offset));
      tick += measure;
    }
  }
  measures.push(tick);
  return { measures, groups };
}

export function gridLineBoundaries(grids: BaseGrid[], timePerQuarter: number): number[] {
  return gridBoundaries(grids, timePerQuarter).groups;
}

export function beamWindows(grids: BaseGrid[], timePerQuarter: number): [number, number][] {
  const { measures } = gridBoundaries(grids, timePerQuarter);
  const boundaries = [...new Set([...measures, ...gridLineBoundaries(grids, timePerQuarter)])]
    .sort((left, right) => left - right);
  return boundaries.slice(0, -1).map((start, index) => [start, boundaries[index + 1]]);
}

export function applyBeamOverrides(defaultWindows: [number, number][], overrides: [number, number][]): [number, number][] {
  let windows = [...defaultWindows];
  for (const [start, end] of [...overrides].sort(([left], [right]) => left - right)) {
    if (end <= start) continue;
    windows = windows.filter(([windowStart, windowEnd]) => windowStart >= end || windowEnd <= start);
    windows.push([start, end]);
  }
  return windows.sort(([left], [right]) => left - right);
}