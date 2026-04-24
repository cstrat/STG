const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  makeHttpRequest:    (p)   => ipcRenderer.invoke('make-http-request', p),
  classifyResponse:   (p)   => ipcRenderer.invoke('classify-response', p),
  portScan:           (p)   => ipcRenderer.invoke('port-scan', p),
  loadConfig:         ()    => ipcRenderer.invoke('load-config'),
  saveConfig:         (c)   => ipcRenderer.invoke('save-config', c),
  saveReport:         (p)   => ipcRenderer.invoke('save-report', p),
  // Per-webContents byte tracking for the live-preview webview tiles
  webviewBytesReset:  (id)  => ipcRenderer.invoke('webview-bytes-reset', id),
  webviewBytesGet:    (id)  => ipcRenderer.invoke('webview-bytes-get', id),
});
