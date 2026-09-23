const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const SCORE_FILTERS = [{ name: "keyTAB score", extensions: ["ktw"] }];
let mainWindow = null;
let closeApproved = false;
let closeRequestPending = false;
const lastOpenedPath = () => path.join(app.getPath("userData"), "last-opened.json");
const isScorePath = (filePath) => path.extname(filePath).toLowerCase() === ".ktw";
const scoreName = (filePath) => path.basename(filePath);

const readScore = async (filePath) => ({ path: filePath, name: scoreName(filePath), contents: await fs.readFile(filePath, "utf8") });

ipcMain.handle("score:open", async () => {
  const result = await dialog.showOpenDialog({ properties: ["openFile"], filters: SCORE_FILTERS });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  if (!isScorePath(filePath)) throw new Error("Choose a .ktw score");
  await fs.writeFile(lastOpenedPath(), JSON.stringify({ path: filePath }), "utf8");
  return readScore(filePath);
});

ipcMain.handle("score:save", async (_event, { path: existingPath, suggestedName, contents }) => {
  let filePath = existingPath;
  if (!filePath) {
    const result = await dialog.showSaveDialog({ defaultPath: suggestedName, filters: SCORE_FILTERS });
    if (result.canceled || !result.filePath) return null;
    filePath = result.filePath;
  }
  if (!isScorePath(filePath)) filePath = `${filePath}.ktw`;
  await fs.writeFile(filePath, contents, "utf8");
  await fs.writeFile(lastOpenedPath(), JSON.stringify({ path: filePath }), "utf8");
  return { path: filePath, name: scoreName(filePath) };
});

ipcMain.handle("score:load-last-opened", async () => {
  try {
    const { path: filePath } = JSON.parse(await fs.readFile(lastOpenedPath(), "utf8"));
    return isScorePath(filePath) ? await readScore(filePath) : null;
  } catch {
    return null;
  }
});

ipcMain.handle("score:confirm-discard", async (_event, action) => {
  const result = await dialog.showMessageBox({
    type: "warning",
    title: "keyTAB",
    message: `Save changes before ${action}?`,
    detail: "Your unsaved score changes will be lost if you choose Don't Save.",
    buttons: ["Save", "Don't Save", "Cancel"],
    defaultId: 0,
    cancelId: 2,
  });
  return ["save", "discard", "cancel"][result.response];
});

ipcMain.on("app:approve-close", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return;
  closeApproved = true;
  closeRequestPending = false;
  window.close();
});

ipcMain.on("app:cancel-close", () => {
  closeRequestPending = false;
});

const createWindow = () => {
  const icon = path.join(app.getAppPath(), "src", "assets", "icons", "keyTAB.png");
  const rendererPath = path.join(__dirname, "..", "dist", "index.html");
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 640,
    autoHideMenuBar: true,
    show: true,
    icon,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
  mainWindow.on("close", (event) => {
    if (closeApproved) return;
    event.preventDefault();
    if (closeRequestPending) return;
    closeRequestPending = true;
    mainWindow?.webContents.send("app:close-requested");
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
    closeApproved = false;
    closeRequestPending = false;
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https:")) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file:")) event.preventDefault();
  });
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
    console.error(`Could not load keyTAB renderer (${errorCode}): ${errorDescription} (${validatedUrl})`);
    mainWindow?.show();
  });
  void mainWindow.loadFile(rendererPath).catch((error) => {
    console.error("Could not load keyTAB renderer", error);
    mainWindow?.show();
  });
};

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (!mainWindow) createWindow();
  });
}).catch((error) => console.error("Electron failed during startup", error));

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});