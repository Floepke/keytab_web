import { useState } from "react";
import type { MidiHand, ParsedMidiFile } from "./midiImport";

const channelLabel = (channel: number) => `Channel ${channel + 1}${channel === 9 ? " (percussion)" : ""}`;
const defaultHand = (parsed: ParsedMidiFile, channel: number): MidiHand => {
  if (channel === 9) return "ignore";
  const notes = parsed.notes.filter((note) => note.channel === channel);
  const averagePitch = notes.reduce((total, note) => total + note.pitch, 0) / Math.max(notes.length, 1);
  return averagePitch < 60 ? "left" : "right";
};

export function MidiImportDialog({ parsed, onImport, onClose }: { parsed: ParsedMidiFile; onImport: (channelHands: Record<number, MidiHand>) => void; onClose: () => void }) {
  const [channelHands, setChannelHands] = useState<Record<number, MidiHand>>(() => Object.fromEntries(parsed.channels.map((channel) => [channel, defaultHand(parsed, channel)])));
  return <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="stave-dialog" role="dialog" aria-modal="true" aria-label="Import MIDI" onMouseDown={(event) => event.stopPropagation()}>
      <header><h2>Import MIDI</h2><button type="button" aria-label="Close Import MIDI" onClick={onClose}>x</button></header>
      <div className="stave-dialog-body">
        <p className="stave-dialog-copy">Assign each MIDI channel to a hand. The imported score starts a new system every six measures.</p>
        <div className="midi-channel-map">
          {parsed.channels.map((channel) => <label key={channel}>
            <span>{channelLabel(channel)}</span>
            <select aria-label={`${channelLabel(channel)} hand`} value={channelHands[channel]} onChange={(event) => setChannelHands((current) => ({ ...current, [channel]: event.target.value as MidiHand }))}>
              <option value="left">Left hand</option>
              <option value="right">Right hand</option>
              <option value="ignore">Ignore</option>
            </select>
          </label>)}
        </div>
      </div>
      <footer><button type="button" onClick={onClose}>Cancel</button><button type="button" className="primary" disabled={!parsed.notes.length} onClick={() => onImport(channelHands)}>Import</button></footer>
    </section>
  </div>;
}