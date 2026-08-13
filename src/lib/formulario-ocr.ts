export type DadosPortadorOcr = {
  nome: string;
  funcao: string;
  identidade: string;
  empresa: string;
  matricula: string;
  cpf: string;
};

export type EquipamentoOcr = {
  tipo: "celular" | "notebook";
  marca: string;
  modelo: string;
  numero_serie: string;
  imei: string;
  acessorios: string;
  contato: string;
};

export type ResultadoFormularioOcr = {
  portador: DadosPortadorOcr;
  celular: EquipamentoOcr;
  notebook: EquipamentoOcr;
  justificativa: string;
  confianca: number;
  textoReconhecido: string;
  imagem: string;
};

export type ProgressoOcr = { etapa: string; percentual: number };

type Box = { x: number; y: number; width: number; height: number };

function emptyEquipment(tipo: "celular" | "notebook"): EquipamentoOcr {
  return { tipo, marca: "", modelo: "", numero_serie: "", imei: "", acessorios: "", contato: "" };
}

function canvasFromImage(source: CanvasImageSource, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Não foi possível preparar a imagem do formulário.");
  context.drawImage(source, 0, 0, width, height);
  return canvas;
}

function ensurePdfBinaryCompatibility() {
  if (!("toHex" in Uint8Array.prototype)) {
    Object.defineProperty(Uint8Array.prototype, "toHex", {
      configurable: true,
      writable: true,
      value(this: Uint8Array) {
        let output = "";
        for (const byte of this) output += byte.toString(16).padStart(2, "0");
        return output;
      },
    });
  }
  if (!("fromBase64" in Uint8Array)) {
    Object.defineProperty(Uint8Array, "fromBase64", {
      configurable: true,
      writable: true,
      value(value: string) {
        const binary = atob(value);
        const output = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index++) output[index] = binary.charCodeAt(index);
        return output;
      },
    });
  }
}

async function renderFile(file: File) {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    ensurePdfBinaryCompatibility();
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/ocr/pdf.worker.min.mjs";
    const pdfDocument = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
    const page = await pdfDocument.getPage(1);
    const original = page.getViewport({ scale: 1 });
    const scale = Math.min(3, 2200 / Math.max(original.width, original.height));
    const viewport = page.getViewport({ scale });
    const canvas = globalThis.document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Não foi possível renderizar o PDF.");
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    return canvas;
  }

  if (!file.type.startsWith("image/")) throw new Error("Selecione um arquivo PDF, PNG, JPG ou JPEG.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
  const canvas = canvasFromImage(bitmap, Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  bitmap.close();
  return canvas;
}

function rotateCanvas(canvas: HTMLCanvasElement, quarterTurns: 0 | 1 | 2 | 3) {
  if (quarterTurns === 0) return canvas;
  const rotated = document.createElement("canvas");
  const swapsDimensions = quarterTurns === 1 || quarterTurns === 3;
  rotated.width = swapsDimensions ? canvas.height : canvas.width;
  rotated.height = swapsDimensions ? canvas.width : canvas.height;
  const context = rotated.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Não foi possível girar o formulário.");
  if (quarterTurns === 1) {
    context.translate(rotated.width, 0);
    context.rotate(Math.PI / 2);
  } else if (quarterTurns === 2) {
    context.translate(rotated.width, rotated.height);
    context.rotate(Math.PI);
  } else {
    context.translate(0, rotated.height);
    context.rotate(-Math.PI / 2);
  }
  context.drawImage(canvas, 0, 0);
  return rotated;
}

type OrientationWorker = {
  recognize(image: HTMLCanvasElement): Promise<{ data: { text: string; confidence: number } }>;
};

const FORM_KEYWORDS = [
  "dados", "portador", "colaborador", "propriedade", "equipamento",
  "celular", "notebook", "justificativa", "nome", "empresa", "matricula",
  "cpf", "marca", "modelo", "identidade", "acessorios",
];

function normalizedOcrText(value: string) {
  return value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function orientationScore(text: string, confidence: number) {
  const normalized = normalizedOcrText(text);
  const recognizedKeywords = FORM_KEYWORDS.filter((keyword) => normalized.includes(keyword)).length;
  // Os rótulos impressos do formulário são mais confiáveis que a confiança
  // média, que também inclui linhas, carimbos e escrita manual.
  return confidence + recognizedKeywords * 12;
}

async function orientForm(
  canvas: HTMLCanvasElement,
  worker: OrientationWorker,
  onProgress?: (progress: ProgressoOcr) => void,
) {
  // O PDF.js já respeita o metadado /Rotate do PDF. Portanto, um documento
  // horizontal pode precisar ser girado para qualquer um dos dois lados.
  // Para imagens verticais, compare a posição original com 180 graus.
  const candidates = canvas.width > canvas.height
    ? [rotateCanvas(canvas, 1), rotateCanvas(canvas, 3)]
    : [canvas, rotateCanvas(canvas, 2)];
  let best = candidates[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < candidates.length; index++) {
    onProgress?.({ etapa: `Conferindo orientação ${index + 1} de ${candidates.length}`, percentual: 7 + index * 4 });
    const preview = candidates[index];
    const scale = Math.min(1, 1100 / Math.max(preview.width, preview.height));
    const sample = scale < 1
      ? canvasFromImage(preview, Math.round(preview.width * scale), Math.round(preview.height * scale))
      : preview;
    const result = await worker.recognize(sample);
    const score = orientationScore(result.data.text, result.data.confidence);
    if (score > bestScore) {
      best = preview;
      bestScore = score;
    }
  }
  return best;
}

function improveContrast(canvas: HTMLCanvasElement) {
  const output = canvasFromImage(canvas, canvas.width, canvas.height);
  const context = output.getContext("2d", { willReadFrequently: true })!;
  const image = context.getImageData(0, 0, output.width, output.height);
  for (let index = 0; index < image.data.length; index += 4) {
    const gray = image.data[index] * 0.299 + image.data[index + 1] * 0.587 + image.data[index + 2] * 0.114;
    const adjusted = gray < 210 ? Math.max(0, (gray - 105) * 1.65 + 105) : 255;
    image.data[index] = image.data[index + 1] = image.data[index + 2] = adjusted;
  }
  context.putImageData(image, 0, 0);
  return output;
}

function crop(canvas: HTMLCanvasElement, box: Box) {
  const x = Math.round(canvas.width * box.x);
  const y = Math.round(canvas.height * box.y);
  const width = Math.round(canvas.width * box.width);
  const height = Math.round(canvas.height * box.height);
  const output = document.createElement("canvas");
  output.width = Math.max(1, width);
  output.height = Math.max(1, height);
  output.getContext("2d")!.drawImage(canvas, x, y, width, height, 0, 0, width, height);
  return output;
}

function clean(value: string) {
  return value.replace(/[|_[\]{}]/g, " ").replace(/\s+/g, " ").replace(/^[:;,.\-\s]+|[:;,.\-\s]+$/g, "").trim();
}

function recognizedValue(text: string, labelPattern: RegExp) {
  return clean(text.replace(labelPattern, ""));
}

function afterLabel(text: string, labels: string[]) {
  const alternatives = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const match = text.match(new RegExp(`(?:${alternatives})\\s*[:;]?\\s*([^\\n]+)`, "i"));
  return clean(match?.[1] ?? "");
}

function parsePortador(text: string): DadosPortadorOcr {
  return {
    nome: afterLabel(text, ["nome"]),
    funcao: afterLabel(text, ["função", "funcao"]),
    identidade: afterLabel(text, ["identidade", "rg"]),
    empresa: afterLabel(text, ["empresa"]),
    matricula: afterLabel(text, ["matrícula", "matricula"]),
    cpf: afterLabel(text, ["cpf"]),
  };
}

function parseEquipment(text: string, tipo: "celular" | "notebook"): EquipamentoOcr {
  return {
    tipo,
    marca: afterLabel(text, ["marca"]),
    modelo: afterLabel(text, ["modelo"]),
    numero_serie: afterLabel(text, ["número de série", "numero de serie", "nº de série", "n de serie"]),
    imei: afterLabel(text, ["imei"]),
    acessorios: afterLabel(text, ["acessórios", "acessorios"]),
    contato: afterLabel(text, ["nº contatos", "n contatos", "contatos", "contato"]),
  };
}

export async function lerFormularioOffline(file: File, onProgress?: (progress: ProgressoOcr) => void): Promise<ResultadoFormularioOcr> {
  onProgress?.({ etapa: "Preparando o documento localmente", percentual: 5 });
  const rendered = await renderFile(file);

  const { createWorker, OEM, PSM } = await import("tesseract.js");
  let reportDetailedProgress = false;
  const worker = await createWorker("por", OEM.LSTM_ONLY, {
    workerPath: "/ocr/worker.min.js",
    langPath: "/ocr/lang",
    corePath: "/ocr/core",
    cacheMethod: "none",
    logger(message) {
      if (reportDetailedProgress && typeof message.progress === "number") {
        onProgress?.({ etapa: "Reconhecendo a escrita no computador", percentual: 15 + Math.round(message.progress * 70) });
      }
    },
  });

  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: "1" });
    const oriented = await orientForm(rendered, worker, onProgress);
    reportDetailedProgress = true;
    const enhanced = improveContrast(oriented);
    const imagem = oriented.toDataURL("image/jpeg", 0.82);
    // As caixas terminam antes das assinaturas e dos carimbos.
    const areas = {
      portador: crop(enhanced, { x: 0.06, y: 0.05, width: 0.88, height: 0.13 }),
      celular: crop(enhanced, { x: 0.06, y: 0.20, width: 0.88, height: 0.22 }),
      notebook: crop(enhanced, { x: 0.06, y: 0.41, width: 0.88, height: 0.15 }),
      justificativa: crop(enhanced, { x: 0.06, y: 0.56, width: 0.88, height: 0.08 }),
    };
    const results: Record<string, Awaited<ReturnType<typeof worker.recognize>>> = {};
    let completed = 0;
    for (const [name, area] of Object.entries(areas)) {
      results[name] = await worker.recognize(area);
      completed++;
      onProgress?.({ etapa: `Área ${completed} de 4 analisada`, percentual: 15 + completed * 20 });
    }
    // Para campos críticos, uma segunda leitura em linhas pequenas reduz a
    // interferência da grade e dos rótulos impressos no texto manuscrito.
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE, preserve_interword_spaces: "1" });
    const lineBoxes: Record<string, Box> = {
      nome: { x: 0.06, y: 0.090, width: 0.52, height: 0.028 },
      funcao: { x: 0.06, y: 0.112, width: 0.52, height: 0.027 },
      identidade: { x: 0.06, y: 0.135, width: 0.52, height: 0.026 },
      empresa: { x: 0.58, y: 0.090, width: 0.36, height: 0.028 },
      matricula: { x: 0.58, y: 0.112, width: 0.36, height: 0.027 },
      cpf: { x: 0.58, y: 0.135, width: 0.36, height: 0.026 },
      celularMarca: { x: 0.06, y: 0.256, width: 0.42, height: 0.026 },
      celularModelo: { x: 0.50, y: 0.256, width: 0.44, height: 0.026 },
      celularSerie: { x: 0.06, y: 0.278, width: 0.42, height: 0.026 },
      celularImei: { x: 0.50, y: 0.278, width: 0.44, height: 0.026 },
      celularAcessorios: { x: 0.06, y: 0.300, width: 0.88, height: 0.026 },
      celularContato: { x: 0.06, y: 0.322, width: 0.88, height: 0.026 },
      notebookMarca: { x: 0.06, y: 0.466, width: 0.42, height: 0.026 },
      notebookModelo: { x: 0.50, y: 0.466, width: 0.44, height: 0.026 },
      notebookSerie: { x: 0.06, y: 0.488, width: 0.42, height: 0.026 },
      notebookAcessorios: { x: 0.06, y: 0.510, width: 0.88, height: 0.026 },
      justificativa: { x: 0.06, y: 0.590, width: 0.88, height: 0.047 },
    };
    const lines: Record<string, string> = {};
    for (const [name, box] of Object.entries(lineBoxes)) {
      const lineResult = await worker.recognize(crop(enhanced, box));
      lines[name] = lineResult.data.confidence >= 35 ? lineResult.data.text : "";
    }
    const portador = parsePortador(results.portador.data.text);
    portador.nome = recognizedValue(lines.nome, /^\s*nome\s*[:;]?/i) || portador.nome;
    portador.funcao = recognizedValue(lines.funcao, /^\s*fun[cç][aã]o\s*[:;]?/i) || portador.funcao;
    portador.identidade = recognizedValue(lines.identidade, /^\s*(?:identidade|rg)\s*[:;]?/i) || portador.identidade;
    portador.empresa = recognizedValue(lines.empresa, /^\s*empresa\s*[:;]?/i) || portador.empresa;
    portador.matricula = recognizedValue(lines.matricula, /^\s*matr[ií]cula\s*[:;]?/i) || portador.matricula;
    portador.cpf = recognizedValue(lines.cpf, /^\s*cpf\s*[:;]?/i) || portador.cpf;
    const celular = parseEquipment(results.celular.data.text, "celular");
    celular.marca = recognizedValue(lines.celularMarca, /^\s*marca\s*[:;]?/i) || celular.marca;
    celular.modelo = recognizedValue(lines.celularModelo, /^\s*modelo\s*[:;]?/i) || celular.modelo;
    celular.numero_serie = recognizedValue(lines.celularSerie, /^\s*(?:n[uú]mero de s[eé]rie|n[ºo]?\s*de s[eé]rie)\s*[:;]?/i) || celular.numero_serie;
    celular.imei = recognizedValue(lines.celularImei, /^\s*imei\s*[:;]?/i) || celular.imei;
    celular.acessorios = recognizedValue(lines.celularAcessorios, /^\s*acess[oó]rios\s*[:;]?/i) || celular.acessorios;
    celular.contato = recognizedValue(lines.celularContato, /^\s*(?:n[ºo]?\s*)?contatos?\s*[:;]?/i) || celular.contato;
    const notebook = parseEquipment(results.notebook.data.text, "notebook");
    notebook.marca = recognizedValue(lines.notebookMarca, /^\s*marca\s*[:;]?/i) || notebook.marca;
    notebook.modelo = recognizedValue(lines.notebookModelo, /^\s*modelo\s*[:;]?/i) || notebook.modelo;
    notebook.numero_serie = recognizedValue(lines.notebookSerie, /^\s*(?:n[uú]mero de s[eé]rie|n[ºo]?\s*de s[eé]rie)\s*[:;]?/i) || notebook.numero_serie;
    notebook.acessorios = recognizedValue(lines.notebookAcessorios, /^\s*acess[oó]rios\s*[:;]?/i) || notebook.acessorios;
    const texts = [...Object.values(results).map((result) => result.data.text), ...Object.values(lines)];
    const confidence = Object.values(results).reduce((sum, result) => sum + result.data.confidence, 0) / 4;
    const justificationText = (lines.justificativa || results.justificativa.data.text)
      .replace(/justificativa\s*[:;]?/i, "")
      .replace(/ci[eê]ncia.*$/is, "")
      .trim();
    onProgress?.({ etapa: "Leitura concluída - confira todos os campos", percentual: 100 });
    return {
      portador,
      celular,
      notebook,
      justificativa: clean(justificationText),
      confianca: Math.round(confidence),
      textoReconhecido: texts.join("\n\n"),
      imagem,
    };
  } finally {
    await worker.terminate();
  }
}

export function equipamentoTemDados(equipment: EquipamentoOcr) {
  return [equipment.marca, equipment.modelo, equipment.numero_serie, equipment.imei, equipment.acessorios, equipment.contato].some((value) => value.trim());
}

export function equipamentoVazio(tipo: "celular" | "notebook") {
  return emptyEquipment(tipo);
}
