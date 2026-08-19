const { contextBridge, ipcRenderer } = require("electron");

// A página continua isolada do Node. Ela recebe apenas as operações
// necessárias para os dois arquivos de planilha, nunca um caminho do disco.
contextBridge.exposeInMainWorld("spguardFiles", {
  selectDirectory: () => ipcRenderer.invoke("spguard-files:select-directory"),
  getDirectoryName: () => ipcRenderer.invoke("spguard-files:get-directory-name"),
  fileExists: (name) => ipcRenderer.invoke("spguard-files:file-exists", name),
  writeFile: (name, contents) => ipcRenderer.invoke("spguard-files:write-file", name, contents),
  readFile: (name) => ipcRenderer.invoke("spguard-files:read-file", name),
});

contextBridge.exposeInMainWorld("spguardNetwork", {
  read: (relative) => ipcRenderer.invoke("spguard-network:read", relative),
  exists: (relative) => ipcRenderer.invoke("spguard-network:exists", relative),
  write: (relative, contents) => ipcRenderer.invoke("spguard-network:write", relative, contents),
  acquireLock: () => ipcRenderer.invoke("spguard-network:acquire-lock"),
  releaseLock: () => ipcRenderer.invoke("spguard-network:release-lock"),
});

contextBridge.exposeInMainWorld("spguardRuntime", {
  getRpcToken: () => ipcRenderer.invoke("spguard-runtime:get-rpc-token"),
});
