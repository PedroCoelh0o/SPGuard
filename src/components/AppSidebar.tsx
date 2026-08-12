import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Building2, Users, Search, Smartphone, CircleHelp } from "lucide-react";
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
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="relative h-16 w-16 shrink-0" aria-label="Distintivo SEPAT">
            <svg viewBox="0 0 64 64" className="absolute inset-0 h-full w-full text-sidebar-primary" fill="currentColor" aria-hidden="true">
              <path d="M32 2 L58 12 V30 C58 46 46 56 32 62 C18 56 6 46 6 30 V12 Z" />
              <path d="M32 6 L54 14.5 V30 C54 43.5 43.5 52.5 32 58 C20.5 52.5 10 43.5 10 30 V14.5 Z" fill="none" stroke="hsl(var(--sidebar-primary-foreground))" strokeOpacity="0.35" strokeWidth="1.5" />
            </svg>
            <div className="absolute inset-0 grid place-items-center font-black text-[10px] tracking-[0.12em] text-sidebar-primary-foreground">
              SEPAT
            </div>
          </div>
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
          SPGuard · SEPAT
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
