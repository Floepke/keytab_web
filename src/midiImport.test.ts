import { describe, expect, it } from "vitest";
import { writeMidi } from "midi-file";
import { importMidi, parseMidiFile } from "./midiImport";

describe("MIDI import", () => {
  it("maps channels to hands and starts a new system every six measures", () => {
    const data = writeMidi({
      header: { format: 0, numTracks: 1, ticksPerBeat: 480 },
      tracks: [[
        { deltaTime: 0, meta: true, type: "timeSignature", numerator: 4, denominator: 4, metronome: 24, thirtyseconds: 8 },
        { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: 48, velocity: 96 },
        { deltaTime: 480, type: "noteOff", channel: 0, noteNumber: 48, velocity: 0 },
        { deltaTime: 0, type: "noteOn", channel: 1, noteNumber: 72, velocity: 80 },
        { deltaTime: 480, type: "noteOff", channel: 1, noteNumber: 72, velocity: 0 },
        { deltaTime: 10752, meta: true, type: "endOfTrack" },
      ]],
    });
    const parsed = parseMidiFile(Uint8Array.from(data).buffer);
    const document = importMidi(parsed, { 0: "left", 1: "right" }, "Imported score");
    const systems = document.pages.flatMap((page) => page.systems);
    const notes = systems.flatMap((system) => system.staves[0].events).filter((event) => event.type === "note");

    expect(document.score_info.title).toBe("Imported score");
    expect(systems).toHaveLength(2);
    expect(systems[0].first_measure_number).toBe(1);
    expect(systems[1].first_measure_number).toBe(7);
    expect(notes.map((note) => note.hand)).toEqual(["left", "right"]);
    expect(notes.map((note) => note.duration)).toEqual([256, 256]);
  });
});
