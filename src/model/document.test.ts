import { describe, expect, it } from "vitest";
import {
  addMeasure,
  createDocument,
  createLayout,
  deserializeDocument,
  ensureScoreDuration,
  engravingMm,
  engravingPtToMm,
  engravingScale,
  removeMeasure,
  removeSystemBreak,
  setForcedPageBreakBefore,
  setTimeSignature,
  setTimeSignatureGridLine,
  serializeDocument,
  splitSystemAt,
} from "./document";
import { applyBeamOverrides, beamWindows, gridBoundaries, gridLineBoundaries, timeSignatureIndicators } from "./grid";

describe("keyTAB document model", () => {
  it("creates the keyTAB web default template", () => {
    const document = createDocument();
    const systems = document.pages.flatMap((page) => page.systems);
    expect(systems).toHaveLength(4);
    expect(systems.every((system) => system.staves.length === 1)).toBe(true);
    expect(document.base_grid).toMatchObject([{ numerator: 4, denominator: 4, measure_amount: 16 }]);
    expect(systems.map(({ start_tick, end_tick }) => [start_tick, end_tick])).toEqual([
      [0, 4096],
      [4096, 8192],
      [8192, 12288],
      [12288, 16384],
    ]);
    expect(document.score_info).toEqual({
      title: "Untitled",
      composer: "keyTAB_web",
      copyright: `\u00A9 keyTAB_web ${new Date().getFullYear()}`,
    });
  });

  it("applies a layout template to a new document without sharing it", () => {
    const template = createLayout();
    template.scale = 0.5;
    const document = createDocument(template);
    template.scale = 0.25;

    expect(document.layout.scale).toBe(0.5);
  });

  it("round-trips serialized native document data", () => {
    const document = createDocument();
    document.pages[0].systems[0].staves[0].events.push({ id: "note-1", type: "note", time: 256, duration: 128, pitch: 60, velocity: 64, hand: "left", notehead: "auto", color: "auto", acc: 0, continuation_id: null, continues_from_previous: false, continues_to_next: false });
    const restored = deserializeDocument(JSON.parse(serializeDocument(document)));
    expect(restored.pages[0].systems[0].staves[0].events[0]).toMatchObject({ type: "note", time: 256, pitch: 60 });
  });

  it("loads existing keytab2-labelled files and writes the keytab-web format", () => {
    const serialized = JSON.parse(serializeDocument(createDocument()));
    serialized.format = "keytab2";
    const restored = deserializeDocument(serialized);
    expect(restored.format).toBe("keytab-web");
    expect(JSON.parse(serializeDocument(restored)).format).toBe("keytab-web");
  });

  it("restores the required initial tempo marker when loading a score without one", () => {
    const serialized = JSON.parse(serializeDocument(createDocument()));
    serialized.timeline_events = [];
    const restored = deserializeDocument(serialized);
    expect(restored.timeline_events).toHaveLength(1);
    expect(restored.timeline_events[0]).toMatchObject({ type: "tempo", start_tick: 0, tempo: 120 });
  });

  it("uses enabled beat markers for visible grid lines", () => {
    expect(gridBoundaries([{ numerator: 7, denominator: 8, beat_grouping: [1, 4, 9], measure_amount: 2, indicator_enabled: true }], 256)).toEqual({ measures: [0, 896, 1792], groups: [384, 1280] });
  });

  it("shows time-signature indicators only at enabled grid-segment starts", () => {
    const grids = [
      { numerator: 4, denominator: 4, beat_grouping: [1, 2, 3, 4], measure_amount: 4, indicator_enabled: true },
      { numerator: 3, denominator: 4, beat_grouping: [1, 3], measure_amount: 2, indicator_enabled: true },
      { numerator: 5, denominator: 8, beat_grouping: [1, 3], measure_amount: 1, indicator_enabled: false },
    ];
    expect(timeSignatureIndicators(grids, 256).map(({ grid, startTick }) => [startTick, grid.numerator, grid.denominator])).toEqual([
      [0, 4, 4],
      [4096, 3, 4],
    ]);
  });

  it("uses grid lines for automatic beams and replaces overlaps with explicit beams", () => {
    const grid = [{ numerator: 4, denominator: 4, beat_grouping: [1, 2, 4, 8], measure_amount: 1, indicator_enabled: true }];
    expect(gridLineBoundaries(grid, 256)).toEqual([256, 768]);
    expect(beamWindows(grid, 256)).toEqual([[0, 256], [256, 768], [768, 1024]]);
    expect(applyBeamOverrides(beamWindows(grid, 256), [[128, 640]])).toEqual([[128, 640], [768, 1024]]);
  });

  it("keeps keyTAB2 layout fields and engraving units distinct from paper dimensions", () => {
    const layout = createLayout();
    layout.scale = 0.5;
    expect(engravingScale(layout, 0.5)).toBe(0.25);
    expect(engravingMm(layout, 1, 0.5)).toBe(0.25);
    expect(engravingPtToMm(layout, 72, 0.5)).toBeCloseTo(6.35);
    expect(layout.time_signature_indicator_type).toBe("classical & klavarskribo");
    expect(layout.measure_numbering_placement).toBe("barline");
    expect(layout.font_copyright.size_pt).toBe(30);
    expect(layout.mini_piano_visible).toBe(true);
  });

  it("splits systems and creates linked note continuations", () => {
    const document = createDocument();
    const system = document.pages[0].systems[0];
    system.staves[0].events.push({ id: "crossing", type: "note", time: 2000, duration: 256, pitch: 60, velocity: 64, hand: "left", notehead: "auto", color: "auto", acc: 0, continuation_id: null, continues_from_previous: false, continues_to_next: false });

    const following = splitSystemAt(document, system.id, 2048);
    const leadingNote = system.staves[0].events[0];
    const followingNote = following.staves[0].events[0];
    if (leadingNote.type !== "note" || followingNote.type !== "note") {
      throw new Error("Expected split notes to remain note events");
    }

    expect([leadingNote.time, leadingNote.duration]).toEqual([2000, 48]);
    expect([followingNote.type, followingNote.time, followingNote.duration]).toEqual(["note", 2048, 208]);
    expect(leadingNote).toMatchObject({ continues_to_next: true, continuation_id: "crossing" });
    expect(followingNote).toMatchObject({ continues_from_previous: true, continuation_id: "crossing" });
    expect(following.first_measure_number).toBe(3);
  });

  it("gives every segment of a cross-system note one continuation identity", () => {
    const document = createDocument();
    const system = document.pages[0].systems[0];
    system.staves[0].events.push({ id: "crossing", type: "note", time: 2000, duration: 256, pitch: 60, velocity: 64, hand: "left", notehead: "auto", color: "auto", acc: 0, continuation_id: null, continues_from_previous: false, continues_to_next: false });

    const following = splitSystemAt(document, system.id, 2048);
    const segments = [system, following].flatMap((candidate) => candidate.staves[0].events)
      .filter((event): event is Extract<typeof event, { type: "note" }> => event.type === "note");
    const continuationId = segments[0].continuation_id ?? segments[0].id;

    expect(segments.every((event) => event.id === continuationId || event.continuation_id === continuationId)).toBe(true);
  });

  it("preserves score duration through time signature and measure edits", () => {
    const document = createDocument();
    setTimeSignature(document, 2048, 3, 4, false);
    expect(document.base_grid.map(({ numerator, denominator, measure_amount, indicator_enabled }) => ({ numerator, denominator, measure_amount, indicator_enabled }))).toEqual([
      { numerator: 4, denominator: 4, measure_amount: 2, indicator_enabled: true },
      { numerator: 3, denominator: 4, measure_amount: 14, indicator_enabled: false },
    ]);
    expect(document.pages.at(-1)!.systems.at(-1)!.end_tick).toBe(12800);

    addMeasure(document);
    expect(document.base_grid.at(-1)!.measure_amount).toBe(15);
    removeMeasure(document);
    expect(document.base_grid.at(-1)!.measure_amount).toBe(14);
  });

  it("adds whole measures when score content extends beyond the final bar", () => {
    const document = createDocument();
    ensureScoreDuration(document, 16385);

    expect(document.base_grid.at(-1)!.measure_amount).toBe(17);
    expect(document.pages.flatMap((page) => page.systems).at(-1)!.end_tick).toBe(17408);
  });

  it("extends the final grid instead of discarding notes after a time-signature change", () => {
    const document = createDocument();
    document.pages[0].systems[0].staves[0].events.push({ id: "imported-note", type: "note", time: 7800, duration: 256, pitch: 60, velocity: 64, hand: "left", notehead: "auto", color: "auto", acc: 0, continuation_id: null, continues_from_previous: false, continues_to_next: false });

    setTimeSignature(document, 2048, 3, 4, false);

    const events = document.pages.flatMap((page) => page.systems).flatMap((system) => system.staves[0].events);
    expect(events.find((event) => event.id === "imported-note")).toMatchObject({ time: 7800, duration: 256 });
    expect(document.pages.at(-1)!.systems.at(-1)!.end_tick).toBeGreaterThanOrEqual(8056);
  });

  it("edits grid lines only in a time-signature change measure", () => {
    const document = createDocument();
    setTimeSignatureGridLine(document, 256, false);
    expect(document.base_grid[0].beat_grouping).toEqual([1, 3, 4]);

    setTimeSignatureGridLine(document, 256, true);
    expect(document.base_grid[0].beat_grouping).toEqual([1, 2, 3, 4]);
    expect(() => setTimeSignatureGridLine(document, 1280, false)).toThrow("Grid lines must be internal beat boundaries in the change measure");
  });

  it("repaginates narrow paper after a system split", () => {
    const document = createDocument();
    document.layout.page_width_mm = 55;
    document.pages[0].width_mm = 55;
    const system = document.pages[0].systems[0];

    splitSystemAt(document, system.id, 1024);

    expect(document.pages).toHaveLength(5);
    expect(document.pages.map((page) => page.systems[0].start_tick)).toEqual([0, 1024, 4096, 8192, 12288]);
  });

  it("supports forced page breaks and merging systems again", () => {
    const document = createDocument();
    const first = document.pages[0].systems[0];
    const following = splitSystemAt(document, first.id, 1024);

    setForcedPageBreakBefore(document, following.id, true);
    expect(document.pages.map((page) => page.systems)).toHaveLength(3);
    expect(document.pages[1].systems[0].force_page_break_before).toBe(true);

    const merged = removeSystemBreak(document, following.id, "top");
    expect(document.pages).toHaveLength(2);
    expect(document.pages[0].systems[0]).toEqual(merged);
    expect([merged.start_tick, merged.end_tick]).toEqual([0, 4096]);
  });
});