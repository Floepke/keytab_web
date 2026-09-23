const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("keytabDesktop", {
  openScore: () => ipcRenderer.invoke("score:open"),
  saveScore: (request) => ipcRenderer.invoke("score:save", request),
  loadLastOpenedScore: () => ipcRenderer.invoke("score:load-last-opened"),
  confirmDiscard: (action) => ipcRenderer.invoke("score:confirm-discard", action),
});