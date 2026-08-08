import React from "react";
import { Search } from "lucide-react";
import NotificationBell from "../notifications/NotificationBell.jsx";
import UserMenu from "./UserMenu.jsx";
import { cx } from "../../lib/cx.js";

/**
 * The command bar.
 *
 * Sticky, one row, hairline bottom. It carries where you are on the left and
 * what you can do on the right, and the search field doubles as the visible
 * affordance for ⌘K so the shortcut is discoverable rather than folklore.
 */
function Topbar({
  title,
  subtitle,
  search,
  setSearch,
  placeholder,
  showSearch = true,
  onOpenPalette,
  onNavigate,
  actions,
}) {
  return (
    <header className="sticky top-0 z-30 -mx-4 mb-6 border-b border-ink-600 bg-ink-900/85 px-4 backdrop-blur-md sm:-mx-6 sm:px-6">
      <div className="flex h-[72px] items-center gap-3">
        <div className="min-w-0 shrink-0">
          <h1 className="title-lg truncate text-[22px]">{title}</h1>
          {subtitle ? <p className="mt-0.5 truncate text-[11.5px] text-mist-500">{subtitle}</p> : null}
        </div>

        {showSearch && (
          <div className="ml-auto hidden min-w-0 flex-1 justify-end md:flex">
            <div
              className={cx(
                "flex h-9 w-full max-w-sm items-center gap-2 rounded-tile border border-ink-600 bg-ink-850 px-3",
                "transition-colors focus-within:border-brand/50"
              )}
            >
              <Search className="h-3.5 w-3.5 shrink-0 text-mist-600" aria-hidden="true" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={placeholder || "Search"}
                aria-label={placeholder || "Search"}
                className="min-w-0 flex-1 bg-transparent text-[13px] text-paper outline-none placeholder:text-mist-600"
              />
            </div>
          </div>
        )}

        <div className={cx("flex items-center gap-2", !showSearch && "ml-auto")}>
          <button
            type="button"
            onClick={onOpenPalette}
            aria-label="Search and jump to anything"
            className="hidden h-9 items-center gap-2 rounded-tile border border-ink-600 bg-ink-850 px-2.5 text-mist-500 transition-colors hover:border-ink-400 hover:text-paper sm:flex"
          >
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            <kbd className="num text-[10px] font-medium">⌘K</kbd>
          </button>

          {actions}
          <NotificationBell onNavigate={onNavigate} />
          <UserMenu />
        </div>
      </div>

      {showSearch && (
        <div className="flex h-12 items-center gap-2 border-t border-ink-700 md:hidden">
          <Search className="h-3.5 w-3.5 shrink-0 text-mist-600" aria-hidden="true" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={placeholder || "Search"}
            aria-label={placeholder || "Search"}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-paper outline-none placeholder:text-mist-600"
          />
        </div>
      )}
    </header>
  );
}

export default Topbar;
