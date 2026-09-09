/** Trigger a file save from a user click. Blob URLs must stay in the DOM and not be revoked immediately. */
export function downloadTextFile(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob(["\uFEFF", content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  window.setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 2500);
}