import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Users, UserCheck, UserX, Smartphone, Laptop, Tablet } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid, LineChart, Line, Legend } from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — SPGuard" },
      { name: "description", content: "Painel do SPGuard com indicadores em tempo real de empresas, colaboradores ativos e desligados, e totais de celulares, notebooks e tablets." },
      { property: "og:title", content: "Dashboard — SPGuard" },
      { property: "og:description", content: "Indicadores em tempo real de empresas, colaboradores e eletrônicos da segurança patrimonial." },
      { property: "og:url", content: "https://spguardian.lovable.app/dashboard" },
    ],
    links: [{ rel: "canonical", href: "https://spguardian.lovable.app/dashboard" }],
  }),
  component: Dashboard,
});

const COLORS = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-4)", "var(--color-chart-5)"];

const tooltipStyle = {
  backgroundColor: "hsl(var(--popover, var(--card)))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  color: "hsl(var(--foreground))",
  fontSize: "12px",
} as const;
const tooltipLabelStyle = { color: "hsl(var(--foreground))", fontWeight: 600 } as const;
const axisTick = { fontSize: 11, fill: "hsl(var(--foreground))" };
const gridStroke = "hsl(var(--border))";

function Dashboard() {
  const [eletEmpresa, setEletEmpresa] = useState<string>("all");

  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [emp, col] = await Promise.all([
        supabase.from("empresas").select("id, razao_social, nome_fantasia"),
        fetchAllRows<{ id: string; empresa_id: string; cargo: string | null; cidade: string | null; status: string; data_admissao: string | null; data_desligamento: string | null }>(
          () => supabase.from("colaboradores").select("id, empresa_id, cargo, cidade, status, data_admissao, data_desligamento").order("id") as never,
        ),
      ]);
      return { empresas: emp.data ?? [], colaboradores: col };
    },
  });

  const { data: eletronicos = [] } = useQuery({
    queryKey: ["dashboard-eletronicos"],
    queryFn: async () => {
      const { data } = await supabase.from("eletronicos" as never).select("tipo, colaborador_id");
      return (data ?? []) as { tipo: "celular" | "notebook" | "tablet"; colaborador_id: string }[];
    },
  });

  const empresas = data?.empresas ?? [];
  const colabs = data?.colaboradores ?? [];
  const ativos = colabs.filter((c) => c.status === "ativo").length;
  const desligados = colabs.filter((c) => c.status === "desligado").length;
  const qtdCelulares = eletronicos.filter((e) => e.tipo === "celular").length;
  const qtdNotebooks = eletronicos.filter((e) => e.tipo === "notebook").length;
  const qtdTablets = eletronicos.filter((e) => e.tipo === "tablet").length;

  const colabEmpresaMap = useMemo(() => {
    const m = new Map<string, string>();
    colabs.forEach((c) => m.set(c.id, c.empresa_id));
    return m;
  }, [colabs]);

  const eletronicosData = useMemo(() => {
    const filtered = eletEmpresa === "all"
      ? eletronicos
      : eletronicos.filter((e) => colabEmpresaMap.get(e.colaborador_id) === eletEmpresa);
    return [
      { tipo: "Celulares", total: filtered.filter((e) => e.tipo === "celular").length },
      { tipo: "Notebooks", total: filtered.filter((e) => e.tipo === "notebook").length },
      { tipo: "Tablets", total: filtered.filter((e) => e.tipo === "tablet").length },
    ];
  }, [eletronicos, colabEmpresaMap, eletEmpresa]);

  const porEmpresa = empresas.map((e) => ({
    name: e.nome_fantasia || e.razao_social,
    total: colabs.filter((c) => c.empresa_id === e.id).length,
  })).sort((a, b) => b.total - a.total).slice(0, 8);



  const statusData = [
    { name: "Ativos", value: ativos },
    { name: "Desligados", value: desligados },
  ];

  const now = new Date();
  const months: { key: string; label: string; adm: number; des: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.push({ key, label: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }), adm: 0, des: 0 });
  }
  colabs.forEach((c) => {
    if (c.data_admissao) { const m = months.find((x) => x.key === c.data_admissao!.slice(0, 7)); if (m) m.adm++; }
    if (c.data_desligamento) { const m = months.find((x) => x.key === c.data_desligamento!.slice(0, 7)); if (m) m.des++; }
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral em tempo real</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi title="Empresas" value={empresas.length} icon={<Building2 className="h-5 w-5" />} />
        <Kpi title="Colaboradores" value={colabs.length} icon={<Users className="h-5 w-5" />} />
        <Kpi title="Ativos" value={ativos} icon={<UserCheck className="h-5 w-5" />} tone="text-emerald-500 dark:text-emerald-400" />
        <Kpi title="Desligados" value={desligados} icon={<UserX className="h-5 w-5" />} tone="text-red-500 dark:text-red-400" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi title="Celulares" value={qtdCelulares} icon={<Smartphone className="h-5 w-5" />} />
        <Kpi title="Notebooks" value={qtdNotebooks} icon={<Laptop className="h-5 w-5" />} />
        <Kpi title="Tablets" value={qtdTablets} icon={<Tablet className="h-5 w-5" />} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Eletrônicos por tipo</CardTitle>
          <Select value={eletEmpresa} onValueChange={setEletEmpresa}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as empresas</SelectItem>
              {empresas.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome_fantasia || e.razao_social}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={eletronicosData}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} opacity={0.5} />
              <XAxis dataKey="tipo" tick={axisTick} />
              <YAxis allowDecimals={false} tick={axisTick} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }} />
              <Bar dataKey="total" radius={[8, 8, 0, 0]}>
                {eletronicosData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Colaboradores por Empresa">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={porEmpresa}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} opacity={0.5} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#ffffff" }} interval={0} angle={-20} textAnchor="end" height={60} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#ffffff" }} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }} />
              <Bar dataKey="total" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Situação">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={statusData} dataKey="value" nameKey="name" outerRadius={100} label>
                {statusData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} />
              <Legend wrapperStyle={{ color: "hsl(var(--foreground))" }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Admissões x Desligamentos (últimos 6 meses)" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={months}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} opacity={0.5} />
              <XAxis dataKey="label" tick={axisTick} />
              <YAxis allowDecimals={false} tick={axisTick} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} />
              <Legend wrapperStyle={{ color: "hsl(var(--foreground))" }} />
              <Line type="monotone" dataKey="adm" name="Admissões" stroke="var(--color-chart-1)" strokeWidth={2} />
              <Line type="monotone" dataKey="des" name="Desligamentos" stroke="var(--color-chart-5)" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function Kpi({ title, value, icon, tone }: { title: string; value: number; icon: React.ReactNode; tone?: string }) {
  return (
    <Card>
      <CardContent className="p-5 flex items-center justify-between">
        <div>
          <div className="text-sm text-muted-foreground">{title}</div>
          <div className={`text-3xl font-bold mt-1 ${tone ?? ""}`}>{value}</div>
        </div>
        <div className="grid h-11 w-11 place-items-center rounded-lg bg-primary/10 text-primary">{icon}</div>
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
