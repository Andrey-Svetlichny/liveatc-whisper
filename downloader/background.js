// Content scripts can't call chrome.downloads, so the actual save happens here.
const SUBFOLDER = "liveatc";

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "download") return;

  // chrome.downloads rejects absolute paths, ".." and empty names.
  const base = (msg.filename || "")
    .split(/[\\/]/)
    .pop()
    .replace(/^\.+/, "")
    .trim();

  chrome.downloads.download(
    {
      url: msg.url,
      // Always relative to the Downloads dir, so everything lands in one place.
      filename: `${SUBFOLDER}/${base || `recording-${Date.now()}.mp3`}`,
      // Don't force a prompt. Chrome's "ask where to save each file" setting
      // still wins over this — turn it off in chrome://settings/downloads.
      saveAs: false,
      conflictAction: "uniquify",
    },
    (id) => {
      sendResponse(
        chrome.runtime.lastError
          ? { ok: false, error: chrome.runtime.lastError.message }
          : { ok: true, id }
      );
    }
  );

  return true; // keep the channel open for the async callback
});
