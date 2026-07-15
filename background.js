// Fillit — service worker
// Opens the side panel when the toolbar icon is clicked.

chrome.runtime.onInstalled.addListener(async () => {
  // Seed a few example snippets on first install so the sidebar isn't empty.
  const { fillit_snippets } = await chrome.storage.local.get("fillit_snippets");
  if (!fillit_snippets) {
    const now = Date.now();
    const seed = [
      {
        id: crypto.randomUUID(),
        title: "Email sign-off",
        shortcut: "sig",
        content: "Best regards,\n{cursor}",
        folder: "Email",
        createdAt: now,
        updatedAt: now,
        uses: 0
      },
      {
        id: crypto.randomUUID(),
        title: "Today's date",
        shortcut: "date",
        content: "{date}",
        folder: "Utility",
        createdAt: now,
        updatedAt: now,
        uses: 0
      },
      {
        id: crypto.randomUUID(),
        title: "Meeting follow-up",
        shortcut: "followup",
        content:
          "Hi {name},\n\nThanks for the great conversation today. As discussed, here are the next steps:\n\n- {cursor}\n\nLooking forward to it!",
        folder: "Email",
        createdAt: now,
        updatedAt: now,
        uses: 0
      }
    ];
    await chrome.storage.local.set({
      fillit_snippets: seed,
      fillit_settings: { theme: "system" }
    });
  }
});

// Clicking the toolbar icon — or the Ctrl+Shift+Y command, which is bound to
// _execute_action — opens the side panel.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.warn("Fillit: sidePanel behavior", err));
