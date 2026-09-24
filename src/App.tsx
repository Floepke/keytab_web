import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  FilePlus,
  FolderOpen,
  Music2,
  Play,
  Redo2,
  Save,
  Square,
  Undo2,
} from "lucide-react";
import arpeggioIcon from "./assets/icons/arpeggio.png";
import countLineIcon from "./assets/icons/count_line.png";
import lineBreakIcon from "./assets/icons/line_break.png";
import leftNoteIcon from "./assets/icons/note_left.png";
import rightNoteIcon from "./assets/icons/note_right.png";
import tempoIcon from "./assets/icons/tempo.png";
import timeSignatureIcon from "./assets/icons/time_signature.png";
import { ScoreInfoDialog } from "./ScoreInfoDialog";
import { StyleDialog } from "./StyleDialog";
import { ManualDialog } from "./ManualDialog";
import { StaveRangeDialog, StavesDialog, StaveValueDialog, TempoDialog, TimeSignatureDialog, type StaveConfiguration, type StaveSetting } from "./StaveDialogs";
import { MidiImportDialog } from "./MidiImportDialog";
import { exportScorePdf } from "./pdfExport";
import { playNoteAudition, startPlayback, type PlaybackSession } from "./playback";
import { approveDesktopClose, cancelDesktopClose, confirmDesktopDiscard, isDesktopApp, loadLastOpenedDesktopScore, onDesktopCloseRequested, openDesktopScore, saveDesktopScore } from "./desktop";
import { chooseSaveLocation, chooseScoreFile, clearLastFileHandle, hasFileSystemAccess, loadDefaultLayoutTemplate, loadLastFileHandle, loadSessionSnapshot, resetDefaultLayoutTemplate, saveDefaultLayoutTemplate, saveLastFileHandle, saveSessionSnapshot, type StoredFileHandle } from "./sessionStore";
import { addMeasure, createDocument, deserializeDocument, ensureInitialTempo, ensureScoreDuration, removeMeasure, removeSystemBreak, repaginateDocument, serializeDocument, setForcedPageBreakBefore, setTimeSignature, setTimeSignatureGridLine, splitSystemAt, type ScoreTemplate } from "./model/document";
import { createEvent, newId } from "./model/events";
import { resolveWebSafeFontFamily } from "./model/fonts";
import { importMidi, parseMidiFile, type MidiHand, type ParsedMidiFile } from "./midiImport";
import { applyBeamOverrides, beamWindows, gridBoundaries, measureDuration, timeSignatureIndicators } from "./model/grid";
import { Operator } from "./model/operator";
import {
  centeredStaveLeftPositions,
  ledgerLineSegments,
  naturalLinePitches,
  nearestStavePitch,
  pageSystemBounds,
  pitchToXmm,
  staveBoundsMm,
  staveLineStyle,
  staveSemitoneMm,
} from "./model/stave";
import type { CountLineEvent, KeyTabDocument, NoteEvent, Stave, System, TempoEvent } from "./model/types";

const SNAP_BASES = [1, 2, 4, 8, 16, 32, 64, 128];
const PIXELS_PER_MM = 3;
const ZOOM_FACTOR = 1.15;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const BLACK_KEY_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);
const isBlackKey = (pitch: number) => BLACK_KEY_PITCH_CLASSES.has(pitch % 12);
const blackKeyWidthScale = (pitch: number, time: number, notes: readonly NoteEvent[], blackNoteRule: string) => {
  const hasAdjacentNote = notes.some((candidate) => candidate.pitch !== pitch
    && Math.abs(candidate.time - time) < 1e-9
    && Math.abs(candidate.pitch - pitch) === 1);
  return isBlackKey(pitch) && blackNoteRule === "below_stem" && hasAdjacentNote ? 0.7 : 1;
};
type Point = readonly [number, number];
const pointInRect = ([x, y]: Point, left: number, top: number, right: number, bottom: number) => x >= left && x <= right && y >= top && y <= bottom;
const segmentsIntersect = (firstStart: Point, firstEnd: Point, secondStart: Point, secondEnd: Point) => {
  const orientation = (start: Point, end: Point, point: Point) => (end[0] - start[0]) * (point[1] - start[1]) - (end[1] - start[1]) * (point[0] - start[0]);
  const firstStartSide = orientation(secondStart, secondEnd, firstStart);
  const firstEndSide = orientation(secondStart, secondEnd, firstEnd);
  const secondStartSide = orientation(firstStart, firstEnd, secondStart);
  const secondEndSide = orientation(firstStart, firstEnd, secondEnd);
  return ((firstStartSide >= 0 && firstEndSide <= 0) || (firstStartSide <= 0 && firstEndSide >= 0))
    && ((secondStartSide >= 0 && secondEndSide <= 0) || (secondStartSide <= 0 && secondEndSide >= 0));
};
const pointInPolygon = ([x, y]: Point, polygon: readonly Point[]) => polygon.some(([firstX, firstY], index) => {
  const [secondX, secondY] = polygon[(index + 1) % polygon.length];
  return (firstY > y) !== (secondY > y) && x < (secondX - firstX) * (y - firstY) / (secondY - firstY) + firstX;
}) ? polygon.reduce((inside, [firstX, firstY], index) => {
  const [secondX, secondY] = polygon[(index + 1) % polygon.length];
  return ((firstY > y) !== (secondY > y) && x < (secondX - firstX) * (y - firstY) / (secondY - firstY) + firstX) ? !inside : inside;
}, false) : false;
const polygonOverlapsRect = (polygon: readonly Point[], left: number, top: number, right: number, bottom: number) => {
  const rectangle: Point[] = [[left, top], [right, top], [right, bottom], [left, bottom]];
  return polygon.some((point) => pointInRect(point, left, top, right, bottom))
    || rectangle.some((point) => pointInPolygon(point, polygon))
    || polygon.some((point, index) => rectangle.some((corner, rectangleIndex) => segmentsIntersect(point, polygon[(index + 1) % polygon.length], corner, rectangle[(rectangleIndex + 1) % rectangle.length])));
};
const measureTextWidth = (text: string, fontFamily: string, fontSize: number, bold: boolean, italic: boolean) => {
  const canvas = globalThis.document?.createElement("canvas");
  if (!canvas) return fontSize * text.length;
  const context = canvas.getContext("2d");
  if (!context) return fontSize * text.length;
  context.font = `${italic ? "italic " : ""}${bold ? "700 " : "400 "}${fontSize}px ${fontFamily}`;
  return context.measureText(text).width;
};
const SVG_DRAW_LAYERS = [
  "page_background",
  "snap_band",
  "midi_body",
  "grid_lines",
  "barlines",
  "stave_lines",
  "ledger_lines",
  "time_signature",
  "measure_numbers",
  "tempo",
  "count_lines",
  "notes",
  "beams",
  "editor_controls",
  "break_overlay",
  "meter_overlay",
  "selection_overlay",
  "playhead",
  "input_overlay",
  "page_number",
] as const;

type SvgDrawLayer = typeof SVG_DRAW_LAYERS[number];

type Tool = "left" | "right" | "arpeggio" | "break" | "meter" | "tempo" | "count_line" | "slur-left" | "slur-right";
type SystemBreakTarget =
  | { kind: "split"; time: number }
  | { kind: "remove"; boundary: "top" | "bottom" };
type StaveMenuTarget = { systemId: string; staveId: string; x: number; y: number };
type TimeSignatureEditTarget = { time: number; numerator: number; denominator: number; indicatorEnabled: boolean };
type TempoEditTarget = { id: string };
type MeterTarget =
  | { kind: "barline"; time: number }
  | { kind: "grid"; time: number; changeStartTick: number };
type NoteClipboardEntry = { systemId: string; staveId: string; systemIndex: number; staveIndex: number; note: NoteEvent };
type PasteTarget = { systemId: string; time: number };

interface IconButtonProps {
  label: string;
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
}

function IconButton({ label, active = false, onClick, children }: IconButtonProps) {
  return (
    <button
      className={`icon-button${active ? " is-active" : ""}`}
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function KeyTabIcon({ src, alt = "" }: { src: string; alt?: string }) {
  return <img className="keytab-icon" src={src} alt={alt} aria-hidden={alt === ""} />;
}

function documentFileName(document: KeyTabDocument): string {
  const title = document.score_info.title.trim() || "Untitled";
  const safeTitle = title.replace(/[\\/:*?"<>|]/g, "_");
  return `${safeTitle}.ktw`;
}

type DiscardChoice = "save" | "discard" | "cancel";

function DiscardChangesDialog({ action, onChoose }: { action: string; onChoose: (choice: DiscardChoice) => void }) {
  return <div className="dialog-backdrop" role="presentation" onMouseDown={() => onChoose("cancel")}>
    <section className="score-info-dialog" role="dialog" aria-modal="true" aria-label="Unsaved changes" onMouseDown={(event) => event.stopPropagation()}>
      <header><h2>Unsaved Changes</h2><button type="button" aria-label="Cancel" onClick={() => onChoose("cancel")}>x</button></header>
      <div className="score-info-body"><p className="stave-dialog-copy">Save changes before {action}?</p></div>
      <footer><button type="button" onClick={() => onChoose("cancel")}>Cancel</button><button type="button" onClick={() => onChoose("discard")}>Don't Save</button><button type="button" className="primary" onClick={() => onChoose("save")}>Save</button></footer>
    </section>
  </div>;
}

function SystemPreview({
  document,
  page,
  system,
  activeTool,
  snapTicks,
  onEdit,
  onOpenStaveMenu,
  onOpenTimeSignatureDialog,
  onOpenTempoDialog,
  selectedNoteIds = new Set(),
  onSelectionChange,
  onClearSelection,
  onPasteTargetChange,
  onAuditionNote,
  playbackTick,
}: {
  document: KeyTabDocument;
  page: KeyTabDocument["pages"][number];
  system: System;
  activeTool: Tool;
  snapTicks: number;
  onEdit: (mutate: (document: KeyTabDocument) => void, message: string) => void;
  onOpenStaveMenu: (target: StaveMenuTarget) => void;
  onOpenTimeSignatureDialog: (target: TimeSignatureEditTarget) => void;
  onOpenTempoDialog: (target: TempoEditTarget) => void;
  selectedNoteIds: ReadonlySet<string>;
  onSelectionChange: (noteIds: string[]) => void;
  onClearSelection: () => void;
  onPasteTargetChange: (target: PasteTarget) => void;
  onAuditionNote: (pitch: number, velocity: number) => void;
  playbackTick: number | null;
}) {
  const { measures, groups } = gridBoundaries(document.base_grid, document.time_per_quarter);
  const paperWidth = page.width_mm * PIXELS_PER_MM;
  const paperHeight = page.height_mm * PIXELS_PER_MM;
  const systemBoundsById = pageSystemBounds(page, document);
  const systemBounds = systemBoundsById.get(system.id)!;
  const staveLeftPositions = centeredStaveLeftPositions(system, document.layout, ...systemBounds);
  const staveBounds = system.staves.map((candidate, index) => staveBoundsMm(system, candidate, document.layout, staveLeftPositions[index], false));
  const staveTargets = system.staves.flatMap((candidate, index) => {
    const bounds = staveBounds[index];
    if (!bounds) return [];
    const leftMm = staveLeftPositions[index];
    const inputLedgers = ledgerLineSegments(system, candidate, document.layout, leftMm);
    const editableBounds = inputLedgers.reduce<[number, number]>((range, ledger) => [
      Math.min(range[0], ledger.xMm),
      Math.max(range[1], ledger.xMm),
    ], [...bounds]);
    return [{ stave: candidate, index, bounds, leftMm, semitoneMm: staveSemitoneMm(document.layout, candidate), inputLedgers, editableBounds }];
  });
  const primaryStaveTarget = staveTargets[0]!;
  const stave = primaryStaveTarget.stave;
  const staveLeftMm = primaryStaveTarget.leftMm;
  const inputBounds = primaryStaveTarget.bounds;
  const leftmostStaveBound = staveBounds[0] ?? inputBounds;
  const rightmostStaveBound = staveBounds.at(-1) ?? inputBounds;
  const semitoneMm = staveSemitoneMm(document.layout, stave);
  const inputLedgers = primaryStaveTarget.inputLedgers;
  const editableInputBounds = primaryStaveTarget.editableBounds;
  const mayEditOutsideStaveRange = inputLedgers.length > 0;
  const mmToPixels = (millimetres: number) => millimetres * PIXELS_PER_MM;
  const yAt = (tick: number) => mmToPixels(
    system.top_mm + (tick - system.start_tick) * system.height_mm / (system.end_tick - system.start_tick),
  );
  const xAtPitch = (pitch: number) => mmToPixels(pitchToXmm(pitch, stave, staveLeftMm, document.layout));
  const visibleMeasures = measures.filter((tick) => tick >= system.start_tick && tick <= system.end_tick);
  const visibleGroups = groups.filter((tick) => tick > system.start_tick && tick < system.end_tick);
  const timeSignatures = timeSignatureIndicators(document.base_grid, document.time_per_quarter)
    .filter(({ startTick }) => startTick >= system.start_tick && startTick < system.end_tick);
  const signatureChanges = (() => {
    let startTick = 0;
    return document.base_grid.map((grid) => {
      const change = { grid, startTick };
      startTick += grid.measure_amount * measureDuration(grid, document.time_per_quarter);
      return change;
    });
  })();
  const snapBands = measures.slice(0, -1).flatMap((measureStart, measureIndex) => {
    const measureEnd = measures[measureIndex + 1];
    const bands: { start: number; end: number }[] = [];
    let tick = measureStart;
    let bandIndex = 0;
    while (tick < measureEnd) {
      const nextTick = Math.min(measureEnd, tick + snapTicks);
      if (bandIndex % 2 === 0 && nextTick > system.start_tick && tick < system.end_tick) {
        bands.push({ start: Math.max(tick, system.start_tick), end: Math.min(nextTick, system.end_tick) });
      }
      tick = nextTick;
      bandIndex += 1;
    }
    return bands;
  });
  const dragRef = useRef<{
    hand: "left" | "right";
    mode: "move" | "duration";
    noteId: string;
    staveId: string;
    pointerId: number;
  } | null>(null);
  const countLineDragRef = useRef<{ id: string; staveId: string; part: "start" | "end" | "line"; pointerId: number; startTime: number; startPointerTime: number; startRpitch1: number; startRpitch2: number; startRpitch: number } | null>(null);
  const selectionDragRef = useRef<{ pointerId: number; startX: number; startY: number; startClientX: number; startClientY: number; rightButton: boolean } | null>(null);
  const suppressContextMenuRef = useRef(false);
  const [inputPreview, setInputPreview] = useState<{ staveId: string; time: number; pitch: number } | null>(null);
  const [systemBreakTarget, setSystemBreakTarget] = useState<SystemBreakTarget | null>(null);
  const [meterTarget, setMeterTarget] = useState<MeterTarget | null>(null);
  const [hoveredStaveControlId, setHoveredStaveControlId] = useState<string | null>(null);
  const [selectionRect, setSelectionRect] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);

  const beatDurationAt = (tick: number) => {
    const change = [...signatureChanges].reverse().find((candidate) => candidate.startTick <= tick);
    return document.time_per_quarter * 4 / (change?.grid.denominator ?? 4);
  };

  const editTempo = (event: MouseEvent<SVGElement>) => {
    if (activeTool !== "tempo") return;
    const { xMm, yMm } = pointAt(event);
    const existing = tempoTargetAt(xMm, yMm);
    if (existing) {
      onOpenTempoDialog({ id: existing.id });
      return;
    }
    if (xMm < systemBounds[0] || xMm > systemBounds[1] || yMm < system.top_mm || yMm > system.top_mm + system.height_mm) return;
    const startTick = snapTimeAt(yMm);
    const created: TempoEvent = { ...createEvent("tempo") as TempoEvent, start_tick: startTick, duration_ticks: beatDurationAt(startTick), tempo: 60 };
    onEdit((editableDocument) => {
      editableDocument.timeline_events.push(created);
      ensureInitialTempo(editableDocument);
    }, `Tempo marking added at tick ${startTick}`);
    onOpenTempoDialog({ id: created.id });
  };

  const removeTempo = (event: MouseEvent<SVGElement>) => {
    if (activeTool !== "tempo") return;
    const { xMm, yMm } = pointAt(event);
    const tempo = tempoTargetAt(xMm, yMm);
    if (!tempo || tempo.start_tick === 0) return;
    onEdit((editableDocument) => {
      editableDocument.timeline_events = editableDocument.timeline_events.filter((candidate) => candidate.id !== tempo.id);
      ensureInitialTempo(editableDocument);
    }, "Tempo marking removed");
  };

  const pointAt = (event: MouseEvent<SVGElement> | PointerEvent<SVGElement>) => {
    const bounds = (event.currentTarget.ownerSVGElement ?? event.currentTarget).getBoundingClientRect();
    return {
      xMm: ((event.clientX - bounds.left) / bounds.width) * page.width_mm,
      yMm: ((event.clientY - bounds.top) / bounds.height) * page.height_mm,
    };
  };

  const staveTargetAt = (xMm: number) => staveTargets.find((target) => xMm >= target.bounds[0] && xMm <= target.bounds[1]) ?? null;
  const staveTargetById = (staveId: string) => staveTargets.find((target) => target.stave.id === staveId) ?? null;

  const snapTimeAt = (yMm: number) => Math.max(
    system.start_tick,
    Math.min(
      system.end_tick - snapTicks,
      Math.round((system.start_tick + (yMm - system.top_mm) * (system.end_tick - system.start_tick) / system.height_mm) / snapTicks) * snapTicks,
    ),
  );

  const systemBreakTargetAt = (xMm: number, yMm: number): SystemBreakTarget | null => {
    const toleranceMm = 7 / PIXELS_PER_MM;
    if (xMm < systemBounds[0] - toleranceMm || xMm > systemBounds[1] + toleranceMm) return null;
    const systems = document.pages.flatMap((candidatePage) => candidatePage.systems);
    const systemIndex = systems.findIndex((candidate) => candidate.id === system.id);
    if (systemIndex > 0 && Math.abs(yMm - system.top_mm) <= toleranceMm) return { kind: "remove", boundary: "top" };
    if (systemIndex >= 0 && systemIndex < systems.length - 1 && Math.abs(yMm - (system.top_mm + system.height_mm)) <= toleranceMm) return { kind: "remove", boundary: "bottom" };
    const time = measures.find((measure) => system.start_tick < measure && measure < system.end_tick && Math.abs(yMm - yAt(measure) / PIXELS_PER_MM) <= toleranceMm);
    return time === undefined ? null : { kind: "split", time };
  };

  const staveControlAt = (xMm: number, yMm: number): string | null => system.staves.find((candidate, index) => {
    const bounds = staveBoundsMm(system, candidate, document.layout, staveLeftPositions[index], false);
    const centerX = bounds ? (bounds[0] + bounds[1]) * 0.5 : staveLeftPositions[index];
    const centerY = system.top_mm - 4;
    return xMm >= (bounds?.[0] ?? centerX) - 2.5
      && xMm <= (bounds?.[1] ?? centerX) + 2.5
      && Math.abs(yMm - centerY) <= 4.5;
  })?.id ?? null;

  const locateStave = (editableDocument: KeyTabDocument, staveId = stave.id): [System, Stave] | null => {
    for (const editablePage of editableDocument.pages) {
      const editableSystem = editablePage.systems.find((candidate) => candidate.id === system.id);
      const editableStave = editableSystem?.staves.find((candidate) => candidate.id === staveId);
      if (editableSystem && editableStave) return [editableSystem, editableStave];
    }
    return null;
  };

  const followingSystem = page.systems[page.systems.findIndex((candidate) => candidate.id === system.id) + 1] ?? null;
  const followingSystemBounds = followingSystem ? systemBoundsById.get(followingSystem.id) : null;
  const durationEndTimeAt = (xMm: number, yMm: number): number => {
    const pointerIsOverFollowingSystem = followingSystem && followingSystemBounds
      && xMm >= followingSystemBounds[0] && xMm <= followingSystemBounds[1]
      && yMm >= followingSystem.top_mm && yMm <= followingSystem.top_mm + followingSystem.height_mm;
    if (pointerIsOverFollowingSystem) {
      const time = followingSystem.start_tick + (yMm - followingSystem.top_mm) * (followingSystem.end_tick - followingSystem.start_tick) / followingSystem.height_mm;
      return Math.max(followingSystem.start_tick, Math.min(followingSystem.end_tick, Math.round(time / snapTicks) * snapTicks));
    }
    const time = system.start_tick + (yMm - system.top_mm) * (system.end_tick - system.start_tick) / system.height_mm;
    return Math.max(system.start_tick, Math.min(system.end_tick, Math.round(time / snapTicks) * snapTicks));
  };

  const noteHitAt = (xMm: number, yMm: number): { note: NoteEvent; part: "head" | "body"; staveTarget: typeof staveTargets[number] } | null => {
    const xPx = mmToPixels(xMm);
    const yPx = mmToPixels(yMm);
    for (const target of [...staveTargets].reverse()) {
      const candidateNotes = target.stave.events.filter((event): event is NoteEvent => event.type === "note");
      const candidateScale = document.layout.scale * target.stave.scale;
      const bodyHalfWidth = mmToPixels(target.semitoneMm);
      for (const candidate of [...candidateNotes].reverse()) {
        const noteX = mmToPixels(pitchToXmm(candidate.pitch, target.stave, target.leftMm, document.layout));
        const noteY = yAt(candidate.time);
        const endY = yAt(Math.min(system.end_tick, candidate.time + candidate.duration));
        const noteHeight = mmToPixels(target.semitoneMm * 2 * document.layout.notehead_height_scaling);
        const noteHalfWidth = mmToPixels(target.semitoneMm * document.layout.note_width_scaling * blackKeyWidthScale(candidate.pitch, candidate.time, candidateNotes, document.layout.black_note_rule));
        const isBlack = isBlackKey(candidate.pitch);
        const headUp = candidate.notehead === "auto"
          ? isBlack && document.layout.black_note_rule === "above_stem"
          : candidate.notehead.endsWith("_up");
        const headCenterY = (headUp ? noteY - noteHeight : noteY) + noteHeight * 0.5;
        const headHit = !candidate.continues_from_previous
          && ((xPx - noteX) / noteHalfWidth) ** 2 + ((yPx - headCenterY) / (noteHeight * 0.5)) ** 2 <= 1;
        if (headHit) return { note: candidate, part: "head", staveTarget: target };
        const bodyHit = xPx >= noteX - bodyHalfWidth && xPx <= noteX + bodyHalfWidth
          && yPx >= noteY && yPx <= Math.max(noteY + bodyHalfWidth, endY);
        if (bodyHit) return { note: candidate, part: "body", staveTarget: target };
      }
    }
    return null;
  };

  const selectedNotesInRect = (rect: { startX: number; startY: number; endX: number; endY: number }) => {
    const left = Math.min(rect.startX, rect.endX);
    const right = Math.max(rect.startX, rect.endX);
    const top = Math.min(rect.startY, rect.endY);
    const bottom = Math.max(rect.startY, rect.endY);
    return noteGeometries.filter((geometry) => {
      const noteLeft = geometry.x - geometry.headHalfWidth;
      const noteRight = Math.max(geometry.x + geometry.headHalfWidth, geometry.stemTipX);
      const noteTop = Math.min(geometry.start - mmToPixels(noteHeightMm), geometry.start);
      const noteBottom = geometry.end;
      return noteRight >= left && noteLeft <= right && noteBottom >= top && noteTop <= bottom;
    }).map((geometry) => geometry.note.id);
  };

  const startSelectionDrag = (event: PointerEvent<SVGElement>) => {
    if (!event.shiftKey && (event.button !== 2 || activeTool === "count_line")) return false;
    const point = pointAt(event);
    const startX = mmToPixels(point.xMm);
    const startY = mmToPixels(point.yMm);
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointer events do not always own a capturable pointer.
    }
    selectionDragRef.current = { pointerId: event.pointerId, startX, startY, startClientX: event.clientX, startClientY: event.clientY, rightButton: event.button === 2 };
    setSelectionRect({ startX, startY, endX: startX, endY: startY });
    return true;
  };

  const updateSelectionDrag = (event: PointerEvent<SVGElement>) => {
    const drag = selectionDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return false;
    const point = pointAt(event);
    setSelectionRect({ startX: drag.startX, startY: drag.startY, endX: mmToPixels(point.xMm), endY: mmToPixels(point.yMm) });
    return true;
  };

  const endSelectionDrag = (event: PointerEvent<SVGElement>) => {
    const drag = selectionDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return false;
    selectionDragRef.current = null;
    const point = pointAt(event);
    const rect = { startX: drag.startX, startY: drag.startY, endX: mmToPixels(point.xMm), endY: mmToPixels(point.yMm) };
    setSelectionRect(null);
    const moved = Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY);
    if (!drag.rightButton || moved >= 3) onSelectionChange(selectedNotesInRect(rect));
    if (drag.rightButton && moved >= 3) suppressContextMenuRef.current = true;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    return true;
  };

  const editSystemBreak = (event: MouseEvent<SVGElement>) => {
    if (activeTool !== "break") return;
    const { xMm, yMm } = pointAt(event);
    const target = systemBreakTargetAt(xMm, yMm);
    if (!target) return;
    onEdit((editableDocument) => {
      if (target.kind === "split") splitSystemAt(editableDocument, system.id, target.time);
      else removeSystemBreak(editableDocument, system.id, target.boundary);
    }, target.kind === "split" ? `System break added at measure ${measures.indexOf(target.time) + 1}` : "System break removed");
  };

  const updateSystemBreakHover = (event: PointerEvent<SVGElement>) => {
    if (activeTool !== "break") return;
    const { xMm, yMm } = pointAt(event);
    setSystemBreakTarget(systemBreakTargetAt(xMm, yMm));
  };

  const gridTimesForSignatureChange = (startTick: number): number[] => {
    const change = signatureChanges.find((candidate) => candidate.startTick === startTick);
    if (!change) return [];
    const beatDuration = document.time_per_quarter * 4 / change.grid.denominator;
    return Array.from({ length: change.grid.numerator - 1 }, (_, index) => startTick + (index + 1) * beatDuration);
  };

  const meterTargetAt = (xMm: number, yMm: number): MeterTarget | null => {
    const toleranceMm = 7 / PIXELS_PER_MM;
    if (xMm < systemBounds[0] - toleranceMm || xMm > systemBounds[1] + toleranceMm) return null;
    const time = measures.find((tick) => tick >= system.start_tick && tick < system.end_tick && Math.abs(yMm - yAt(tick) / PIXELS_PER_MM) <= toleranceMm);
    if (time !== undefined) return { kind: "barline", time };
    for (const change of signatureChanges) {
      const gridTime = gridTimesForSignatureChange(change.startTick)
        .find((candidate) => candidate > system.start_tick && candidate < system.end_tick && Math.abs(yMm - yAt(candidate) / PIXELS_PER_MM) <= toleranceMm);
      if (gridTime !== undefined) return { kind: "grid", time: gridTime, changeStartTick: change.startTick };
    }
    return null;
  };

  const editTimeSignature = (event: MouseEvent<SVGElement>) => {
    if (activeTool !== "meter") return;
    const { xMm, yMm } = pointAt(event);
    const target = meterTargetAt(xMm, yMm);
    if (!target) return;
    if (target.kind === "grid") {
      onEdit((editableDocument) => setTimeSignatureGridLine(editableDocument, target.time, true), "Grid line enabled");
      return;
    }
    const change = [...signatureChanges].reverse().find((candidate) => candidate.startTick <= target.time);
    if (change) onOpenTimeSignatureDialog({ time: target.time, numerator: change.grid.numerator, denominator: change.grid.denominator, indicatorEnabled: change.grid.indicator_enabled });
  };

  const removeTimeSignatureGridLine = (event: MouseEvent<SVGElement>) => {
    if (activeTool !== "meter") return;
    const { xMm, yMm } = pointAt(event);
    const target = meterTargetAt(xMm, yMm);
    if (target?.kind !== "grid") return;
    onEdit((editableDocument) => setTimeSignatureGridLine(editableDocument, target.time, false), "Grid line disabled");
  };

  const updateMeterHover = (event: PointerEvent<SVGElement>) => {
    if (activeTool !== "meter") return;
    const { xMm, yMm } = pointAt(event);
    setMeterTarget(meterTargetAt(xMm, yMm));
  };

  const updateStaveControlHover = (event: PointerEvent<SVGElement>) => {
    const { xMm, yMm } = pointAt(event);
    setHoveredStaveControlId(staveControlAt(xMm, yMm));
  };

  const updatePasteTarget = (event: PointerEvent<SVGElement>) => {
    const { xMm, yMm } = pointAt(event);
    if (xMm < systemBounds[0] || xMm > systemBounds[1] || yMm < system.top_mm || yMm > system.top_mm + system.height_mm) return;
    onPasteTargetChange({ systemId: system.id, time: snapTimeAt(yMm) });
  };

  useEffect(() => {
    if (activeTool !== "break" || !systemBreakTarget) return;
    const handlePageBreakShortcut = (event: KeyboardEvent) => {
      const focusTarget = event.target;
      if (focusTarget instanceof HTMLElement && focusTarget.closest("input, textarea, select, [contenteditable='true']")) return;
      if (event.key !== "Enter" || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      event.preventDefault();
      onEdit((editableDocument) => {
        let pageBreakSystemId = system.id;
        if (systemBreakTarget.kind === "split") {
          pageBreakSystemId = splitSystemAt(editableDocument, system.id, systemBreakTarget.time).id;
        } else if (systemBreakTarget.boundary === "bottom") {
          const systems = editableDocument.pages.flatMap((candidatePage) => candidatePage.systems);
          const following = systems[systems.findIndex((candidate) => candidate.id === system.id) + 1];
          if (!following) return;
          pageBreakSystemId = following.id;
        }
        const systems = editableDocument.pages.flatMap((candidatePage) => candidatePage.systems);
        const pageBreakSystem = systems.find((candidate) => candidate.id === pageBreakSystemId);
        if (!pageBreakSystem) return;
        setForcedPageBreakBefore(editableDocument, pageBreakSystem.id, !pageBreakSystem.force_page_break_before);
      }, "Page break updated");
    };
    window.addEventListener("keydown", handlePageBreakShortcut);
    return () => window.removeEventListener("keydown", handlePageBreakShortcut);
  }, [activeTool, onEdit, system.id, systemBreakTarget]);

  const startNoteDrag = (event: PointerEvent<SVGElement>) => {
    if ((activeTool !== "left" && activeTool !== "right") || event.button !== 0) return;
    if (selectedNoteIds.size) {
      onClearSelection();
      return;
    }
    const { xMm, yMm } = pointAt(event);
    const hit = noteHitAt(xMm, yMm);
    const target = hit?.staveTarget ?? staveTargetAt(xMm);
    if (!target || yMm < system.top_mm || yMm > system.top_mm + system.height_mm) return;
    event.preventDefault();
    setInputPreview(null);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointer events do not always own a capturable pointer.
    }
    const hand = activeTool;
    if (hit) {
      dragRef.current = { hand: hit.note.hand, mode: hit.part === "head" ? "move" : "duration", noteId: hit.note.id, staveId: target.stave.id, pointerId: event.pointerId };
      return;
    }

    const time = snapTimeAt(yMm);
    const pitch = nearestStavePitch(target.stave, document.layout, target.leftMm, xMm, target.inputLedgers.length > 0);
    const noteId = createEvent("note").id;
    dragRef.current = { hand, mode: "duration", noteId, staveId: target.stave.id, pointerId: event.pointerId };
    onEdit((editableDocument) => {
      const editableTarget = locateStave(editableDocument, target.stave.id);
      if (!editableTarget) return;
      const note = createEvent("note") as NoteEvent;
      note.id = noteId;
      note.time = time;
      note.duration = snapTicks;
      note.pitch = pitch;
      note.hand = hand;
      editableTarget[1].events.push(note);
    }, `${hand === "left" ? "Left" : "Right"} note added`);
    onAuditionNote(pitch, 100);
  };

  const updateNoteDrag = (event: PointerEvent<SVGElement>) => {
    const drag = dragRef.current;
    const { xMm, yMm } = pointAt(event);
    if (!drag || drag.pointerId !== event.pointerId) {
      if (activeTool !== "left" && activeTool !== "right") return;
      const target = staveTargetAt(xMm);
      const inInputBounds = target && yMm >= system.top_mm && yMm <= system.top_mm + system.height_mm;
      setInputPreview(inInputBounds ? {
        staveId: target.stave.id,
        time: snapTimeAt(yMm),
        pitch: nearestStavePitch(target.stave, document.layout, target.leftMm, xMm, target.inputLedgers.length > 0),
      } : null);
      return;
    }
    const target = staveTargetById(drag.staveId);
    if (!target) return;
    const nextPitch = drag.mode === "move" ? nearestStavePitch(target.stave, document.layout, target.leftMm, xMm, true) : null;
    const currentPitch = drag.mode === "move" ? target.stave.events.find((candidate): candidate is NoteEvent => candidate.type === "note" && candidate.id === drag.noteId)?.pitch : null;
    onEdit((editableDocument) => {
      const editableTarget = locateStave(editableDocument, drag.staveId);
      if (!editableTarget) return;
      const note = editableTarget[1].events.find((candidate): candidate is NoteEvent => candidate.type === "note" && candidate.id === drag.noteId);
      if (!note) return;
      if (drag.mode === "move") {
        note.time = Math.min(snapTimeAt(yMm), system.end_tick - note.duration);
        note.pitch = nextPitch!;
        return;
      }
      const editablePage = editableDocument.pages.find((candidate) => candidate.systems.some((candidateSystem) => candidateSystem.id === system.id));
      const sourceIndex = editablePage?.systems.findIndex((candidate) => candidate.id === system.id) ?? -1;
      const following = sourceIndex >= 0 ? editablePage?.systems[sourceIndex + 1] : undefined;
      const staveIndex = editableTarget[0].staves.findIndex((candidate) => candidate.id === editableTarget[1].id);
      const followingStave = following?.staves[staveIndex];
      const continuationId = note.continuation_id ?? note.id;
      const nextSamePitchTime = editableDocument.pages
        .flatMap((page) => page.systems)
        .flatMap((candidateSystem) => candidateSystem.staves[staveIndex]?.events ?? [])
        .filter((candidate): candidate is NoteEvent => candidate.type === "note"
          && candidate.pitch === note.pitch
          && candidate.time > note.time
          && candidate.id !== continuationId
          && candidate.continuation_id !== continuationId)
        .reduce((earliest, candidate) => Math.min(earliest, candidate.time), Number.POSITIVE_INFINITY);
      const requestedEndTime = Math.max(note.time + snapTicks, durationEndTimeAt(xMm, yMm));
      const endTime = Math.min(requestedEndTime, nextSamePitchTime);
      if (following && followingStave && endTime > following.start_tick) {
        note.duration = system.end_tick - note.time;
        note.continuation_id = continuationId;
        note.continues_to_next = true;
        const continuation = followingStave.events.find((candidate): candidate is NoteEvent => candidate.type === "note" && candidate.continues_from_previous && candidate.continuation_id === continuationId);
        if (continuation) {
          continuation.duration = endTime - following.start_tick;
          continuation.continues_to_next = false;
        } else {
          followingStave.events.push({ ...structuredClone(note), id: newId(), time: following.start_tick, duration: endTime - following.start_tick, continuation_id: continuationId, continues_from_previous: true, continues_to_next: false });
        }
        return;
      }
      note.duration = Math.min(system.end_tick, endTime) - note.time;
      note.continues_to_next = false;
      if (followingStave) {
        followingStave.events = followingStave.events.filter((candidate) => candidate.type !== "note" || !(candidate.continues_from_previous && candidate.continuation_id === continuationId));
      }
    }, drag.mode === "move" ? "Note moved" : "Note duration set");
    if (nextPitch !== null && currentPitch !== null && currentPitch !== nextPitch) onAuditionNote(nextPitch, 100);
  };

  const endNoteDrag = (event: PointerEvent<SVGElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const clearInputPreview = () => setInputPreview(null);

  const clearSystemBreakHover = () => setSystemBreakTarget(null);

  const removeNoteAt = (event: MouseEvent<SVGElement>) => {
    event.preventDefault();
    if (activeTool !== "left" && activeTool !== "right") return;
    const { xMm, yMm } = pointAt(event);
    const hit = noteHitAt(xMm, yMm);
    if (!hit) return;
    onEdit((editableDocument) => {
      const continuationId = hit.note.continuation_id ?? hit.note.id;
      for (const editableSystem of editableDocument.pages.flatMap((editablePage) => editablePage.systems)) {
        for (const editableStave of editableSystem.staves) {
          editableStave.events = editableStave.events.filter((candidate) => candidate.type !== "note" || (candidate.id !== continuationId && candidate.continuation_id !== continuationId));
        }
      }
    }, "Note removed");
  };

  const notes = stave.events.filter((event): event is NoteEvent => event.type === "note");
  const time = new Operator();
  const scale = document.layout.scale * stave.scale;
  const noteWidthMm = semitoneMm * document.layout.note_width_scaling;
  const noteHeightMm = semitoneMm * 2 * document.layout.notehead_height_scaling;
  const stemLengthMm = semitoneMm * document.layout.note_stem_length_semitone;
  const noteStrokePx = mmToPixels(document.layout.note_stem_thickness_mm * scale);
  const noteGeometries = notes.map((note) => {
    const x = xAtPitch(note.pitch);
    const start = yAt(note.time);
    const end = yAt(Math.min(system.end_tick, note.time + note.duration));
    const isBlack = isBlackKey(note.pitch);
    const blackAbove = document.layout.black_note_rule === "above_stem";
    const headUp = note.notehead === "auto" ? isBlack && blackAbove : note.notehead.endsWith("_up");
    const filled = note.notehead === "auto" ? isBlack : note.notehead.includes("black");
    const form = note.notehead === "auto" ? "circle" : note.notehead.split("_")[0];
    const top = headUp ? start - mmToPixels(noteHeightMm) : start;
    const centerY = top + mmToPixels(noteHeightMm) * 0.5;
    const halfWidth = mmToPixels(noteWidthMm * blackKeyWidthScale(note.pitch, note.time, notes, document.layout.black_note_rule));
    const height = mmToPixels(noteHeightMm);
    const headPoints = form === "triangle"
      ? (headUp ? [[x - halfWidth, top], [x + halfWidth, top], [x, top + height]] : [[x, top], [x - halfWidth, top + height], [x + halfWidth, top + height]])
      : Array.from({ length: 48 }, (_, index) => {
        const angle = Math.PI * 2 * index / 48;
        const tilt = (note.hand === "right" ? -1 : 1) * document.layout.notehead_tilt * halfWidth * Math.cos(angle);
        return [x + halfWidth * Math.cos(angle), centerY + height * 0.5 * Math.sin(angle) + tilt];
      });
    const headPath = `M ${headPoints.map(([pointX, pointY]) => `${pointX} ${pointY}`).join(" L ")} Z`;
    const stemTipX = x + (note.hand === "left" ? -1 : 1) * mmToPixels(stemLengthMm);
    const body = [[x, start], [x - mmToPixels(semitoneMm), start + mmToPixels(semitoneMm)], [x - mmToPixels(semitoneMm), end], [x + mmToPixels(semitoneMm), end], [x + mmToPixels(semitoneMm), start + mmToPixels(semitoneMm)]];
    const nextSameHand = notes.some((candidate) => candidate.id !== note.id && candidate.hand === note.hand && time.eq(candidate.time, note.time + note.duration));
    const midiHalfWidth = mmToPixels(semitoneMm);
    const stop = !note.continues_to_next && !nextSameHand ? [[x - midiHalfWidth, end - height], [x, end], [x + midiHalfWidth, end - height]] : null;
    const dotTicks = [...new Set([
      ...measures,
      ...notes.filter((candidate) => candidate.hand === note.hand).flatMap((candidate) => [candidate.time, candidate.time + candidate.duration]),
      ...(note.continues_from_previous ? [note.time] : []),
      ...(note.continues_to_next ? [note.time + note.duration] : []),
    ])].filter((tick) => (
      (note.continues_from_previous && tick === note.time)
      || (note.time < tick && (tick < note.time + note.duration || (note.continues_to_next && tick === note.time + note.duration)))
    ));
    return { note, staveId: stave.id, x, start, end, stemTipX, headPath, body, filled, form, headUp, headHalfWidth: halfWidth, isBlackKey: isBlack, stop, noteHeightPx: mmToPixels(noteHeightMm), noteStrokePx, stopStrokePx: mmToPixels(document.layout.note_stopsign_thickness_mm * scale), dotRadiusPx: mmToPixels(document.layout.note_continuation_dot_size_mm * scale) / 2, dots: dotTicks.map((tick) => [x, yAt(tick) + mmToPixels(semitoneMm)] as const) };
  });
  const additionalNoteGeometries = staveTargets.slice(1).flatMap((target) => {
    const candidateNotes = target.stave.events.filter((event): event is NoteEvent => event.type === "note");
    const candidateScale = document.layout.scale * target.stave.scale;
    const candidateNoteWidthMm = target.semitoneMm * document.layout.note_width_scaling;
    const candidateNoteHeightMm = target.semitoneMm * 2 * document.layout.notehead_height_scaling;
    const candidateStemLengthMm = target.semitoneMm * document.layout.note_stem_length_semitone;
    const candidateNoteStrokePx = mmToPixels(document.layout.note_stem_thickness_mm * candidateScale);
    return candidateNotes.map((note) => {
      const x = mmToPixels(pitchToXmm(note.pitch, target.stave, target.leftMm, document.layout));
      const start = yAt(note.time);
      const end = yAt(Math.min(system.end_tick, note.time + note.duration));
      const isBlack = isBlackKey(note.pitch);
      const headUp = note.notehead === "auto" ? isBlack && document.layout.black_note_rule === "above_stem" : note.notehead.endsWith("_up");
      const filled = note.notehead === "auto" ? isBlack : note.notehead.includes("black");
      const form = note.notehead === "auto" ? "circle" : note.notehead.split("_")[0];
      const halfWidth = mmToPixels(candidateNoteWidthMm * blackKeyWidthScale(note.pitch, note.time, candidateNotes, document.layout.black_note_rule));
      const noteHeightPx = mmToPixels(candidateNoteHeightMm);
      const top = headUp ? start - noteHeightPx : start;
      const centerY = top + noteHeightPx * 0.5;
      const headPoints = form === "triangle"
        ? (headUp ? [[x - halfWidth, top], [x + halfWidth, top], [x, top + noteHeightPx]] : [[x, top], [x - halfWidth, top + noteHeightPx], [x + halfWidth, top + noteHeightPx]])
        : Array.from({ length: 48 }, (_, index) => {
          const angle = Math.PI * 2 * index / 48;
          const tilt = (note.hand === "right" ? -1 : 1) * document.layout.notehead_tilt * halfWidth * Math.cos(angle);
          return [x + halfWidth * Math.cos(angle), centerY + noteHeightPx * 0.5 * Math.sin(angle) + tilt];
        });
      const stemTipX = x + (note.hand === "left" ? -1 : 1) * mmToPixels(candidateStemLengthMm);
      const bodyHalfWidth = mmToPixels(target.semitoneMm);
      const body = [[x, start], [x - bodyHalfWidth, start + bodyHalfWidth], [x - bodyHalfWidth, end], [x + bodyHalfWidth, end], [x + bodyHalfWidth, start + bodyHalfWidth]];
      const nextSameHand = candidateNotes.some((candidate) => candidate.id !== note.id && candidate.hand === note.hand && time.eq(candidate.time, note.time + note.duration));
      const stop = !note.continues_to_next && !nextSameHand ? [[x - bodyHalfWidth, end - noteHeightPx], [x, end], [x + bodyHalfWidth, end - noteHeightPx]] : null;
      const dotTicks = [...new Set([
        ...measures,
        ...candidateNotes.filter((candidate) => candidate.hand === note.hand).flatMap((candidate) => [candidate.time, candidate.time + candidate.duration]),
        ...(note.continues_from_previous ? [note.time] : []),
        ...(note.continues_to_next ? [note.time + note.duration] : []),
      ])].filter((tick) => (note.continues_from_previous && tick === note.time) || (note.time < tick && (tick < note.time + note.duration || (note.continues_to_next && tick === note.time + note.duration))));
      return { note, staveId: target.stave.id, x, start, end, stemTipX, headPath: `M ${headPoints.map(([pointX, pointY]) => `${pointX} ${pointY}`).join(" L ")} Z`, body, filled, form, headUp, headHalfWidth: halfWidth, isBlackKey: isBlack, stop, noteHeightPx, noteStrokePx: candidateNoteStrokePx, stopStrokePx: mmToPixels(document.layout.note_stopsign_thickness_mm * candidateScale), dotRadiusPx: mmToPixels(document.layout.note_continuation_dot_size_mm * candidateScale) / 2, dots: dotTicks.map((tick) => [x, yAt(tick) + bodyHalfWidth] as const) };
    });
  });
  const renderedNoteGeometries = [...noteGeometries, ...additionalNoteGeometries];
  const noteGeometriesInPaintOrder = [...noteGeometries].sort((first, second) => Number(first.isBlackKey) - Number(second.isBlackKey));
  const renderedNoteGeometriesInPaintOrder = [...renderedNoteGeometries].sort((first, second) => Number(first.isBlackKey) - Number(second.isBlackKey));
  const countLineMetrics = (target: typeof staveTargets[number]) => {
    const handleHalfMm = Math.max(target.semitoneMm, 6 / PIXELS_PER_MM) * 0.7;
    const centreMm = pitchToXmm(60, target.stave, target.leftMm, document.layout);
    const bounds = {
      min: Math.ceil((handleHalfMm - centreMm) / target.semitoneMm),
      max: Math.floor((page.width_mm - handleHalfMm - centreMm) / target.semitoneMm),
    };
    const clamp = (rpitch: number) => Math.max(bounds.min, Math.min(bounds.max, rpitch));
    return {
      bounds,
      clamp,
      centreX: mmToPixels(centreMm),
      semitonePx: mmToPixels(target.semitoneMm),
      tolerance: Math.max(mmToPixels(target.semitoneMm) * 0.7, 6),
      handleSize: Math.max(mmToPixels(target.semitoneMm), 6) * 1.4,
      rpitchAt: (xMm: number) => clamp(Math.round((xMm - centreMm) / target.semitoneMm)),
      scale: document.layout.scale * target.stave.scale,
    };
  };
  const countLineTargetAt = (xMm: number, yMm: number): { line: CountLineEvent; staveTarget: typeof staveTargets[number]; part: "start" | "end" | "line" } | null => {
    if (activeTool !== "count_line") return null;
    const x = mmToPixels(xMm);
    const y = mmToPixels(yMm);
    for (const staveTarget of staveTargets) {
      const metrics = countLineMetrics(staveTarget);
      for (const line of [...staveTarget.stave.events].reverse()) {
        if (line.type !== "count_line" || line.start_tick < system.start_tick || line.start_tick >= system.end_tick) continue;
        const lineY = yAt(line.start_tick);
        const startX = metrics.centreX + metrics.clamp(line.rpitch1) * metrics.semitonePx;
        const endX = metrics.centreX + metrics.clamp(line.rpitch2) * metrics.semitonePx;
        if (Math.abs(x - startX) <= metrics.tolerance && Math.abs(y - lineY) <= metrics.tolerance) return { line, staveTarget, part: "start" };
        if (Math.abs(x - endX) <= metrics.tolerance && Math.abs(y - lineY) <= metrics.tolerance) return { line, staveTarget, part: "end" };
        if (Math.abs(y - lineY) <= metrics.tolerance / 2 && x >= Math.min(startX, endX) && x <= Math.max(startX, endX)) return { line, staveTarget, part: "line" };
      }
    }
    return null;
  };
  const startCountLineDrag = (event: PointerEvent<SVGElement>) => {
    if (activeTool !== "count_line" || event.button !== 0) return false;
    const { xMm, yMm } = pointAt(event);
    if (yMm < system.top_mm || yMm > system.top_mm + system.height_mm) return false;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const target = countLineTargetAt(xMm, yMm);
    if (target) {
      const metrics = countLineMetrics(target.staveTarget);
      countLineDragRef.current = { id: target.line.id, staveId: target.staveTarget.stave.id, part: target.part, pointerId: event.pointerId, startTime: target.line.start_tick, startPointerTime: snapTimeAt(yMm), startRpitch1: metrics.clamp(target.line.rpitch1), startRpitch2: metrics.clamp(target.line.rpitch2), startRpitch: metrics.rpitchAt(xMm) };
      return true;
    }
    const staveTarget = staveTargetAt(xMm);
    if (!staveTarget) return false;
    const metrics = countLineMetrics(staveTarget);
    const line = createEvent("count_line") as CountLineEvent;
    const rpitch = metrics.rpitchAt(xMm);
    line.start_tick = snapTimeAt(yMm);
    line.rpitch1 = rpitch;
    line.rpitch2 = rpitch;
    countLineDragRef.current = { id: line.id, staveId: staveTarget.stave.id, part: "end", pointerId: event.pointerId, startTime: line.start_tick, startPointerTime: line.start_tick, startRpitch1: rpitch, startRpitch2: rpitch, startRpitch: rpitch };
    onEdit((editableDocument) => { locateStave(editableDocument, staveTarget.stave.id)?.[1].events.push(line); }, "Count line added");
    return true;
  };
  const updateCountLineDrag = (event: PointerEvent<SVGElement>) => {
    const drag = countLineDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return false;
    const { xMm, yMm } = pointAt(event);
    const staveTarget = staveTargetById(drag.staveId);
    if (!staveTarget) return false;
    const metrics = countLineMetrics(staveTarget);
    const rpitch = metrics.rpitchAt(xMm);
    onEdit((editableDocument) => {
      const line = locateStave(editableDocument, drag.staveId)?.[1].events.find((candidate): candidate is CountLineEvent => candidate.type === "count_line" && candidate.id === drag.id);
      if (!line) return;
      line.rpitch1 = metrics.clamp(line.rpitch1);
      line.rpitch2 = metrics.clamp(line.rpitch2);
      if (drag.part === "line") {
        const minDelta = metrics.bounds.min - Math.min(drag.startRpitch1, drag.startRpitch2);
        const maxDelta = metrics.bounds.max - Math.max(drag.startRpitch1, drag.startRpitch2);
        const delta = Math.max(minDelta, Math.min(maxDelta, rpitch - drag.startRpitch));
        line.start_tick = Math.max(system.start_tick, Math.min(system.end_tick - snapTicks, drag.startTime + snapTimeAt(yMm) - drag.startPointerTime));
        line.rpitch1 = drag.startRpitch1 + delta;
        line.rpitch2 = drag.startRpitch2 + delta;
      } else {
        line.start_tick = snapTimeAt(yMm);
        if (drag.part === "start") line.rpitch1 = line.rpitch1 <= line.rpitch2 ? Math.min(rpitch, line.rpitch2 - 2) : Math.max(rpitch, line.rpitch2 + 2);
        else if (line.rpitch2 === line.rpitch1) line.rpitch2 = rpitch >= line.rpitch1 ? line.rpitch1 + 2 : line.rpitch1 - 2;
        else line.rpitch2 = line.rpitch2 >= line.rpitch1 ? Math.max(rpitch, line.rpitch1 + 2) : Math.min(rpitch, line.rpitch1 - 2);
      }
    }, "Count line updated");
    return true;
  };
  const endCountLineDrag = (event: PointerEvent<SVGElement>) => {
    if (countLineDragRef.current?.pointerId !== event.pointerId) return false;
    countLineDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    return true;
  };
  const removeCountLineAt = (event: MouseEvent<SVGElement>) => {
    if (activeTool !== "count_line") return false;
    const { xMm, yMm } = pointAt(event);
    const target = countLineTargetAt(xMm, yMm);
    if (!target) return false;
    onEdit((editableDocument) => {
      const editableStave = locateStave(editableDocument, target.staveTarget.stave.id)?.[1];
      if (!editableStave) return;
      editableStave.events = editableStave.events.filter((candidate) => candidate.id !== target.line.id);
    }, "Count line removed");
    return true;
  };
  const previewGeometry = inputPreview && (activeTool === "left" || activeTool === "right") ? (() => {
    const target = staveTargetById(inputPreview.staveId);
    if (!target) return null;
    const { time: previewTime, pitch } = inputPreview;
    const previewNotes = target.stave.events.filter((event): event is NoteEvent => event.type === "note");
    const previewScale = document.layout.scale * target.stave.scale;
    const previewNoteWidthMm = target.semitoneMm * document.layout.note_width_scaling;
    const previewNoteHeightMm = target.semitoneMm * 2 * document.layout.notehead_height_scaling;
    const previewStemLengthMm = target.semitoneMm * document.layout.note_stem_length_semitone;
    const x = mmToPixels(pitchToXmm(pitch, target.stave, target.leftMm, document.layout));
    const start = yAt(previewTime);
    const end = yAt(Math.min(system.end_tick, previewTime + snapTicks));
    const isBlack = isBlackKey(pitch);
    const headUp = isBlack && document.layout.black_note_rule === "above_stem";
    const height = mmToPixels(previewNoteHeightMm);
    const top = headUp ? start - height : start;
    const centerY = top + height * 0.5;
    const halfWidth = mmToPixels(previewNoteWidthMm * blackKeyWidthScale(pitch, previewTime, previewNotes, document.layout.black_note_rule));
    const headPoints = Array.from({ length: 48 }, (_, index) => {
      const angle = Math.PI * 2 * index / 48;
      const tilt = (activeTool === "right" ? -1 : 1) * document.layout.notehead_tilt * halfWidth * Math.cos(angle);
      return [x + halfWidth * Math.cos(angle), centerY + height * 0.5 * Math.sin(angle) + tilt];
    });
    const dotTicks = [...new Set([...measures, ...previewNotes.filter((note) => note.hand === activeTool).flatMap((note) => [note.time, note.time + note.duration])])]
      .filter((tick) => previewTime < tick && tick < previewTime + snapTicks);
    const midiHalfWidth = mmToPixels(target.semitoneMm);
    return {
      x,
      start,
      end,
      stemTipX: x + (activeTool === "left" ? -1 : 1) * mmToPixels(previewStemLengthMm),
      isBlackKey: isBlack,
      headPath: `M ${headPoints.map(([pointX, pointY]) => `${pointX} ${pointY}`).join(" L ")} Z`,
      body: [[x, start], [x - midiHalfWidth, start + midiHalfWidth], [x - midiHalfWidth, end], [x + midiHalfWidth, end], [x + midiHalfWidth, start + midiHalfWidth]],
      stop: [[x - midiHalfWidth, end - height], [x, end], [x + midiHalfWidth, end - height]],
      dotRadiusPx: mmToPixels(document.layout.note_continuation_dot_size_mm * previewScale) / 2,
      noteStrokePx: mmToPixels(document.layout.note_stem_thickness_mm * previewScale),
      stopStrokePx: mmToPixels(document.layout.note_stopsign_thickness_mm * previewScale),
      dots: dotTicks.map((tick) => [x, yAt(tick) + midiHalfWidth] as const),
    };
  })() : null;
  const ledgers = staveTargets.flatMap((target) => {
    const targetGeometries = renderedNoteGeometries.filter((geometry) => geometry.staveId === target.stave.id);
    return ledgerLineSegments(
      system,
      target.stave,
      document.layout,
      target.leftMm,
      new Map(targetGeometries.map((geometry) => [
        geometry.note.id,
        [...geometry.dots.map(([, y]) => y / PIXELS_PER_MM), ...(geometry.stop ? [geometry.stop[1][1] / PIXELS_PER_MM] : [])],
      ])),
    ).map((ledger) => ({ ...ledger, staveId: target.stave.id }));
  });
  const chordConnectors = ["left", "right"].flatMap((hand) => {
    const remaining = renderedNoteGeometries.filter((geometry) => geometry.note.hand === hand);
    const connectors: { staveId: string; tick: number; x1: number; y: number; x2: number; strokeWidth: number }[] = [];
    while (remaining.length) {
      const first = remaining.shift()!;
      const group = [first, ...remaining.filter((geometry) => geometry.staveId === first.staveId && time.eq(geometry.note.time, first.note.time))];
      for (const geometry of group.slice(1)) remaining.splice(remaining.indexOf(geometry), 1);
      if (group.length >= 2) connectors.push({
        staveId: first.staveId,
        tick: first.note.time,
        x1: Math.min(...group.map((geometry) => geometry.x)),
        y: first.start,
        x2: Math.max(...group.map((geometry) => geometry.x)),
        strokeWidth: first.noteStrokePx,
      });
    }
    return connectors;
  });
  const beamGeometries = staveTargets.flatMap((target) => {
    const targetGeometries = renderedNoteGeometries.filter((geometry) => geometry.staveId === target.stave.id);
    const explicitBeams = target.stave.events.filter((event) => event.type === "beam");
    const automaticBeams = applyBeamOverrides(
      beamWindows(document.base_grid, document.time_per_quarter),
      explicitBeams.map((beam) => [beam.time, beam.time + beam.duration]),
    );
    const targetScale = document.layout.scale * target.stave.scale;
    const beamWidth = mmToPixels(document.layout.beam_thickness_mm * targetScale);
    const semitoneWidth = mmToPixels(target.semitoneMm);
    return ["left", "right"].flatMap((hand) => automaticBeams.flatMap(([startTick, endTick]) => {
      const members = targetGeometries.filter((geometry) => geometry.note.hand === hand && time.ge(geometry.note.time, startTick) && time.lt(geometry.note.time, endTick));
      if (members.length < 2) return [];
      const first = members.reduce((earliest, member) => time.lt(member.note.time, earliest.note.time) ? member : earliest);
      const last = members.reduce((latest, member) => time.gt(member.note.time, latest.note.time) ? member : latest);
      if (time.eq(first.note.time, last.note.time)) return [];
      const continuationMembers = targetGeometries.filter((geometry) => geometry.note.hand === hand
        && time.lt(geometry.note.time, startTick)
        && time.gt(geometry.note.time + geometry.note.duration, startTick)
        && geometry.dots.some(([, dotY]) => dotY >= yAt(startTick) && dotY < yAt(endTick)));
      const beamAnchors = [...members, ...continuationMembers];
      const pitchAnchor = hand === "left"
        ? beamAnchors.reduce((lowest, member) => member.note.pitch < lowest.note.pitch ? member : lowest)
        : beamAnchors.reduce((highest, member) => member.note.pitch > highest.note.pitch ? member : highest);
      const x1 = pitchAnchor.stemTipX;
      const x2 = x1 + (hand === "left" ? -semitoneWidth : semitoneWidth);
      const polygon: [number, number][] = [[x1 - beamWidth / 2, first.start - first.noteStrokePx / 2], [x2 - beamWidth / 2, last.start + first.noteStrokePx / 2], [x2 + beamWidth / 2, last.start + first.noteStrokePx / 2], [x1 + beamWidth / 2, first.start - first.noteStrokePx / 2]];
      return [{ id: `${target.stave.id}-${hand}-${startTick}-${endTick}`, staveId: target.stave.id, startTick, endTick, polygon, strokeWidth: first.noteStrokePx, connectors: members.map((member) => {
        const fraction = (member.note.time - first.note.time) / Math.max(1, last.note.time - first.note.time);
        return [member.stemTipX, member.start, x1 + (x2 - x1) * fraction, member.start] as const;
      }) }];
    }));
  });
  const notationCutsAt = (tick: number): [number, number][] => {
    const padding = mmToPixels(2 * scale);
    const intervals: [number, number][] = [];
    for (const geometry of noteGeometries) {
      if (!time.eq(geometry.note.time, tick)) continue;
      const headWidth = geometry.headHalfWidth + padding;
      intervals.push([geometry.x - headWidth, geometry.x + headWidth]);
      intervals.push([Math.min(geometry.x, geometry.stemTipX) - padding, Math.max(geometry.x, geometry.stemTipX) + padding]);
    }
    chordConnectors
      .filter((connector) => connector.staveId === stave.id && time.eq(connector.tick, tick))
      .forEach((connector) => intervals.push([connector.x1 - padding, connector.x2 + padding]));
    for (const beam of beamGeometries) {
      if (beam.staveId !== stave.id) continue;
      if (!time.ge(tick, beam.startTick) || !time.le(tick, beam.endTick)) continue;
      const ratio = (tick - beam.startTick) / (beam.endTick - beam.startTick);
      const startCenter = (beam.polygon[0][0] + beam.polygon[3][0]) * 0.5;
      const endCenter = (beam.polygon[1][0] + beam.polygon[2][0]) * 0.5;
      const beamX = startCenter + (endCenter - startCenter) * ratio;
      intervals.push([beamX - padding, beamX + padding]);
      beam.connectors.filter((connector) => time.eq(yAt(tick), connector[1])).forEach(([x1, , x2]) => intervals.push([Math.min(x1, x2) - padding, Math.max(x1, x2) + padding]));
    }
    return intervals
      .map(([start, end]) => [Math.max(mmToPixels(inputBounds[0]), start), Math.min(mmToPixels(inputBounds[1]), end)] as [number, number])
      .filter(([start, end]) => end > start)
      .sort(([left], [right]) => left - right)
      .reduce<[number, number][]>((merged, interval) => {
        const previous = merged.at(-1);
        if (previous && interval[0] <= previous[1]) previous[1] = Math.max(previous[1], interval[1]);
        else merged.push(interval);
        return merged;
      }, []);
  };
  const segmentedLine = (tick: number, className: string, strokeWidth?: number, stroke?: string, strokeDasharray?: string) => {
    const y = yAt(tick);
    const left = mmToPixels(inputBounds[0]);
    const right = mmToPixels(inputBounds[1]);
    let cursor = left;
    const segments: ReactNode[] = [];
    notationCutsAt(tick).forEach(([start, end], index) => {
      if (start > cursor) segments.push(<line key={`before-${index}`} x1={cursor} x2={start} y1={y} y2={y} className={className} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={strokeDasharray} />);
      cursor = Math.max(cursor, end);
    });
    if (cursor < right) segments.push(<line key="after" x1={cursor} x2={right} y1={y} y2={y} className={className} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={strokeDasharray} />);
    return segments;
  };
  const segmentedStaveLine = (tick: number, bounds: [number, number], staveId: string, keyPrefix: string, className: string, strokeWidth?: number, stroke?: string, strokeDasharray?: string) => {
    const padding = mmToPixels(2 * document.layout.scale);
    const cuts = [
      ...renderedNoteGeometries
        .filter((geometry) => geometry.staveId === staveId && time.eq(geometry.note.time, tick))
        .flatMap((geometry) => [
          [geometry.x - geometry.headHalfWidth - padding, geometry.x + geometry.headHalfWidth + padding] as [number, number],
          [Math.min(geometry.x, geometry.stemTipX) - padding, Math.max(geometry.x, geometry.stemTipX) + padding] as [number, number],
        ]),
      ...chordConnectors
        .filter((connector) => connector.staveId === staveId && time.eq(connector.tick, tick))
        .map((connector) => [connector.x1 - padding, connector.x2 + padding] as [number, number]),
      ...beamGeometries
        .filter((beam) => beam.staveId === staveId && time.ge(tick, beam.startTick) && time.le(tick, beam.endTick))
        .flatMap((beam) => {
          const ratio = (tick - beam.startTick) / (beam.endTick - beam.startTick);
          const startCenter = (beam.polygon[0][0] + beam.polygon[3][0]) * 0.5;
          const endCenter = (beam.polygon[1][0] + beam.polygon[2][0]) * 0.5;
          const beamX = startCenter + (endCenter - startCenter) * ratio;
          return [
            [beamX - padding, beamX + padding] as [number, number],
            ...beam.connectors.filter((connector) => time.eq(yAt(tick), connector[1])).map(([x1, , x2]) => [Math.min(x1, x2) - padding, Math.max(x1, x2) + padding] as [number, number]),
          ];
        }),
    ]
      .map(([start, end]) => [Math.max(mmToPixels(bounds[0]), start), Math.min(mmToPixels(bounds[1]), end)] as [number, number])
      .filter(([start, end]) => end > start)
      .sort(([left], [right]) => left - right);
    const y = yAt(tick);
    const left = mmToPixels(bounds[0]);
    const right = mmToPixels(bounds[1]);
    let cursor = left;
    const segments: ReactNode[] = [];
    cuts.forEach(([start, end], index) => {
      if (start > cursor) segments.push(<line key={`${keyPrefix}-before-${index}`} x1={cursor} x2={start} y1={y} y2={y} className={className} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={strokeDasharray} />);
      cursor = Math.max(cursor, end);
    });
    if (cursor < right) segments.push(<line key={`${keyPrefix}-after`} x1={cursor} x2={right} y1={y} y2={y} className={className} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={strokeDasharray} />);
    return segments;
  };
  const segmentedBarlineConnector = (tick: number, bounds: [number, number], keyPrefix: string, className: string, strokeWidth?: number) => {
    const padding = mmToPixels(2 * document.layout.scale);
    const cuts = [
      ...renderedNoteGeometries
        .filter((geometry) => time.eq(geometry.note.time, tick))
        .flatMap((geometry) => [
          [geometry.x - geometry.headHalfWidth - padding, geometry.x + geometry.headHalfWidth + padding] as [number, number],
          [Math.min(geometry.x, geometry.stemTipX) - padding, Math.max(geometry.x, geometry.stemTipX) + padding] as [number, number],
        ]),
      ...chordConnectors
        .filter((connector) => time.eq(connector.tick, tick))
        .map((connector) => [connector.x1 - padding, connector.x2 + padding] as [number, number]),
    ]
      .map(([start, end]) => [Math.max(mmToPixels(bounds[0]), start), Math.min(mmToPixels(bounds[1]), end)] as [number, number])
      .filter(([start, end]) => end > start)
      .sort(([left], [right]) => left - right)
      .reduce<[number, number][]>((merged, interval) => {
        const previous = merged.at(-1);
        if (previous && interval[0] <= previous[1]) previous[1] = Math.max(previous[1], interval[1]);
        else merged.push(interval);
        return merged;
      }, []);
    const left = mmToPixels(bounds[0]);
    const right = mmToPixels(bounds[1]);
    const y = yAt(tick);
    let cursor = left;
    const segments: ReactNode[] = [];
    cuts.forEach(([start, end], index) => {
      if (start > cursor) segments.push(<line key={`${keyPrefix}-before-${index}`} x1={cursor} x2={start} y1={y} y2={y} className={className} strokeWidth={strokeWidth} />);
      cursor = Math.max(cursor, end);
    });
    if (cursor < right) segments.push(<line key={`${keyPrefix}-after`} x1={cursor} x2={right} y1={y} y2={y} className={className} strokeWidth={strokeWidth} />);
    return segments;
  };
  const dashPatternPixels = (values: readonly number[], patternScale = 1) => {
    if (!values.length) return undefined;
    const pattern = values.length === 1
      ? values[0] === 0 ? [2, 2] : [values[0], values[0]]
      : values.map((value, index) => value === 0 ? index % 2 === 0 ? 0.1 : 2 : value);
    return pattern.map((value) => mmToPixels(value * patternScale)).join(" ");
  };
  const fullStaveLine = (tick: number, bounds: [number, number], key: string, className: string, strokeWidth?: number) => <line key={key} x1={mmToPixels(bounds[0])} x2={mmToPixels(bounds[1])} y1={yAt(tick)} y2={yAt(tick)} className={className} strokeWidth={strokeWidth} />;
  const isFinalSystem = document.pages.at(-1)?.systems.at(-1)?.id === system.id;
  const indicatorScale = document.layout.scale * stave.scale;
  const indicatorLaneWidth = document.layout.time_signature_indicator_lane_width_mm * indicatorScale;
  const indicatorHalfSpan = 3 * indicatorScale;
  const indicatorFontPixels = (points: number) => mmToPixels(points * (25.4 / 72) * indicatorScale);
  const beamRightAt = (tick: number) => {
    const rightEdges = beamGeometries
      .filter((beam) => time.ge(tick, beam.startTick) && time.le(tick, beam.endTick))
      .flatMap((beam) => beam.polygon.map(([x]) => x));
    return rightEdges.length ? Math.max(...rightEdges) : null;
  };
  const measureNumberTicks = document.layout.measure_numbers_visible && document.layout.measure_numbering_placement !== "off"
    ? visibleMeasures.slice(0, -1).filter((_, index) => document.layout.measure_numbering_placement === "barline" || index === 0)
    : [];
  const measureNumberGeometry = (tick: number, index: number) => {
    const measureFont = document.layout.measure_numbering_font;
    const fontSize = indicatorFontPixels(measureFont.size_pt);
    const numberText = `${system.first_measure_number + index}`;
    const numberWidth = measureTextWidth(numberText, resolveWebSafeFontFamily(measureFont.family), fontSize, measureFont.bold, measureFont.italic);
    const textTop = yAt(tick) + mmToPixels(document.layout.grid_barline_thickness_mm * indicatorScale * 0.5 + 1);
    const textBottom = textTop + fontSize;
    const notationRightBase = mmToPixels(rightmostStaveBound[1]);
    let notationRight = Math.max(notationRightBase, beamRightAt(tick) ?? Number.NEGATIVE_INFINITY);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const labelLeft = notationRight + mmToPixels(6.5 * indicatorScale);
      const labelRight = labelLeft + numberWidth;
      const collidingRight = Math.max(
        notationRightBase,
        ...noteGeometries
          .filter((geometry) => geometry.end >= textTop
            && geometry.start <= textBottom
            && Math.max(geometry.x + geometry.headHalfWidth, geometry.x, geometry.stemTipX) >= labelLeft
            && Math.min(geometry.x - geometry.headHalfWidth, geometry.x, geometry.stemTipX) <= labelRight)
          .flatMap((geometry) => [geometry.x + geometry.headHalfWidth, Math.max(geometry.x, geometry.stemTipX)]),
        ...beamGeometries
          .filter((beam) => polygonOverlapsRect(beam.polygon, labelLeft, textTop, labelRight, textBottom))
          .flatMap((beam) => beam.polygon.map(([x]) => x)),
        ...ledgers
          .filter((ledger) => mmToPixels(ledger.endYmm) >= textTop && mmToPixels(ledger.startYmm) <= textBottom)
          .filter((ledger) => {
            const halfWidth = mmToPixels(ledger.widthMm) * 0.5;
            const x = mmToPixels(ledger.xMm);
            return x + halfWidth >= labelLeft && x - halfWidth <= labelRight;
          })
          .map((ledger) => mmToPixels(ledger.xMm) + mmToPixels(ledger.widthMm) * 0.5),
      );
      if (collidingRight <= notationRight) break;
      notationRight = collidingRight;
    }
    const numberX = notationRight + mmToPixels(6.5 * indicatorScale);
    return { measureFont, fontSize, numberText, textTop, numberX, numberRight: numberX + numberWidth };
  };
  const measureNumberRightEdges = new Map(measureNumberTicks.map((tick, index) => [tick, measureNumberGeometry(tick, index).numberRight]));
  const tempoMarkerGeometry = (tempo: TempoEvent) => {
    const fontSize = document.layout.tempo_font.size_pt * 25.4 / 72 * PIXELS_PER_MM * document.layout.scale * stave.scale;
    const textWidth = Math.max(PIXELS_PER_MM, measureTextWidth(`${tempo.tempo}`, resolveWebSafeFontFamily(document.layout.tempo_font.family), fontSize, document.layout.tempo_font.bold, document.layout.tempo_font.italic));
    const beamRight = beamRightAt(tempo.start_tick);
    const baseLeft = Math.max(
      mmToPixels(rightmostStaveBound[1] + tempo.x_offset_mm),
      beamRight === null ? Number.NEGATIVE_INFINITY : beamRight + mmToPixels(indicatorScale),
    );
    const measureNumberRight = measureNumberRightEdges.get(tempo.start_tick);
    const textLeft = measureNumberRight === undefined ? baseLeft : Math.max(baseLeft, measureNumberRight + mmToPixels(indicatorScale));
    const startY = yAt(tempo.start_tick);
    const endY = yAt(Math.min(system.end_tick, tempo.start_tick + tempo.duration_ticks));
    const hookRight = textLeft + textWidth + Math.max(mmToPixels(0.6), fontSize * 0.7);
    return { textLeft, textWidth, startY, endY: Math.max(startY + 1, endY), hookRight, fontSize };
  };
  const tempoTargetAt = (xMm: number, yMm: number): TempoEvent | null => {
    const x = mmToPixels(xMm);
    const y = mmToPixels(yMm);
    return document.timeline_events.find((tempo) => {
      if (tempo.invisible || tempo.start_tick < system.start_tick || tempo.start_tick >= system.end_tick) return false;
      const marker = tempoMarkerGeometry(tempo);
      return x >= marker.textLeft - mmToPixels(2) && x <= marker.hookRight + mmToPixels(2)
        && y >= marker.startY - mmToPixels(2) && y <= marker.endY + mmToPixels(2);
    }) ?? null;
  };
  const klavarskriboValues = (beats: number, grouping: number[]) => {
    const resetBeats = new Set(grouping.filter((beat) => beat >= 1 && beat <= beats));
    const fullGroup = resetBeats.size === beats;
    const middle: number[] = [];
    const groups: { beat: number; value: number }[] = [];
    let middleValue = 1;
    let groupValue = 1;
    for (let beat = 1; beat <= beats; beat += 1) {
      const reset = beat === 1 || (!fullGroup && resetBeats.has(beat));
      if (reset) {
        middleValue = 1;
        if (beat > 1) groupValue += 1;
        groups.push({ beat, value: groupValue });
      } else {
        middleValue += 1;
      }
      middle.push(middleValue);
    }
    return { middle, groups };
  };
  const drawingGroups: Record<SvgDrawLayer, ReactNode> = {
    page_background: null,
    snap_band: document.layout.grid_band_visible ? <g data-export="exclude">
      {staveBounds.flatMap((bounds, staveIndex) => bounds ? snapBands.map((band) => (
        <rect
          key={`${staveIndex}-${band.start}-${band.end}`}
          className="snap-band"
          x={mmToPixels(bounds[0])}
          y={yAt(band.start)}
          width={mmToPixels(bounds[1] - bounds[0])}
          height={yAt(band.end) - yAt(band.start)}
          fill={document.layout.grid_band_color}
        />
      )) : [])}
    </g> : null,
    grid_lines: document.layout.grid_line_visible ? <>
      {visibleGroups.flatMap((tick) => segmentedLine(tick, "grid-line", mmToPixels(document.layout.grid_gridline_thickness_mm * scale), undefined, dashPatternPixels(document.layout.grid_gridline_dash_pattern_mm, scale)).map((line, index) => <g key={`group-${tick}-${index}`}>{line}</g>))}
      {system.staves.slice(1).flatMap((candidate, index) => {
        const bounds = staveBounds[index + 1];
        if (!bounds) return [];
        const candidateScale = document.layout.scale * candidate.scale;
        return visibleGroups.flatMap((tick) => segmentedStaveLine(tick, bounds, candidate.id, `stave-${index + 1}-grid-${tick}`, "grid-line", mmToPixels(document.layout.grid_gridline_thickness_mm * candidateScale), undefined, dashPatternPixels(document.layout.grid_gridline_dash_pattern_mm, candidateScale)));
      })}
    </> : null,
    barlines: document.layout.barline_visible ? <>
      {visibleMeasures.flatMap((tick) => segmentedLine(tick, "measure-line", mmToPixels(document.layout.grid_barline_thickness_mm * scale)).map((line, index) => <g key={`measure-${tick}-${index}`}>{line}</g>))}
      {segmentedLine(system.end_tick, isFinalSystem ? "end-barline" : "measure-line", mmToPixels(document.layout.grid_barline_thickness_mm * scale * (isFinalSystem ? 3 : 1)))}
      {system.staves.slice(1).flatMap((candidate, index) => {
        const bounds = staveBounds[index + 1];
        const candidateScale = document.layout.scale * candidate.scale;
        if (!bounds) return [];
        return [
          ...visibleMeasures.flatMap((tick) => segmentedStaveLine(tick, bounds, candidate.id, `stave-${index + 1}-measure-${tick}`, "measure-line", mmToPixels(document.layout.grid_barline_thickness_mm * candidateScale))),
          ...segmentedStaveLine(system.end_tick, bounds, candidate.id, `stave-${index + 1}-end`, isFinalSystem ? "end-barline" : "measure-line", mmToPixels(document.layout.grid_barline_thickness_mm * candidateScale * (isFinalSystem ? 3 : 1))),
        ];
      })}
      {[...new Set([...visibleMeasures, system.end_tick])].flatMap((tick) => staveBounds.slice(0, -1).flatMap((leftBounds, index) => {
        const rightBounds = staveBounds[index + 1];
        if (!leftBounds || !rightBounds) return [];
        const connectorScale = Math.max(system.staves[index].scale, system.staves[index + 1].scale) * document.layout.scale;
        return segmentedBarlineConnector(tick, [leftBounds[1], rightBounds[0]], `connector-${tick}-${index}`, tick === system.end_tick && isFinalSystem ? "end-barline" : "measure-line", tick === system.end_tick && isFinalSystem ? mmToPixels(document.layout.grid_barline_thickness_mm * connectorScale * 3) : undefined);
      }))}
    </> : null,
    stave_lines: document.layout.stave_visible ? system.staves.flatMap((candidate, index) => naturalLinePitches(candidate).map((pitch) => {
      const style = staveLineStyle(pitch, document.layout, candidate);
      const x = mmToPixels(pitchToXmm(pitch, candidate, staveLeftPositions[index], document.layout));
      return <line key={`${candidate.id}-${pitch}`} x1={x} x2={x} y1={mmToPixels(system.top_mm)} y2={mmToPixels(system.top_mm + system.height_mm)} className="stave-line" style={{ strokeWidth: mmToPixels(style.widthMm), strokeDasharray: dashPatternPixels(style.dashMm) }} />;
    })) : null,
    ledger_lines: document.layout.stave_visible ? ledgers.map((ledger) => (
      <line key={`${ledger.staveId}-${ledger.pitch}-${ledger.startYmm}`} x1={mmToPixels(ledger.xMm)} x2={mmToPixels(ledger.xMm)} y1={mmToPixels(ledger.startYmm)} y2={mmToPixels(ledger.endYmm)} className={ledger.midiOnly ? "stave-line ledger-line midi-ledger" : "stave-line ledger-line"} style={{ strokeWidth: mmToPixels(ledger.widthMm), strokeDasharray: dashPatternPixels(ledger.dashMm) }} />
    )) : null,
    time_signature: document.layout.time_signature_visible ? timeSignatures.flatMap(({ grid, startTick }) => {
      const measureEndTick = Math.min(system.end_tick, startTick + grid.numerator * document.time_per_quarter * 4 / grid.denominator);
      const notationLeft = Math.min(
        mmToPixels(inputBounds[0]),
        ...noteGeometries
          .filter((geometry) => geometry.note.time < measureEndTick && geometry.note.time + geometry.note.duration > startTick)
          .flatMap((geometry) => [geometry.x - mmToPixels(noteWidthMm), Math.min(geometry.x, geometry.stemTipX)]),
        ...beamGeometries
          .filter((beam) => beam.startTick < measureEndTick && beam.endTick > startTick)
          .flatMap((beam) => beam.polygon.map(([x]) => x)),
      );
      const laneRight = Math.min(leftmostStaveBound[0], notationLeft / PIXELS_PER_MM) - 1.5 * indicatorScale;
      const laneLeft = laneRight - indicatorLaneWidth;
      const indicatorColumnWidth = indicatorLaneWidth / 3;
      const indicatorPositions = {
        left: laneLeft + indicatorColumnWidth * 0.5,
        middle: laneLeft + indicatorColumnWidth * 1.5,
        right: laneLeft + indicatorColumnWidth * 2.5,
      };
      const indicatorY = yAt(startTick);
      const classical = document.layout.time_signature_indicator_type === "classical" || document.layout.time_signature_indicator_type === "classical & klavarskribo";
      const klavarskribo = document.layout.time_signature_indicator_type === "klavarskribo" || document.layout.time_signature_indicator_type === "classical & klavarskribo";
      const beatTicks = document.time_per_quarter * 4 / grid.denominator;
      const { middle, groups: klavarskriboGroups } = klavarskriboValues(grid.numerator, grid.beat_grouping);
      const classicFont = document.layout.time_signature_indicator_classic_font;
      const klavarskriboFont = document.layout.time_signature_indicator_klavarskribo_font;
      const classicTextOffset = indicatorHalfSpan + classicFont.size_pt * (25.4 / 72) * indicatorScale * 0.5;
      return [
        classical && <g key={`classic-${startTick}`} className="time-signature classical">
          <text x={mmToPixels(indicatorPositions.right)} y={indicatorY - mmToPixels(classicTextOffset)} textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: resolveWebSafeFontFamily(classicFont.family), fontSize: indicatorFontPixels(classicFont.size_pt), fontWeight: classicFont.bold ? 700 : 400, fontStyle: classicFont.italic ? "italic" : "normal", stroke: "none" }}>{grid.numerator}</text>
          <line x1={mmToPixels(indicatorPositions.right - indicatorHalfSpan)} x2={mmToPixels(indicatorPositions.right + indicatorHalfSpan)} y1={indicatorY} y2={indicatorY} strokeWidth={mmToPixels(document.layout.time_signature_indicator_divide_guide_thickness_mm * indicatorScale)} />
          <text x={mmToPixels(indicatorPositions.right)} y={indicatorY + mmToPixels(classicTextOffset)} textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: resolveWebSafeFontFamily(classicFont.family), fontSize: indicatorFontPixels(classicFont.size_pt), fontWeight: classicFont.bold ? 700 : 400, fontStyle: classicFont.italic ? "italic" : "normal", stroke: "none" }}>{grid.denominator}</text>
        </g>,
        klavarskribo && <g key={`klavarskribo-${startTick}`} className="time-signature klavarskribo">
          {Array.from({ length: grid.numerator + 1 }, (_, beat) => <line key={`guide-${beat}`} x1={mmToPixels(indicatorPositions.right - indicatorHalfSpan)} x2={mmToPixels(indicatorPositions.right + indicatorHalfSpan)} y1={yAt(startTick + beat * beatTicks)} y2={yAt(startTick + beat * beatTicks)} strokeWidth={mmToPixels(document.layout.time_signature_indicator_guide_thickness_mm * indicatorScale)} />)}
          {middle.map((value, index) => <text key={`beat-${index}`} x={mmToPixels(indicatorPositions.middle)} y={yAt(startTick + index * beatTicks)} textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: resolveWebSafeFontFamily(klavarskriboFont.family), fontSize: indicatorFontPixels(klavarskriboFont.size_pt), fontWeight: klavarskriboFont.bold ? 700 : 400, fontStyle: klavarskriboFont.italic ? "italic" : "normal", stroke: "none" }}>{value}</text>)}
          <text x={mmToPixels(indicatorPositions.middle)} y={yAt(startTick + grid.numerator * beatTicks)} textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: resolveWebSafeFontFamily(klavarskriboFont.family), fontSize: indicatorFontPixels(klavarskriboFont.size_pt), fontWeight: klavarskriboFont.bold ? 700 : 400, fontStyle: klavarskriboFont.italic ? "italic" : "normal", stroke: "none" }}>1</text>
          {klavarskriboGroups.map(({ beat, value }) => <text key={`group-${beat}`} x={mmToPixels(indicatorPositions.left)} y={yAt(startTick + (beat - 1) * beatTicks)} textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: resolveWebSafeFontFamily(klavarskriboFont.family), fontSize: indicatorFontPixels(klavarskriboFont.size_pt), fontWeight: klavarskriboFont.bold ? 700 : 400, fontStyle: klavarskriboFont.italic ? "italic" : "normal", stroke: "none" }}>{value}</text>)}
        </g>,
      ];
    }) : null,
    measure_numbers: measureNumberTicks.map((tick, index) => {
      const { measureFont, fontSize, numberText, textTop, numberX, numberRight } = measureNumberGeometry(tick, index);
      return <g key={`number-${tick}`}>
        {document.layout.measure_numbering_guide_visible && <line className="measure-numbering-guide" x1={mmToPixels(rightmostStaveBound[1])} x2={numberRight} y1={yAt(tick)} y2={yAt(tick)} style={{ stroke: "var(--notation-color)", strokeWidth: mmToPixels(document.layout.measure_numbering_guide_thickness_mm * indicatorScale), strokeDasharray: dashPatternPixels(document.layout.measure_numbering_guide_dash_pattern_mm, indicatorScale) }} />}
        <text x={numberX} y={textTop} className="measure-number" dominantBaseline="hanging" style={{ fontFamily: resolveWebSafeFontFamily(measureFont.family), fontSize, fontWeight: measureFont.bold ? 700 : 400, fontStyle: measureFont.italic ? "italic" : "normal" }}>{numberText}</text>
      </g>;
    }),
    tempo: document.layout.tempo_indicator_visible ? document.timeline_events
      .filter((tempo) => !tempo.invisible && tempo.start_tick >= system.start_tick && tempo.start_tick < system.end_tick)
      .map((tempo) => {
        const marker = tempoMarkerGeometry(tempo);
        const font = document.layout.tempo_font;
        return <g key={tempo.id} className="tempo-marker">
          <path d={`M ${marker.textLeft} ${marker.startY} L ${marker.hookRight} ${marker.startY} L ${marker.hookRight} ${marker.endY} M ${marker.textLeft} ${marker.endY} L ${marker.hookRight} ${marker.endY}`} fill="none" stroke="var(--notation-color)" strokeWidth={Math.max(0.6, marker.fontSize * 0.04)} strokeDasharray={`${mmToPixels(0.5)} ${mmToPixels(1)}`} />
          <text x={marker.textLeft} y={(marker.startY + marker.endY) / 2} dominantBaseline="middle" style={{ fontFamily: resolveWebSafeFontFamily(font.family), fontSize: marker.fontSize, fontWeight: font.bold ? 700 : 400, fontStyle: font.italic ? "italic" : "normal", textDecoration: font.underline ? "underline" : "none" }}>{tempo.tempo}</text>
        </g>;
      }) : null,
    count_lines: document.layout.countline_visible ? staveTargets.flatMap((target) => {
      const metrics = countLineMetrics(target);
      return target.stave.events.filter((event): event is CountLineEvent => event.type === "count_line" && event.start_tick >= system.start_tick && event.start_tick < system.end_tick).map((line) => {
        const startX = metrics.centreX + metrics.clamp(line.rpitch1) * metrics.semitonePx;
        const endX = metrics.centreX + metrics.clamp(line.rpitch2) * metrics.semitonePx;
        const y = yAt(line.start_tick);
        return <g key={`${target.stave.id}-${line.id}`} className="count-line"><line x1={Math.min(startX, endX)} x2={Math.max(startX, endX)} y1={y} y2={y} stroke="var(--notation-color)" strokeWidth={mmToPixels(document.layout.countline_thickness_mm * metrics.scale)} strokeDasharray={dashPatternPixels(document.layout.countline_dash_pattern, metrics.scale)} />{activeTool === "count_line" && <><rect fill="var(--accent)" x={startX - metrics.handleSize / 2} y={y - metrics.handleSize / 2} width={metrics.handleSize} height={metrics.handleSize} /><rect fill="var(--accent)" x={endX - metrics.handleSize / 2} y={y - metrics.handleSize / 2} width={metrics.handleSize} height={metrics.handleSize} /></>}</g>;
      });
    }) : null,
    midi_body: document.layout.note_midinote_visible ? <>
      {renderedNoteGeometriesInPaintOrder.map((geometry) => {
        const bodyPath = `M ${geometry.body.map(([pointX, pointY]) => `${pointX} ${pointY}`).join(" L ")} Z`;
        const bodyColor = selectedNoteIds.has(geometry.note.id) ? "var(--accent)" : geometry.note.color === "auto" ? (geometry.note.hand === "left" ? document.layout.note_midinote_left_color : document.layout.note_midinote_right_color) : geometry.note.color;
        return <path key={geometry.note.id} d={bodyPath} fill={bodyColor} />;
      })}
    </> : null,
    notes: <>
      {renderedNoteGeometries.map((geometry) => {
        const stopPath = geometry.stop ? `M ${geometry.stop.map(([pointX, pointY]) => `${pointX} ${pointY}`).join(" L ")}` : null;
        const selected = selectedNoteIds.has(geometry.note.id);
        const notationColor = selected ? "var(--accent)" : "var(--notation-color)";
        return (
          <g key={geometry.note.id} className={`score-note ${geometry.note.hand}`}>
            {document.layout.note_head_visible && !geometry.note.continues_from_previous && (geometry.form === "cross" ? <path d={`M ${geometry.x - geometry.headHalfWidth} ${geometry.start} L ${geometry.x + geometry.headHalfWidth} ${geometry.start + geometry.noteHeightPx} M ${geometry.x + geometry.headHalfWidth} ${geometry.start} L ${geometry.x - geometry.headHalfWidth} ${geometry.start + geometry.noteHeightPx}`} className="note-outline" style={{ stroke: notationColor }} /> : <path d={geometry.headPath} style={{ fill: selected ? "var(--accent)" : geometry.filled ? "var(--notation-color)" : "#fffefa", stroke: notationColor }} className={`note-outline ${geometry.filled ? "black-notehead" : "white-notehead"}`} />)}
            {document.layout.note_stem_visible && <line x1={geometry.x} y1={geometry.start} x2={geometry.stemTipX} y2={geometry.start} className="note-stem" style={{ stroke: notationColor }} strokeWidth={geometry.noteStrokePx} />}
            {document.layout.note_stop_visible && stopPath && <path d={stopPath} className="note-stop" strokeWidth={geometry.stopStrokePx} />}
            {document.layout.note_continuation_dot_visible && geometry.dots.map(([dotX, dotY], index) => <circle key={index} cx={dotX} cy={dotY} r={geometry.dotRadiusPx} className="continuation-dot" />)}
          </g>
        );
      })}
      {chordConnectors.map((connector) => <line key={`${connector.staveId}-${connector.tick}-${connector.x1}-${connector.x2}`} x1={connector.x1} y1={connector.y} x2={connector.x2} y2={connector.y} className="note-stem" strokeWidth={connector.strokeWidth} />)}
    </>,
    beams: document.layout.beam_visible ? beamGeometries.map((beam) => (
      <g key={beam.id} className="beam">
        <path d={`M ${beam.polygon.map(([pointX, pointY]) => `${pointX} ${pointY}`).join(" L ")} Z`} />
        {beam.connectors.map(([x1, y1, x2, y2], index) => <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={beam.strokeWidth} />)}
      </g>
    )) : null,
    editor_controls: <g className="editor-only measure-controls" data-export="exclude">
      {system.staves.map((candidate, index) => {
        if (candidate.id !== hoveredStaveControlId) return null;
        const bounds = staveBoundsMm(system, candidate, document.layout, staveLeftPositions[index], false);
        const controlX = mmToPixels(bounds ? (bounds[0] + bounds[1]) * 0.5 : staveLeftPositions[index]);
        const controlY = mmToPixels(system.top_mm - 4);
        return <g key={candidate.id} className="stave-control" role="button" aria-label={`Configure ${candidate.name || `stave ${index + 1}`}`} tabIndex={0} onClick={(event) => { event.stopPropagation(); onOpenStaveMenu({ systemId: system.id, staveId: candidate.id, x: event.clientX, y: event.clientY }); }}>
          <rect x={controlX - 7.5} y={controlY - 7.5} width="15" height="15" />
          {[-3, 0, 3].map((offset) => <circle key={offset} cx={controlX} cy={controlY + offset} r="0.9" />)}
        </g>;
      })}
      {isFinalSystem && <>
      {(["+", "-"] as const).map((symbol, index) => {
        const x = (systemBounds[0] + systemBounds[1]) / 2 + (index === 0 ? -3.5 : 3.5);
        const y = system.top_mm + system.height_mm + 4.5;
        return <g key={symbol} className="measure-control" role="button" aria-label={symbol === "+" ? "Add measure" : "Remove final measure"} onClick={(event) => { event.stopPropagation(); onEdit((editableDocument) => symbol === "+" ? addMeasure(editableDocument) : removeMeasure(editableDocument), symbol === "+" ? "Measure added" : "Final measure removed"); }}>
          <rect x={mmToPixels(x - 2.5)} y={mmToPixels(y - 2.5)} width={mmToPixels(5)} height={mmToPixels(5)} />
          <text x={mmToPixels(x)} y={mmToPixels(y)} textAnchor="middle" dominantBaseline="middle">{symbol}</text>
        </g>;
      })}
      </>}
    </g>,
    break_overlay: activeTool === "break" ? <g className="system-break-overlay" data-export="exclude">
      {systemBreakTarget && <line x1={mmToPixels(systemBounds[0])} x2={mmToPixels(systemBounds[1])} y1={systemBreakTarget.kind === "split" ? yAt(systemBreakTarget.time) : mmToPixels(systemBreakTarget.boundary === "top" ? system.top_mm : system.top_mm + system.height_mm)} y2={systemBreakTarget.kind === "split" ? yAt(systemBreakTarget.time) : mmToPixels(systemBreakTarget.boundary === "top" ? system.top_mm : system.top_mm + system.height_mm)} className="system-break-highlight" />}
      {system.force_page_break_before && <line x1={mmToPixels(systemBounds[0])} x2={mmToPixels(systemBounds[1])} y1={mmToPixels(system.top_mm - 3)} y2={mmToPixels(system.top_mm - 3)} className="page-break-guide" />}
    </g> : null,
    meter_overlay: activeTool === "meter" ? <g className="time-signature-overlay" data-export="exclude" pointerEvents="none">
      {meterTarget?.kind === "barline" && <line x1={mmToPixels(leftmostStaveBound[0])} x2={mmToPixels(rightmostStaveBound[1])} y1={yAt(meterTarget.time)} y2={yAt(meterTarget.time)} stroke="var(--accent)" strokeWidth={2} />}
      {meterTarget?.kind === "grid" && segmentedLine(meterTarget.time, "time-signature-gridline-highlight", 2, "var(--accent)").map((line, index) => <g key={`meter-grid-${meterTarget.time}-${index}`}>{line}</g>)}
    </g> : null,
    selection_overlay: <g className="selection-overlay" data-export="exclude" pointerEvents="none">
      {selectionRect && <rect x={Math.min(selectionRect.startX, selectionRect.endX)} y={Math.min(selectionRect.startY, selectionRect.endY)} width={Math.abs(selectionRect.endX - selectionRect.startX)} height={Math.abs(selectionRect.endY - selectionRect.startY)} fill="var(--accent)" fillOpacity={0.15} stroke="var(--accent)" strokeWidth={1.5} />}
    </g>,
    playhead: playbackTick !== null && playbackTick >= system.start_tick && playbackTick <= system.end_tick ? <g className="playhead" data-export="exclude" pointerEvents="none">
      <line x1={mmToPixels(systemBounds[0])} x2={mmToPixels(systemBounds[1])} y1={yAt(playbackTick)} y2={yAt(playbackTick)} />
    </g> : null,
    input_overlay: previewGeometry ? <g className="note-input-preview" data-export="exclude">
      {document.layout.note_midinote_visible && <path d={`M ${previewGeometry.body.map(([pointX, pointY]) => `${pointX} ${pointY}`).join(" L ")} Z`} />}
      {document.layout.note_head_visible && <path d={previewGeometry.headPath} className="note-input-preview-head" style={{ fill: previewGeometry.isBlackKey ? "#000" : "none", stroke: "#000" }} strokeWidth={previewGeometry.noteStrokePx} />}
      {document.layout.note_stem_visible && <line x1={previewGeometry.x} y1={previewGeometry.start} x2={previewGeometry.stemTipX} y2={previewGeometry.start} stroke="#000" strokeWidth={previewGeometry.noteStrokePx} />}
      {document.layout.note_stop_visible && <path d={`M ${previewGeometry.stop.map(([pointX, pointY]) => `${pointX} ${pointY}`).join(" L ")}`} fill="none" strokeWidth={previewGeometry.stopStrokePx} />}
      {document.layout.note_continuation_dot_visible && previewGeometry.dots.map(([x, y], index) => <circle key={index} cx={x} cy={y} r={previewGeometry.dotRadiusPx} />)}
    </g> : null,
    page_number: null,
  };

  return (
    <g
      onClick={(event) => { if (selectedNoteIds.size) onClearSelection(); else { editSystemBreak(event); editTimeSignature(event); editTempo(event); } }}
      onPointerDown={(event) => { if (!startSelectionDrag(event) && !startCountLineDrag(event)) startNoteDrag(event); }}
      onPointerOver={(event) => { updateSystemBreakHover(event); updateMeterHover(event); updateStaveControlHover(event); updatePasteTarget(event); }}
      onPointerMove={(event) => { updateSystemBreakHover(event); updateMeterHover(event); updateStaveControlHover(event); updatePasteTarget(event); if (!updateSelectionDrag(event) && !updateCountLineDrag(event)) updateNoteDrag(event); }}
      onPointerUp={(event) => { if (!endSelectionDrag(event) && !endCountLineDrag(event)) endNoteDrag(event); }}
      onPointerCancel={(event) => { if (!endSelectionDrag(event) && !endCountLineDrag(event)) endNoteDrag(event); }}
      onPointerLeave={() => { clearInputPreview(); clearSystemBreakHover(); setMeterTarget(null); setHoveredStaveControlId(null); }}
      onContextMenu={(event) => {
        if (suppressContextMenuRef.current) {
          suppressContextMenuRef.current = false;
          event.preventDefault();
          return;
        }
        if (activeTool === "count_line") {
          if (removeCountLineAt(event)) event.preventDefault();
          return;
        }
        if (selectedNoteIds.size) {
          onClearSelection();
          event.preventDefault();
          return;
        }
        removeNoteAt(event);
        removeTimeSignatureGridLine(event);
        removeTempo(event);
      }}
    >
      <rect x={mmToPixels(systemBounds[0])} y={mmToPixels(system.top_mm - 10)} width={mmToPixels(systemBounds[1] - systemBounds[0])} height={mmToPixels(system.height_mm + 10)} fill="transparent" />
      {SVG_DRAW_LAYERS.map((layer) => <g key={layer} className={`svg-layer svg-layer-${layer}`}>{drawingGroups[layer]}</g>)}
    </g>
  );
}

function PaperPreview({ document, pageIndex, activeTool, snapTicks, onEdit, onOpenStaveMenu, onOpenTimeSignatureDialog, onOpenTempoDialog, selectedNoteIds, onSelectionChange, onClearSelection, onPasteTargetChange, onAuditionNote, playbackTick, exportOnly = false }: {
  document: KeyTabDocument;
  pageIndex: number;
  activeTool: Tool;
  snapTicks: number;
  onEdit: (mutate: (document: KeyTabDocument) => void, message: string) => void;
  onOpenStaveMenu: (target: StaveMenuTarget) => void;
  onOpenTimeSignatureDialog: (target: TimeSignatureEditTarget) => void;
  onOpenTempoDialog: (target: TempoEditTarget) => void;
  selectedNoteIds: ReadonlySet<string>;
  onSelectionChange: (noteIds: string[]) => void;
  onClearSelection: () => void;
  onPasteTargetChange: (target: PasteTarget) => void;
  onAuditionNote: (pitch: number, velocity: number) => void;
  playbackTick: number | null;
  exportOnly?: boolean;
}) {
  const page = document.pages[pageIndex];
  const paperWidth = page.width_mm * PIXELS_PER_MM;
  const paperHeight = page.height_mm * PIXELS_PER_MM;
  const metadataFontSize = (points: number) => points * (25.4 / 72) * PIXELS_PER_MM * document.layout.scale;
  const title = document.score_info.title.trim() || "Untitled";
  const composer = document.score_info.composer.trim();
  const copyright = document.score_info.copyright.trim();
  const footer = `Page ${pageIndex + 1} of ${document.pages.length} | ${title}${copyright ? ` | ${copyright}` : ""}`;
  const titleX = document.layout.page_left_margin_mm * PIXELS_PER_MM;
  const titleY = document.layout.page_top_margin_mm * PIXELS_PER_MM;
  const composerX = (page.width_mm - document.layout.page_right_margin_mm) * PIXELS_PER_MM;
  const footerX = document.layout.page_left_margin_mm * PIXELS_PER_MM;
  const footerY = (page.height_mm - document.layout.page_bottom_margin_mm) * PIXELS_PER_MM;
  const pageSelectionDragRef = useRef<{ pointerId: number; startX: number; startY: number; startClientX: number; startClientY: number; rightButton: boolean } | null>(null);
  const suppressPageContextMenuRef = useRef(false);
  const [pageSelectionRect, setPageSelectionRect] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const pageBoundsBySystemId = pageSystemBounds(page, document);
  const pointOnPage = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * paperWidth / bounds.width,
      y: (event.clientY - bounds.top) * paperHeight / bounds.height,
    };
  };
  const selectedNotesOnPage = (rect: { startX: number; startY: number; endX: number; endY: number }) => {
    const left = Math.min(rect.startX, rect.endX);
    const right = Math.max(rect.startX, rect.endX);
    const top = Math.min(rect.startY, rect.endY);
    const bottom = Math.max(rect.startY, rect.endY);
    return page.systems.flatMap((system) => {
      const systemBounds = pageBoundsBySystemId.get(system.id)!;
      const staveLeftPositions = centeredStaveLeftPositions(system, document.layout, ...systemBounds);
      return system.staves.flatMap((stave, staveIndex) => {
        const semitoneMm = staveSemitoneMm(document.layout, stave);
        const noteWidthMm = semitoneMm * document.layout.note_width_scaling;
        const noteHeightMm = semitoneMm * 2 * document.layout.notehead_height_scaling;
        const stemLengthMm = semitoneMm * document.layout.note_stem_length_semitone;
        const notes = stave.events.filter((event): event is NoteEvent => event.type === "note");
        return notes.filter((note) => {
          const x = pitchToXmm(note.pitch, stave, staveLeftPositions[staveIndex], document.layout) * PIXELS_PER_MM;
          const start = (system.top_mm + (note.time - system.start_tick) * system.height_mm / (system.end_tick - system.start_tick)) * PIXELS_PER_MM;
          const end = (system.top_mm + (Math.min(system.end_tick, note.time + note.duration) - system.start_tick) * system.height_mm / (system.end_tick - system.start_tick)) * PIXELS_PER_MM;
          const headHalfWidth = noteWidthMm * blackKeyWidthScale(note.pitch, note.time, notes, document.layout.black_note_rule) * PIXELS_PER_MM;
          const stemTipX = x + (note.hand === "left" ? -1 : 1) * stemLengthMm * PIXELS_PER_MM;
          const noteLeft = x - headHalfWidth;
          const noteRight = Math.max(x + headHalfWidth, stemTipX);
          const noteTop = start - noteHeightMm * PIXELS_PER_MM;
          return noteRight >= left && noteLeft <= right && end >= top && noteTop <= bottom;
        }).map((note) => note.id);
      });
    });
  };
  const startPageSelectionDrag = (event: PointerEvent<SVGSVGElement>) => {
    if (!event.shiftKey && (event.button !== 2 || activeTool === "count_line")) return false;
    const point = pointOnPage(event);
    event.preventDefault();
    event.stopPropagation();
    if (event.button === 2) suppressPageContextMenuRef.current = false;
    pageSelectionDragRef.current = { pointerId: event.pointerId, startX: point.x, startY: point.y, startClientX: event.clientX, startClientY: event.clientY, rightButton: event.button === 2 };
    setPageSelectionRect({ startX: point.x, startY: point.y, endX: point.x, endY: point.y });
    return true;
  };
  const updatePageSelectionDrag = (event: PointerEvent<SVGSVGElement>) => {
    const drag = pageSelectionDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return false;
    const point = pointOnPage(event);
    event.preventDefault();
    event.stopPropagation();
    setPageSelectionRect({ startX: drag.startX, startY: drag.startY, endX: point.x, endY: point.y });
    return true;
  };
  const endPageSelectionDrag = (event: PointerEvent<SVGSVGElement>) => {
    const drag = pageSelectionDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return false;
    const point = pointOnPage(event);
    const rect = { startX: drag.startX, startY: drag.startY, endX: point.x, endY: point.y };
    pageSelectionDragRef.current = null;
    event.preventDefault();
    event.stopPropagation();
    setPageSelectionRect(null);
    const moved = Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY);
    if (!drag.rightButton || moved >= 3) onSelectionChange(selectedNotesOnPage(rect));
    if (drag.rightButton && moved >= 3) suppressPageContextMenuRef.current = true;
    return true;
  };
  return (
    <svg
      className={`paper${exportOnly ? " export-paper" : ""}${activeTool === "left" || activeTool === "right" ? " is-note-input" : ""}${activeTool === "break" || activeTool === "meter" || activeTool === "tempo" ? " is-system-break" : ""}`}
      viewBox={`0 0 ${paperWidth} ${paperHeight}`}
      role="img"
      aria-label="keyTAB score page"
      onPointerDownCapture={(event) => {
        if (startPageSelectionDrag(event)) return;
        if (selectedNoteIds.size && !event.shiftKey && event.button === 0) {
          onClearSelection();
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onPointerMoveCapture={(event) => { updatePageSelectionDrag(event); }}
      onPointerUpCapture={(event) => { endPageSelectionDrag(event); }}
      onPointerCancelCapture={(event) => { endPageSelectionDrag(event); }}
      onContextMenuCapture={(event) => {
        if (suppressPageContextMenuRef.current) {
          suppressPageContextMenuRef.current = false;
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <g className="svg-layer svg-layer-page_background"><rect width={paperWidth} height={paperHeight} fill="#f4f0f0" /></g>
      {pageIndex === 0 && <g className="score-metadata">
        <text x={titleX} y={titleY} dominantBaseline="hanging" className="score-title" style={{ fontFamily: resolveWebSafeFontFamily(document.layout.font_title.family), fontSize: metadataFontSize(document.layout.font_title.size_pt), fontWeight: document.layout.font_title.bold ? 700 : 400, fontStyle: document.layout.font_title.italic ? "italic" : "normal", textDecoration: document.layout.font_title.underline ? "underline" : "none" }}>{title}</text>
        {composer && <text x={composerX} y={titleY} textAnchor="end" dominantBaseline="hanging" className="score-composer" style={{ fontFamily: resolveWebSafeFontFamily(document.layout.font_composer.family), fontSize: metadataFontSize(document.layout.font_composer.size_pt), fontWeight: document.layout.font_composer.bold ? 700 : 400, fontStyle: document.layout.font_composer.italic ? "italic" : "normal", textDecoration: document.layout.font_composer.underline ? "underline" : "none" }}>{composer}</text>}
      </g>}
      {page.systems.map((system) => <SystemPreview key={system.id} document={document} page={page} system={system} activeTool={activeTool} snapTicks={snapTicks} onEdit={onEdit} onOpenStaveMenu={onOpenStaveMenu} onOpenTimeSignatureDialog={onOpenTimeSignatureDialog} onOpenTempoDialog={onOpenTempoDialog} selectedNoteIds={selectedNoteIds} onSelectionChange={onSelectionChange} onClearSelection={onClearSelection} onPasteTargetChange={onPasteTargetChange} onAuditionNote={onAuditionNote} playbackTick={playbackTick} />)}
      {pageSelectionRect && <g className="selection-overlay" pointerEvents="none" data-export="exclude"><rect x={Math.min(pageSelectionRect.startX, pageSelectionRect.endX)} y={Math.min(pageSelectionRect.startY, pageSelectionRect.endY)} width={Math.abs(pageSelectionRect.endX - pageSelectionRect.startX)} height={Math.abs(pageSelectionRect.endY - pageSelectionRect.startY)} fill="var(--accent)" fillOpacity={0.15} stroke="var(--accent)" strokeWidth={1.5} /></g>}
      <g className="svg-layer svg-layer-page_number"><text x={footerX} y={footerY} dominantBaseline="alphabetic" className="score-footer" style={{ fontFamily: resolveWebSafeFontFamily(document.layout.font_copyright.family), fontSize: metadataFontSize(document.layout.font_copyright.size_pt), fontWeight: document.layout.font_copyright.bold ? 700 : 400, fontStyle: document.layout.font_copyright.italic ? "italic" : "normal", textDecoration: document.layout.font_copyright.underline ? "underline" : "none" }}>{footer}</text></g>
    </svg>
  );
}

export default function App() {
  const [document, setDocument] = useState<KeyTabDocument>(() => createDocument(loadDefaultLayoutTemplate()));
  const [fileName, setFileName] = useState("Untitled.ktw");
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<Tool>("left");
  const [pageIndex, setPageIndex] = useState(0);
  const [snapBase, setSnapBase] = useState(8);
  const [divider, setDivider] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [status, setStatus] = useState("New score");
  const [sessionReady, setSessionReady] = useState(false);
  const [scoreInfoDialogOpen, setScoreInfoDialogOpen] = useState(false);
  const [styleDialogOpen, setStyleDialogOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [discardPrompt, setDiscardPrompt] = useState<{ action: string; resolve: (choice: DiscardChoice) => void } | null>(null);
  const [midiImport, setMidiImport] = useState<{ parsed: ParsedMidiFile; title: string; sourceName: string } | null>(null);
  const [tempoEdit, setTempoEdit] = useState<TempoEditTarget | null>(null);
  const [timeSignatureEdit, setTimeSignatureEdit] = useState<TimeSignatureEditTarget | null>(null);
  const [staveMenu, setStaveMenu] = useState<StaveMenuTarget | null>(null);
  const [staveValueEdit, setStaveValueEdit] = useState<{ target: StaveMenuTarget; setting: StaveSetting } | null>(null);
  const [staveRangeEdit, setStaveRangeEdit] = useState<StaveMenuTarget | null>(null);
  const [globalStavesTarget, setGlobalStavesTarget] = useState<StaveMenuTarget | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [pdfPagesMounted, setPdfPagesMounted] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(() => new Set());
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTick, setPlaybackTick] = useState<number | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const openInputRef = useRef<HTMLInputElement>(null);
  const canvasAreaRef = useRef<HTMLElement>(null);
  const panRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const documentRef = useRef(document);
  const undoStackRef = useRef<KeyTabDocument[]>([]);
  const redoStackRef = useRef<KeyTabDocument[]>([]);
  const noteClipboardRef = useRef<NoteClipboardEntry[]>([]);
  const selectedNoteIdsRef = useRef<Set<string>>(new Set());
  const pasteTargetRef = useRef<PasteTarget | null>(null);
  const desktopFilePathRef = useRef<string | null>(null);
  const fileHandleRef = useRef<StoredFileHandle | null>(null);
  const midiInputRef = useRef<HTMLInputElement>(null);
  const playbackRef = useRef<PlaybackSession | null>(null);
  const playbackTimerRef = useRef<number | null>(null);
  const playbackFrameRef = useRef<number | null>(null);
  const playbackRequestRef = useRef(0);
  const playbackStartingRef = useRef(false);
  const savedDocumentRef = useRef(serializeDocument(document));
  documentRef.current = document;
  const snapTicks = Math.max(1, (256 * 4) / (snapBase * divider));
  const menus = ["File", "Edit", "View", "Help"];

  const editDocument = (mutate: (editableDocument: KeyTabDocument) => void, message: string) => {
    setDocument((currentDocument) => {
      undoStackRef.current.push(structuredClone(currentDocument));
      redoStackRef.current = [];
      const updatedDocument = structuredClone(currentDocument);
      mutate(updatedDocument);
      return updatedDocument;
    });
    setStatus(message);
  };

  const stopPlayback = (message = "Playback stopped") => {
    playbackRequestRef.current += 1;
    playbackStartingRef.current = false;
    playbackRef.current?.stop();
    playbackRef.current = null;
    if (playbackTimerRef.current !== null) window.clearTimeout(playbackTimerRef.current);
    if (playbackFrameRef.current !== null) window.cancelAnimationFrame(playbackFrameRef.current);
    playbackTimerRef.current = null;
    playbackFrameRef.current = null;
    setIsPlaying(false);
    setPlaybackTick(null);
    setStatus(message);
  };

  const playScore = async (startTick = 0) => {
    stopPlayback("Starting playback...");
    const request = playbackRequestRef.current;
    playbackStartingRef.current = true;
    try {
      const session = await startPlayback(documentRef.current, startTick);
      if (request !== playbackRequestRef.current) {
        session?.stop();
        return;
      }
      if (!session) {
        playbackStartingRef.current = false;
        setStatus("No notes to play");
        return;
      }
      playbackRef.current = session;
      playbackStartingRef.current = false;
      setIsPlaying(true);
      const playbackStartedAt = performance.now();
      const updatePlayhead = () => {
        if (playbackRef.current !== session) return;
        setPlaybackTick(Math.min(session.endTick, session.tickAtElapsedMs(performance.now() - playbackStartedAt)));
        playbackFrameRef.current = window.requestAnimationFrame(updatePlayhead);
      };
      updatePlayhead();
      setStatus(startTick > 0 ? "Playing from cursor" : "Playing score");
      playbackTimerRef.current = window.setTimeout(() => {
        if (playbackRef.current !== session) return;
        session.stop();
        playbackRef.current = null;
        playbackTimerRef.current = null;
        if (playbackFrameRef.current !== null) window.cancelAnimationFrame(playbackFrameRef.current);
        playbackFrameRef.current = null;
        setIsPlaying(false);
        setPlaybackTick(null);
        setStatus("Playback finished");
      }, session.durationMs);
    } catch (error) {
      if (request === playbackRequestRef.current) playbackStartingRef.current = false;
      const message = error instanceof Error ? error.message : "Unknown audio error";
      setStatus(`Could not start playback: ${message}`);
    }
  };

  const updateSelectedNoteIds = (noteIds: Iterable<string>) => {
    const next = new Set(noteIds);
    selectedNoteIdsRef.current = next;
    setSelectedNoteIds(next);
  };

  const selectNotes = (noteIds: string[]) => {
    updateSelectedNoteIds(noteIds);
    setStatus(`${noteIds.length} note${noteIds.length === 1 ? "" : "s"} selected`);
  };

  const selectAllObjects = () => {
    const noteIds = documentRef.current.pages
      .flatMap((page) => page.systems)
      .flatMap((system) => system.staves)
      .flatMap((stave) => stave.events)
      .filter((event): event is NoteEvent => event.type === "note")
      .map((note) => note.id);
    selectNotes(noteIds);
  };

  const selectedNotes = (): NoteClipboardEntry[] => documentRef.current.pages
    .flatMap((page) => page.systems)
    .flatMap((system, systemIndex) => system.staves.flatMap((stave, staveIndex) => stave.events
      .filter((event): event is NoteEvent => event.type === "note" && selectedNoteIdsRef.current.has(event.id))
      .map((note) => ({ systemId: system.id, staveId: stave.id, systemIndex, staveIndex, note: structuredClone(note) }))));

  const copySelectedNotes = () => {
    const notes = selectedNotes();
    if (!notes.length) return;
    noteClipboardRef.current = notes;
    setStatus(`${notes.length} note${notes.length === 1 ? "" : "s"} copied`);
  };

  const deleteSelectedNotes = (message = "Selected notes deleted") => {
    if (!selectedNoteIdsRef.current.size) return;
    const noteIds = new Set(selectedNoteIdsRef.current);
    editDocument((editableDocument) => {
      for (const system of editableDocument.pages.flatMap((page) => page.systems)) {
        for (const stave of system.staves) stave.events = stave.events.filter((event) => event.type !== "note" || !noteIds.has(event.id));
      }
    }, message);
    updateSelectedNoteIds([]);
  };

  const pasteSelectedNotes = () => {
    const copied = noteClipboardRef.current;
    if (!copied.length) return;
    const pasteTarget = pasteTargetRef.current;
    if (!pasteTarget) {
      setStatus("Move the mouse over a system before pasting");
      return;
    }
    const firstCopiedTime = Math.min(...copied.map((entry) => entry.note.time));
    const notesToPaste = copied.map((entry) => {
      const note = structuredClone(entry.note);
      note.id = newId();
      note.time = pasteTarget.time + entry.note.time - firstCopiedTime;
      note.continuation_id = null;
      note.continues_from_previous = false;
      note.continues_to_next = false;
      return { staveIndex: entry.staveIndex, note };
    });
    if (!notesToPaste.length) return;
    editDocument((editableDocument) => {
      ensureScoreDuration(editableDocument, Math.max(...notesToPaste.map(({ note }) => note.time + note.duration)));
      const editableSystems = editableDocument.pages.flatMap((page) => page.systems);
      for (const entry of notesToPaste) {
        const system = editableSystems.find((candidate) => candidate.start_tick <= entry.note.time && entry.note.time < candidate.end_tick);
        const stave = system?.staves[entry.staveIndex];
        if (!system || !stave) continue;
        stave.events.push(entry.note);
      }
    }, `${notesToPaste.length} note${notesToPaste.length === 1 ? "" : "s"} pasted`);
    updateSelectedNoteIds(notesToPaste.map((entry) => entry.note.id));
  };

  const setSelectedNotesHand = (hand: NoteEvent["hand"]) => {
    if (!selectedNoteIdsRef.current.size) return;
    const noteIds = new Set(selectedNoteIdsRef.current);
    editDocument((editableDocument) => {
      for (const stave of editableDocument.pages.flatMap((page) => page.systems).flatMap((system) => system.staves)) {
        for (const event of stave.events) if (event.type === "note" && noteIds.has(event.id)) event.hand = hand;
      }
    }, `Selected notes mapped to ${hand} hand`);
  };

  const transposeSelectedNotes = (semitones: number) => {
    if (!selectedNoteIdsRef.current.size) return;
    const selected = selectedNotes();
    if (!selected.length || selected.some(({ note }) => note.pitch + semitones < 0 || note.pitch + semitones > 127)) {
      setStatus("Selected notes cannot be transposed beyond MIDI range");
      return;
    }
    const noteIds = new Set(selectedNoteIdsRef.current);
    editDocument((editableDocument) => {
      for (const stave of editableDocument.pages.flatMap((page) => page.systems).flatMap((system) => system.staves)) {
        for (const event of stave.events) if (event.type === "note" && noteIds.has(event.id)) event.pitch += semitones;
      }
    }, `${selected.length} note${selected.length === 1 ? "" : "s"} transposed ${semitones > 0 ? "up" : "down"}`);
  };

  const shiftSelectedNotes = (ticks: number) => {
    if (!selectedNoteIdsRef.current.size) return;
    const noteIds = new Set(selectedNoteIdsRef.current);
    const selectedSystems = documentRef.current.pages.flatMap((page) => page.systems).map((system) => ({
      system,
      notes: system.staves.flatMap((stave) => stave.events).filter((event): event is NoteEvent => event.type === "note" && noteIds.has(event.id)),
    })).filter(({ notes }) => notes.length);
    if (!selectedSystems.length || selectedSystems.some(({ system, notes }) => notes.some((note) => note.time + ticks < system.start_tick || note.time + ticks + note.duration > system.end_tick))) {
      setStatus("Selected notes cannot move beyond their system");
      return;
    }
    editDocument((editableDocument) => {
      for (const system of editableDocument.pages.flatMap((page) => page.systems)) {
        for (const stave of system.staves) for (const event of stave.events) if (event.type === "note" && noteIds.has(event.id)) event.time += ticks;
      }
    }, `${selectedSystems.reduce((total, { notes }) => total + notes.length, 0)} selected note${selectedSystems.reduce((total, { notes }) => total + notes.length, 0) === 1 ? "" : "s"} moved ${ticks > 0 ? "forward" : "backward"}`);
  };

  const createNewDocument = (template?: ScoreTemplate) => {
    const nextDocument = createDocument(loadDefaultLayoutTemplate(), template);
    undoStackRef.current = [];
    redoStackRef.current = [];
    desktopFilePathRef.current = null;
    fileHandleRef.current = null;
    void clearLastFileHandle();
    savedDocumentRef.current = serializeDocument(nextDocument);
    setIsDirty(false);
    setDocument(nextDocument);
    setFileName("Untitled.ktw");
    setPageIndex(0);
    setStatus(template ? `New ${template} template` : "New score");
  };

  const undoDocument = () => {
    const previous = undoStackRef.current.pop();
    if (!previous) {
      setStatus("Nothing to undo");
      return;
    }
    setDocument((currentDocument) => {
      redoStackRef.current.push(structuredClone(currentDocument));
      return previous;
    });
    setPageIndex((current) => Math.min(current, previous.pages.length - 1));
    setStatus("Undid last change");
  };

  const redoDocument = () => {
    const next = redoStackRef.current.pop();
    if (!next) {
      setStatus("Nothing to redo");
      return;
    }
    setDocument((currentDocument) => {
      undoStackRef.current.push(structuredClone(currentDocument));
      return next;
    });
    setPageIndex((current) => Math.min(current, next.pages.length - 1));
    setStatus("Redid last change");
  };

  const changePage = (offset: number) => {
    setPageIndex((current) => (current + offset + document.pages.length) % document.pages.length);
  };

  const findStave = (target: StaveMenuTarget) => document.pages
    .flatMap((page) => page.systems)
    .find((system) => system.id === target.systemId)
    ?.staves.find((stave) => stave.id === target.staveId) ?? null;

  const editLocalStave = (target: StaveMenuTarget, change: (stave: Stave) => void, message: string) => {
    editDocument((editableDocument) => {
      const editableStave = editableDocument.pages
        .flatMap((page) => page.systems)
        .find((system) => system.id === target.systemId)
        ?.staves.find((stave) => stave.id === target.staveId);
      if (!editableStave) return;
      change(editableStave);
      repaginateDocument(editableDocument);
    }, message);
  };

  const applyGlobalStaveConfiguration = (source: StaveMenuTarget, configuredStaves: StaveConfiguration[]) => {
    editDocument((editableDocument) => {
      const sourceSystem = editableDocument.pages.flatMap((page) => page.systems).find((system) => system.id === source.systemId);
      if (!sourceSystem) return;
      for (const system of editableDocument.pages.flatMap((page) => page.systems)) {
        const existingStaves = system.staves;
        system.staves = configuredStaves.map((configuration) => {
          const targetStave = configuration.sourceIndex === null ? {
            id: newId(),
            name: configuration.name,
            pitch_range: [...configuration.pitch_range] as [number, number],
            scale: configuration.scale,
            left_margin_mm: configuration.left_margin_mm,
            right_margin_mm: configuration.right_margin_mm,
            events: [],
          } : existingStaves[configuration.sourceIndex];
          if (!targetStave) throw new Error("Configured stave does not exist in this system");
          targetStave.name = configuration.name;
          targetStave.pitch_range = [...configuration.pitch_range];
          targetStave.scale = configuration.scale;
          targetStave.left_margin_mm = configuration.left_margin_mm;
          targetStave.right_margin_mm = configuration.right_margin_mm;
          return targetStave;
        });
      }
      repaginateDocument(editableDocument);
    }, "Stave configuration applied globally");
  };

  useEffect(() => {
    let cancelled = false;
    const restoreSession = async () => {
      try {
        const desktopScore = isDesktopApp() ? await loadLastOpenedDesktopScore() : null;
        if (desktopScore) {
          const restoredDocument = deserializeDocument(JSON.parse(desktopScore.contents));
          if (cancelled) return;
          desktopFilePathRef.current = desktopScore.path;
          savedDocumentRef.current = serializeDocument(restoredDocument);
          setIsDirty(false);
          setDocument(restoredDocument);
          setFileName(desktopScore.name);
          setPageIndex(0);
          setStatus(`Restored ${desktopScore.name}`);
          return;
        }
        const handle = isDesktopApp() ? null : await loadLastFileHandle();
        if (handle && handle.name.toLowerCase().endsWith(".ktw")) {
          try {
            const file = await handle.getFile();
            const restoredDocument = deserializeDocument(JSON.parse(await file.text()));
            if (cancelled) return;
            fileHandleRef.current = handle;
            savedDocumentRef.current = serializeDocument(restoredDocument);
            setIsDirty(false);
            setDocument(restoredDocument);
            setFileName(handle.name);
            setPageIndex(0);
            setStatus(`Restored ${handle.name}`);
            return;
          } catch {
            // The browser may have revoked permission or the file may no longer exist; use the recovery snapshot.
          }
        } else if (handle) {
          void clearLastFileHandle();
        }
        const snapshot = await loadSessionSnapshot();
        if (!snapshot) return;
        const restoredDocument = deserializeDocument(JSON.parse(snapshot.contents));
        if (cancelled) return;
        savedDocumentRef.current = "";
        setIsDirty(true);
        setDocument(restoredDocument);
        setFileName(snapshot.fileName.toLowerCase().endsWith(".ktw") ? snapshot.fileName : documentFileName(restoredDocument));
        setPageIndex(Math.min(snapshot.pageIndex, restoredDocument.pages.length - 1));
        setSnapBase(snapshot.snapBase);
        setDivider(snapshot.divider);
        setZoom(snapshot.zoom);
        setStatus("Restored recovery session");
      } catch {
        if (!cancelled) setStatus("Could not restore the previous session");
      } finally {
        if (!cancelled) setSessionReady(true);
      }
    };
    void restoreSession();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    const timer = window.setTimeout(() => {
      void saveSessionSnapshot({
        contents: serializeDocument(document),
        fileName,
        pageIndex,
        snapBase,
        divider,
        zoom,
        savedAt: Date.now(),
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [divider, document, fileName, pageIndex, sessionReady, snapBase, zoom]);

  useEffect(() => {
    if (sessionReady) setIsDirty(serializeDocument(document) !== savedDocumentRef.current);
  }, [document, sessionReady]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (styleDialogOpen || manualOpen) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable='true']")) return;
      if (event.ctrlKey || event.metaKey) {
        const key = event.key.toLowerCase();
        if (key === "o") {
          event.preventDefault();
          void openScore();
        } else if (key === "s") {
          event.preventDefault();
          void saveDocument(event.shiftKey);
        } else if (key === "n") {
          event.preventDefault();
          void requestNewDocument();
        } else if (key === "z") {
          event.preventDefault();
          if (event.shiftKey) redoDocument();
          else undoDocument();
        } else if (key === "y") {
          event.preventDefault();
          redoDocument();
        } else if (key === "a") {
          event.preventDefault();
          selectAllObjects();
        } else if (key === "c") {
          event.preventDefault();
          copySelectedNotes();
        } else if (key === "x") {
          if (!selectedNoteIdsRef.current.size) return;
          event.preventDefault();
          copySelectedNotes();
          deleteSelectedNotes("Selected notes cut");
        } else if (key === "v") {
          event.preventDefault();
          pasteSelectedNotes();
        }
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        if (event.repeat) return;
        if (isPlaying || playbackStartingRef.current) stopPlayback();
        else void playScore(pasteTargetRef.current?.time ?? 0);
      } else if (event.key === ",") {
        event.preventDefault();
        setActiveTool("left");
      } else if (event.key === ".") {
        event.preventDefault();
        setActiveTool("right");
      } else if (event.key.toLowerCase() === "b") {
        event.preventDefault();
        setActiveTool("break");
      } else if (event.key.toLowerCase() === "a") {
        event.preventDefault();
        setActiveTool("arpeggio");
      } else if (event.key.toLowerCase() === "t") {
        event.preventDefault();
        setActiveTool(event.shiftKey ? "tempo" : "meter");
      } else if (event.key === "ArrowLeft" && selectedNoteIdsRef.current.size) {
        event.preventDefault();
        transposeSelectedNotes(-1);
      } else if (event.key === "ArrowRight" && selectedNoteIdsRef.current.size) {
        event.preventDefault();
        transposeSelectedNotes(1);
      } else if (event.key === "ArrowUp" && selectedNoteIdsRef.current.size) {
        event.preventDefault();
        shiftSelectedNotes(-snapTicks);
      } else if (event.key === "ArrowDown" && selectedNoteIdsRef.current.size) {
        event.preventDefault();
        shiftSelectedNotes(snapTicks);
      } else if (event.key === "Delete" || event.key === "Backspace") {
        if (!selectedNoteIdsRef.current.size) return;
        event.preventDefault();
        deleteSelectedNotes();
      } else if (event.key === "[") {
        event.preventDefault();
        setSelectedNotesHand("left");
      } else if (event.key === "]") {
        event.preventDefault();
        setSelectedNotesHand("right");
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [document, isPlaying, manualOpen, selectedNoteIds, snapTicks, styleDialogOpen]);

  useEffect(() => () => {
    playbackRef.current?.stop();
    if (playbackTimerRef.current !== null) window.clearTimeout(playbackTimerRef.current);
    if (playbackFrameRef.current !== null) window.cancelAnimationFrame(playbackFrameRef.current);
  }, []);

  useEffect(() => {
    const viewport = canvasAreaRef.current;
    if (!viewport) return;
    const handleViewportWheel = (event: globalThis.WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      if (!event.deltaY) return;
      const steps = Math.max(1, Math.round(Math.abs(event.deltaY) / 120));
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * ZOOM_FACTOR ** (event.deltaY < 0 ? steps : -steps)));
      if (nextZoom === zoom) return;
      const bounds = viewport.getBoundingClientRect();
      const cursorX = event.clientX - bounds.left;
      const cursorY = event.clientY - bounds.top;
      const pageX = (viewport.scrollLeft + cursorX) / zoom;
      const pageY = (viewport.scrollTop + cursorY) / zoom;
      setZoom(nextZoom);
      window.requestAnimationFrame(() => {
        viewport.scrollLeft = pageX * nextZoom - cursorX;
        viewport.scrollTop = pageY * nextZoom - cursorY;
      });
    };
    viewport.addEventListener("wheel", handleViewportWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleViewportWheel);
  }, [zoom]);

  const startViewportPan = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 1) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointer events do not always own a capturable pointer.
    }
    event.currentTarget.classList.add("is-panning");
    panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  };

  const updateViewportPan = (event: PointerEvent<HTMLElement>) => {
    const pan = panRef.current;
    const viewport = canvasAreaRef.current;
    if (!pan || pan.pointerId !== event.pointerId || !viewport) return;
    viewport.scrollLeft -= event.clientX - pan.x;
    viewport.scrollTop -= event.clientY - pan.y;
    pan.x = event.clientX;
    pan.y = event.clientY;
  };

  const endViewportPan = (event: PointerEvent<HTMLElement>) => {
    if (panRef.current?.pointerId !== event.pointerId) return;
    panRef.current = null;
    event.currentTarget.classList.remove("is-panning");
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const openDocumentContents = async (contents: string, name: string, handle: StoredFileHandle | null, desktopPath: string | null) => {
    if (!name.toLowerCase().endsWith(".ktw")) {
      setStatus("Choose a .ktw score");
      return;
    }
    try {
      const parsedDocument = deserializeDocument(JSON.parse(contents));
      undoStackRef.current = [];
      redoStackRef.current = [];
      desktopFilePathRef.current = desktopPath;
      fileHandleRef.current = handle;
      if (!isDesktopApp()) {
        if (handle) void saveLastFileHandle(handle);
        else void clearLastFileHandle();
      }
      setDocument(parsedDocument);
      savedDocumentRef.current = serializeDocument(parsedDocument);
      setIsDirty(false);
      setFileName(name);
      setPageIndex(0);
      setStatus(`Opened ${name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown file error";
      setStatus(`Could not open score: ${message}`);
    }
  };

  const openDocumentFile = async (file: File, handle: StoredFileHandle | null) => openDocumentContents(await file.text(), file.name, handle, null);

  const openDocument = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await openDocumentFile(file, null);
  };

  const openScore = async () => {
    if (!(await confirmDiscardChanges("opening another score"))) return;
    if (isDesktopApp()) {
      try {
        const score = await openDesktopScore();
        if (score) await openDocumentContents(score.contents, score.name, null, score.path);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown file error";
        setStatus(`Could not open score: ${message}`);
      }
      return;
    }
    if (!hasFileSystemAccess()) {
      openInputRef.current?.click();
      return;
    }
    try {
      const handle = await chooseScoreFile();
      await openDocumentFile(await handle.getFile(), handle);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const message = error instanceof Error ? error.message : "Unknown file error";
      setStatus(`Could not open score: ${message}`);
    }
  };

  const selectMidiFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const title = file.name.replace(/\.(mid|midi)$/i, "") || "Untitled";
      setMidiImport({ parsed: parseMidiFile(await file.arrayBuffer()), title, sourceName: file.name });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown MIDI file error";
      setStatus(`Could not import MIDI: ${message}`);
    }
  };

  const importMidiScore = (channelHands: Record<number, MidiHand>) => {
    if (!midiImport) return;
    try {
      const importedDocument = importMidi(midiImport.parsed, channelHands, midiImport.title);
      undoStackRef.current = [];
      redoStackRef.current = [];
      desktopFilePathRef.current = null;
      fileHandleRef.current = null;
      void clearLastFileHandle();
      setDocument(importedDocument);
      setFileName(`${midiImport.title}.ktw`);
      setPageIndex(0);
      updateSelectedNoteIds([]);
      setMidiImport(null);
      setStatus(`Imported ${midiImport.sourceName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown MIDI import error";
      setStatus(`Could not import MIDI: ${message}`);
    }
  };

  const saveDocument = async (saveAs = false): Promise<boolean> => {
    const saveName = fileName === "Untitled.ktw" ? documentFileName(document) : fileName;
    const contents = serializeDocument(document);
    if (isDesktopApp()) {
      try {
        const saved = await saveDesktopScore({ path: saveAs ? null : desktopFilePathRef.current, suggestedName: saveName, contents });
        if (!saved) return false;
        desktopFilePathRef.current = saved.path;
        savedDocumentRef.current = contents;
        setIsDirty(false);
        setFileName(saved.name);
        setStatus(`Saved ${saved.name}`);
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown file error";
        setStatus(`Could not save score: ${message}`);
        return false;
      }
    }
    try {
      let handle = saveAs ? null : fileHandleRef.current;
      if (!handle && hasFileSystemAccess()) handle = await chooseSaveLocation(saveName);
      if (handle) {
        const writable = await handle.createWritable();
        await writable.write(contents);
        await writable.close();
        fileHandleRef.current = handle;
        void saveLastFileHandle(handle);
        savedDocumentRef.current = contents;
        setIsDirty(false);
        setFileName(handle.name);
        setStatus(`Saved ${handle.name}`);
        return true;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return false;
      const message = error instanceof Error ? error.message : "Unknown file error";
      setStatus(`Could not save score: ${message}`);
      return false;
    }
    let downloadName = saveName;
    if (saveAs || fileName === "Untitled.ktw") {
      const enteredName = window.prompt("Save score as:", saveName);
      if (enteredName === null) return false;
      const normalizedName = enteredName.trim().replace(/[\\/:*?"<>|]/g, "_");
      if (!normalizedName) {
        setStatus("Enter a file name to save the score");
        return false;
      }
      downloadName = normalizedName.toLowerCase().endsWith(".ktw") ? normalizedName : `${normalizedName}.ktw`;
    }
    const blob = new Blob([contents], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = downloadName;
    anchor.click();
    URL.revokeObjectURL(url);
    savedDocumentRef.current = contents;
    setIsDirty(false);
    setFileName(downloadName);
    setStatus(`Saved ${downloadName}`);
    return true;
  };

  const confirmDiscardChanges = async (action: string): Promise<boolean> => {
    if (!isDirty) return true;
    if (isDesktopApp()) {
      const choice = await confirmDesktopDiscard(action);
      if (choice === "cancel") return false;
      return choice === "discard" || await saveDocument();
    }
    const choice = await new Promise<DiscardChoice>((resolve) => setDiscardPrompt({ action, resolve }));
    if (choice === "cancel") return false;
    return choice === "discard" || await saveDocument();
  };

  useEffect(() => {
    if (isDesktopApp() || !isDirty) return;
    const preventTabClose = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventTabClose);
    return () => window.removeEventListener("beforeunload", preventTabClose);
  }, [isDirty]);

  useEffect(() => {
    if (!isDesktopApp()) return;
    return onDesktopCloseRequested(() => {
      void confirmDiscardChanges("closing keyTAB").then((canClose) => {
        if (canClose) approveDesktopClose();
        else cancelDesktopClose();
      });
    });
  }, [isDirty]);

  const requestNewDocument = async (template?: ScoreTemplate) => {
    if (await confirmDiscardChanges("creating a new score")) createNewDocument(template);
  };

  const exportPdf = async () => {
    if (exportingPdf) return;
    setPdfPagesMounted(true);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const svgPages = [...globalThis.document.querySelectorAll<SVGSVGElement>("svg.export-paper")];
    if (svgPages.length !== document.pages.length) {
      setStatus("Could not find every score page for PDF export");
      setPdfPagesMounted(false);
      return;
    }
    setExportingPdf(true);
    setStatus("Exporting PDF...");
    try {
      await exportScorePdf(
        svgPages.map((svg, index) => ({
          svg,
          widthMm: document.pages[index].width_mm,
          heightMm: document.pages[index].height_mm,
        })),
        documentFileName(document).replace(/\.ktw$/i, ".pdf"),
      );
      setStatus("PDF exported");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown export error";
      setStatus(`Could not export PDF: ${message}`);
    } finally {
      setExportingPdf(false);
      setPdfPagesMounted(false);
    }
  };

  const selectMenuItem = (item: string) => {
    setActiveMenu(null);
    if (item === "New") void requestNewDocument();
    else if (item === "New Piano Template") void requestNewDocument("piano");
    else if (item === "New Organ Template") void requestNewDocument("organ");
    else if (item === "Open...") void openScore();
    else if (item === "Import MIDI...") midiInputRef.current?.click();
    else if (item === "Save") void saveDocument();
    else if (item === "Save As...") void saveDocument(true);
    else if (item === "Export PDF...") void exportPdf();
    else if (item === "Set current file as default template") {
      try {
        saveDefaultLayoutTemplate(document.layout);
        setStatus("Current layout saved as default template");
      } catch {
        setStatus("Could not save the default template");
      }
    } else if (item === "Reset Default template") {
      try {
        resetDefaultLayoutTemplate();
        setStatus("Default template reset");
      } catch {
        setStatus("Could not reset the default template");
      }
    }
    else if (item === "Score Info...") setScoreInfoDialogOpen(true);
    else if (item === "Style...") setStyleDialogOpen(true);
    else if (item === "Manual...") setManualOpen(true);
    else if (item === "Undo") undoDocument();
    else if (item === "Redo") redoDocument();
    else if (item === "Snap Band") editDocument((editableDocument) => {
      editableDocument.layout.grid_band_visible = !editableDocument.layout.grid_band_visible;
    }, document.layout.grid_band_visible ? "Snap band hidden" : "Snap band shown");
    else setStatus(`${item} is not available yet`);
  };

  const menuItems: Record<string, string[]> = {
    File: ["New", "New Piano Template", "New Organ Template", "---", "Open...", "Import MIDI...", "Save", "Save As...", "Export PDF...", "---", "Set current file as default template", "Reset Default template"],
    Edit: ["Score Info...", "Style...", "Preferences...", "Undo", "Redo"],
    View: ["Snap Band"],
    Help: ["Manual...", "About keyTAB"],
  };

  return (
    <div className="app-shell" onContextMenu={(event) => event.preventDefault()}>
      <input ref={openInputRef} className="visually-hidden" type="file" accept=".ktw,application/json" onChange={openDocument} />
      <input ref={midiInputRef} className="visually-hidden" type="file" accept=".mid,.midi,audio/midi,audio/x-midi" onChange={selectMidiFile} />
      <header className="titlebar">
        <Music2 size={17} />
        <span>keyTAB</span>
        <span className="document-name">{fileName}</span>
      </header>
      <nav className="menubar" aria-label="Application menu">
        {menus.map((menu) => (
          <div className="menu-wrap" key={menu}>
            <button type="button" className="menu-button" onClick={() => setActiveMenu(activeMenu === menu ? null : menu)}>{menu}</button>
            {activeMenu === menu && (
              <div className="menu-popover">
                {menuItems[menu].map((item, index) => item === "---"
                  ? <hr key={`${menu}-separator-${index}`} />
                  : <button type="button" key={item} onClick={() => selectMenuItem(item)}>{item}</button>)}
              </div>
            )}
          </div>
        ))}
      </nav>
      <div className="toolbar" aria-label="Note input toolbar">
        <IconButton label="New score" onClick={() => void requestNewDocument()}><FilePlus size={19} /></IconButton>
        <IconButton label="Open score" onClick={() => void openScore()}><FolderOpen size={19} /></IconButton>
        <IconButton label="Save score" onClick={() => void saveDocument()}><Save size={19} /></IconButton>
        <span className="toolbar-separator" />
        <IconButton label="Left note input" active={activeTool === "left"} onClick={() => setActiveTool("left")}><KeyTabIcon src={leftNoteIcon} /></IconButton>
        <IconButton label="Right note input" active={activeTool === "right"} onClick={() => setActiveTool("right")}><KeyTabIcon src={rightNoteIcon} /></IconButton>
        <IconButton label="Arpeggio" active={activeTool === "arpeggio"} onClick={() => setActiveTool("arpeggio")}><KeyTabIcon src={arpeggioIcon} /></IconButton>
        <IconButton label="Count line" active={activeTool === "count_line"} onClick={() => setActiveTool("count_line")}><KeyTabIcon src={countLineIcon} /></IconButton>
        <IconButton label="System break" active={activeTool === "break"} onClick={() => setActiveTool("break")}><KeyTabIcon src={lineBreakIcon} /></IconButton>
        <IconButton label="Time signature" active={activeTool === "meter"} onClick={() => setActiveTool("meter")}><KeyTabIcon src={timeSignatureIcon} /></IconButton>
        <IconButton label="Tempo" active={activeTool === "tempo"} onClick={() => setActiveTool("tempo")}><KeyTabIcon src={tempoIcon} /></IconButton>
        <span className="toolbar-spacer" />
        <IconButton label="Previous page" onClick={() => changePage(-1)}><ArrowLeft size={19} /></IconButton>
        <IconButton label="Next page" onClick={() => changePage(1)}><ArrowRight size={19} /></IconButton>
        <span className="toolbar-separator" />
        <IconButton label="Undo" onClick={undoDocument}><Undo2 size={19} /></IconButton>
        <IconButton label="Redo" onClick={redoDocument}><Redo2 size={19} /></IconButton>
        <IconButton label="Play score" active={isPlaying} onClick={() => void playScore()}><Play size={19} /></IconButton>
        <IconButton label="Stop playback" onClick={() => stopPlayback()}><Square size={16} /></IconButton>
      </div>
      <main className="workbench">
        <aside className="snap-dock">
          <div className="dock-heading">Snap Size</div>
          <div className="snap-readout">1/{snapBase} &divide; {divider} <span>= {snapTicks.toFixed(2)} ticks</span></div>
          <div className="snap-list" role="listbox" aria-label="Snap note length">
            {SNAP_BASES.map((base) => (
              <button type="button" role="option" aria-selected={snapBase === base} className={snapBase === base ? "selected" : ""} key={base} onClick={() => { setSnapBase(base); setDivider(1); }}>{base}</button>
            ))}
          </div>
          <div className="divider-control">
            <button type="button" aria-label="Decrease snap divider" disabled={divider === 1} onClick={() => setDivider(divider - 1)}>-</button>
            <output>&divide; {divider}</output>
            <button type="button" aria-label="Increase snap divider" disabled={divider === 64} onClick={() => setDivider(divider + 1)}>+</button>
          </div>
        </aside>
        <section ref={canvasAreaRef} className="canvas-area" aria-label="Score workspace" onPointerDownCapture={startViewportPan} onPointerMove={updateViewportPan} onPointerUp={endViewportPan} onPointerCancel={endViewportPan}>
          <div className="paper-frame" style={{ width: `${document.pages[Math.min(pageIndex, document.pages.length - 1)].width_mm * PIXELS_PER_MM * zoom}px` }}>
            <PaperPreview document={document} pageIndex={Math.min(pageIndex, document.pages.length - 1)} activeTool={activeTool} snapTicks={snapTicks} onEdit={editDocument} onOpenStaveMenu={setStaveMenu} onOpenTimeSignatureDialog={setTimeSignatureEdit} onOpenTempoDialog={setTempoEdit} selectedNoteIds={selectedNoteIds} onSelectionChange={selectNotes} onClearSelection={() => updateSelectedNoteIds([])} onPasteTargetChange={(target) => { pasteTargetRef.current = target; }} onAuditionNote={(pitch, velocity) => { void playNoteAudition(pitch, velocity); }} playbackTick={playbackTick} />
          </div>
        </section>
        {pdfPagesMounted && <div aria-hidden="true" style={{ position: "fixed", left: "-100000px", top: 0, width: 0, height: 0, overflow: "hidden", opacity: 0, pointerEvents: "none" }}>
          {document.pages.map((page, index) => <PaperPreview key={page.id} document={document} pageIndex={index} activeTool="left" snapTicks={snapTicks} onEdit={editDocument} onOpenStaveMenu={setStaveMenu} onOpenTimeSignatureDialog={setTimeSignatureEdit} onOpenTempoDialog={setTempoEdit} selectedNoteIds={new Set()} onSelectionChange={selectNotes} onClearSelection={() => undefined} onPasteTargetChange={() => undefined} onAuditionNote={() => undefined} playbackTick={null} exportOnly />)}
        </div>}
      </main>
      <footer className="statusbar"><span>{status}</span><span>Snap: 1/{snapBase * divider}</span><span>Page {Math.min(pageIndex, document.pages.length - 1) + 1} of {document.pages.length}</span></footer>
      {discardPrompt && <DiscardChangesDialog
        action={discardPrompt.action}
        onChoose={(choice) => {
          discardPrompt.resolve(choice);
          setDiscardPrompt(null);
        }}
      />}
      {scoreInfoDialogOpen && <ScoreInfoDialog
        scoreInfo={document.score_info}
        onClose={() => setScoreInfoDialogOpen(false)}
        onApply={(scoreInfo) => {
          editDocument((editableDocument) => { editableDocument.score_info = scoreInfo; }, "Score info updated");
          setScoreInfoDialogOpen(false);
        }}
      />}
      {styleDialogOpen && <StyleDialog
        layout={document.layout}
        onClose={() => setStyleDialogOpen(false)}
        onApply={(layout) => {
          editDocument((editableDocument) => { editableDocument.layout = layout; }, "Style updated");
          setStyleDialogOpen(false);
        }}
      />}
      {manualOpen && <ManualDialog onClose={() => setManualOpen(false)} />}
      {midiImport && <MidiImportDialog
        parsed={midiImport.parsed}
        onClose={() => setMidiImport(null)}
        onImport={importMidiScore}
      />}
      {timeSignatureEdit && <TimeSignatureDialog
        numerator={timeSignatureEdit.numerator}
        denominator={timeSignatureEdit.denominator}
        indicatorEnabled={timeSignatureEdit.indicatorEnabled}
        onClose={() => setTimeSignatureEdit(null)}
        onApply={(numerator, denominator, indicatorEnabled) => {
          editDocument((editableDocument) => {
            setTimeSignature(editableDocument, timeSignatureEdit.time, numerator, denominator, indicatorEnabled);
          }, `Time signature set to ${numerator}/${denominator}`);
          setTimeSignatureEdit(null);
        }}
      />}
      {tempoEdit && (() => {
        const tempo = document.timeline_events.find((candidate) => candidate.id === tempoEdit.id);
        if (!tempo) return null;
        return <TempoDialog tempo={tempo.tempo} durationTicks={tempo.duration_ticks} xOffsetMm={tempo.x_offset_mm} visible={!tempo.invisible} onClose={() => setTempoEdit(null)} onApply={(value, durationTicks, xOffsetMm, visible) => {
          editDocument((editableDocument) => {
            const editableTempo = editableDocument.timeline_events.find((candidate) => candidate.id === tempo.id);
            if (editableTempo) {
              editableTempo.tempo = value;
              editableTempo.duration_ticks = durationTicks;
              editableTempo.x_offset_mm = xOffsetMm;
              editableTempo.invisible = !visible;
            }
            ensureInitialTempo(editableDocument);
          }, "Tempo marking updated");
          setTempoEdit(null);
        }} />;
      })()}
      {staveMenu && <div className="stave-menu" style={{ left: Math.min(staveMenu.x, window.innerWidth - 230), top: Math.min(staveMenu.y, window.innerHeight - 220) }} role="menu">
        <button type="button" role="menuitem" onClick={() => { setStaveMenu(null); setGlobalStavesTarget(staveMenu); }}>Configure Staves...</button>
        <hr />
        <button type="button" role="menuitem" onClick={() => { setStaveMenu(null); setStaveValueEdit({ target: staveMenu, setting: "scale" }); }}>Set Stave Scale</button>
        <button type="button" role="menuitem" onClick={() => { setStaveMenu(null); setStaveValueEdit({ target: staveMenu, setting: "left_margin_mm" }); }}>Set Stave Margin Left</button>
        <button type="button" role="menuitem" onClick={() => { setStaveMenu(null); setStaveValueEdit({ target: staveMenu, setting: "right_margin_mm" }); }}>Set Stave Margin Right</button>
        <button type="button" role="menuitem" onClick={() => { setStaveMenu(null); setStaveRangeEdit(staveMenu); }}>Set Stave Range</button>
      </div>}
      {staveValueEdit && findStave(staveValueEdit.target) && <StaveValueDialog setting={staveValueEdit.setting} value={findStave(staveValueEdit.target)![staveValueEdit.setting]} onClose={() => setStaveValueEdit(null)} onApply={(value) => { editLocalStave(staveValueEdit.target, (stave) => { stave[staveValueEdit.setting] = value; }, `${staveValueEdit.setting === "scale" ? "Stave scale" : "Stave margin"} updated`); setStaveValueEdit(null); }} />}
      {staveRangeEdit && findStave(staveRangeEdit) && <StaveRangeDialog range={findStave(staveRangeEdit)!.pitch_range} onClose={() => setStaveRangeEdit(null)} onApply={(range) => { editLocalStave(staveRangeEdit, (stave) => { stave.pitch_range = range; }, "Stave range updated"); setStaveRangeEdit(null); }} />}
      {globalStavesTarget && (() => {
        const sourceSystem = document.pages.flatMap((page) => page.systems).find((system) => system.id === globalStavesTarget.systemId);
        return sourceSystem ? <StavesDialog staves={sourceSystem.staves} onClose={() => setGlobalStavesTarget(null)} onApply={(staves) => { applyGlobalStaveConfiguration(globalStavesTarget, staves); setGlobalStavesTarget(null); }} /> : null;
      })()}
    </div>
  );
}
