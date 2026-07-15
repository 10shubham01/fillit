// slash slash — service worker
// Opens the side panel when the toolbar icon is clicked.

chrome.runtime.onInstalled.addListener(async () => {
  // Seed a few example snippets on first install so the sidebar isn't empty.
  // (Storage key stays "fillit_snippets" so existing installs keep their data.)
  const { fillit_snippets } = await chrome.storage.local.get("fillit_snippets");
  if (!fillit_snippets) {
    const now = Date.now();
    const snip = (title, shortcut, content, folder) => ({
      id: crypto.randomUUID(),
      title,
      shortcut,
      content,
      folder,
      createdAt: now,
      updatedAt: now,
      uses: 0
    });
    const seed = [
      snip("Email sign-off", "sig", "Best regards,\n{cursor}", "Email"),
      snip(
        "Meeting follow-up",
        "followup",
        "Hi {name},\n\nThanks for the great conversation today. As discussed, here are the next steps:\n\n- {cursor}\n\nLooking forward to it!",
        "Email"
      ),
      snip(
        "Thank-you note",
        "thanks",
        "Hi {name},\n\nThank you so much for {reason}. I really appreciate it!\n\nBest,\n{cursor}",
        "Email"
      ),
      snip("Today's date", "date", "{date}", "Utility"),
      snip("Date & time", "now", "{datetime:long}", "Utility"),
      snip("ISO date", "isodate", "{date:iso}", "Utility"),
      snip("Random ID", "uuid", "{uuid}", "Utility"),
      snip("Page link", "link", "{title}\n{url}", "Web"),
      snip(
        "Share availability",
        "avail",
        "I'm free {cursor}. Would any of those times work for you?",
        "Scheduling"
      )
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
  .catch((err) => console.warn("slash slash: sidePanel behavior", err));
