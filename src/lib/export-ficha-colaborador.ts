import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDate } from "./format";

export type FichaColaborador = {
  nome: string;
  cpf: string | null;
  rg: string | null;
  matricula: string | null;
  cargo: string | null;
  setor: string | null;
  escolaridade: string | null;
  data_nascimento: string | null;
  sexo: string | null;
  turno?: string | null;
  data_admissao: string | null;
  data_desligamento: string | null;
  motivo_desligamento: string | null;
  observacoes: string | null;
  status: string;
  telefone: string | null;
  celular: string | null;
  email: string | null;
  cep: string | null;
  rua: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
};

export type FichaEletronico = {
  tipo: string;
  descricao: string | null;
  modelo: string | null;
  imei: string | null;
  numero_serie: string | null;
  numero_selo: string | null;
  acessorios: string | null;
  justificativa: string | null;
};

export type FichaDocumento = { nome: string; tamanho: number | null; created_at: string };

const tipoLabel: Record<string, string> = { celular: "Celular", notebook: "Notebook", tablet: "Tablet" };

function text(value: string | null | undefined) {
  return value?.trim() || "-";
}

function formatSize(bytes: number | null) {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function timestamp() {
  const now = new Date();
  const part = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${part(now.getMonth() + 1)}${part(now.getDate())}-${part(now.getHours())}${part(now.getMinutes())}`;
}

function safeFilename(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "colaborador";
}

function addSection(doc: jsPDF, title: string, y: number) {
  doc.setFillColor(30, 41, 59);
  doc.rect(40, y, 515, 18, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text(title, 48, y + 12);
  doc.setTextColor(0, 0, 0);
  return y + 24;
}

function nextY(doc: jsPDF, fallback: number) {
  return ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? fallback) + 16;
}

export function exportFichaColaboradorPDF(
  colaborador: FichaColaborador,
  empresa: string,
  eletronicos: FichaEletronico[],
  documentos: FichaDocumento[],
) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 42;

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Ficha completa do colaborador", 40, y);
  y += 18;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 40, y);
  y += 26;

  y = addSection(doc, "IDENTIFICAÇÃO", y);
  autoTable(doc, {
    startY: y,
    theme: "grid",
    head: [["Campo", "Informação", "Campo", "Informação"]],
    body: [
      ["Nome", text(colaborador.nome), "Empresa", text(empresa)],
      ["CPF", text(colaborador.cpf), "RG", text(colaborador.rg)],
      ["Matrícula", text(colaborador.matricula), "Status", colaborador.status === "ativo" ? "Ativo" : "Desligado"],
      ["Nascimento", formatDate(colaborador.data_nascimento), "Sexo", colaborador.sexo === "M" ? "Masculino" : colaborador.sexo === "F" ? "Feminino" : colaborador.sexo === "O" ? "Outro" : "-"],
    ],
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [71, 85, 105] },
    columnStyles: { 0: { cellWidth: 70, fontStyle: "bold" }, 1: { cellWidth: 188 }, 2: { cellWidth: 70, fontStyle: "bold" }, 3: { cellWidth: 187 } },
  });

  y = addSection(doc, "DADOS TRABALHISTAS", nextY(doc, y));
  autoTable(doc, {
    startY: y,
    theme: "grid",
    body: [
      ["Cargo", text(colaborador.cargo), "Setor", text(colaborador.setor)],
      ["Turno", text(colaborador.turno), "Escolaridade", text(colaborador.escolaridade)],
      ["Admissão", formatDate(colaborador.data_admissao), "Desligamento", formatDate(colaborador.data_desligamento)],
      ["Motivo do desligamento", text(colaborador.motivo_desligamento), "", ""],
    ],
    styles: { fontSize: 8, cellPadding: 4 },
    columnStyles: { 0: { cellWidth: 110, fontStyle: "bold" }, 1: { cellWidth: 148 }, 2: { cellWidth: 110, fontStyle: "bold" }, 3: { cellWidth: 147 } },
  });

  y = addSection(doc, "CONTATO E ENDEREÇO", nextY(doc, y));
  autoTable(doc, {
    startY: y,
    theme: "grid",
    body: [
      ["Telefone", text(colaborador.telefone), "Celular", text(colaborador.celular)],
      ["E-mail", text(colaborador.email), "CEP", text(colaborador.cep)],
      ["Endereço", text([colaborador.rua, colaborador.numero].filter(Boolean).join(", ")), "Bairro", text(colaborador.bairro)],
      ["Cidade / UF", text([colaborador.cidade, colaborador.estado].filter(Boolean).join(" - ")), "", ""],
    ],
    styles: { fontSize: 8, cellPadding: 4 },
    columnStyles: { 0: { cellWidth: 80, fontStyle: "bold" }, 1: { cellWidth: 178 }, 2: { cellWidth: 80, fontStyle: "bold" }, 3: { cellWidth: 177 } },
  });

  y = nextY(doc, y);
  if (y > 670) { doc.addPage(); y = 42; }
  y = addSection(doc, "OBSERVAÇÕES", y);
  const observations = doc.splitTextToSize(text(colaborador.observacoes), pageWidth - 96);
  doc.setFontSize(9);
  doc.text(observations, 48, y + 4);
  y += Math.max(28, observations.length * 11 + 12);

  if (y > 620) { doc.addPage(); y = 42; }
  y = addSection(doc, "ELETRÔNICOS VINCULADOS", y);
  autoTable(doc, {
    startY: y,
    head: [["Tipo", "Descrição", "Identificadores e detalhes"]],
    body: eletronicos.length
      ? eletronicos.map((item) => [
        tipoLabel[item.tipo] ?? item.tipo,
        text(item.descricao),
        [
          `Modelo: ${text(item.modelo)}`,
          `IMEI: ${text(item.imei)}`,
          `Nº de série: ${text(item.numero_serie)}`,
          `Patrimônio/selo: ${text(item.numero_selo)}`,
          `Acessórios: ${text(item.acessorios)}`,
          `Justificativa: ${text(item.justificativa)}`,
        ].join("\n"),
      ])
      : [["Nenhum eletrônico vinculado", "", ""]],
    styles: { fontSize: 7, cellPadding: 3 },
    headStyles: { fillColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [245, 247, 250] },
  });

  y = nextY(doc, y);
  if (y > 620) { doc.addPage(); y = 42; }
  y = addSection(doc, "DOCUMENTOS ANEXADOS", y);
  autoTable(doc, {
    startY: y,
    head: [["Documento", "Tamanho", "Enviado em"]],
    body: documentos.length
      ? documentos.map((item) => [item.nome, formatSize(item.tamanho), formatDate(item.created_at)])
      : [["Nenhum documento anexado", "", ""]],
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [245, 247, 250] },
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(`SPGuard · Ficha de ${colaborador.nome}`, 40, doc.internal.pageSize.getHeight() - 20);
    doc.text(`Página ${page} de ${pageCount}`, pageWidth - 85, doc.internal.pageSize.getHeight() - 20);
  }
  doc.save(`ficha-${safeFilename(colaborador.nome)}-${timestamp()}.pdf`);
}
