export const DRAWING_ORDER = {
  page_background: { layer: "page_background", order: 0 },
  snap_band: { layer: "snap_band", order: 10 },
  midi_body: { layer: "midi_body", order: 20 },
  grid_line: { layer: "grid_lines", order: 30 },
  barline: { layer: "barlines", order: 40 },
  stave_line: { layer: "stave_lines", order: 50 },
  ledger_line: { layer: "ledger_lines", order: 60 },
  time_signature: { layer: "time_signature", order: 70 },
  measure_number: { layer: "measure_numbers", order: 80 },
  tempo: { layer: "tempo", order: 90 },
  count_line: { layer: "count_lines", order: 100 },
  white_note: { layer: "notes", order: 110 },
  black_note: { layer: "notes", order: 120 },
  note_stem: { layer: "notes", order: 130 },
  note_stop: { layer: "notes", order: 130 },
  continuation_dot: { layer: "notes", order: 130 },
  chord_connector: { layer: "notes", order: 130 },
  grace_note: { layer: "notes", order: 140 },
  pedal: { layer: "expressions", order: 150 },
  text: { layer: "expressions", order: 150 },
  line: { layer: "expressions", order: 150 },
  slur: { layer: "expressions", order: 160 },
  hairpin: { layer: "expressions", order: 160 },
  dynamic_symbol: { layer: "expressions", order: 160 },
  repeat_start: { layer: "expressions", order: 160 },
  repeat_end: { layer: "expressions", order: 160 },
  double_bar: { layer: "expressions", order: 160 },
  arpeggio_stem: { layer: "arpeggios", order: 170 },
  beam: { layer: "beams", order: 180 },
  editor_control: { layer: "editor_controls", order: 190 },
  arpeggio_handle: { layer: "editor_controls", order: 190 },
  break_overlay: { layer: "break_overlay", order: 200 },
  meter_overlay: { layer: "meter_overlay", order: 210 },
  selection_overlay: { layer: "selection_overlay", order: 220 },
  playhead: { layer: "playhead", order: 230 },
  input_preview: { layer: "input_overlay", order: 240 },
  page_number: { layer: "page_number", order: 250 },
} as const;

export type DrawingElement = keyof typeof DRAWING_ORDER;
export type SvgDrawLayer = (typeof DRAWING_ORDER)[DrawingElement]["layer"];

export const SVG_DRAW_LAYERS = [...new Set(
  Object.values(DRAWING_ORDER)
    .sort((first, second) => first.order - second.order)
    .map(({ layer }) => layer),
)] as SvgDrawLayer[];

export const compareDrawingElements = (first: DrawingElement, second: DrawingElement) => DRAWING_ORDER[first].order - DRAWING_ORDER[second].order;

export const sortByDrawingOrder = <Item,>(items: readonly Item[], drawingElement: (item: Item) => DrawingElement): Item[] => items
  .map((item, index) => ({ item, index, order: DRAWING_ORDER[drawingElement(item)].order }))
  .sort((first, second) => first.order - second.order || first.index - second.index)
  .map(({ item }) => item);

export const noteDrawingElement = (isBlackKey: boolean): "white_note" | "black_note" => isBlackKey ? "black_note" : "white_note";