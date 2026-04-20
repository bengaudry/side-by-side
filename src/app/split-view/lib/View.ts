import { changeCssVariableValue } from "shared/colors/utils";
import { MIN_VIEW_PERCENTAGE } from "shared/constants";
import { Side } from "shared/types";
import { Searchbar } from "./Searchbar";
import { SplitContext } from "./SplitContext";

export class View {
  private static leftSplitInstance: View;
  private static rightSplitInstance: View;

  private static leftPaneIcon: string | null = null;
  private static rightPaneIcon: string | null = null;

  private url: string | null = null;
  private urlPreview: string | null = null;

  private size: number;
  private side: Side;

  private containerRef: HTMLDivElement | null;
  private iframeRef: HTMLIFrameElement | null;
  private searchbarTrigger: HTMLButtonElement | null;
  private refreshBtn: HTMLButtonElement | null;
  private closeBtn: HTMLButtonElement | null;

  constructor(url: string | null, size: number, side: Side) {
    this.loadUrl(url);

    this.size = size;
    this.side = side;

    if (side === "left") View.leftSplitInstance = this;
    else View.rightSplitInstance = this;

    this.containerRef = document.querySelector(`#${side}-pane`);
    this.searchbarTrigger = document.querySelector(`#${side}-pane-shortened-url-btn`);
    this.iframeRef = document.querySelector(`#${side}-pane-iframe`);
    this.refreshBtn = document.querySelector(`#${side}-pane-refresh-btn`);
    this.closeBtn = document.querySelector(`#${side}-pane-close-split-btn`);

    // Events
    this.containerRef?.addEventListener("mousedown", () => {
      View.activate(this.side);
    });

    document.addEventListener("keydown", (e) => {
      const isNavKey = e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown";
      if (e.altKey && isNavKey) {
        e.preventDefault();
        const direction = e.key === "ArrowLeft" || e.key === "ArrowUp" ? "left" : "right";
        View.activate(direction);
      }
    });

    this.searchbarTrigger?.addEventListener("click", () => {
      const searchbarInstance = Searchbar.getInstance();
      searchbarInstance.open({ defaultUrl: this.url });
      SplitContext.getInstance().setActiveSide(this.side);
    });

    this.refreshBtn?.addEventListener("click", () => {
      this.loadUrl(this.url);
    });

    this.closeBtn?.addEventListener("click", () => {
      browser.runtime.sendMessage({
        type: "REQUEST_CLOSE_SPLIT",
        keep: side === "left" ? "right" : "left"
      });
    });

    /* this.iframeRef?.addEventListener("load", () => {
      this.requestIframeData();
    }); */

    const context = SplitContext.getInstance();
    window.addEventListener("message", (e) => {
      if (e.data && e.data.type === "IFRAME_FOCUSED") {
        if (this.iframeRef && e.source === this.iframeRef.contentWindow) {
          context.setActiveSide(this.side);
        }
      }
      if (e.data && e.data.type === "SWITCH_FOCUS") {
        context.setActiveSide(e.data.direction);
      }
    });
  }

  public static activate(side: Side) {
    const leftContainer = View.leftSplitInstance?.containerRef;
    const rightContainer = View.rightSplitInstance?.containerRef;

    if (side === "left") {
      leftContainer?.classList.add("active-split");
      rightContainer?.classList.remove("active-split");
      View.leftSplitInstance?.iframeRef?.focus();
    } else {
      rightContainer?.classList.add("active-split");
      leftContainer?.classList.remove("active-split");
      View.rightSplitInstance?.iframeRef?.focus();
    }
  }

  public getCurrentUrl() {
    return this.url;
  }

  /** Load a new URL into this split's iframe */
  public loadUrl(newUrl: string | null | undefined): boolean {
    if (!newUrl) return false;
    if (!this.iframeRef) return false;

    this.iframeRef.classList.add("iframe-content-loading");
    this.iframeRef.onload = () => {
      this.iframeRef?.classList.remove("iframe-content-loading");
    };

    try {
      const urlObj = new URL(newUrl);

      this.url = newUrl;
      this.urlPreview = urlObj.hostname;
      if (this.searchbarTrigger) {
        this.searchbarTrigger.textContent = this.urlPreview;
      } else console.warn("No searchbar trigger found");

      if (this.iframeRef) this.iframeRef.src = this.url;
      else console.warn("No iframe reference found");
      //this.requestIframeData();

      Searchbar.getInstance().close();

      return true;
    } catch (err) {
      // TODO -> Manage this error properly
      console.error(`[${this.side} Split] Error loading URL: `, err);
      return false;
    }
  }

  /**
   * Resize this split
   * @warning the other split must be resized accordingly by the caller
   */
  public updateSize(newSize: number): void {
    if (this.size < MIN_VIEW_PERCENTAGE || newSize > 100 - MIN_VIEW_PERCENTAGE) return;
    this.size = newSize;
    changeCssVariableValue(`--${this.side}-pane-view-percentage`, `${this.size}%`);
  }

  // TODO :
  /**
   * Requests icon, colors from website when iframe src changes
   */
  /* private requestIframeData = () => {
    console.log(`[${this.side} Split] Requesting iframe data`);
    if (!this.iframeRef?.contentWindow || !this.iframeRef.src) return;
    this.iframeRef.contentWindow.postMessage({ type: "REQUEST_IFRAME_DATA" }, this.iframeRef.src);

    window.addEventListener("message", (e) => {
      if (!this.url) return;
      if (e.data || e.data.type !== "REQUEST_IFRAME_DATA_RESULTS") return;
      if (!getUrlBase(this.url).startsWith(e.origin)) return; // not for this side
      console.log(e);

      // reload to update url if changed & check if url is correct
      if (!e.data.backgroundColor) return;
      const rgbVal = getRgbValuesFromBackgroundColor(e.data.backgroundColor);

      changeCssVariableValue("--left-pane-background-color", rgbVal);
      changeCssVariableValue("--left-pane-text-color", invertRgbValues(rgbVal));

      if (e.data.icon) {
        if ("left" === this.side) View.leftPaneIcon = e.data.icon;
        else View.rightPaneIcon = e.data.icon;
        createCompositeFavicon(View.leftPaneIcon, View.rightPaneIcon);
      }
    });
  }; */
}
