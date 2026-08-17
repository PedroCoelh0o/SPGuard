import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Building2, Users, Search, Smartphone, CircleHelp, ShieldAlert } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter,
} from "@/components/ui/sidebar";

const items = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Empresas", url: "/empresas", icon: Building2 },
  { title: "Colaboradores", url: "/colaboradores", icon: Users },
  { title: "Consulta", url: "/consulta", icon: Search },
  { title: "Eletrônicos", url: "/eletronicos", icon: Smartphone },
  { title: "Ocorrências e Apurações", url: "/ocorrencias", icon: ShieldAlert },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:py-2">
          <img src="/cmoc-logo.svg" alt="CMOC" className="h-12 w-28 shrink-0 object-contain transition-all group-data-[collapsible=icon]:h-9 group-data-[collapsible=icon]:w-9" />
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="text-sm font-semibold truncate">SPGuard</div>
            <div className="text-xs text-sidebar-foreground/60 truncate">Segurança Patrimonial</div>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={pathname.startsWith(item.url)}>
                    <Link to={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname.startsWith("/ajuda")}>
              <Link to="/ajuda"><CircleHelp /><span>Ajuda</span></Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="px-2 py-2 text-xs text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden">
          SPGuard · CMOC
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
