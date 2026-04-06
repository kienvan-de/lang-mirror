import { Link, Outlet } from "@tanstack/react-router";
import { useState } from "react";

export function RootLayout() {
  const [dark, setDark] = useState(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  const toggleDark = () => {
    setDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      return next;
    });
  };

  if (dark) document.documentElement.classList.add("dark");

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <nav className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 py-3 flex items-center gap-6 sticky top-0 z-40 shadow-sm">
        <Link to="/" className="font-bold text-lg tracking-tight select-none text-gray-900 dark:text-gray-100">
          🪞 lang-mirror
        </Link>
        <div className="flex gap-1 flex-1">
          {(
            [
              { to: "/" as const, label: "Dashboard" },
              { to: "/topics" as const, label: "Topics" },
              { to: "/import" as const, label: "Import" },
              { to: "/settings" as const, label: "Settings" },
            ] as const
          ).map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors [&.active]:text-blue-600 dark:[&.active]:text-blue-400 [&.active]:bg-blue-50 dark:[&.active]:bg-blue-900/20"
            >
              {label}
            </Link>
          ))}
        </div>
        <button
          onClick={toggleDark}
          className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400"
          aria-label="Toggle dark mode"
        >
          {dark ? "☀️" : "🌙"}
        </button>
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
