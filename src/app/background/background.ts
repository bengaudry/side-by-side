import { FORBIDDEN_HOSTNAMES } from "shared/constants";
import { updateIcons } from "./lib/icons";
import { BackgroundContext } from "./lib/BackgroundContext";
import { getThemeColors } from "shared/themes/utils";
import { BrowserMessageSender, BrowserTab } from "./types";
import { Side } from "shared/types";
import { createContextMenu } from "./lib/contextMenu";

console.info("[background.ts] > Loaded");

async function refreshIconsForAllTabs() {
  const tabs = await browser.tabs.query({});
  for (const tab of tabs) {
    if (tab.id !== undefined) {
      updateIcons(tab.id);
    }
  }
}

browser.runtime.onInstalled.addListener(async () => {
  await refreshIconsForAllTabs();
});

browser.theme.onUpdated.addListener(async ({ theme }) => {
  const context = BackgroundContext.getInstance();
  const themeColors = await getThemeColors(theme);
  context.setThemeColors(themeColors);
  await refreshIconsForAllTabs();
});

/* ===== Listeners for page icon & tab icon ===== */
// Recompute icon state after navigation/reload completes.
browser.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status === "complete") {
    await updateIcons(tabId);
  }
});

// Remove X-Frame-Options and modify Content-Security-Policy headers
// because some pages prevent being renderered into iframes
browser.webRequest.onHeadersReceived.addListener(
  function (details) {
    let responseHeaders = details.responseHeaders;

    if (responseHeaders) {
      // Remove X-Frame-Options header
      responseHeaders = responseHeaders.filter((header) => header.name.toLowerCase() !== "x-frame-options");

      // Modify Content-Security-Policy to allow framing
      responseHeaders = responseHeaders.filter((header) => header.name.toLowerCase() !== "content-security-policy");
    }

    return { responseHeaders };
  },
  { urls: ["<all_urls>"] },
  ["blocking", "responseHeaders"]
);

// ===== GLOBAL VARIABLES ===== //
function isForbiddenUrl(url: string | undefined | null) {
  if (!url) return true;
  if (url.startsWith("moz-extension:")) return true;
  if (url.startsWith("about:")) return true;
  if (url.startsWith("file:")) return true;
  try {
    const urlObj = new URL(url);
    if (FORBIDDEN_HOSTNAMES.includes(urlObj.hostname)) return true;
  } catch (_) {
    return true;
  }
  return false;
}

async function fetchTabs(sender: BrowserMessageSender, sendResponse: (response?: any) => void) {
  try {
    const tabs = await browser.tabs.query({ currentWindow: true });
    sendResponse({
      type: "TABS_DATA",
      tabs: tabs
    });
    return tabs;
  } catch (error) {
    console.error("background.ts > Error while fetching tabs", error);
    if (sender.tab && sender.tab.id) {
      await browser.tabs.sendMessage(sender.tab.id, {
        type: "TABS_DATA",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
    return null;
  }
}

browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  // Initialize extension
  console.info("[background.ts] > received " + message.type);

  const context = BackgroundContext.getInstance();
  const tab = context.getTab();

  if (message.sender === "split") {
    context.updateFromSplitDispatch(message.event);

    switch (message.event.type) {
      case "REQUEST_UPDATE_THEME":
        context.setThemeColors(await getThemeColors());
        break;
    }
  }

  if (message.sender === "settings") {
    switch (message.type) {
      case "UPDATE_SETTING":
        context.setSetting(message.key, message.value);
        return null;

      case "GET_SETTING":
        return {
          type: "SETTING_VALUE",
          key: message.key,
          value: context.getSetting(message.key)
        };

      default:
        return null;
    }
  }

  switch (message.type) {
    case "INIT_EXT":
      await handleInitializeExtension(message.side);
      return null;

    // Fetch opened tabs on browser to make suggestions to user
    case "REQUEST_FETCH_TABS":
      // Query all tabs in the current window
      const tabs = await fetchTabs(sender, sendResponse);
      return {
        type: "TABS_DATA",
        tabs: tabs
      };

    // Close one of the tabs in the split
    case "REQUEST_CLOSE_SPLIT":
      const urlToKeep = message.keep === "left" ? context.getLeftUrl() : context.getRightUrl();
      if (urlToKeep && tab?.id !== undefined) {
        await browser.tabs.create({
          url: urlToKeep,
          active: true
        });
        await browser.tabs.remove(tab?.id);
        context.setTab(null);
      }
      return null;

    case "OPEN_SETTINGS":
      await browser.tabs.create({
        url: browser.runtime.getURL("settings.html"),
        discarded: false
      });
      return null;

    case "REQUEST_OPEN_EXTERNAL_URL":
      await browser.tabs.create({
        url: message.url,
        discarded: false
      });
      return null;

    default:
      return null;
  }
});

async function getActiveTab(): Promise<BrowserTab | null> {
  try {
    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true
    });
    if (tabs.length > 0) {
      return tabs[0] ?? null;
    }
    return null;
  } catch (error) {
    console.error("background.ts > Error while getting active tab:", error);
    return null;
  }
}

async function handleInitializeExtension(side: Side) {
  try {
    // Get the current tab's URL
    const activeTab = await getActiveTab();

    if (!activeTab?.id) {
      console.error("background.ts > No active tab found");
      return;
    }

    // initialize context
    const currentUrl = isForbiddenUrl(activeTab.url) ? null : activeTab.url;

    const context = BackgroundContext.getInstance();

    if (Boolean(context.getSetting("close-tab-before-opening"))) {
      await browser.tabs.remove(activeTab.id);
    }

    const themeColors = await getThemeColors();
    context.setThemeColors(themeColors);

    context.setLeftUrl(side === "left" || side === "top" ? (currentUrl ?? null) : null);
    context.setRightUrl(side === "right" || side === "bottom" ? (currentUrl ?? null) : null);
    context.setOrientation(side === "top" || side === "bottom" ? "vertical" : "horizontal");

    // Creates a new tab containing the split view
    const splitViewTab = await browser.tabs.create({
      url: browser.runtime.getURL("split-view.html"),
      discarded: false
    });

    if (!splitViewTab?.id) {
      console.error("background.ts > Could not create new tab for split view");
      return;
    }

    context.setTab(splitViewTab);

    // Wait for the tab to be fully loaded, and send informations
    browser.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
      if (splitViewTab?.id && tabId === splitViewTab.id && changeInfo.status === "complete") {
        // Remove the listener to avoid multiple calls
        browser.tabs.onUpdated.removeListener(listener);
        context.dispatchToSplit("INIT_EXTENSION");
      }
    });

    createContextMenu();
  } catch (err) {
    console.error("background.ts > Error while initializing extension :", err);
  }
}
