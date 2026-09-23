import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { WEB_SAFE_FONT_FAMILIES, resolveWebSafeFontFamily } from "./model/fonts";
import type { Font, Layout } from "./model/types";

type LayoutField = keyof Layout;

interface NumericConfig {
  min: number;
  max: number;
  step: number;
}

const CATEGORIES: readonly [string, readonly LayoutField[]][] = [
  ["Page", ["scale", "page_orientation", "read_direction", "page_width_mm", "page_height_mm", "page_top_margin_mm", "page_bottom_margin_mm", "page_left_margin_mm", "page_right_margin_mm", "header_height_mm", "footer_height_mm"]],
  ["Notes", ["black_note_rule", "note_stem_length_semitone", "note_stem_thickness_mm", "note_stopsign_thickness_mm", "note_continuation_dot_size_mm", "note_midinote_left_color", "note_midinote_right_color", "note_width_scaling", "notehead_height_scaling", "notehead_tilt", "beam_thickness_mm", "beam_corner_radius_mm", "grace_note_outline_width_mm", "grace_note_scale"]],
  ["Symbols", ["pedal_symbol_thickness_mm", "pedal_background_padding_mm", "text_background_padding_mm", "slur_width_sides_mm", "slur_width_middle_mm", "hairpin_line_width_mm", "hairpin_width_mm", "dynamic_symbol_font_size_pt", "dynamic_symbol_background_padding_mm", "dynamic_rotation", "countline_dash_pattern", "countline_thickness_mm"]],
  ["Grid", ["measure_grouping", "grid_band_track", "grid_barline_thickness_mm", "grid_gridline_thickness_mm", "grid_gridline_dash_pattern_mm", "grid_band_color", "grid_band_start_phase", "time_signature_indicator_type", "time_signature_indicator_lane_width_mm", "time_signature_indicator_guide_thickness_mm", "time_signature_indicator_divide_guide_thickness_mm", "measure_numbering_guide_thickness_mm", "measure_numbering_guide_dash_pattern_mm", "measure_numbering_placement"]],
  ["Stave", ["stave_two_line_thickness_mm", "stave_three_line_thickness_mm", "stave_clef_line_thickness_mm", "stave_clef_line_dash_pattern_mm", "mini_piano_octave_numbering", "mini_piano_color"]],
  ["Fonts", ["time_signature_indicator_classic_font", "time_signature_indicator_klavarskribo_font", "measure_numbering_font", "tempo_font", "font_text", "font_title", "font_composer", "font_copyright", "font_arranger", "font_lyricist"]],
  ["Visibility", ["note_head_visible", "note_stem_visible", "accidental_visible", "note_stop_visible", "note_continuation_dot_visible", "note_midinote_visible", "beam_visible", "grace_note_visible", "text_visible", "slur_visible", "hairpin_visible", "dynamic_symbol_visible", "repeat_start_visible", "repeat_end_visible", "double_barline_visible", "countline_visible", "stave_visible", "barline_visible", "grid_line_visible", "grid_band_visible", "time_signature_visible", "measure_numbering_guide_visible", "measure_numbers_visible", "tempo_indicator_visible", "mini_piano_visible"]],
];

const CHOICES: Partial<Record<LayoutField, readonly string[]>> = {
  page_orientation: ["portrait", "landscape"],
  read_direction: ["vertical", "horizontal"],
  black_note_rule: ["above_stem", "below_stem", "above_stem_if_collision", "above_stem_if_chord_and_white_note_same_hand"],
  grid_band_start_phase: ["dark", "light"],
  time_signature_indicator_type: ["classical", "klavarskribo", "classical & klavarskribo"],
  measure_numbering_placement: ["barline", "system", "off"],
};

const NUMBERS: Partial<Record<LayoutField, NumericConfig>> = {
  scale: { min: 0.25, max: 1, step: 0.005 },
  page_width_mm: { min: 50, max: 5000, step: 0.5 }, page_height_mm: { min: 50, max: 10000, step: 0.5 },
  page_top_margin_mm: { min: 0, max: 100, step: 0.05 }, page_bottom_margin_mm: { min: 0, max: 100, step: 0.05 }, page_left_margin_mm: { min: 0, max: 100, step: 0.05 }, page_right_margin_mm: { min: 0, max: 100, step: 0.05 }, header_height_mm: { min: 0, max: 100, step: 0.05 }, footer_height_mm: { min: 0, max: 100, step: 0.05 },
  note_stem_length_semitone: { min: 3, max: 20, step: 0.05 }, note_stem_thickness_mm: { min: 0.05, max: 5, step: 0.05 }, note_stopsign_thickness_mm: { min: 0.05, max: 5, step: 0.05 }, note_continuation_dot_size_mm: { min: 0.05, max: 10, step: 0.05 }, note_width_scaling: { min: 0.05, max: 2, step: 0.01 }, notehead_height_scaling: { min: 0.1, max: 3, step: 0.01 }, notehead_tilt: { min: 0, max: 0.5, step: 0.01 }, beam_thickness_mm: { min: 0.05, max: 5, step: 0.05 }, beam_corner_radius_mm: { min: 0, max: 5, step: 0.05 }, grace_note_outline_width_mm: { min: 0.05, max: 5, step: 0.05 }, grace_note_scale: { min: 0.05, max: 1, step: 0.05 },
  pedal_symbol_thickness_mm: { min: 0.05, max: 5, step: 0.05 }, pedal_background_padding_mm: { min: 0, max: 10, step: 0.05 }, text_background_padding_mm: { min: 0, max: 20, step: 0.05 }, slur_width_sides_mm: { min: 0.05, max: 5, step: 0.05 }, slur_width_middle_mm: { min: 0.05, max: 5, step: 0.05 }, hairpin_line_width_mm: { min: 0.05, max: 5, step: 0.05 }, hairpin_width_mm: { min: 0.05, max: 20, step: 0.05 }, dynamic_symbol_font_size_pt: { min: 4, max: 100, step: 0.5 }, dynamic_symbol_background_padding_mm: { min: 0, max: 20, step: 0.05 }, dynamic_rotation: { min: 0, max: 360, step: 1 }, countline_thickness_mm: { min: 0.05, max: 5, step: 0.05 },
  grid_barline_thickness_mm: { min: 0.05, max: 5, step: 0.05 }, grid_gridline_thickness_mm: { min: 0.05, max: 5, step: 0.05 }, measure_numbering_guide_thickness_mm: { min: 0.05, max: 5, step: 0.05 }, time_signature_indicator_lane_width_mm: { min: 0.05, max: 100, step: 0.05 }, time_signature_indicator_guide_thickness_mm: { min: 0.05, max: 5, step: 0.05 }, time_signature_indicator_divide_guide_thickness_mm: { min: 0.05, max: 5, step: 0.05 }, stave_two_line_thickness_mm: { min: 0.05, max: 5, step: 0.05 }, stave_three_line_thickness_mm: { min: 0.05, max: 5, step: 0.05 }, stave_clef_line_thickness_mm: { min: 0.05, max: 5, step: 0.05 },
};

const FONT_FIELDS = new Set<LayoutField>(["time_signature_indicator_classic_font", "time_signature_indicator_klavarskribo_font", "measure_numbering_font", "tempo_font", "font_text", "font_title", "font_composer", "font_copyright", "font_arranger", "font_lyricist"]);
const label = (field: string) => field.replace(/_/g, " ").replace(/\bmm\b/g, "mm").replace(/\b\w/g, (letter) => letter.toUpperCase());
const cloneLayout = (layout: Layout): Layout => structuredClone(layout);

function NumberInput({ value, min, max, step, onChange, ...props }: { value: number; min?: number; max?: number; step: number; onChange: (value: number) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "min" | "max" | "step" | "onChange">) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const wheel = (event: WheelEvent) => {
      if (!event.deltaY) return;
      event.preventDefault();
      const direction = event.deltaY < 0 ? 1 : -1;
      const next = Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? Number.NEGATIVE_INFINITY, value + direction * step));
      const decimals = (step.toString().split(".")[1] ?? "").length;
      onChange(Number(next.toFixed(decimals)));
    };
    input.addEventListener("wheel", wheel, { passive: false });
    return () => input.removeEventListener("wheel", wheel);
  }, [max, min, onChange, step, value]);
  return <input {...props} ref={inputRef} type="number" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />;
}

function FontEditor({ value, onChange }: { value: Font; onChange: (value: Font) => void }) {
  const update = (field: keyof Font, next: string | boolean) => onChange({ ...value, [field]: field === "size_pt" || field === "x_offset" || field === "y_offset" ? Number(next) : next });
  return <div className="font-editor">
    <select aria-label="Font family" value={resolveWebSafeFontFamily(value.family)} onChange={(event) => update("family", event.target.value)}>{WEB_SAFE_FONT_FAMILIES.map((family) => <option key={family} value={family}>{family}</option>)}</select>
    <NumberInput aria-label="Font size" min={4} max={200} step={0.5} value={value.size_pt} onChange={(next) => update("size_pt", String(next))} />
    <label><input type="checkbox" checked={value.bold} onChange={(event) => update("bold", event.target.checked)} />B</label>
    <label><input type="checkbox" checked={value.italic} onChange={(event) => update("italic", event.target.checked)} />I</label>
    <label><input type="checkbox" checked={value.underline} onChange={(event) => update("underline", event.target.checked)} />U</label>
    <NumberInput aria-label="Font horizontal offset" step={0.05} value={value.x_offset} onChange={(next) => update("x_offset", String(next))} />
    <NumberInput aria-label="Font vertical offset" step={0.05} value={value.y_offset} onChange={(next) => update("y_offset", String(next))} />
  </div>;
}

export function StyleDialog({ layout, onApply, onClose }: { layout: Layout; onApply: (layout: Layout) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<Layout>(() => cloneLayout(layout));
  const [activeTab, setActiveTab] = useState(CATEGORIES[0][0]);
  const [gridTrackError, setGridTrackError] = useState("");
  const [, fields] = CATEGORIES.find(([title]) => title === activeTab) ?? CATEGORIES[0];
  const update = <K extends LayoutField>(field: K, value: Layout[K]) => setDraft((current) => ({ ...current, [field]: value }));
  const updateArray = (field: LayoutField, event: ChangeEvent<HTMLInputElement>) => update(field, event.target.value.split(/[ ,]+/).filter(Boolean).map(Number).filter(Number.isFinite) as Layout[typeof field]);
  const updateTrack = (value: string) => {
    try {
      update("grid_band_track", value.trim() ? JSON.parse(value) : []);
      setGridTrackError("");
    } catch {
      setGridTrackError("Enter valid JSON.");
    }
  };
  const editor = (field: LayoutField) => {
    const value = draft[field];
    if (typeof value === "boolean") return <input type="checkbox" checked={value} onChange={(event) => update(field, event.target.checked as Layout[typeof field])} />;
    if (FONT_FIELDS.has(field)) return <FontEditor value={value as Font} onChange={(next) => update(field, next as Layout[typeof field])} />;
    if (field === "grid_band_track") return <><textarea value={JSON.stringify(value)} onChange={(event) => updateTrack(event.target.value)} rows={3} />{gridTrackError && <small className="field-error">{gridTrackError}</small>}</>;
    if (Array.isArray(value)) return <input value={value.join(", ")} onChange={(event) => updateArray(field, event)} />;
    if (CHOICES[field]) return <select value={value as string} onChange={(event) => update(field, event.target.value as Layout[typeof field])}>{CHOICES[field]!.map((choice) => <option key={choice} value={choice}>{choice.replace(/_/g, " ")}</option>)}</select>;
    if (typeof value === "number") {
      const config = NUMBERS[field] ?? { min: -1000, max: 10000, step: 0.05 };
      return <NumberInput min={config.min} max={config.max} step={config.step} value={value} onChange={(next) => update(field, next as Layout[typeof field])} />;
    }
    if (field.endsWith("_color")) return <span className="color-editor"><input type="color" value={value as string} onChange={(event) => update(field, event.target.value as Layout[typeof field])} /><input value={value as string} onChange={(event) => update(field, event.target.value as Layout[typeof field])} /></span>;
    return <input value={value as string} onChange={(event) => update(field, event.target.value as Layout[typeof field])} />;
  };

  return <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="style-dialog" role="dialog" aria-modal="true" aria-label="Style" onMouseDown={(event) => event.stopPropagation()}>
      <header><h2>Style</h2><button type="button" aria-label="Close style dialog" onClick={onClose}>x</button></header>
      <div className="style-tabs" role="tablist">{CATEGORIES.map(([title]) => <button type="button" key={title} role="tab" aria-selected={activeTab === title} className={activeTab === title ? "active" : ""} onClick={() => setActiveTab(title)}>{title}</button>)}</div>
      <div className="style-fields">{fields.map((field) => <label className="style-field" key={field}><span>{label(field)}</span>{editor(field)}</label>)}</div>
      <footer><button type="button" onClick={onClose}>Cancel</button><button type="button" className="primary" onClick={() => onApply(draft)}>Apply</button></footer>
    </section>
  </div>;
}