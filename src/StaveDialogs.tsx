import { useState } from "react";
import type { Stave } from "./model/types";

export type StaveSetting = "scale" | "left_margin_mm" | "right_margin_mm";

export interface StaveConfiguration {
  id: string;
  sourceIndex: number | null;
  name: string;
  pitch_range: [number, number];
  scale: number;
  left_margin_mm: number;
  right_margin_mm: number;
}

const MIDI_LOW = 21;
const MIDI_HIGH = 108;
const BLACK_PITCHES = new Set([1, 3, 6, 8, 10]);
const THREE_LINE_PITCH_CLASSES = new Set([6, 8, 10]);
const CENTRAL_CLEF_PITCHES = new Set([61, 63]);
const settingLabel: Record<StaveSetting, string> = {
  scale: "Stave Scale",
  left_margin_mm: "Stave Margin Left",
  right_margin_mm: "Stave Margin Right",
};
const pitchName = (pitch: number) => `${["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][pitch % 12]}${Math.floor(pitch / 12) - 1}`;

function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="stave-dialog" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
      <header><h2>{title}</h2><button type="button" aria-label={`Close ${title}`} onClick={onClose}>x</button></header>
      {children}
    </section>
  </div>;
}

export function StaveValueDialog({ setting, value, onApply, onClose }: { setting: StaveSetting; value: number; onApply: (value: number) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(value);
  const isScale = setting === "scale";
  return <Dialog title={`Set ${settingLabel[setting]}`} onClose={onClose}>
    <div className="stave-dialog-body">
      <label className="stave-value-field"><span>{isScale ? "Scale" : "Millimetres"}</span><input autoFocus type="number" min={isScale ? 0.1 : 0} max={isScale ? 4 : 100} step={isScale ? 0.01 : 0.05} value={draft} onChange={(event) => setDraft(Number(event.target.value))} /></label>
    </div>
    <footer><button type="button" onClick={onClose}>Cancel</button><button type="button" className="primary" disabled={!Number.isFinite(draft)} onClick={() => onApply(draft)}>Apply</button></footer>
  </Dialog>;
}

export function TimeSignatureDialog({ numerator, denominator, indicatorEnabled, onApply, onClose }: { numerator: number; denominator: number; indicatorEnabled: boolean; onApply: (numerator: number, denominator: number, indicatorEnabled: boolean) => void; onClose: () => void }) {
  const [signature, setSignature] = useState(`${numerator}/${denominator}`);
  const [indicator, setIndicator] = useState(indicatorEnabled);
  const match = /^(\d+)\/(\d+)$/.exec(signature.trim());
  const parsedNumerator = match ? Number(match[1]) : NaN;
  const parsedDenominator = match ? Number(match[2]) : NaN;
  const valid = Number.isInteger(parsedNumerator)
    && parsedNumerator > 0
    && Number.isInteger(parsedDenominator)
    && parsedDenominator > 0
    && (parsedDenominator & (parsedDenominator - 1)) === 0;
  return <Dialog title="Time Signature" onClose={onClose}>
    <div className="stave-dialog-body">
      <label className="stave-value-field"><span>Time signature</span><input autoFocus value={signature} aria-invalid={!valid} onChange={(event) => setSignature(event.target.value)} /></label>
      {!valid && <p className="stave-dialog-copy">Enter a positive numerator and a power-of-two denominator, such as 4/4 or 7/8.</p>}
      <label className="dialog-checkbox"><input type="checkbox" checked={indicator} onChange={(event) => setIndicator(event.target.checked)} />Time signature indicator enabled</label>
    </div>
    <footer><button type="button" onClick={onClose}>Cancel</button><button type="button" className="primary" disabled={!valid} onClick={() => onApply(parsedNumerator, parsedDenominator, indicator)}>Apply</button></footer>
  </Dialog>;
}

export function StaveRangeDialog({ range, onApply, onClose }: { range: [number, number]; onApply: (range: [number, number]) => void; onClose: () => void }) {
  const [low, setLow] = useState(range[0]);
  const [high, setHigh] = useState(range[1]);
  const updateLow = (value: number) => setLow(Math.min(value, high - 1));
  const updateHigh = (value: number) => setHigh(Math.max(value, low + 1));
  const keyMarks = Array.from({ length: MIDI_HIGH - MIDI_LOW + 1 }, (_, index) => MIDI_LOW + index);
  const toPercent = (pitch: number) => (pitch - MIDI_LOW) / (MIDI_HIGH - MIDI_LOW) * 100;
  return <Dialog title="Set Stave Range" onClose={onClose}>
    <div className="stave-dialog-body">
      <p className="stave-dialog-copy">Drag the handles to set the displayed pitch range.</p>
      <div className="stave-range-visualizer">
        <div className="stave-range-lines">{keyMarks.filter((pitch) => BLACK_PITCHES.has(pitch % 12)).map((pitch) => <i key={pitch} className={`${THREE_LINE_PITCH_CLASSES.has(pitch % 12) ? "three-line" : ""}${CENTRAL_CLEF_PITCHES.has(pitch) ? " clef-line" : ""}`} style={{ left: `${toPercent(pitch)}%`, width: THREE_LINE_PITCH_CLASSES.has(pitch % 12) ? "4px" : undefined }} />)}</div>
        <div className="stave-range-selected" style={{ left: `${toPercent(low)}%`, width: `${toPercent(high) - toPercent(low)}%` }} />
        <output className="stave-range-label low" style={{ left: `${toPercent(low)}%` }}>{pitchName(low)}</output>
        <output className="stave-range-label high" style={{ left: `${toPercent(high)}%` }}>{pitchName(high)}</output>
        <input aria-label="Lowest stave pitch" className="stave-range-slider" type="range" min={MIDI_LOW} max={MIDI_HIGH - 1} value={low} onChange={(event) => updateLow(Number(event.target.value))} />
        <input aria-label="Highest stave pitch" className="stave-range-slider" type="range" min={MIDI_LOW + 1} max={MIDI_HIGH} value={high} onChange={(event) => updateHigh(Number(event.target.value))} />
      </div>
      <div className="stave-range-inputs"><label>Low<input type="number" min={MIDI_LOW} max={high - 1} value={low} onChange={(event) => updateLow(Number(event.target.value))} /></label><strong>{pitchName(low)} to {pitchName(high)}</strong><label>High<input type="number" min={low + 1} max={MIDI_HIGH} value={high} onChange={(event) => updateHigh(Number(event.target.value))} /></label></div>
    </div>
    <footer><button type="button" onClick={onClose}>Cancel</button><button type="button" className="primary" onClick={() => onApply([low, high])}>Apply</button></footer>
  </Dialog>;
}

const configuration = (stave: Stave, sourceIndex: number): StaveConfiguration => ({ id: `source-${sourceIndex}`, sourceIndex, name: stave.name, pitch_range: [...stave.pitch_range], scale: stave.scale, left_margin_mm: stave.left_margin_mm, right_margin_mm: stave.right_margin_mm });
const newConfiguration = (index: number): StaveConfiguration => ({ id: `new-${crypto.randomUUID()}`, sourceIndex: null, name: `Stave ${index}`, pitch_range: [36, 84], scale: 1, left_margin_mm: 5, right_margin_mm: 5 });

export function StavesDialog({ staves, onApply, onClose }: { staves: readonly Stave[]; onApply: (staves: StaveConfiguration[]) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(() => staves.map(configuration));
  const [selectedId, setSelectedId] = useState(() => draft[0]?.id ?? "");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [editingRange, setEditingRange] = useState(false);
  const selectedIndex = draft.findIndex((stave) => stave.id === selectedId);
  const current = draft[selectedIndex];
  const update = <K extends keyof StaveConfiguration>(field: K, value: StaveConfiguration[K]) => setDraft((items) => items.map((item) => item.id === selectedId ? { ...item, [field]: value } : item));
  const addStave = () => {
    const added = newConfiguration(draft.length + 1);
    setDraft((items) => [...items, added]);
    setSelectedId(added.id);
  };
  const removeStave = () => {
    if (draft.length <= 1 || selectedIndex < 0) return;
    const next = draft.filter((stave) => stave.id !== selectedId);
    setDraft(next);
    setSelectedId(next[Math.min(selectedIndex, next.length - 1)].id);
  };
  const moveStave = (targetId: string) => {
    if (!draggingId || draggingId === targetId) return;
    setDraft((items) => {
      const sourceIndex = items.findIndex((stave) => stave.id === draggingId);
      const targetIndex = items.findIndex((stave) => stave.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return items;
      const reordered = [...items];
      const [moved] = reordered.splice(sourceIndex, 1);
      reordered.splice(targetIndex, 0, moved);
      return reordered;
    });
  };
  return <>
    <Dialog title="Configure Staves" onClose={onClose}>
      <div className="stave-dialog-body staves-dialog-body">
        <p className="stave-dialog-copy">These settings apply to the matching stave in every system and overwrite local adjustments.</p>
        <div className="staves-config-grid">
          <div className="staves-list-wrap"><div className="staves-list-actions"><button type="button" aria-label="Add stave" onClick={addStave}>+</button><button type="button" aria-label="Remove selected stave" disabled={draft.length <= 1 || selectedIndex < 0} onClick={removeStave}>-</button></div><div className="staves-list" role="listbox" aria-label="Staves">{draft.map((stave, index) => <button type="button" key={stave.id} draggable role="option" aria-selected={selectedId === stave.id} className={selectedId === stave.id ? "selected" : ""} onClick={() => setSelectedId(stave.id)} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; setDraggingId(stave.id); }} onDragOver={(event) => event.preventDefault()} onDrop={() => { moveStave(stave.id); setDraggingId(null); }} onDragEnd={() => setDraggingId(null)}>{stave.name || `Stave ${index + 1}`}<small>{pitchName(stave.pitch_range[0])} - {pitchName(stave.pitch_range[1])}</small></button>)}</div></div>
          {current && <div className="stave-config-fields">
            <label><span>Name</span><input value={current.name} onChange={(event) => update("name", event.target.value)} /></label>
            <label><span>Scale</span><input type="number" min="0.1" max="4" step="0.01" value={current.scale} onChange={(event) => update("scale", Number(event.target.value))} /></label>
            <label><span>Margin left (mm)</span><input type="number" min="0" max="100" step="0.05" value={current.left_margin_mm} onChange={(event) => update("left_margin_mm", Number(event.target.value))} /></label>
            <label><span>Margin right (mm)</span><input type="number" min="0" max="100" step="0.05" value={current.right_margin_mm} onChange={(event) => update("right_margin_mm", Number(event.target.value))} /></label>
            <button type="button" className="range-button" onClick={() => setEditingRange(true)}>Set Stave Range: {pitchName(current.pitch_range[0])} - {pitchName(current.pitch_range[1])}</button>
          </div>}
        </div>
      </div>
      <footer><button type="button" onClick={onClose}>Cancel</button><button type="button" className="primary" onClick={() => onApply(draft)}>Apply Globally</button></footer>
    </Dialog>
    {editingRange && current && <StaveRangeDialog range={current.pitch_range} onClose={() => setEditingRange(false)} onApply={(range) => { update("pitch_range", range); setEditingRange(false); }} />}
  </>;
}