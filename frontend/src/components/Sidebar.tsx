import {
  BarChart3,
  FileText,
  LayoutDashboard,
  LineChart,
  Sprout,
} from "lucide-react";

const menuItems = [
  {
    label: "Dashboard",
    icon: LayoutDashboard,
    path: "/",
  },
  {
    label: "Precios",
    icon: Sprout,
    path: "/precios",
  },
  {
    label: "Comparativa",
    icon: BarChart3,
    path: "/comparativa",
  },
  {
    label: "Tendencias",
    icon: LineChart,
    path: "/tendencias",
  },
  {
    label: "Reportes",
    icon: FileText,
    path: "/reportes",
  },
];

function Sidebar() {
  return (
    <aside className="hidden min-h-screen w-64 flex-col bg-[#1B5E20] text-white md:flex">
      <div className="flex h-20 items-center gap-3 border-b border-white/10 px-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
          <Sprout size={24} />
        </div>

        <div>
          <h1 className="text-lg font-bold">AgrónomoDigital</h1>
          <p className="text-xs text-white/70">Gestión agrícola</p>
        </div>
      </div>

      <nav className="flex-1 px-4 py-6">
        <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-white/50">
          Menú principal
        </p>

        <div className="space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;

            return (
              <a
                key={item.path}
                href={item.path}
                className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
              >
                <Icon size={20} />
                <span>{item.label}</span>
              </a>
            );
          })}
        </div>
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="rounded-xl bg-white/10 p-4">
          <p className="text-xs text-white/60">AgrónomoDigital</p>
          <p className="mt-1 text-sm font-semibold">Tu cosecha, tus decisiones.</p>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;