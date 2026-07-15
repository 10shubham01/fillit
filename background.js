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
      snip(
        "Out of office",
        "ooo",
        "Hi,\n\nI'm out of office until {return date} with limited access to email. For anything urgent, please reach out to {backup contact}.\n\nThanks!",
        "Email"
      ),
      snip(
        "My address",
        "addr",
        "12 Rosewood Lane, Apt 4B\nBengaluru 560001",
        "Personal"
      ),
      snip(
        "Intro + links",
        "intro",
        "A little about me:\nLinkedIn: https://linkedin.com/in/yourname\nGitHub: https://github.com/yourname\nPortfolio: https://yourname.dev",
        "Personal"
      ),
      snip(
        "Meeting link",
        "meet",
        "Here's my meeting room — join anytime:\nhttps://meet.google.com/xyz-abcd-pqr",
        "Scheduling"
      ),
      snip(
        "Share availability",
        "avail",
        "I'm free {cursor}. Would any of those times work for you?",
        "Scheduling"
      ),
      snip("Today's date", "today", "{current date}", "Utility"),
      snip("Pick a date", "date", "{date}", "Utility"),
      snip("Date & time", "now", "{datetime:long}", "Utility"),
      snip("Random ID", "uuid", "{uuid}", "Utility"),
      snip("Page link", "link", "{title}\n{url}", "Web")
    ];
    await chrome.storage.local.set({
      fillit_snippets: seed,
      fillit_settings: { theme: "system" }
    });
  }

  // Re-inject the content script into tabs that are already open, so the
  // trigger works immediately after install/update — no tab reload needed.
  // (content.js tears down any previous copy of itself via a handshake.)
  try {
    const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
    for (const tab of tabs) {
      chrome.scripting
        .insertCSS({ target: { tabId: tab.id, allFrames: true }, files: ["content.css"] })
        .catch(() => {});
      chrome.scripting
        .executeScript({
          target: { tabId: tab.id, allFrames: true },
          files: ["format.js", "content.js"]
        })
        .catch(() => {});
    }
  } catch (e) {
    console.warn("slash slash: tab re-inject", e);
  }
});

// Clicking the toolbar icon — or the Ctrl+Shift+Y command, which is bound to
// _execute_action — opens the side panel.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.warn("slash slash: sidePanel behavior", err));
