const { app, BrowserWindow, globalShortcut, ipcMain, screen, session } = require("electron");

const COPILOT_URL = process.env.COPILOT_URL || "https://french-audio-copilot.vercel.app/?desktop=1&overlay=1&compact=1&direction=fr-en";

let win;
let clickThrough = false;
let dimmed = false;

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  const width = 460;
  const height = Math.min(720, workArea.height - 96);
  win = new BrowserWindow({
    width,
    height,
    x: Math.max(workArea.x + 12, workArea.x + workArea.width - width - 18),
    y: workArea.y + 72,
    minWidth: 340,
    minHeight: 360,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: true,
    movable: true,
    title: "French Audio Copilot Overlay",
    backgroundColor: "#00000000",
    vibrancy: "hud",
    visualEffectState: "active",
    webPreferences: {
      preload: `${__dirname}/preload.cjs`,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setContentProtection(false);
  win.loadURL(COPILOT_URL);
}

function toggleClickThrough() {
  if (!win) return;
  clickThrough = !clickThrough;
  win.setIgnoreMouseEvents(clickThrough, { forward: true });
  win.webContents.executeJavaScript(`document.body.classList.toggle("click-through", ${clickThrough});`);
}

function toggleOpacity() {
  if (!win) return;
  dimmed = !dimmed;
  win.setOpacity(dimmed ? 0.78 : 1);
}

function click(selector) {
  if (!win) return;
  win.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)})?.click();`);
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(permission === "media");
  });

  createWindow();

  globalShortcut.register("CommandOrControl+Shift+Space", () => {
    if (!win) return;
    if (win.isVisible()) win.hide();
    else {
      win.show();
      win.focus();
    }
  });
  globalShortcut.register("CommandOrControl+Shift+M", () => click("#pauseMine"));
  globalShortcut.register("CommandOrControl+Shift+L", () => click("#start"));
  globalShortcut.register("CommandOrControl+Shift+T", () => toggleClickThrough());
  globalShortcut.register("CommandOrControl+Shift+O", () => toggleOpacity());
  globalShortcut.register("CommandOrControl+Shift+Y", () => {
    if (!win) return;
    win.show();
    win.center();
  });
  globalShortcut.register("CommandOrControl+Shift+Q", () => app.quit());
});

ipcMain.on("overlay-close", () => {
  app.quit();
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
