// Health check executado no GitHub Actions. Roda no processo principal do
// Electron (e portanto com seu ABI), sem criar nenhuma janela gráfica.
const { app } = require("electron");

app.whenReady().then(() => {
  try {
    const Database = require("better-sqlite3");
    const db = new Database(":memory:");
    db.exec("CREATE TABLE healthcheck (id INTEGER)");
    db.close();
    console.log("SQLite no Electron: OK");
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
