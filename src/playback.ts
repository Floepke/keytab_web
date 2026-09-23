import type { KeyTabDocument, NoteEvent, TempoEvent } from "./model/types";

export interface PlaybackSession {
  durationMs: number;
  startDelayMs: number;
  endTick: number;
  tickAtElapsedMs: (elapsedMs: number) => number;
  stop: () => void;
}

interface PlaybackNote {
  pitch: number;
  velocity: number;
  startTick: number;
  endTick: number;
}

export async function playNoteAudition(pitch: number, velocity = 100): Promise<void> {
  const Tone = await import("tone");
  await Tone.start();
  const synth = new Tone.Synth({
    oscillator: { type: "triangle8" },
    envelope: { attack: 0.003, decay: 0.08, sustain: 0.15, release: 0.15 },
  }).toDestination();
  const duration = 0.18;
  synth.triggerAttackRelease(Tone.Frequency(pitch, "midi").toFrequency(), duration, undefined, Math.min(1, Math.max(0, velocity / 127)));
  window.setTimeout(() => synth.dispose(), (duration + 0.25) * 1000);
}

const scoreNotes = (document: KeyTabDocument): PlaybackNote[] => {
  const segments = document.pages.flatMap((page) => page.systems)
    .flatMap((system) => system.staves)
    .flatMap((stave) => stave.events)
    .filter((event): event is NoteEvent => event.type === "note");
  const merged = new Map<string, PlaybackNote>();
  for (const note of segments) {
    const key = note.continuation_id ?? note.id;
    const existing = merged.get(key);
    const endTick = note.time + note.duration;
    if (existing) {
      existing.startTick = Math.min(existing.startTick, note.time);
      existing.endTick = Math.max(existing.endTick, endTick);
    } else {
      merged.set(key, { pitch: note.pitch, velocity: note.velocity, startTick: note.time, endTick });
    }
  }
  return [...merged.values()].sort((left, right) => left.startTick - right.startTick || left.pitch - right.pitch);
};

const tempoChanges = (document: KeyTabDocument): TempoEvent[] => {
  const changes = [...document.timeline_events]
    .filter((event) => Number.isFinite(event.tempo) && event.tempo > 0)
    .sort((left, right) => left.start_tick - right.start_tick);
  if (!changes.length || changes[0].start_tick !== 0) {
    changes.unshift({ id: "playback-default-tempo", type: "tempo", start_tick: 0, duration_ticks: 0, tempo: 120, x_offset_mm: 0, invisible: true });
  }
  return changes.filter((change, index) => index === changes.length - 1 || change.start_tick !== changes[index + 1].start_tick);
};

const secondsAtTick = (tick: number, ticksPerQuarter: number, changes: TempoEvent[]): number => {
  let seconds = 0;
  for (let index = 0; index < changes.length; index += 1) {
    const change = changes[index];
    const nextTick = changes[index + 1]?.start_tick ?? tick;
    if (tick <= change.start_tick) break;
    const segmentEnd = Math.min(tick, nextTick);
    seconds += (segmentEnd - change.start_tick) / ticksPerQuarter * 60 / change.tempo;
    if (tick <= nextTick) break;
  }
  return seconds;
};

const tickAtSeconds = (seconds: number, ticksPerQuarter: number, changes: TempoEvent[]): number => {
  let remaining = Math.max(0, seconds);
  for (let index = 0; index < changes.length; index += 1) {
    const change = changes[index];
    const nextTick = changes[index + 1]?.start_tick;
    const secondsPerTick = 60 / (change.tempo * ticksPerQuarter);
    if (nextTick === undefined) return change.start_tick + remaining / secondsPerTick;
    const spanSeconds = (nextTick - change.start_tick) * secondsPerTick;
    if (remaining <= spanSeconds) return change.start_tick + remaining / secondsPerTick;
    remaining -= spanSeconds;
  }
  return changes.at(-1)!.start_tick;
};

export async function startPlayback(document: KeyTabDocument, startTick = 0): Promise<PlaybackSession | null> {
  const notes = scoreNotes(document).filter((note) => note.endTick > startTick);
  if (!notes.length) return null;
  const Tone = await import("tone");
  await Tone.start();
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "triangle8" },
    envelope: { attack: 0.003, decay: 0.12, sustain: 0.32, release: 0.9 },
  }).toDestination();
  const changes = tempoChanges(document);
  const start = Tone.now() + 0.05;
  const startSeconds = secondsAtTick(startTick, document.time_per_quarter, changes);
  const scheduledEnd = Math.max(...notes.map((note) => secondsAtTick(note.endTick, document.time_per_quarter, changes) - startSeconds));
  for (const note of notes) {
    const noteStart = secondsAtTick(Math.max(note.startTick, startTick), document.time_per_quarter, changes) - startSeconds;
    const noteEnd = secondsAtTick(note.endTick, document.time_per_quarter, changes) - startSeconds;
    synth.triggerAttackRelease(Tone.Frequency(note.pitch, "midi").toFrequency(), Math.max(0.01, noteEnd - noteStart), start + noteStart, Math.min(1, Math.max(0, note.velocity / 127)));
  }
  let stopped = false;
  return {
    durationMs: Math.ceil((scheduledEnd + 1) * 1000),
    startDelayMs: 50,
    endTick: Math.max(...notes.map((note) => note.endTick)),
    tickAtElapsedMs: (elapsedMs) => tickAtSeconds(startSeconds + Math.max(0, elapsedMs - 50) / 1000, document.time_per_quarter, changes),
    stop: () => {
      if (stopped) return;
      stopped = true;
      synth.releaseAll();
      synth.dispose();
    },
  };
}