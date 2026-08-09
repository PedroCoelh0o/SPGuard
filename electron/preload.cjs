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
