import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, UserCheck, UserX } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid, LineChart, Line } from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Gestão de Colaboradores" }] }),
  component: Dashboard,
});

const COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

function Dashboard() {
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [emp, col] = await Promise.all([
        supabase.from("empresas").select("id, razao_social, nome_fantasia"),
        supabase.from("colaboradores").select("id, empresa_id, cargo, cidade, status, data_admissao, data_desligamento"),
      ]);
      return { empresas: emp.data ?? [], colaboradores: col.data ?? [] };
    },
  });

  const empresas = data?.empresas ?? [];
  const colabs = data?.colaboradores ?? [];
  const ativos = colabs.filter((c) => c.status === "ativo").length;
  const desligados = colabs.filter((c) => c.status === "desligado").length;

  const porEmpresa = empresas.map((e) => ({
    name: e.nome_fantasia || e.razao_social,
    total: colabs.filter((c) => c.empresa_id === e.id).length,
  })).sort((a, b) => b.total - a.total).slice(0, 8);

  const cargoMap = new Map<string, number>();
  colabs.forEach((c) => { if (c.cargo) cargoMap.set(c.cargo, (cargoMap.get(c.cargo) ?? 0) + 1); });
  const porCargo = Array.from(cargoMap.entries()).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total).slice(0, 8);

  const cidadeMap = new Map<string, number>();
  colabs.forEach((c) => { if (c.cidade) cidadeMap.set(c.cidade, (cidadeMap.get(c.cidade) ?? 0) + 1); });
  const porCidade = Array.from(cidadeMap.entries()).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total).slice(0, 8);

  const statusData = [
    { name: "Ativos", value: ativos },
    { name: "Desligados", value: desligados },
  ];

  // Admissões / Desligamentos últimos 6 meses
  const now = new Date();
  const months: { key: string; label: string; adm: number; des: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.push({ key, label: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }), adm: 0, des: 0 });
  }
  colabs.forEach((c) => {
    if (c.data_admissao) {
      const k = c.data_admissao.slice(0, 7);
      const m = months.find((x) => x.key === k);
      if (m) m.adm++;
    }
    if (c.data_desligamento) {
      const k = c.data_desligamento.slice(0, 7);
      const m = months.find((x) => x.key === k);
      if (m) m.des++;
    }
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
        <Kpi title="Ativos" value={ativos} icon={<UserCheck className="h-5 w-5" />} tone="text-emerald-600" />
        <Kpi title="Desligados" value={desligados} icon={<UserX className="h-5 w-5" />} tone="text-red-600" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Colaboradores por Empresa">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={porEmpresa}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
              <YAxis allowDecimals={false} />
              <Tooltip />
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
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Por Cargo (Top 8)">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={porCargo} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="total" fill="var(--color-chart-2)" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Por Cidade (Top 8)">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={porCidade}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="total" fill="var(--color-chart-3)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Admissões x Desligamentos (últimos 6 meses)" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={months}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="label" />
              <YAxis allowDecimals={false} />
              <Tooltip />
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
