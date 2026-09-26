import { describe, expect, it } from "vitest";
import { SVG_DRAW_LAYERS, noteDrawingElement, sortByDrawingOrder } from "./drawing_order";

describe("drawing order", () => {
  it("paints black notes after white notes while preserving their source order", () => {
    const notes = [
      { id: "black-first", isBlackKey: true },
      { id: "white", isBlackKey: false },
      { id: "black-second", isBlackKey: true },
    ];

    expect(sortByDrawingOrder(notes, ({ isBlackKey }) => noteDrawingElement(isBlackKey)).map(({ id }) => id)).toEqual([
      "white",
      "black-first",
      "black-second",
    ]);
  });

  it("keeps notation below editor overlays", () => {
    expect(SVG_DRAW_LAYERS.indexOf("notes")).toBeLessThan(SVG_DRAW_LAYERS.indexOf("selection_overlay"));
    expect(SVG_DRAW_LAYERS.indexOf("notes")).toBeLessThan(SVG_DRAW_LAYERS.indexOf("input_overlay"));
  });
});