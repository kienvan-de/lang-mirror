const SHORTCUTS = [
  { key: "Space", action: "Play TTS", condition: "When idle" },
  { key: "R", action: "Start / Stop recording", condition: "Manual mode" },
  { key: "P", action: "Play back recording", condition: "Recording exists" },
  { key: "→ / L", action: "Next sentence", condition: "Not recording" },
  { key: "← / H", action: "Previous sentence", condition: "Not recording" },
  { key: "T", action: "Toggle translation", condition: "Always" },
  { key: "?", action: "Show this help", condition: "Always" },
  { key: "Esc", action: "Close this help", condition: "Help open" },
];

interface Props {
  onClose: () => void;
}

export function ShortcutHelpOverlay({ onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Keyboard Shortcuts</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
        </div>
        <div className="space-y-2">
          {SHORTCUTS.map(({ key, action, condition }) => (
            <div key={key} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <kbd className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 font-mono text-xs text-gray-700 dark:text-gray-300">
                  {key}
                </kbd>
                <span className="text-gray-700 dark:text-gray-300">{action}</span>
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500">{condition}</span>
            </div>
          ))}
        </div>
        <button
          onClick={onClose}
          className="mt-5 w-full py-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}
