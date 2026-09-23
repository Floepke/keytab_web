import { parseMidi, type MidiEvent } from "midi-file";
import { createDocument, repaginateDocument, splitSystemAt } from "./model/document";
import { gridBoundaries, measureDuration, totalDuration } from "./model/grid";
import { newId } from "./model/events";
import type { BaseGrid, KeyTabDocument, NoteEvent } from "./model/types";

export type MidiHand = "left" | "right" | "ignore";

export interface ImportedMidiNote {
  channel: number;
  time: number;
  duration: number;
  pitch: number;
  velocity: number;
}

export interface ParsedMidiFile {
  channels: number[];
  notes: ImportedMidiNote[];
  baseGrid: BaseGrid[];
}

type TimedMidiEvent = { tick: number; order: number; event: MidiEvent };

const DEFAULT_TICKS_PER_QUARTER = 256;

const documentTick = (midiTick: number, ticksPerQuarter: number) => (
  Math.round(midiTick * DEFAULT_TICKS_PER_QUARTER / ticksPerQuarter)
);

const gridForTimeSignatures = (events: TimedMidiEvent[], finalTick: number, ticksPerQuarter: number): BaseGrid[] => {
  const signatures: Array<{ tick: number; numerator: number; denominator: number }> = [];
  for (const entry of events) {
    if (entry.event.type !== "timeSignature") continue;
    const { numerator, denominator } = entry.event;
    if (numerator <= 0 || denominator <= 0 || (denominator & (denominator - 1)) !== 0) continue;
    signatures.push({ tick: documentTick(entry.tick, ticksPerQuarter), numerator, denominator });
  }
  const changes = signatures.filter((signature, index) => index === signatures.length - 1 || signature.tick !== signatures[index + 1].tick);
  if (!changes.length || changes[0].tick !== 0) changes.unshift({ tick: 0, numerator: 4, denominator: 4 });
  return changes.map((change, index) => {
    const nextTick = index < changes.length - 1 ? changes[index + 1].tick : finalTick;
    const measureTicks = change.numerator * DEFAULT_TICKS_PER_QUARTER * 4 / change.denominator;
    return {
      numerator: change.numerator,
      denominator: change.denominator,
      beat_grouping: Array.from({ length: change.numerator }, (_, beat) => beat + 1),
      measure_amount: Math.max(1, Math.ceil((nextTick - change.tick) / measureTicks)),
      indicator_enabled: true,
    };
  });
};

export function parseMidiFile(contents: ArrayBuffer): ParsedMidiFile {
  const midi = parseMidi(new Uint8Array(contents));
  const ticksPerQuarter = midi.header.ticksPerBeat;
  if (!ticksPerQuarter) throw new Error("SMPTE-timed MIDI files are not supported");
  const events = midi.tracks.flatMap((track) => {
    let tick = 0;
    return track.map((event, order) => {
      tick += event.deltaTime;
      return { tick, order, event };
    });
  }).sort((left, right) => left.tick - right.tick || left.order - right.order);
  const pending = new Map<string, Array<{ tick: number; velocity: number }>>();
  const notes: ImportedMidiNote[] = [];
  const channels = new Set<number>();
  let finalMidiTick = ticksPerQuarter * 4;
  for (const entry of events) {
    finalMidiTick = Math.max(finalMidiTick, entry.tick);
    const { event } = entry;
    if (event.type !== "noteOn" && event.type !== "noteOff") continue;
    channels.add(event.channel);
    const key = `${event.channel}:${event.noteNumber}`;
    const isNoteOn = event.type === "noteOn" && event.velocity > 0;
    if (isNoteOn) {
      const active = pending.get(key) ?? [];
      active.push({ tick: entry.tick, velocity: event.velocity });
      pending.set(key, active);
      continue;
    }
    const active = pending.get(key);
    const start = active?.pop();
    if (!start) continue;
    notes.push({
      channel: event.channel,
      time: documentTick(start.tick, ticksPerQuarter),
      duration: Math.max(1, documentTick(entry.tick, ticksPerQuarter) - documentTick(start.tick, ticksPerQuarter)),
      pitch: event.noteNumber,
      velocity: start.velocity,
    });
  }
  for (const [key, active] of pending) {
    const [channelText, pitchText] = key.split(":");
    for (const start of active) notes.push({
      channel: Number(channelText),
      time: documentTick(start.tick, ticksPerQuarter),
      duration: Math.max(1, Math.round(DEFAULT_TICKS_PER_QUARTER / 8)),
      pitch: Number(pitchText),
      velocity: start.velocity,
    });
  }
  notes.sort((left, right) => left.time - right.time || left.pitch - right.pitch);
  const finalTick = Math.max(
    documentTick(finalMidiTick, ticksPerQuarter),
    ...notes.map((note) => note.time + note.duration),
  );
  return {
    channels: [...channels].sort((left, right) => left - right),
    notes,
    baseGrid: gridForTimeSignatures(events, finalTick, ticksPerQuarter),
  };
}

export function importMidi(parsed: ParsedMidiFile, channelHands: Record<number, MidiHand>, title: string): KeyTabDocument {
  const document = createDocument();
  document.score_info.title = title || document.score_info.title;
  document.base_grid = parsed.baseGrid;
  const system = document.pages[0].systems[0];
  system.end_tick = totalDuration(document.base_grid, document.time_per_quarter);
  system.staves[0].events = parsed.notes
    .filter((note) => channelHands[note.channel] && channelHands[note.channel] !== "ignore")
    .map<NoteEvent>((note) => ({
      id: newId(),
      type: "note",
      time: note.time,
      duration: note.duration,
      pitch: note.pitch,
      velocity: note.velocity,
      hand: channelHands[note.channel] as "left" | "right",
      notehead: "auto",
      color: "auto",
      acc: 0,
      continuation_id: null,
      continues_from_previous: false,
      continues_to_next: false,
    }));
  const { measures } = gridBoundaries(document.base_grid, document.time_per_quarter);
  let following = system;
  for (let measure = 6; measure < measures.length - 1; measure += 6) {
    following = splitSystemAt(document, following.id, measures[measure]);
  }
  repaginateDocument(document);
  return document;
}