export interface DesktopScoreFile {
  path: string;
  name: string;
  contents: string;
}

interface DesktopBridge {
  openScore(): Promise<DesktopScoreFile | null>;
  saveScore(request: { path: string | null; suggestedName: string; contents: string }): Promise<{ path: string; name: string } | null>;
  loadLastOpenedScore(): Promise<DesktopScoreFile | null>;
  confirmDiscard(action: string): Promise<"save" | "discard" | "cancel">;
}

const bridge = () => (window as Window & { keytabDesktop?: DesktopBridge }).keytabDesktop ?? null;

export const isDesktopApp = () => bridge() !== null;
export const openDesktopScore = () => bridge()?.openScore() ?? Promise.resolve(null);
export const saveDesktopScore = (request: { path: string | null; suggestedName: string; contents: string }) => bridge()?.saveScore(request) ?? Promise.resolve(null);
export const loadLastOpenedDesktopScore = () => bridge()?.loadLastOpenedScore() ?? Promise.resolve(null);
export const confirmDesktopDiscard = (action: string) => bridge()?.confirmDiscard(action) ?? Promise.resolve("cancel" as const);