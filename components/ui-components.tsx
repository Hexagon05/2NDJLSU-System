"use client";

// Sidebar component for layout
export function Sidebar({ isOpen, onToggle, navigationItems, onLogout }: any) {
  return (
    <div
      className={`${isOpen ? "w-64" : "w-20"
        } bg-gradient-to-b from-slate-900 to-slate-800 shadow-2xl transition-all duration-300 ease-in-out flex flex-col border-r border-slate-700/50`}
    >
      <div className="flex h-16 items-center justify-between border-b border-slate-700/50 px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-green-600 text-white shadow-lg shadow-emerald-500/30 flex-shrink-0">
            <span className="material-symbols-outlined" style={{ fontSize: "1.25rem" }}>local_shipping</span>
          </div>
          {isOpen && (
            <div className="animate-fade-in overflow-hidden">
              <p className="font-bold text-white tracking-wide">Log Truck</p>
              <p className="text-xs text-slate-400">v2.0</p>
            </div>
          )}
        </div>
        <button
          onClick={onToggle}
          className="rounded-lg p-1.5 hover:bg-slate-700 transition-colors text-slate-400 hover:text-white"
        >
          <span className="material-symbols-outlined" style={{ fontSize: "1.25rem" }}>
            {isOpen ? "menu_open" : "menu"}
          </span>
        </button>
      </div>

      <nav className="space-y-1 px-3 py-4 flex-1">
        {navigationItems.map((item: any) => (
          <a
            key={item.name}
            href={item.href}
            className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all duration-200 ${item.active
                ? "bg-gradient-to-r from-emerald-500/20 to-emerald-500/5 text-emerald-400 border border-emerald-500/30 shadow-md"
                : "text-slate-400 hover:bg-slate-700/50 hover:text-white"
              }`}
          >
            <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: "1.25rem" }}>{item.icon}</span>
            {isOpen && <span className="truncate">{item.name}</span>}
          </a>
        ))}
      </nav>

      <div className="border-t border-slate-700/50 p-3">
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-400 hover:bg-rose-500/10 hover:text-rose-400 transition-all duration-200 border border-transparent hover:border-rose-500/20"
        >
          <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: "1.25rem" }}>logout</span>
          {isOpen && "Logout"}
        </button>
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}

// Header component
export function Header({ title, titleIcon, user, onNotify }: any) {
  return (
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm px-6 py-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {titleIcon && (
            <span className="material-symbols-outlined text-slate-600" style={{ fontSize: "1.75rem" }}>{titleIcon}</span>
          )}
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
        </div>
        <div className="flex items-center gap-4">
          <button className="relative p-2.5 hover:bg-slate-100 rounded-xl transition-colors group" onClick={onNotify}>
            <span className="material-symbols-outlined text-slate-500 group-hover:text-slate-700" style={{ fontSize: "1.5rem" }}>notifications</span>
            <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 bg-rose-500 rounded-full animate-pulse ring-2 ring-white"></span>
          </button>
          <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-900">{user?.email}</p>
              <p className="text-xs text-slate-500">System Administrator</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-500/30">
              <span className="material-symbols-outlined" style={{ fontSize: "1.25rem" }}>person</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

// Status Badge component
export function StatusBadge({ status }: { status: string }) {
  const getStatusStyle = (status: string) => {
    switch (status) {
      case "Active": return "bg-emerald-100 text-emerald-800 border border-emerald-200";
      case "In Transit": return "bg-blue-100 text-blue-800 border border-blue-200";
      case "Maintenance": return "bg-amber-100 text-amber-800 border border-amber-200";
      case "Emergency": return "bg-rose-100 text-rose-800 border border-rose-200";
      default: return "bg-slate-100 text-slate-800 border border-slate-200";
    }
  };

  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${getStatusStyle(status)}`}>
      {status}
    </span>
  );
}

// Loading Spinner
export function LoadingSpinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="text-center">
        <span
          className="material-symbols-outlined animate-spin text-blue-400"
          style={{ fontSize: "3rem" }}
        >
          progress_activity
        </span>
        <p className="mt-4 text-slate-300 font-medium tracking-wide">Loading...</p>
      </div>
    </div>
  );
}

// Metric Card component
export function MetricCard({ title, value, icon, color, glow = "", delay = 0 }: any) {
  return (
    <div
      className={`bg-gradient-to-br ${color} rounded-2xl p-6 shadow-xl ${glow} transition-all duration-300 hover:shadow-2xl hover:scale-105 animate-fade-in text-white`}
      style={{ animationDelay: `${delay * 0.1}s` }}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-white/70 tracking-wide">{title}</p>
          <p className="mt-2 text-4xl font-bold tracking-tight">{value}</p>
        </div>
        <div className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
          <span className="material-symbols-outlined text-white/80" style={{ fontSize: "2rem" }}>{icon}</span>
        </div>
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.4s ease-out forwards;
          opacity: 0;
        }
      `}</style>
    </div>
  );
}

// Pagination component
export function Pagination({ currentPage, totalPages, onPageChange }: any) {
  return (
    <div className="flex gap-1.5">
      <button className="flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors text-sm font-medium">
        <span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>chevron_left</span>
      </button>
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
        <button
          key={page}
          className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition-all ${currentPage === page
              ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/30"
              : "border border-slate-200 text-slate-600 hover:bg-slate-100"
            }`}
          onClick={() => onPageChange(page)}
        >
          {page}
        </button>
      ))}
      <button className="flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors text-sm font-medium">
        <span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>chevron_right</span>
      </button>
    </div>
  );
}