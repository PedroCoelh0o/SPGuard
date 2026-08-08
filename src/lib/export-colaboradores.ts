import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/local-db/client";
import { formatDate } from "./format";

export type ColabExport = {
  id: string;
  nome: string;
  empresa_id: string;
  cpf: string | null;
  matricula: string | null;
  cargo: string | null;
  cidade: string | null;
  estado?: string | null;
  email?: string | null;
  telefone?: string | null;
  celular?: string | null;
  data_admissao: string | null;
  data_desligamento?: string | null;
  status: string;
};

export type EmpresaLite = { id: string; razao_social: string; nome_fantasia: string | null };

export type ExportFilters = Record<string, string | undefined | null>;

async function logExportacao(tipo: "csv" | "pdf" | "xlsx", filtros: ExportFilters, total: number) {
  try {
    const cleanFilters = Object.fromEntries(
      Object.entries(filtros).filter(([, v]) => v != null && v !== "" && v !== "all"),
    );
    await supabase.from("audit_exportacoes").insert({
      tipo,
      modulo: "colaboradores",
      filtros: cleanFilters,
      total_registros: total,
    } as never);
  } catch (e) {
    console.warn("Falha ao registrar auditoria de exportação", e);
  }
}

function empresaLabel(id: string, empresas: EmpresaLite[]) {
  const e = empresas.find((x) => x.id === id);
  return e ? e.nome_fantasia || e.razao_social : "-";
}

async function fetchAnexosCount(ids: string[]) {
  const map = new Map<string, number>();
  if (ids.length === 0) return map;
  const { data } = await supabase
    .from("colaborador_documentos")
    .select("colaborador_id")
    .in("colaborador_id", ids);
  (data ?? []).forEach((r) => {
    map.set(r.colaborador_id, (map.get(r.colaborador_id) ?? 0) + 1);
  });
  return map;
}

function csvEscape(v: unknown) {
  const s = v == null ? "" : String(v);
  if (/[",;\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function timestamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function filtersLine(filters: ExportFilters) {
  const parts = Object.entries(filters)
    .filter(([, v]) => v != null && v !== "" && v !== "all")
    .map(([k, v]) => `${k}: ${v}`);
  return parts.length ? parts.join(" | ") : "Nenhum filtro aplicado";
}

export async function exportColaboradoresCSV(
  colabs: ColabExport[],
  empresas: EmpresaLite[],
  filters: ExportFilters = {},
) {
  const anexos = await fetchAnexosCount(colabs.map((c) => c.id));
  const headers = [
    "Nome", "Empresa", "CPF", "Matrícula", "Cargo", "Cidade", "UF",
    "E-mail", "Telefone", "Admissão", "Desligamento", "Situação", "Anexos",
  ];
  const rows = colabs.map((c) => [
    c.nome,
    empresaLabel(c.empresa_id, empresas),
    c.cpf ?? "",
    c.matricula ?? "",
    c.cargo ?? "",
    c.cidade ?? "",
    c.estado ?? "",
    c.email ?? "",
    c.telefone ?? c.celular ?? "",
    formatDate(c.data_admissao),
    formatDate(c.data_desligamento ?? null),
    c.status === "ativo" ? "Ativo" : "Desligado",
    String(anexos.get(c.id) ?? 0),
  ]);
  const meta = [
    [`Relatório de Colaboradores`],
    [`Gerado em: ${new Date().toLocaleString("pt-BR")}`],
    [`Filtros: ${filtersLine(filters)}`],
    [`Total: ${colabs.length}`],
    [],
  ];
  const lines = [...meta, headers, ...rows].map((r) => r.map(csvEscape).join(";")).join("\r\n");
  const blob = new Blob(["\uFEFF" + lines], { type: "text/csv;charset=utf-8" });
  download(blob, `colaboradores-${timestamp()}.csv`);
  await logExportacao("csv", filters, colabs.length);
}

export async function exportColaboradoresPDF(
  colabs: ColabExport[],
  empresas: EmpresaLite[],
  filters: ExportFilters = {},
) {
  const anexos = await fetchAnexosCount(colabs.map((c) => c.id));
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(14);
  doc.text("Relatório de Colaboradores", 40, 40);
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 40, 56);
  const filtroTxt = doc.splitTextToSize(`Filtros: ${filtersLine(filters)}`, pageWidth - 80);
  doc.text(filtroTxt, 40, 70);
  doc.text(`Total de registros: ${colabs.length}`, 40, 70 + filtroTxt.length * 11);

  autoTable(doc, {
    startY: 88 + filtroTxt.length * 11,
    head: [["Nome", "Empresa", "Cargo", "Matrícula", "CPF", "Cidade/UF", "Admissão", "Situação", "Anexos"]],
    body: colabs.map((c) => [
      c.nome,
      empresaLabel(c.empresa_id, empresas),
      c.cargo ?? "-",
      c.matricula ?? "-",
      c.cpf ?? "-",
      [c.cidade, c.estado].filter(Boolean).join("/") || "-",
      formatDate(c.data_admissao),
      c.status === "ativo" ? "Ativo" : "Desligado",
      String(anexos.get(c.id) ?? 0),
    ]),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    didDrawPage: () => {
      const str = `Página ${doc.getCurrentPageInfo().pageNumber}`;
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(str, pageWidth - 60, doc.internal.pageSize.getHeight() - 20);
    },
  });

  doc.save(`colaboradores-${timestamp()}.pdf`);
  await logExportacao("pdf", filters, colabs.length);
}

export async function exportColaboradoresXLSX(
  colabs: ColabExport[],
  empresas: EmpresaLite[],
  filters: ExportFilters = {},
) {
  const anexos = await fetchAnexosCount(colabs.map((c) => c.id));
  const headers = [
    "Nome", "Empresa", "CPF", "Matrícula", "Cargo", "Cidade", "UF",
    "E-mail", "Telefone", "Admissão", "Desligamento", "Situação", "Anexos",
  ];
  const rows = colabs.map((c) => [
    c.nome,
    empresaLabel(c.empresa_id, empresas),
    c.cpf ?? "",
    c.matricula ?? "",
    c.cargo ?? "",
    c.cidade ?? "",
    c.estado ?? "",
    c.email ?? "",
    c.telefone ?? c.celular ?? "",
    formatDate(c.data_admissao),
    formatDate(c.data_desligamento ?? null),
    c.status === "ativo" ? "Ativo" : "Desligado",
    anexos.get(c.id) ?? 0,
  ]);
  const meta = [
    ["Relatório de Colaboradores"],
    [`Gerado em: ${new Date().toLocaleString("pt-BR")}`],
    [`Filtros: ${filtersLine(filters)}`],
    [`Total: ${colabs.length}`],
    [],
  ];
  const aoa = [...meta, headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 32 }, { wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 22 },
    { wch: 18 }, { wch: 6 }, { wch: 28 }, { wch: 16 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 8 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Colaboradores");
  XLSX.writeFile(wb, `colaboradores-${timestamp()}.xlsx`);
  await logExportacao("xlsx", filters, colabs.length);
}
