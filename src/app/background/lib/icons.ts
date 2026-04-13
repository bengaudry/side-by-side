import { IS_DEV } from "shared/constants";
import { getThemeColors } from "shared/themes/utils";
import { BrowserTabId } from "../types";

// use of a global variable to store the icon object URL, to avoid creating multiple URLs and leaking memory
// (since each call to URL.createObjectURL creates a new URL that needs to be revoked)
let iconObjectUrl: string | null = null;

/**
 * Generates an SVG string for the extension icon, using the provided fill color.
 * @param fillColor the color to use for the icon's fill and stroke, typically extracted from the browser theme to ensure the icon matches the overall look of the browser.
 * @returns the SVG string representing the icon, which will be converted to a Blob and then to an object URL for use as the extension's page action icon and tab favicon.
 */
function generateSVG(fillColor: string) {
  if (IS_DEV) {
    return `<svg width="128" height="128" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect x="5" y="5" width="102" height="102" rx="21" stroke="${fillColor}" stroke-width="10"/>
<rect x="51.625" y="4.375" width="8.75" height="103.25" fill="${fillColor}"/>
<path d="M78.899 117.857L91.1841 98.4998C91.5908 97.8589 91.8068 97.1154 91.8068 96.3563V73C91.8068 70.7909 93.5977 69 95.8068 69H108.091C110.3 69 112.091 70.7909 112.091 73V96.5319C112.091 97.18 112.248 97.8183 112.55 98.3919L122.922 118.14C124.321 120.804 122.389 124 119.381 124H82.2762C79.1221 124 77.2088 120.52 78.899 117.857Z" fill="url(#paint0_linear_2001_4)" stroke="url(#paint1_linear_2001_4)" stroke-width="6"/>
<defs>
<linearGradient id="paint0_linear_2001_4" x1="100.5" y1="69" x2="100.5" y2="124" gradientUnits="userSpaceOnUse">
<stop stop-color="#01FF88"/>
<stop offset="1" stop-color="#00C8F5"/>
</linearGradient>
<linearGradient id="paint1_linear_2001_4" x1="100.5" y1="69" x2="100.5" y2="124" gradientUnits="userSpaceOnUse">
<stop stop-color="#00FF88"/>
<stop offset="1" stop-color="#00C8F5"/>
</linearGradient>
</defs>
</svg>
`;
  }

  return `<svg width="128" height="128" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect x="5" y="5" width="118" height="118" rx="27" stroke="${fillColor}" stroke-width="10"/>
<rect x="59" y="5" width="10" height="118" fill="${fillColor}"/>
</svg>
  `;
}

/**
 * Updates the extension's page action icon and the tab favicon to match the current browser theme colors,
 * ensuring a consistent look and feel. This function is called when the theme is updated or when a new tab
 * is created, to ensure that the icons always reflect the current theme.
 */
async function createIconObjectUrl() {
  try {
    const themeColors = await getThemeColors();

    let color = themeColors.iconsColor;
    if (!color) {
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        color = "#fbfbfe"; // default icon color for dark theme in firefox
      } else color = "#4c4b51"; // default icon color for light theme in firefox
    }

    if (Array.isArray(color)) color = `rgb(${color.join(",")})`;

    // Try to get the accent color from the theme
    const svg = generateSVG(color);

    const blob = new Blob([svg], { type: "image/svg+xml" });
    iconObjectUrl = URL.createObjectURL(blob);
  } catch (err) {
    console.error("Could not create icon object URL:", err);
  }
}

/**
 * Returns the object URL for the extension icon, creating it if it doesn't already exist.
 * This URL is used for the page action icon and the tab favicon, and is generated based on the current browser
 * theme colors to ensure visual consistency.
 * @returns the object URL for the extension icon. If the URL cannot be created, it returns null.
 */
async function getIconObjectUrl() {
  if (iconObjectUrl) return iconObjectUrl;
  await createIconObjectUrl();
  return iconObjectUrl;
}

/**
 * Updates the extension's page action icon for the specified tab,
 * ensuring that it matches the current browser theme colors.
 * @param tabId the id of the tab for which to update the page action icon. This is typically the tab containing the split view, but can be any tab where the page action is shown.
 */
async function updatePageIcon(tabId: BrowserTabId) {
  try {
    const iconUrl = await getIconObjectUrl();
    if (!iconUrl) return;

    if (browser.pageAction) {
      await browser.pageAction.setIcon({
        path: {
          32: iconUrl
        },
        tabId
      });

      await browser.pageAction.show(tabId);
    }
  } catch (err) {
    console.error("Could not update page icon color :", err);
  }
}

/**
 * Updates the favicon of the specified tab to match the extension icon, ensuring visual consistency with the browser theme.
 * @param tabId the id of the tab for which to update the favicon. This is typically the tab containing the split view, but can be any tab where the favicon should reflect the extension icon.
 */
async function updateTabFavicon(tabId: BrowserTabId) {
  try {
    const iconUrl = await getIconObjectUrl();
    if (!iconUrl) return;

    const changeFaviconScript = (newIconUrl: string) => {
      let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = newIconUrl;
    };

    try {
      await browser.scripting.executeScript({
        target: { tabId },
        func: changeFaviconScript,
        args: [iconUrl]
      });
    } catch (err) {
      console.error("Could not execute script to change tab favicon:", err);
    }
  } catch (err) {
    console.error("Could not update icon color :", err);
  }
}

/**
 * Updates the extension's page action icon and the tab favicon for the specified tab,
 * ensuring that they match the current browser theme colors.
 * This function is called when the theme is updated or when a new tab is created,
 * to ensure that the icons always reflect the current theme.
 * @param tabId the id of the tab for which to update the icons. This is typically the tab containing the split view, but can be any tab where the icons should reflect the current theme.
 */
export async function updateIcons(tabId: number | undefined) {
  if (!tabId) return;
  void updatePageIcon(tabId as BrowserTabId);
  void updateTabFavicon(tabId as BrowserTabId);
}
