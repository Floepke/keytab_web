import type { Font, ScoreEvent } from "./types";
import { DEFAULT_FONT_FAMILY } from "./fonts";

export const newId = (): string => crypto.randomUUID();

export const createFont = (): Font => ({
  family: DEFAULT_FONT_FAMILY,
  size_pt: 12,
  bold: false,
  italic: false,
  underline: false,
  x_offset: 0,
  y_offset: 0,
});

export function createEvent(type: ScoreEvent["type"]): ScoreEvent {
  const id = newId();
  switch (type) {
    case "note":
      return {
        id,
        type,
        time: 0,
        duration: 100,
        pitch: 40,
        velocity: 64,
        hand: "left",
        notehead: "auto",
        color: "auto",
        acc: 0,
        continuation_id: null,
        continues_from_previous: false,
        continues_to_next: false,
      };
    case "grace_note":
      return { 
        id,
        type,
        start_tick: 50,
        pitch: 41,
        notehead: "auto",
      };
    case "pedal":
      return { 
        id,
        type,
        start_tick: 0,
        rpitch: 0,
        symbol: "down_keytab",
        invisible: false,
      };
    case "text":
      return {
        id,
        type,
        text: "myText",
        alignment: "left",
        start_tick: 0,
        x_rpitch: 0,
        rotation: 0,
        x_offset_mm: 0,
        y_offset_mm: 0,
        font: createFont(),
        use_custom_font: false,
        text_background_width_offset_mm: 0,
      };
    case "slur":
      return {
        id,
        type,
        x1_rpitch: 0,
        y1_tick: 0,
        x2_rpitch: 0,
        y2_tick: 25,
        x3_rpitch: 0,
        y3_tick: 75,
        x4_rpitch: 0,
        y4_tick: 100,
      };
    case "beam":
      return { 
        id,
        type,
        time: 0,
        duration: 256,
        hand: "left",
      };
    case "grid_band":
      return { 
        id,
        type,
        start_tick: 0,
        duration_ticks: 256,
      };
    case "line_break":
      return { 
        id,
        type,
        start_tick: 0,
        margin_mm: [5, 5],
        stave_range: "auto",
        page_break: false,
      };
    case "tempo":
      return { 
        id, 
        type,
        start_tick: 0,
        duration_ticks: 256,
        tempo: 120,
        x_offset_mm: 0,
        invisible: false,
      };
    case "arpeggio":
      return {
        id,
        type,
        start_tick: 0,
        rtime1_ticks: 0,
        rtime2_ticks: 32,
        note_ids: [],
        note_pitches: [],
        hand: "left",
      };
    case "line":
      return {
        id,
        type,
        start_tick: 0,
        time1_tick: 0,
        time2_tick: 0,
        rpitch1: 0,
        rpitch2: 0,
        width_mm: 0.5,
        dash_pattern_mm: [3],
        dash_offset_mm: 0,
        color: "auto",
        zigzag_type: null,
        zigzag_amp_semitone: 0,
        zigzag_freq_ticks: 64,
        arrow: null,
        arrow_form: [0.5, 0.5],
      };
    case "count_line":
      return { id, type, start_tick: 0, rpitch1: 0, rpitch2: 4 };
    case "crescendo":
    case "decrescendo":
      return { id, type, start_tick: 0, duration_ticks: 256, x_rpitch: 0 };
    case "dynamic_symbol":
      return { id, type, start_tick: 0, x_rpitch: 0, symbol: "", rotation: 0 };
    case "start_repeat":
    case "end_repeat":
    case "double_bar":
      return { id, type, start_tick: 0 };
  }
}