import { ArrowLeft, ArrowRight, FilePlus, FolderOpen, Pause, Play, Redo2, Save, Square, Undo2 } from "lucide-react";
import arpeggioIcon from "./assets/icons/arpeggio.png";
import countLineIcon from "./assets/icons/count_line.png";
import lineBreakIcon from "./assets/icons/line_break.png";
import leftNoteIcon from "./assets/icons/note_left.png";
import rightNoteIcon from "./assets/icons/note_right.png";
import tempoIcon from "./assets/icons/tempo.png";
import timeSignatureIcon from "./assets/icons/time_signature.png";

function Mode({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <article className="manual-mode"><div className="manual-mode-icon">{icon}</div><div><h3>{title}</h3><p>{children}</p></div></article>;
}

export function ManualDialog({ onClose }: { onClose: () => void }) {
  return <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="manual-dialog" role="dialog" aria-modal="true" aria-label="Manual" onMouseDown={(event) => event.stopPropagation()} onKeyDownCapture={(event) => event.stopPropagation()}>
      <header><h2>Manual</h2><button type="button" aria-label="Close manual" onClick={onClose}>x</button></header>
      <div className="manual-body">
        <section>
          <h3>Viewport</h3>
          <dl className="manual-controls">
            <dt>Scroll wheel or trackpad</dt><dd>Scroll the score normally.</dd>
            <dt>Middle-mouse drag</dt><dd>Grab and pan the page. The page follows the drag.</dd>
            <dt>Ctrl/Cmd + scroll</dt><dd>Zoom in or out around the pointer position.</dd>
            <dt>Previous / Next page</dt><dd>Use the arrow buttons in the toolbar to change the displayed page.</dd>
          </dl>
        </section>
        <section>
          <h3>Common Editing Controls</h3>
          <dl className="manual-controls">
            <dt>Left click</dt><dd>Add an object in the active mode, or edit and drag an existing object.</dd>
            <dt>Double left click</dt><dd>Delete the clicked note or mode-specific object when supported.</dd>
            <dt>Right drag</dt><dd>Drag more than 3 pixels to select notes with a rectangle. A simple right click does not select.</dd>
            <dt>Shift + drag</dt><dd>Select notes with a rectangle.</dd>
            <dt>Snap Size</dt><dd>Choose the timing grid used when adding or moving notes and Count Lines.</dd>
          </dl>
        </section>
        <section>
          <h3>Toolbar</h3>
          <div className="manual-mode-grid">
            <Mode icon={<FilePlus />} title="New score">Create a new score from the current default layout template.</Mode>
            <Mode icon={<FolderOpen />} title="Open score">Open a keyTAB score file.</Mode>
            <Mode icon={<Save />} title="Save score">Save the current score. Use File &gt; Save As for a new file name or location.</Mode>
            <Mode icon={<img src={leftNoteIcon} alt="" />} title="Left note input">Left-click empty space to add a left-hand note. Drag a note head to move it; drag its body to set duration. Double-click a note to remove it.</Mode>
            <Mode icon={<img src={rightNoteIcon} alt="" />} title="Right note input">Works like Left note input, but new notes are right-hand notes.</Mode>
            <Mode icon={<img src={arpeggioIcon} alt="" />} title="Arpeggio">Click a note in a chord to add an arpeggio. Drag either endpoint handle to shape it; double-click a handle to remove it.</Mode>
            <Mode icon={<img src={countLineIcon} alt="" />} title="Count Line">Left-click to add a Count Line. Drag an endpoint handle to resize it; drag the dashed body to move it. Double-click the line or either endpoint handle to delete it.</Mode>
            <Mode icon={<img src={lineBreakIcon} alt="" />} title="System break">Click a highlighted measure boundary to add or remove a system break.</Mode>
            <Mode icon={<img src={timeSignatureIcon} alt="" />} title="Time signature">Click a barline to edit its time signature. Click a grid guide to enable it; double-click an enabled grid guide to disable it.</Mode>
            <Mode icon={<img src={tempoIcon} alt="" />} title="Tempo">Click empty score space to add a tempo marker, or click a marker to edit it. Double-click a non-initial marker to remove it.</Mode>
            <Mode icon={<ArrowLeft />} title="Previous page">Show the preceding score page.</Mode>
            <Mode icon={<ArrowRight />} title="Next page">Show the following score page.</Mode>
            <Mode icon={<Undo2 />} title="Undo">Reverse the most recent score edit.</Mode>
            <Mode icon={<Redo2 />} title="Redo">Restore the most recently undone score edit.</Mode>
            <Mode icon={<Play />} title="Play score">Start playback from the current paste target or the score start. Choose the internal synth or an available external MIDI port from Playback.</Mode>
            <Mode icon={<Square />} title="Stop playback">Stop score playback.</Mode>
          </div>
        </section>
      </div>
      <footer><button type="button" className="primary" onClick={onClose}>Close</button></footer>
    </section>
  </div>;
}