// Processo principal do Electron.
// Sobe o servidor Node (gerado pelo build do TanStack Start / Nitro) e abre
// uma janela nativa apontando para ele em http://127.0.0.1:PORT.
//
// Arquivo em CommonJS (.cjs) porque o package.json do projeto usa
// "type": "module" — o processo principal do Electron continua sendo
// carregado normalmente como CommonJS através dessa extensão.

const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("node:path");
const http = require("node:http");
const { pathToFileURL } = require("node:url");

// Garante que o nome do app fique "SPGuard" em tempo de execução também
// (barra de tarefas do Windows, agrupamento de janelas, notificações) —
// não só no instalador/atalhos, que já vêm do "productName" configurado
// no package.json.
app.setName("SPGuard");
if (process.platform === "win32") {
  app.setAppUserModelId("com.spguard.app");
}

const PORT = process.env.PORT || 3777;
// Usa 127.0.0.1 explicitamente (não "localhost") para a janela carregar a
// página. Em alguns ambientes "localhost" pode resolver para IPv6 (::1)
// para algumas requisições e IPv4 para outras, o que causa falhas
// intermitentes de conexão quando o app faz chamadas para o servidor local
// depois da carga inicial. Usando o IP direto, todas as requisições da
// página (inclusive as relativas, feitas pelo próprio app) ficam
// consistentes.
const SERVER_URL = `http://127.0.0.1:${PORT}`;

// Pasta onde ficam o banco SQLite e os arquivos anexados (fotos e
// documentos dos colaboradores). Usa a pasta de dados do usuário do
// Windows (ex.: C:\Users\<voce>\AppData\Roaming\SPGuard), então os dados
// sobrevivem a atualizações/reinstalações do app. Em desenvolvimento
// (fora do pacote instalável), usa uma pasta local no próprio projeto.
const LOCAL_DATA_DIR = app.isPackaged
  ? path.join(app.getPath("userData"), "data")
  : path.join(__dirname, "..", "local-data");

// Em produção (empacotado), os arquivos do servidor ficam em
// resources/app-server (copiados via "extraResources" no build do
// electron-builder). Em desenvolvimento, usamos o .output gerado
// localmente por `npm run build`.
const SERVER_ENTRY = app.isPackaged
  ? path.join(process.resourcesPath, "app-server", "server", "index.mjs")
  : path.join(__dirname, "..", ".output", "server", "index.mjs");

const PUBLIC_DIR = app.isPackaged
  ? path.join(process.resourcesPath, "app-server", "public")
  : path.join(__dirname, "..", ".output", "public");

let mainWindow = null;

// O servidor roda DENTRO do próprio processo principal do Electron (não
// como um processo filho separado via child_process.fork). É um padrão
// comum para esse tipo de app e evita a complexidade de gerenciar um
// processo filho separado (pipes, IPC, sinais de encerramento).
function startServer() {
  process.env.PORT = String(PORT);
  process.env.NITRO_PORT = String(PORT);
  process.env.HOST = "127.0.0.1";
  process.env.NITRO_PUBLIC_DIR = PUBLIC_DIR;
  process.env.LOCAL_DATA_DIR = LOCAL_DATA_DIR;

  // O bundle do Nitro é um módulo ESM (.mjs) que, ao ser importado, já
  // sobe o servidor HTTP como efeito colateral (é o mesmo arquivo que
  // `node .output/server/index.mjs` roda diretamente).
  return import(pathToFileURL(SERVER_ENTRY).href);
}

// Faz polling em / até o servidor responder, em vez de assumir que já
// está pronto logo após o import (a inicialização do Nitro é assíncrona).
function waitForServer(resolve, reject, attempt = 0) {
  const MAX_ATTEMPTS = 100; // ~20s
  const req = http.get(SERVER_URL, () => {
    req.destroy();
    resolve();
  });
  req.on("error", () => {
    req.destroy();
    if (attempt >= MAX_ATTEMPTS) {
      reject(new Error("Servidor não respondeu a tempo."));
      return;
    }
    setTimeout(() => waitForServer(resolve, reject, attempt + 1), 200);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#0f172a",
    icon: path.join(__dirname, "..", "build", "icon.ico"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: false,
  });

  Menu.setApplicationMenu(null);

  mainWindow.once("ready-to-show", () => mainWindow.show());

  // Links externos (ex.: target="_blank") abrem no navegador padrão,
  // não dentro da janela do app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(SERVER_URL)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.loadURL(SERVER_URL);
}

app.whenReady().then(async () => {
  try {
    await startServer();
    await new Promise((resolve, reject) => waitForServer(resolve, reject));
    createWindow();
  } catch (err) {
    console.error("Falha ao iniciar o servidor embutido:", err);
    app.quit();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
