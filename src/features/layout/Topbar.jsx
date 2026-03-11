import React from "react";
import { Bell, ChevronDown, Plus, Search } from "lucide-react";
import Input from "../../components/ui/Input.jsx";

function Topbar({ title, subtitle, search, setSearch, placeholder, showSearch = true, showNew = false }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-lg font-bold tracking-tight text-slate-900">{title}</div>
          {subtitle ? <div className="text-sm text-slate-500">{subtitle}</div> : null}
        </div>

        <div className="flex items-center gap-3">
          {showSearch && (
            <div className="hidden lg:flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 w-[420px]">
              <Search className="h-4 w-4 text-slate-500" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={placeholder || "Search..."}
                className="border-0 bg-transparent text-slate-900 placeholder:text-slate-400 focus-visible:ring-0"
              />
            </div>
          )}

          {showNew && (
            <button className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
              <Plus className="h-4 w-4" />
              New
            </button>
          )}

          <button className="h-11 w-11 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center">
            <Bell className="h-5 w-5 text-slate-700" />
          </button>

          <button className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-indigo-200 to-sky-200" />
            <div className="hidden sm:block text-left">
              <div className="text-sm font-semibold text-slate-900 leading-4">Admin</div>
              <div className="text-[11px] text-slate-500">HR Manager</div>
            </div>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </button>
        </div>

        {showSearch && (
          <div className="flex lg:hidden items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
            <Search className="h-4 w-4 text-slate-500" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={placeholder || "Search..."}
              className="border-0 bg-transparent text-slate-900 placeholder:text-slate-400 focus-visible:ring-0"
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default Topbar;
