const KEY = "tp-theme";

export function getTheme() {
  if (typeof localStorage === "undefined") return "dark";
  return localStorage.getItem(KEY) || "dark";
}

export function setTheme(theme) {
  localStorage.setItem(KEY, theme);
  document.documentElement.setAttribute("data-theme", theme);
  const metaTheme = document.getElementById("meta-theme-color");
  if (metaTheme) metaTheme.content = theme === "light" ? "#f0f2f7" : "#0b0c10";
}
