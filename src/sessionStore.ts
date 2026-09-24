import type { Layout } from "./model/types";

export interface SessionSnapshot {
  contents: string;
  fileName: string;
  pageIndex: number;
  snapBase: number;
  divider: number;
  zoom: number;
  savedAt: number;
}

export interface StoredFileHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
}

type FilePickerWindow = Window & {
  showOpenFilePicker?: (options: object) => Promise<StoredFileHandle[]>;
  showSaveFilePicker?: (options: object) => Promise<StoredFileHandle>;
};

const DATABASE_NAME = "keytab-web";
const STORE_NAME = "session";
const SESSION_KEY = "recovery";
const LAST_FILE_KEY = "last-file";
const DEFAULT_LAYOUT_TEMPLATE_KEY = "default-layout-template";
const FILE_TYPES = [{ description: "keyTAB score", accept: { "application/json": [".ktw"] } }];

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open session storage."));
  });
}

async function readValue<T>(key: string): Promise<T | null> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined ?? null);
    request.onerror = () => reject(request.error ?? new Error("Could not read session storage."));
  });
}

async function writeValue(key: string, value: unknown): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Could not save session storage."));
  });
}

async function removeValue(key: string): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Could not update session storage."));
  });
}

export const loadSessionSnapshot = () => readValue<SessionSnapshot>(SESSION_KEY);
export const saveSessionSnapshot = (snapshot: SessionSnapshot) => writeValue(SESSION_KEY, snapshot);
export const loadLastFileHandle = () => readValue<StoredFileHandle>(LAST_FILE_KEY);
export const saveLastFileHandle = (handle: StoredFileHandle) => writeValue(LAST_FILE_KEY, handle);
export const clearLastFileHandle = () => removeValue(LAST_FILE_KEY);

export function loadDefaultLayoutTemplate(): Layout | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const storedLayout = localStorage.getItem(DEFAULT_LAYOUT_TEMPLATE_KEY);
    if (!storedLayout) return null;
    const layout = JSON.parse(storedLayout);
    return typeof layout === "object" && layout !== null && !Array.isArray(layout) ? layout as Layout : null;
  } catch {
    return null;
  }
}

export function saveDefaultLayoutTemplate(layout: Layout): void {
  localStorage.setItem(DEFAULT_LAYOUT_TEMPLATE_KEY, JSON.stringify(layout));
}

export function resetDefaultLayoutTemplate(): void {
  localStorage.removeItem(DEFAULT_LAYOUT_TEMPLATE_KEY);
}

export function hasFileSystemAccess(): boolean {
  return typeof window !== "undefined" && typeof (window as FilePickerWindow).showOpenFilePicker === "function";
}

export async function chooseScoreFile(): Promise<StoredFileHandle> {
  const picker = (window as FilePickerWindow).showOpenFilePicker;
  if (!picker) throw new Error("File System Access is unavailable.");
  const [handle] = await picker.call(window, { multiple: false, types: FILE_TYPES });
  if (!handle) throw new Error("No score selected.");
  return handle;
}

export async function chooseSaveLocation(suggestedName: string): Promise<StoredFileHandle> {
  const picker = (window as FilePickerWindow).showSaveFilePicker;
  if (!picker) throw new Error("File System Access is unavailable.");
  return picker.call(window, { suggestedName, types: FILE_TYPES });
}