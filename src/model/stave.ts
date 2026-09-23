import { engravingMm, engravingScale } from "./document";
import type { KeyTabDocument, Layout, NoteEvent, Page, Stave, System } from "./types";

export const PIANO_LOW_MIDI_PITCH = 21;
export const PIANO_HIGH_MIDI_PITCH = 108;

const EXTRA_GAP_AFTER_PITCH_CLASSES = new Set([4, 11]);
const THREE_LINE_KEY_CLASSES = new Set([1, 9, 11]);
const CLEF_KEY_NUMBERS = new Set([41, 43]);
const LEDGER_LINE_LENGTH_MM = 13;
const LEDGER_LINE_GROUPS = Array.from({ length: 128 }, (_, pitch) => pitch)
  .flatMap((pitch) => {
    if (pitch % 12 === 1) return [[pitch, pitch + 2].filter((value) => value < 128)];
    if (pitch % 12 === 6) return [[pitch, pitch + 2, pitch + 4].filter((value) => value < 128)];
    return [];
  });

export interface StaveLineStyle {
  widthMm: number;
  dashMm: number[];
}

export interface LedgerLineSegment extends StaveLineStyle {
  pitch: number;
  xMm: number;
  startYmm: number;
  endYmm: number;
  midiOnly: boolean;
}

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

export function pitchOffsetUnits(midiPitch: number, rangeLow: number): number {
  const direction = midiPitch >= rangeLow ? 1 : -1;
  const [start, end] = midiPitch >= rangeLow ? [rangeLow, midiPitch] : [midiPitch, rangeLow];
  let units = 0;
  for (let pitch = start; pitch < end; pitch += 1) {
    units += EXTRA_GAP_AFTER_PITCH_CLASSES.has(pitch % 12) ? 2 : 1;
  }
  return direction * units;
}

export function staveSemitoneMm(layout: Layout, stave: Stave): number {
  return engravingMm(layout, 2, stave.scale);
}

export function pitchToXmm(midiPitch: number, stave: Stave, leftMm: number, layout: Layout): number {
  return leftMm + pitchOffsetUnits(midiPitch, stave.pitch_range[0]) * staveSemitoneMm(layout, stave);
}

export function naturalLinePitches(stave: Stave): number[] {
  const first = ledgerGroupIndex(stave.pitch_range[0]);
  const last = ledgerGroupIndex(stave.pitch_range[1]);
  return LEDGER_LINE_GROUPS.slice(first, last + 1).flat().filter(
    (pitch) => pitch >= PIANO_LOW_MIDI_PITCH && pitch <= PIANO_HIGH_MIDI_PITCH,
  );
}

export function ledgerLinePitchesForPitch(stave: Stave, pitch: number): number[] {
  const first = ledgerGroupIndex(stave.pitch_range[0]);
  const last = ledgerGroupIndex(stave.pitch_range[1]);
  const eventGroup = ledgerGroupIndex(pitch);
  if (eventGroup < first) return LEDGER_LINE_GROUPS.slice(eventGroup, first).flat();
  if (eventGroup > last) return LEDGER_LINE_GROUPS.slice(last + 1, eventGroup + 1).flat();
  return [];
}

export function staveLineStyle(pitch: number, layout: Layout, stave: Stave): StaveLineStyle {
  const scale = engravingScale(layout, stave.scale);
  if (pitch === PIANO_LOW_MIDI_PITCH + 1) {
    return { widthMm: layout.stave_three_line_thickness_mm * scale, dashMm: [] };
  }
  const keyNumber = pitch - 20;
  if (CLEF_KEY_NUMBERS.has(keyNumber)) {
    return {
      widthMm: layout.stave_clef_line_thickness_mm * scale,
      dashMm: layout.stave_clef_line_dash_pattern_mm.map((value) => value * scale),
    };
  }
  return {
    widthMm: ((THREE_LINE_KEY_CLASSES.has((keyNumber - 1) % 12))
      ? layout.stave_three_line_thickness_mm
      : layout.stave_two_line_thickness_mm) * scale,
    dashMm: [],
  };
}

export function staveLinePitches(system: System, stave: Stave): number[] {
  const pitches = new Set(naturalLinePitches(stave));
  for (const event of stave.events) {
    if (event.type !== "note" || event.time >= system.end_tick || event.time + event.duration <= system.start_tick) continue;
    if (event.pitch < stave.pitch_range[0] || event.pitch > stave.pitch_range[1]) {
      ledgerLinePitchesForPitch(stave, event.pitch).forEach((pitch) => pitches.add(pitch));
      pitches.add(event.pitch);
    }
  }
  return [...pitches].sort((left, right) => left - right);
}

export function staveBoundsMm(system: System, stave: Stave, layout: Layout, leftMm: number, includeLedgers = true): [number, number] | null {
  const pitches = includeLedgers ? staveLinePitches(system, stave) : naturalLinePitches(stave);
  if (!pitches.length) return null;
  return [pitchToXmm(pitches[0], stave, leftMm, layout), pitchToXmm(pitches.at(-1)!, stave, leftMm, layout)];
}

export function systemRequiredWidthMm(document: KeyTabDocument, system: System): number {
  return system.staves.reduce((total, stave) => {
    const bounds = staveBoundsMm(system, stave, document.layout, 0);
    const width = bounds === null ? 0 : bounds[1] - bounds[0];
    return total + stave.left_margin_mm + width + stave.right_margin_mm;
  }, 0);
}

export function pageSystemBounds(page: Page, document: KeyTabDocument): Map<string, [number, number]> {
  const availableLeft = document.layout.page_left_margin_mm;
  const availableWidth = page.width_mm - availableLeft - document.layout.page_right_margin_mm;
  const footprints = page.systems.map((system) => systemRequiredWidthMm(document, system));
  const requiredWidth = footprints.reduce((total, width) => total + width, 0);
  const bounds = new Map<string, [number, number]>();
  if (requiredWidth > availableWidth) {
    const columnWidth = availableWidth / page.systems.length;
    page.systems.forEach((system, index) => bounds.set(system.id, [
      availableLeft + index * columnWidth,
      availableLeft + (index + 1) * columnWidth,
    ]));
    return bounds;
  }
  const gapWidth = (availableWidth - requiredWidth) / (page.systems.length + 1);
  let cursor = availableLeft + gapWidth;
  page.systems.forEach((system, index) => {
    bounds.set(system.id, [cursor, cursor + footprints[index]]);
    cursor += footprints[index] + gapWidth;
  });
  return bounds;
}

export function centeredStaveLeftPositions(system: System, layout: Layout, leftLimitMm: number, rightLimitMm: number): number[] {
  const bounds = system.staves.map((stave) => staveBoundsMm(system, stave, layout, 0));
  const widths = bounds.map((bound) => bound === null ? 0 : bound[1] - bound[0]);
  const groupWidth = system.staves.reduce(
    (total, stave, index) => total + stave.left_margin_mm + widths[index] + stave.right_margin_mm,
    0,
  );
  let cursor = leftLimitMm + (rightLimitMm - leftLimitMm - groupWidth) * 0.5;
  return system.staves.map((stave, index) => {
    cursor += stave.left_margin_mm;
    const left = bounds[index] === null ? cursor : cursor - bounds[index]![0];
    cursor += widths[index] + stave.right_margin_mm;
    return left;
  });
}

export function ledgerLineSegments(
  system: System,
  stave: Stave,
  layout: Layout,
  leftMm: number,
  markerCentresMmByNoteId: ReadonlyMap<string, readonly number[]> = new Map(),
): LedgerLineSegment[] {
  const semitoneMm = staveSemitoneMm(layout, stave);
  const ledgerLengthMm = engravingMm(layout, LEDGER_LINE_LENGTH_MM, stave.scale);
  const segments: LedgerLineSegment[] = [];
  const drawn = new Set<string>();
  for (const event of stave.events) {
    if (event.type !== "note" || event.time >= system.end_tick || event.time + event.duration <= system.start_tick) continue;
    const startYmm = system.top_mm
      + (Math.max(event.time, system.start_tick) - system.start_tick) * system.height_mm / (system.end_tick - system.start_tick);
    const markerCentresMm = [startYmm + semitoneMm, ...(markerCentresMmByNoteId.get(event.id) ?? [])];
    for (const yCenterMm of markerCentresMm) {
      for (const pitch of ledgerLinePitchesForPitch(stave, event.pitch)) {
        const key = `${pitch}:${yCenterMm}`;
        if (drawn.has(key)) continue;
        drawn.add(key);
        const style = staveLineStyle(pitch, layout, stave);
        const segmentStart = yCenterMm - 3 * semitoneMm;
        segments.push({
          pitch,
          xMm: pitchToXmm(pitch, stave, leftMm, layout),
          startYmm: segmentStart,
          endYmm: segmentStart + ledgerLengthMm,
          ...style,
          midiOnly: pitch < PIANO_LOW_MIDI_PITCH || pitch > PIANO_HIGH_MIDI_PITCH,
        });
      }
    }
  }
  return segments;
}

export function nearestStavePitch(stave: Stave, layout: Layout, leftMm: number, xMm: number, allowOutsideRange = false): number {
  const [lowPitch, highPitch] = allowOutsideRange ? [0, 127] : stave.pitch_range;
  let closestPitch = lowPitch;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (let pitch = lowPitch; pitch <= highPitch; pitch += 1) {
    const distance = Math.abs(pitchToXmm(pitch, stave, leftMm, layout) - xMm);
    if (distance < closestDistance) {
      closestPitch = pitch;
      closestDistance = distance;
    }
  }
  return closestPitch;
}