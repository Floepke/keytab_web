export const FORMAT_NAME = "keytab2";
export const FORMAT_VERSION = 1;
export const TIME_PER_QUARTER = 256;

export interface Font {
  family: string;
  size_pt: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  x_offset: number;
  y_offset: number;
}

export interface BaseGrid {
  numerator: number;
  denominator: number;
  beat_grouping: number[];
  measure_amount: number;
  indicator_enabled: boolean;
}

export interface ScoreInfo {
  title: string;
  composer: string;
  copyright: string;
}

export interface Layout {
  scale: number;
  page_orientation: "portrait" | "landscape";
  read_direction: "vertical" | "horizontal";
  page_width_mm: number;
  page_height_mm: number;
  page_top_margin_mm: number;
  page_bottom_margin_mm: number;
  page_left_margin_mm: number;
  page_right_margin_mm: number;
  header_height_mm: number;
  footer_height_mm: number;
  black_note_rule: "above_stem" | "below_stem" | "above_stem_if_collision" | "above_stem_if_chord_and_white_note_same_hand";
  note_stem_length_semitone: number;
  note_stem_thickness_mm: number;
  note_stopsign_thickness_mm: number;
  note_continuation_dot_size_mm: number;
  note_midinote_left_color: string;
  note_midinote_right_color: string;
  notehead_height_scaling: number;
  note_width_scaling: number;
  notehead_tilt: number;
  beam_thickness_mm: number;
  beam_corner_radius_mm: number;
  grace_note_outline_width_mm: number;
  grace_note_scale: number;
  pedal_symbol_thickness_mm: number;
  pedal_background_padding_mm: number;
  text_background_padding_mm: number;
  slur_width_sides_mm: number;
  slur_width_middle_mm: number;
  hairpin_line_width_mm: number;
  hairpin_width_mm: number;
  dynamic_symbol_font_size_pt: number;
  dynamic_symbol_background_padding_mm: number;
  dynamic_rotation: number;
  measure_grouping: string;
  countline_dash_pattern: number[];
  countline_thickness_mm: number;
  grid_band_track: GridBandEvent[];
  grid_barline_thickness_mm: number;
  grid_gridline_thickness_mm: number;
  grid_gridline_dash_pattern_mm: number[];
  grid_band_color: string;
  grid_band_start_phase: "dark" | "light";
  time_signature_indicator_type: "classical" | "klavarskribo" | "classical & klavarskribo";
  time_signature_indicator_lane_width_mm: number;
  time_signature_indicator_guide_thickness_mm: number;
  time_signature_indicator_divide_guide_thickness_mm: number;
  time_signature_indicator_classic_font: Font;
  time_signature_indicator_klavarskribo_font: Font;
  measure_numbering_guide_thickness_mm: number;
  measure_numbering_guide_dash_pattern_mm: number[];
  measure_numbering_placement: "system" | "barline" | "off";
  measure_numbering_font: Font;
  tempo_font: Font;
  font_copyright: Font;
  font_arranger: Font;
  font_lyricist: Font;
  stave_two_line_thickness_mm: number;
  stave_three_line_thickness_mm: number;
  stave_clef_line_thickness_mm: number;
  stave_clef_line_dash_pattern_mm: number[];
  mini_piano_octave_numbering: boolean;
  mini_piano_color: string;
  font_title: Font;
  font_composer: Font;
  font_text: Font;
  note_head_visible: boolean;
  note_stem_visible: boolean;
  accidental_visible: boolean;
  note_stop_visible: boolean;
  note_continuation_dot_visible: boolean;
  note_midinote_visible: boolean;
  beam_visible: boolean;
  grace_note_visible: boolean;
  text_visible: boolean;
  slur_visible: boolean;
  hairpin_visible: boolean;
  dynamic_symbol_visible: boolean;
  repeat_start_visible: boolean;
  repeat_end_visible: boolean;
  double_barline_visible: boolean;
  countline_visible: boolean;
  stave_visible: boolean;
  barline_visible: boolean;
  grid_line_visible: boolean;
  grid_band_visible: boolean;
  time_signature_visible: boolean;
  measure_numbering_guide_visible: boolean;
  measure_numbers_visible: boolean;
  tempo_indicator_visible: boolean;
  mini_piano_visible: boolean;
}

export interface EventBase {
  id: string;
  type: string;
}

export interface TimedEvent extends EventBase {
  start_tick: number;
}

export interface NoteEvent extends EventBase {
  type: "note";
  time: number;
  duration: number;
  pitch: number;
  velocity: number;
  hand: "left" | "right";
  notehead: string;
  color: string;
  acc: number;
  continuation_id: string | null;
  continues_from_previous: boolean;
  continues_to_next: boolean;
}

export interface GraceNoteEvent extends EventBase {
  type: "grace_note";
  start_tick: number;
  pitch: number;
  notehead: string;
}

export interface PedalEvent extends EventBase {
  type: "pedal";
  start_tick: number;
  rpitch: number;
  symbol: string;
  invisible: boolean;
}

export interface TextEvent extends EventBase {
  type: "text";
  text: string;
  alignment: string;
  start_tick: number;
  x_rpitch: number;
  rotation: number;
  x_offset_mm: number;
  y_offset_mm: number;
  font: Font;
  use_custom_font: boolean;
  text_background_width_offset_mm: number;
}

export interface SlurEvent extends EventBase {
  type: "slur";
  x1_rpitch: number;
  y1_tick: number;
  x2_rpitch: number;
  y2_tick: number;
  x3_rpitch: number;
  y3_tick: number;
  x4_rpitch: number;
  y4_tick: number;
}

export interface BeamEvent extends EventBase {
  type: "beam";
  time: number;
  duration: number;
  hand: "left" | "right";
}

export interface GridBandEvent extends TimedEvent {
  type: "grid_band";
  duration_ticks: number;
}

export interface LineBreakEvent extends TimedEvent {
  type: "line_break";
  margin_mm: number[];
  stave_range: number[] | "auto";
  page_break: boolean;
}

export interface TempoEvent extends TimedEvent {
  type: "tempo";
  duration_ticks: number;
  tempo: number;
  x_offset_mm: number;
  invisible: boolean;
}

export interface ArpeggioEvent extends TimedEvent {
  type: "arpeggio";
  rtime1_ticks: number;
  rtime2_ticks: number;
  note_ids: string[];
  note_pitches: number[];
  hand: "left" | "right";
}

export interface LineEvent extends TimedEvent {
  type: "line";
  time1_tick: number;
  time2_tick: number;
  rpitch1: number;
  rpitch2: number;
  width_mm: number;
  dash_pattern_mm: number[];
  dash_offset_mm: number;
  color: string;
  zigzag_type: string | null;
  zigzag_amp_semitone: number;
  zigzag_freq_ticks: number;
  arrow: string | null;
  arrow_form: number[];
}
export type SimpleEventType = "start_repeat" | "end_repeat" | "double_bar";
export interface SimpleEvent extends TimedEvent {
  type: SimpleEventType;
}

export interface CountLineEvent extends TimedEvent {
  type: "count_line";
  rpitch1: number;
  rpitch2: number;
}

export interface HairpinEvent extends TimedEvent {
  type: "crescendo" | "decrescendo";
  duration_ticks: number;
  x_rpitch: number;
}

export interface DynamicSymbolEvent extends TimedEvent {
  type: "dynamic_symbol";
  x_rpitch: number;
  symbol: string;
  rotation: number;
}

export type ScoreEvent =
  | NoteEvent
  | GraceNoteEvent
  | PedalEvent
  | TextEvent
  | SlurEvent
  | BeamEvent
  | GridBandEvent
  | LineBreakEvent
  | TempoEvent
  | ArpeggioEvent
  | LineEvent
  | SimpleEvent
  | CountLineEvent
  | HairpinEvent
  | DynamicSymbolEvent;

export interface Stave { id: string; name: string; pitch_range: [number, number]; scale: number; left_margin_mm: number; right_margin_mm: number; events: ScoreEvent[] }
export interface System { id: string; start_tick: number; end_tick: number; first_measure_number: number; force_page_break_before: boolean; top_mm: number; height_mm: number; staves: Stave[]; events: ScoreEvent[] }
export interface Page { id: string; width_mm: number; height_mm: number; systems: System[]; events: ScoreEvent[] }
export interface KeyTabDocument { format: typeof FORMAT_NAME; format_version: typeof FORMAT_VERSION; time_per_quarter: typeof TIME_PER_QUARTER; score_info: ScoreInfo; layout: Layout; base_grid: BaseGrid[]; timeline_events: TempoEvent[]; pages: Page[]; created_at: string; modified_at: string }