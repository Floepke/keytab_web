import { useState } from "react";
import type { ScoreInfo } from "./model/types";

export function ScoreInfoDialog({ scoreInfo, onApply, onClose }: { scoreInfo: ScoreInfo; onApply: (scoreInfo: ScoreInfo) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(() => ({ ...scoreInfo }));
  const update = (field: keyof ScoreInfo, value: string) => setDraft((current) => ({ ...current, [field]: value }));
  const apply = () => onApply({
    title: draft.title.trim() || "Untitled",
    composer: draft.composer.trim(),
    copyright: draft.copyright.trim(),
  });

  return <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="score-info-dialog" role="dialog" aria-modal="true" aria-label="Titles and Info" onMouseDown={(event) => event.stopPropagation()}>
      <header><h2>Titles and Info</h2><button type="button" aria-label="Close titles and info dialog" onClick={onClose}>x</button></header>
      <div className="score-info-body">
        <fieldset>
          <legend>Info</legend>
          <label><span>Title:</span><input autoFocus value={draft.title} onChange={(event) => update("title", event.target.value)} /></label>
          <label><span>Composer:</span><input value={draft.composer} onChange={(event) => update("composer", event.target.value)} /></label>
          <label><span>Copyright:</span><input value={draft.copyright} onChange={(event) => update("copyright", event.target.value)} /></label>
        </fieldset>
      </div>
      <footer><button type="button" onClick={onClose}>Cancel</button><button type="button" className="primary" onClick={apply}>OK</button></footer>
    </section>
  </div>;
}