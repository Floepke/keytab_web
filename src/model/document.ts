import { z } from "zod";
import { createEvent, createFont, newId } from "./events";
import { createBaseGrid, gridBoundaries, measureDuration, totalDuration, validateBaseGrid } from "./grid";
import {
  FORMAT_NAME,
  FORMAT_VERSION,
  LEGACY_FORMAT_NAME,
  TIME_PER_QUARTER,
  type BaseGrid,
  type KeyTabDocument,
  type Layout,
  type Page,
  type ScoreEvent,
  type Stave,
  type System,
  type TempoEvent,
} from "./types";

const EXTRA_GAP_AFTER_PITCH_CLASSES = new Set([4, 11]);
const PIANO_LOW_MIDI_PITCH = 21;
const PIANO_HIGH_MIDI_PITCH = 108;

const ledgerLineGroups = (): number[][] => {
  const groups: number[][] = [];
  for (let pitch = 0; pitch < 128; pitch += 1) {
    if (pitch % 12 === 1) groups.push([pitch, pitch + 2].filter((value) => value < 128));
    if (pitch % 12 === 6) groups.push([pitch, pitch + 2, pitch + 4].filter((value) => value < 128));
  }
  return groups;
};

const LEDGER_LINE_GROUPS = ledgerLineGroups();

const headerSchema = z.object({
  format: z.union([z.literal(FORMAT_NAME), z.literal(LEGACY_FORMAT_NAME)]),
  format_version: z.literal(FORMAT_VERSION),
  time_per_quarter: z.literal(TIME_PER_QUARTER),
}).passthrough();

const eventTypes = new Set<ScoreEvent["type"]>([
  "note",
  "grace_note",
  "pedal",
  "text",
  "slur",
  "beam",
  "grid_band",
  "line_break",
  "tempo",
  "arpeggio",
  "line",
  "start_repeat",
  "end_repeat",
  "double_bar",
  "count_line",
  "crescendo",
  "decrescendo",
  "dynamic_symbol",
]);

const plainObject = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected an object");
  }
  return value as Record<string, unknown>;
};

const number = (value: unknown, fallback: number): number => (
  typeof value === "number" && Number.isFinite(value) ? value : fallback
);

const text = (value: unknown, fallback: string): string => (
  typeof value === "string" ? value : fallback
);

export function createLayout(): Layout {
  const font = (overrides: Partial<Layout["font_text"]> = {}) => ({ ...createFont(), ...overrides });
  return {
    scale: 0.33,
    page_orientation: "portrait",
    read_direction: "vertical",
    page_width_mm: 210,
    page_height_mm: 297,
    page_top_margin_mm: 10,
    page_bottom_margin_mm: 10,
    page_left_margin_mm: 10,
    page_right_margin_mm: 10,
    header_height_mm: 15,
    footer_height_mm: 10,
    black_note_rule: "above_stem",
    note_stem_length_semitone: 7,
    note_stem_thickness_mm: 1.25,
    note_stopsign_thickness_mm: 1,
    note_continuation_dot_size_mm: 1.5,
    note_midinote_left_color: "#ccc",
    note_midinote_right_color: "#ccc",
    notehead_height_scaling: 1.2,
    note_width_scaling: 1,
    notehead_tilt: 0.3,
    beam_thickness_mm: 2.5,
    beam_corner_radius_mm: 0.75,
    grace_note_outline_width_mm: 0.8,
    grace_note_scale: 0.75,
    pedal_symbol_thickness_mm: 1,
    pedal_background_padding_mm: 1,
    text_background_padding_mm: 0.5,
    slur_width_sides_mm: 0.75,
    slur_width_middle_mm: 2,
    hairpin_line_width_mm: 1,
    hairpin_width_mm: 10,
    dynamic_symbol_font_size_pt: 35,
    dynamic_symbol_background_padding_mm: 1.5,
    dynamic_rotation: 0,
    measure_grouping: "",
    countline_dash_pattern: [0, 3],
    countline_thickness_mm: 1.5,
    grid_band_track: [],
    grid_barline_thickness_mm: 1.25,
    grid_gridline_thickness_mm: 1,
    grid_gridline_dash_pattern_mm: [3, 4],
    grid_band_color: "#ccc",
    grid_band_start_phase: "dark",
    time_signature_indicator_type: "classical & klavarskribo",
    time_signature_indicator_lane_width_mm: 35,
    time_signature_indicator_guide_thickness_mm: 1,
    time_signature_indicator_divide_guide_thickness_mm: 2,
    time_signature_indicator_classic_font: font({ size_pt: 40, bold: true }),
    time_signature_indicator_klavarskribo_font: font({ size_pt: 25, bold: true }),
    measure_numbering_guide_thickness_mm: 0.75,
    measure_numbering_guide_dash_pattern_mm: [2],
    measure_numbering_placement: "barline",
    measure_numbering_font: font({ size_pt: 35, bold: true }),
    tempo_font: font({ size_pt: 35, bold: true }),
    stave_two_line_thickness_mm: 0.5,
    stave_three_line_thickness_mm: 1.1,
    stave_clef_line_thickness_mm: 0.75,
    stave_clef_line_dash_pattern_mm: [4, 3],
    mini_piano_octave_numbering: true,
    mini_piano_color: "#ccc",
    font_title: font({ size_pt: 80 }),
    font_composer: font({ size_pt: 40, italic: true }),
    font_text: font({ italic: true }),
    font_copyright: font({ size_pt: 30 }),
    font_arranger: font({ size_pt: 15 }),
    font_lyricist: font({ size_pt: 15 }),
    note_head_visible: true,
    note_stem_visible: true,
    accidental_visible: true,
    note_stop_visible: true,
    note_continuation_dot_visible: true,
    note_midinote_visible: true,
    beam_visible: true,
    grace_note_visible: true,
    text_visible: true,
    slur_visible: true,
    hairpin_visible: true,
    dynamic_symbol_visible: true,
    repeat_start_visible: true,
    repeat_end_visible: true,
    double_barline_visible: true,
    countline_visible: true,
    stave_visible: true,
    barline_visible: true,
    grid_line_visible: true,
    grid_band_visible: true,
    time_signature_visible: true,
    measure_numbering_guide_visible: true,
    measure_numbers_visible: true,
    tempo_indicator_visible: true,
    mini_piano_visible: true,
  };
}

export function createDocument(): KeyTabDocument {
  const layout = createLayout();
  const baseGrid = createBaseGrid();
  const system: System = {
    id: newId(),
    start_tick: 0,
    end_tick: totalDuration([baseGrid], TIME_PER_QUARTER),
    first_measure_number: 1,
    force_page_break_before: false,
    top_mm: 0,
    height_mm: 0,
    staves: [{
      id: newId(),
      name: "Piano",
      pitch_range: [36, 84],
      scale: 1,
      left_margin_mm: 5,
      right_margin_mm: 5,
      events: [],
    }],
    events: [],
  };
  const page: Page = {
    id: newId(),
    width_mm: layout.page_width_mm,
    height_mm: layout.page_height_mm,
    systems: [system],
    events: [],
  };
  const document: KeyTabDocument = {
    format: FORMAT_NAME,
    format_version: FORMAT_VERSION,
    time_per_quarter: TIME_PER_QUARTER,
    score_info: { title: "Untitled", composer: "", copyright: "" },
    layout,
    base_grid: [baseGrid],
    timeline_events: [createEvent("tempo") as TempoEvent],
    pages: [page],
    created_at: new Date().toISOString(),
    modified_at: new Date().toISOString(),
  };
  reflowPages(document);
  return document;
}

export function ensureInitialTempo(document: KeyTabDocument): void {
  if (!document.timeline_events.some((event) => event.start_tick === 0)) {
    document.timeline_events.unshift(createEvent("tempo") as TempoEvent);
  }
  document.timeline_events.sort((first, second) => first.start_tick - second.start_tick || first.id.localeCompare(second.id));
}

function parseEvent(raw: unknown): ScoreEvent {
  const data = plainObject(raw);
  const type = data.type;
  if (typeof type !== "string" || !eventTypes.has(type as ScoreEvent["type"])) {
    throw new Error(`Unsupported event type: ${String(type)}`);
  }
  const normalized = { ...data };
  if (type === "note" || type === "beam") {
    normalized.time ??= normalized.start_tick ?? 0;
    normalized.duration ??= normalized.duration_ticks ?? 0;
  }
  const defaults = createEvent(type as ScoreEvent["type"]);
  return {
    ...defaults,
    ...normalized,
    id: text(normalized.id, newId()),
    type,
  } as ScoreEvent;
}

function parseStave(raw: unknown): Stave {
  const data = plainObject(raw);
  if (!Array.isArray(data.events)) {
    throw new Error("Stave events must be an array");
  }
  const range = data.pitch_range;
  if (!Array.isArray(range) || range.length !== 2) {
    throw new Error("Stave pitch_range must contain two MIDI pitches");
  }
  const pitchRange: [number, number] = [number(range[0], 36), number(range[1], 84)];
  if (pitchRange[0] >= pitchRange[1]) {
    throw new Error("Stave pitch_range must be ascending");
  }
  const scale = number(data.scale, 1);
  if (scale <= 0) {
    throw new Error("Stave scale must be positive");
  }
  return {
    id: text(data.id, newId()),
    name: text(data.name, "Piano"),
    pitch_range: pitchRange,
    scale,
    left_margin_mm: number(data.left_margin_mm, 5),
    right_margin_mm: number(data.right_margin_mm, 5),
    events: data.events.map(parseEvent),
  };
}

function parseSystem(raw: unknown): System {
  const data = plainObject(raw);
  if (!Array.isArray(data.staves) || !data.staves.length) {
    throw new Error("System must contain at least one stave");
  }
  if (!Array.isArray(data.events)) {
    throw new Error("System events must be an array");
  }
  const start = number(data.start_tick, 0);
  const end = number(data.end_tick, TIME_PER_QUARTER * 16);
  if (end <= start) {
    throw new Error("System end_tick must be after start_tick");
  }
  return {
    id: text(data.id, newId()),
    start_tick: start,
    end_tick: end,
    first_measure_number: number(data.first_measure_number, 1),
    force_page_break_before: Boolean(data.force_page_break_before),
    top_mm: 0,
    height_mm: 0,
    staves: data.staves.map(parseStave),
    events: data.events.map(parseEvent),
  };
}

function parsePage(raw: unknown): Page {
  const data = plainObject(raw);
  if (!Array.isArray(data.systems) || !data.systems.length) {
    throw new Error("Page must contain at least one system");
  }
  if (data.events !== undefined && !Array.isArray(data.events)) {
    throw new Error("Page events must be an array");
  }
  return {
    id: text(data.id, newId()),
    width_mm: number(data.width_mm, 210),
    height_mm: number(data.height_mm, 297),
    systems: data.systems.map(parseSystem),
    events: (data.events ?? []).map(parseEvent),
  };
}

export function deserializeDocument(raw: unknown): KeyTabDocument {
  const data = headerSchema.parse(raw);
  if (!Array.isArray(data.base_grid) || !data.base_grid.length) {
    throw new Error("Document must contain at least one base-grid segment");
  }
  if (!Array.isArray(data.pages) || !data.pages.length) {
    throw new Error("Document must contain at least one page");
  }
  const base_grid = data.base_grid.map((item) => ({
    ...createBaseGrid(),
    ...plainObject(item),
  })) as BaseGrid[];
  base_grid.forEach(validateBaseGrid);
  const layout = { ...createLayout(), ...plainObject(data.layout ?? {}) } as Layout;
  const score = plainObject(data.score_info ?? {});
  const timeline = data.timeline_events ?? [];
  if (!Array.isArray(timeline)) {
    throw new Error("Timeline events must be an array");
  }
  const timeline_events = timeline.map(parseEvent);
  if (!timeline_events.every((event): event is TempoEvent => event.type === "tempo")) {
    throw new Error("Document timeline supports tempo events only");
  }
  const document: KeyTabDocument = {
    format: FORMAT_NAME,
    format_version: FORMAT_VERSION,
    time_per_quarter: TIME_PER_QUARTER,
    score_info: {
      title: text(score.title, "Untitled"),
      composer: text(score.composer, ""),
      copyright: text(score.copyright, ""),
    },
    layout,
    base_grid,
    timeline_events,
    pages: data.pages.map(parsePage),
    created_at: text(data.created_at, new Date().toISOString()),
    modified_at: text(data.modified_at, new Date().toISOString()),
  };
  ensureInitialTempo(document);
  reflowPages(document);
  return document;
}

export function serializeDocument(document: KeyTabDocument): string {
  const snapshot = structuredClone(document);
  snapshot.modified_at = new Date().toISOString();
  const pages = snapshot.pages.map(({ systems, ...page }) => ({
    ...page,
    systems: systems.map(({ top_mm: _top, height_mm: _height, ...system }) => system),
  }));
  return JSON.stringify({ ...snapshot, pages }, null, 2);
}

export function reflowPages(document: KeyTabDocument): void {
  document.pages.forEach((page, index) => {
    const top = document.layout.page_top_margin_mm
      + (index === 0 ? document.layout.header_height_mm : 0);
    const height = page.height_mm
      - top
      - document.layout.page_bottom_margin_mm
      - document.layout.footer_height_mm;
    if (height <= 0) {
      throw new Error("Page margins and header/footer leave no system height");
    }
    page.systems.forEach((system) => {
      system.top_mm = top;
      system.height_mm = height;
    });
  });
}

export function engravingScale(layout: Layout, staveScale = 1): number {
  return Math.max(0.01, layout.scale) * Math.max(0.01, staveScale);
}

export function engravingMm(layout: Layout, baseMm: number, staveScale = 1): number {
  return baseMm * engravingScale(layout, staveScale);
}

export function engravingPtToMm(layout: Layout, points: number, staveScale = 1): number {
  return points * (25.4 / 72) * engravingScale(layout, staveScale);
}

const eventStartTick = (event: ScoreEvent): number => {
  if (event.type === "note" || event.type === "beam") return event.time;
  if (event.type === "slur") return event.y1_tick;
  return event.start_tick;
};

const eventEndTick = (event: ScoreEvent): number => {
  if (event.type === "note" || event.type === "beam") return event.time + event.duration;
  if (event.type === "slur") return Math.max(event.y1_tick, event.y2_tick, event.y3_tick, event.y4_tick);
  if ("duration_ticks" in event) return event.start_tick + event.duration_ticks;
  if (event.type === "line") return Math.max(event.start_tick, event.time1_tick, event.time2_tick);
  return event.start_tick;
};

const allSystems = (document: KeyTabDocument): System[] => document.pages.flatMap((page) => page.systems);

const ledgerGroupIndex = (pitch: number): number => {
  for (let index = 0; index < LEDGER_LINE_GROUPS.length; index += 1) {
    const group = LEDGER_LINE_GROUPS[index];
    if (pitch <= group.at(-1)!) {
      if (index > 0 && pitch <= (LEDGER_LINE_GROUPS[index - 1].at(-1)! + group[0]) / 2) return index - 1;
      return index;
    }
  }
  return LEDGER_LINE_GROUPS.length - 1;
};

const naturalLinePitches = (stave: Stave): number[] => {
  const first = ledgerGroupIndex(stave.pitch_range[0]);
  const last = ledgerGroupIndex(stave.pitch_range[1]);
  return LEDGER_LINE_GROUPS.slice(first, last + 1).flat().filter(
    (pitch) => pitch >= PIANO_LOW_MIDI_PITCH && pitch <= PIANO_HIGH_MIDI_PITCH,
  );
};

const ledgerPitchesForNote = (stave: Stave, pitch: number): number[] => {
  const first = ledgerGroupIndex(stave.pitch_range[0]);
  const last = ledgerGroupIndex(stave.pitch_range[1]);
  const eventGroup = ledgerGroupIndex(pitch);
  if (eventGroup < first) return LEDGER_LINE_GROUPS.slice(eventGroup, first).flat();
  if (eventGroup > last) return LEDGER_LINE_GROUPS.slice(last + 1, eventGroup + 1).flat();
  return [];
};

const staveLinePitches = (system: System, stave: Stave): number[] => {
  const pitches = new Set(naturalLinePitches(stave));
  for (const event of stave.events) {
    if (event.type !== "note" || event.time >= system.end_tick || event.time + event.duration <= system.start_tick) continue;
    if (event.pitch < stave.pitch_range[0] || event.pitch > stave.pitch_range[1]) {
      ledgerPitchesForNote(stave, event.pitch).forEach((pitch) => pitches.add(pitch));
      pitches.add(event.pitch);
    }
  }
  return [...pitches].sort((left, right) => left - right);
};

const pitchOffsetUnits = (pitch: number, rangeLow: number): number => {
  const direction = pitch >= rangeLow ? 1 : -1;
  const [start, end] = pitch >= rangeLow ? [rangeLow, pitch] : [pitch, rangeLow];
  let units = 0;
  for (let current = start; current < end; current += 1) {
    units += EXTRA_GAP_AFTER_PITCH_CLASSES.has(current % 12) ? 2 : 1;
  }
  return direction * units;
};

const systemWidthMm = (document: KeyTabDocument, system: System): number => system.staves.reduce((total, stave) => {
  const pitches = staveLinePitches(system, stave);
  if (pitches.length < 2) return total + stave.left_margin_mm + stave.right_margin_mm;
  const semitoneMm = engravingMm(document.layout, 2, stave.scale);
  const positions = pitches.map((pitch) => pitchOffsetUnits(pitch, stave.pitch_range[0]) * semitoneMm);
  return total + stave.left_margin_mm + Math.max(...positions) - Math.min(...positions) + stave.right_margin_mm;
}, 0);

export function repaginateDocument(document: KeyTabDocument): void {
  const firstPage = document.pages[0];
  const systems = allSystems(document);
  const pageEvents = document.pages.flatMap((page) => page.events);
  const availableWidth = firstPage.width_mm - document.layout.page_left_margin_mm - document.layout.page_right_margin_mm;
  if (availableWidth <= 0) throw new Error("Page margins leave no system space");

  const groups: System[][] = [[]];
  let currentWidth = 0;
  for (const system of systems) {
    const width = systemWidthMm(document, system);
    if (groups.at(-1)!.length > 0 && (system.force_page_break_before || currentWidth + width > availableWidth)) {
      groups.push([]);
      currentWidth = 0;
    }
    groups.at(-1)!.push(system);
    currentWidth += width;
  }
  document.pages = groups.map((pageSystems, index) => ({
    id: index === 0 ? firstPage.id : newId(),
    width_mm: firstPage.width_mm,
    height_mm: firstPage.height_mm,
    systems: pageSystems,
    events: [],
  }));
  for (const event of pageEvents) {
    const page = document.pages.find((candidate) => {
      const first = candidate.systems[0];
      const last = candidate.systems.at(-1)!;
      return eventStartTick(event) >= first.start_tick && eventStartTick(event) < last.end_tick;
    }) ?? document.pages.at(-1)!;
    page.events.push(event);
  }
  reflowPages(document);
}

const measureCountBefore = (document: KeyTabDocument, start: number, time: number): number => {
  const { measures } = gridBoundaries(document.base_grid, document.time_per_quarter);
  return measures.filter((tick) => tick >= start && tick < time).length;
};

export function splitSystemAt(document: KeyTabDocument, systemId: string, time: number): System {
  const systems = allSystems(document);
  const index = systems.findIndex((system) => system.id === systemId);
  if (index < 0) throw new Error("System not found");
  const system = systems[index];
  if (!(system.start_tick < time && time < system.end_tick)) throw new Error("System split time must be inside the system");

  const following: System = structuredClone(system);
  following.id = newId();
  following.start_tick = time;
  following.first_measure_number = system.first_measure_number + measureCountBefore(document, system.start_tick, time);
  following.staves.forEach((stave) => { stave.id = newId(); stave.events = []; });
  system.staves.forEach((stave, staveIndex) => {
    const nextStave = following.staves[staveIndex];
    const retained: ScoreEvent[] = [];
    for (const event of stave.events) {
      if (eventStartTick(event) >= time) {
        nextStave.events.push(event);
      } else {
        retained.push(event);
        if (event.type === "note" && event.time + event.duration > time) {
          const continuation = { ...structuredClone(event), id: newId(), time, duration: event.time + event.duration - time, continuation_id: event.continuation_id ?? event.id, continues_from_previous: true };
          event.duration = time - event.time;
          event.continuation_id = continuation.continuation_id;
          event.continues_to_next = true;
          nextStave.events.push(continuation);
        }
      }
    }
    stave.events = retained;
  });
  following.events = system.events.filter((event) => eventStartTick(event) >= time);
  system.events = system.events.filter((event) => eventStartTick(event) < time);
  system.end_tick = time;

  const owner = document.pages.find((page) => page.systems.some((candidate) => candidate.id === systemId));
  if (!owner) throw new Error("System page not found");
  owner.systems.splice(owner.systems.indexOf(system) + 1, 0, following);
  repaginateDocument(document);
  return following;
}

export function setForcedPageBreakBefore(document: KeyTabDocument, systemId: string, enabled: boolean): void {
  const systems = allSystems(document);
  const system = systems.find((candidate) => candidate.id === systemId);
  if (!system) throw new Error("System not found");
  if (system === systems[0] && enabled) throw new Error("The first system cannot start a new page");
  if (system.force_page_break_before === enabled) return;
  system.force_page_break_before = enabled;
  repaginateDocument(document);
}

export function removeSystemBreak(document: KeyTabDocument, systemId: string, boundary: "top" | "bottom"): System {
  const systems = allSystems(document);
  const index = systems.findIndex((system) => system.id === systemId);
  if (index < 0) throw new Error("System not found");
  const leadingIndex = boundary === "top" ? index - 1 : index;
  if (leadingIndex < 0 || leadingIndex >= systems.length - 1) throw new Error("No system break at document boundary");
  const leading = systems[leadingIndex];
  const following = systems[leadingIndex + 1];
  if (leading.staves.length !== following.staves.length) throw new Error("Cannot merge systems with different stave counts");
  leading.staves.forEach((stave, staveIndex) => stave.events.push(...following.staves[staveIndex].events));
  leading.events.push(...following.events);
  leading.end_tick = following.end_tick;
  for (const page of document.pages) {
    const followingIndex = page.systems.indexOf(following);
    if (followingIndex >= 0) page.systems.splice(followingIndex, 1);
  }
  document.pages = document.pages.filter((page) => page.systems.length > 0);
  repaginateDocument(document);
  return leading;
}

function syncScoreDuration(document: KeyTabDocument): void {
  const currentSystems = allSystems(document);
  const contentEndTick = Math.max(
    0,
    ...currentSystems.flatMap((system) => [
      ...system.events.map(eventEndTick),
      ...system.staves.flatMap((stave) => stave.events.map(eventEndTick)),
    ]),
  );
  const finalGrid = document.base_grid.at(-1)!;
  const finalMeasureDuration = measureDuration(finalGrid, document.time_per_quarter);
  const gridEndTick = totalDuration(document.base_grid, document.time_per_quarter);
  if (contentEndTick > gridEndTick) {
    finalGrid.measure_amount += Math.ceil((contentEndTick - gridEndTick) / finalMeasureDuration);
  }
  const endTick = totalDuration(document.base_grid, document.time_per_quarter);
  const { measures } = gridBoundaries(document.base_grid, document.time_per_quarter);
  const boundaries = [0];
  for (const system of currentSystems.slice(0, -1)) {
    const choices = measures.filter((tick) => tick > boundaries.at(-1)! && tick < endTick);
    if (!choices.length) break;
    boundaries.push(choices.reduce((closest, tick) => Math.abs(tick - system.end_tick) < Math.abs(closest - system.end_tick) ? tick : closest));
  }
  boundaries.push(endTick);
  const retained = currentSystems.slice(0, boundaries.length - 1);
  const staveEvents = retained[0].staves.map((_, staveIndex) => currentSystems.flatMap((system) => system.staves[staveIndex].events));
  const systemEvents = currentSystems.flatMap((system) => system.events);
  retained.forEach((system, index) => {
    system.start_tick = boundaries[index];
    system.end_tick = boundaries[index + 1];
    system.first_measure_number = measureCountBefore(document, 0, system.start_tick) + 1;
    system.staves.forEach((stave, staveIndex) => {
      stave.events = staveEvents[staveIndex].filter((event) => eventStartTick(event) >= system.start_tick && eventStartTick(event) < system.end_tick);
    });
    system.events = systemEvents.filter((event) => eventStartTick(event) >= system.start_tick && eventStartTick(event) < system.end_tick);
  });
  document.pages = [{ ...document.pages[0], systems: retained, events: [] }];
  repaginateDocument(document);
}

export function setTimeSignature(document: KeyTabDocument, time: number, numerator: number, denominator: number, indicatorEnabled: boolean): void {
  if (!Number.isInteger(numerator) || numerator < 1 || !Number.isInteger(denominator) || denominator < 1 || (denominator & (denominator - 1)) !== 0) {
    throw new Error("Time signature must have a positive numerator and power-of-two denominator");
  }
  let cursor = 0;
  let index = document.base_grid.length;
  for (let candidate = 0; candidate < document.base_grid.length; candidate += 1) {
    const segment = document.base_grid[candidate];
    const end = cursor + segment.measure_amount * measureDuration(segment, document.time_per_quarter);
    if (time >= cursor && time < end) {
      if ((time - cursor) % measureDuration(segment, document.time_per_quarter)) throw new Error("Time-signature changes must start at a barline");
      index = candidate;
      break;
    }
    cursor = end;
  }
  if (time !== cursor && index === document.base_grid.length) throw new Error("Time is outside the score");
  let segment: BaseGrid;
  if (index === document.base_grid.length) {
    segment = { ...structuredClone(document.base_grid.at(-1)!), measure_amount: 1 };
    document.base_grid.push(segment);
  } else {
    segment = document.base_grid[index];
    if (time !== cursor) {
      const duration = measureDuration(segment, document.time_per_quarter);
      const leading = (time - cursor) / duration;
      const trailing = segment.measure_amount - leading;
      segment.measure_amount = leading;
      segment = { ...structuredClone(segment), measure_amount: trailing };
      document.base_grid.splice(index + 1, 0, segment);
    }
  }
  segment.numerator = numerator;
  segment.denominator = denominator;
  segment.indicator_enabled = indicatorEnabled;
  segment.beat_grouping = Array.from({ length: numerator }, (_, beat) => beat + 1);
  syncScoreDuration(document);
}

export function setTimeSignatureGridLine(document: KeyTabDocument, time: number, enabled: boolean): void {
  let startTick = 0;
  for (const grid of document.base_grid) {
    const duration = measureDuration(grid, document.time_per_quarter);
    const endTick = startTick + grid.measure_amount * duration;
    if (time < startTick || time >= endTick) {
      startTick = endTick;
      continue;
    }
    const beatDuration = document.time_per_quarter * 4 / grid.denominator;
    if (time <= startTick || time >= startTick + duration || (time - startTick) % beatDuration) {
      throw new Error("Grid lines must be internal beat boundaries in the change measure");
    }
    const beat = (time - startTick) / beatDuration + 1;
    const markers = new Set(grid.beat_grouping);
    if (enabled) markers.add(beat);
    else {
      markers.delete(beat);
      markers.add(1);
    }
    grid.beat_grouping = [...markers].sort((left, right) => left - right);
    return;
  }
  throw new Error("Time is outside the score");
}

export function addMeasure(document: KeyTabDocument): void {
  document.base_grid.at(-1)!.measure_amount += 1;
  syncScoreDuration(document);
}

export function removeMeasure(document: KeyTabDocument): void {
  const final = document.base_grid.at(-1)!;
  if (document.base_grid.length === 1 && final.measure_amount === 1) throw new Error("A score must contain at least one measure");
  final.measure_amount -= 1;
  if (final.measure_amount === 0) document.base_grid.pop();
  syncScoreDuration(document);
}