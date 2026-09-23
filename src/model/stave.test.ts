import { describe, expect, it } from "vitest";
import { createDocument, createLayout } from "./document";
import {
  centeredStaveLeftPositions,
  ledgerLineSegments,
  naturalLinePitches,
  nearestStavePitch,
  pitchToXmm,
  staveBoundsMm,
} from "./stave";

describe("keyTAB2 stave geometry", () => {
  it("maps pitches through Klavarskribo black-key spacing", () => {
    const document = createDocument();
    const stave = document.pages[0].systems[0].staves[0];
    stave.pitch_range = [60, 72];
    const layout = createLayout();
    layout.scale = 0.5;

    expect(pitchToXmm(60, stave, 10, layout)).toBe(10);
    expect(pitchToXmm(65, stave, 10, layout)).toBe(16);
    expect(naturalLinePitches(stave)).toContain(61);
    expect(naturalLinePitches(stave)).toContain(70);
  });

  it("draws omitted black-key groups as ledger lines for notes outside the range", () => {
    const document = createDocument();
    const system = document.pages[0].systems[0];
    system.start_tick = 0;
    system.end_tick = 1024;
    system.top_mm = 20;
    system.height_mm = 40;
    const stave = system.staves[0];
    stave.pitch_range = [60, 72];
    stave.events.push({ id: "ledger-note", type: "note", time: 512, duration: 128, pitch: 58, velocity: 64, hand: "left", notehead: "auto", color: "auto", acc: 0, continuation_id: null, continues_from_previous: false, continues_to_next: false });
    const layout = createLayout();
    layout.scale = 0.5;

    const ledgers = ledgerLineSegments(system, stave, layout, 10);
    expect(ledgers).toContainEqual(expect.objectContaining({ pitch: 58, xMm: 7, startYmm: 38, endYmm: 44.5 }));
    expect(staveBoundsMm(system, stave, layout, 10)![0]).toBeLessThan(staveBoundsMm(system, stave, layout, 10, false)![0]);
  });

  it("draws ledger groups at continuation dots and stop symbols", () => {
    const document = createDocument();
    const system = document.pages[0].systems[0];
    system.start_tick = 0;
    system.end_tick = 1024;
    system.top_mm = 20;
    system.height_mm = 40;
    const stave = system.staves[0];
    stave.pitch_range = [60, 72];
    stave.events.push({ id: "marker-note", type: "note", time: 512, duration: 128, pitch: 58, velocity: 64, hand: "left", notehead: "auto", color: "auto", acc: 0, continuation_id: null, continues_from_previous: false, continues_to_next: false });
    const layout = createLayout();
    layout.scale = 0.5;

    const ledgers = ledgerLineSegments(system, stave, layout, 10, new Map([["marker-note", [45, 50]]]));
    expect(ledgers).toContainEqual(expect.objectContaining({ pitch: 58, startYmm: 42, endYmm: 48.5 }));
    expect(ledgers).toContainEqual(expect.objectContaining({ pitch: 58, startYmm: 47, endYmm: 53.5 }));
  });

  it("uses the full MIDI pitch span while dragging outside the stave range", () => {
    const document = createDocument();
    const system = document.pages[0].systems[0];
    const stave = system.staves[0];
    stave.pitch_range = [60, 72];
    const layout = createLayout();
    const leftMm = centeredStaveLeftPositions(system, layout, 10, 200)[0];

    expect(nearestStavePitch(stave, layout, leftMm, pitchToXmm(57, stave, leftMm, layout), true)).toBe(57);
    expect(nearestStavePitch(stave, layout, leftMm, pitchToXmm(57, stave, leftMm, layout))).toBe(60);
  });
});