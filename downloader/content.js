// Add a "Download Full Day" button directly to the LiveATC form
window.addEventListener("load", () => {
  // add button next to the "Submit"
  const btnSubmit = document.querySelector("#archiveSubmit");
  if (!btnSubmit) return;

  fieldSelector = document.querySelector('select[name="facility"]');
  timeSelector = document.querySelector('select[name="time"]');

  const btn = document.createElement("button");
  btn.type = "button";
  btn.innerText = "Download and select next time";
  btn.style.cssText =
    "margin-left: 10px; background: #007bff; color: white; padding: 5px 10px; border: none; border-radius: 4px; cursor: pointer;";

  btnSubmit.after(btn);
  fieldSelector.value = "ENZV5-Twr";

  // Move the form to the next half-hour slot. Reads and writes .value rather
  // than assuming a "0030Z"-style format, so the page's own option order decides
  // what "next" means.
  function selectNextTime() {
    const options = [...timeSelector.options];
    const next =
      options[options.findIndex((o) => o.value === timeSelector.value) + 1];
    if (!next) {
      console.log("last slot of the day, time selector left as is");
      return;
    }
    timeSelector.value = next.value;
    console.log("next slot:", next.value);
  }

  btn.addEventListener("click", async () => {
    btnSubmit.click();

    // wait for link
    const checkElement = setInterval(() => {
      const link = document.querySelector("a:has(font.purSep)");
      if (link) {
        clearInterval(checkElement); // 1. Stop the loop
        console.log("link found:", link.href);

        // download (via the service worker: <a download> is ignored cross-origin,
        // so Chrome would just open the mp3 in its player instead of saving it)
        const filename = decodeURIComponent(
          new URL(link.href).pathname.split("/").pop() || "",
        );
        chrome.runtime.sendMessage(
          { type: "download", url: link.href, filename },
          (res) => {
            if (!res?.ok) {
              console.error(
                "download failed:",
                res?.error ?? chrome.runtime.lastError,
              );
              return;
            }
            selectNextTime();
          },
        );
      }
    }, 1000);
  });
});
