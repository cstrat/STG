const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  makeHttpRequest:    (p) => ipcRenderer.invoke('make-http-request', p),
  makeBrowserRequest: (p) => ipcRenderer.invoke('make-browser-request', p),
  makeStreamRequest:  (p) => ipcRenderer.invoke('make-stream-request', p),
  portScan:           (p) => ipcRenderer.invoke('port-scan', p),
  loadConfig:         ()  => ipcRenderer.invoke('load-config'),
  saveConfig:         (c) => ipcRenderer.invoke('save-config', c),
  saveReport:         (p) => ipcRenderer.invoke('save-report', p),
});
