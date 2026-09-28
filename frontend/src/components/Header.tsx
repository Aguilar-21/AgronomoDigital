import { Bell, Menu, UserCircle } from "lucide-react";

function Header() {
  return (
    <header className="flex h-20 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-8">
      <div className="flex items-center gap-3">
        <button
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
          aria-label="Abrir menú"
        >
          <Menu size={24} />
        </button>

        <div>
          <p className="text-xs font-medium text-slate-400">
            Panel de control
          </p>

          <h2 className="text-lg font-bold text-slate-800 md:text-xl">
            Buenos días 👋
          </h2>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          className="relative rounded-xl p-2.5 text-slate-500 transition hover:bg-slate-100"
          aria-label="Notificaciones"
        >
          <Bell size={21} />

          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#D97706]" />
        </button>

        <div className="hidden items-center gap-2 border-l border-slate-200 pl-4 sm:flex">
          <UserCircle size={32} className="text-[#1B5E20]" />

          <div>
            <p className="text-sm font-semibold text-slate-700">
              Agricultor
            </p>

            <p className="text-xs text-slate-400">
              Mi cuenta
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;