const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopOverlay", {
  mode: "electron-overlay",
  close: () => ipcRenderer.send("overlay-close")
});
