import { changeCssVariableValue } from "shared/colors/utils";
import { MIN_VIEW_PERCENTAGE } from "shared/constants";
import { Observer } from "shared/observability/Observer";
import type { Orientation, Side } from "shared/types";
import { SplitContext } from "./SplitContext";
import { View } from "./View";

export class SplitView implements Observer<SplitContext> {
  private static instance: SplitView;

  public static getInstance(): SplitView {
    if (!SplitView.instance) {
      SplitView.instance = new SplitView();
    }
    return SplitView.instance;
  }

  private orientation: Orientation = "horizontal";

  private readonly leftSplit: View;
  private readonly rightSplit: View;

  private isUserResizingViews = false;

  private constructor() {
    this.leftSplit = new View(null, 50, "left");
    this.rightSplit = new View(null, 50, "right");

    // Handle resizing state
    const resizeDraggableRef = SplitView.getResizeDraggableRef();
    if (resizeDraggableRef) {
      resizeDraggableRef?.addEventListener("mousedown", () => {
        this.isUserResizingViews = true;
      });
      resizeDraggableRef?.addEventListener("mouseup", () => {
        this.isUserResizingViews = false;
      });
    }

    document.addEventListener("mousemove", (e) => {
      if (this.isUserResizingViews && e.buttons == 1) {
        // check if the user is pressing the mouse btn
        const leftPercent = Math.round(
          this.orientation === "horizontal" ? (e.pageX * 100) / window.innerWidth : (e.pageY * 100) / window.innerHeight
        );
        const rightPercent = 100 - leftPercent;
        if (leftPercent >= MIN_VIEW_PERCENTAGE && rightPercent >= MIN_VIEW_PERCENTAGE) {
          this.leftSplit.updateSize(leftPercent);
          this.rightSplit.updateSize(rightPercent);
        }
      }
    });

    SplitContext.getInstance().addObserver(this);
  }

  public setOrientation(orientation?: Orientation) {
    if (!orientation) {
      orientation = this.orientation === "horizontal" ? "vertical" : "horizontal";
    }
    this.orientation = orientation;

    changeCssVariableValue("--view-orientation", "vertical" === orientation ? "column" : "row");
    document.body?.classList.toggle("horizontal", "horizontal" === orientation);
    document.body?.classList.toggle("vertical", "vertical" === orientation);
  }

  private static getResizeDraggableRef() {
    return document.querySelector<HTMLDivElement>("#resize-draggable");
  }

  public update(context: SplitContext) {
    console.info("[SplitView] > Received update from context:", context);

    // Update the SplitView based on changes in the context
    this.setOrientation(context.getOrientation());

    if (context.getLeftUrl() !== this.leftSplit?.getCurrentUrl()) {
      console.info("[SplitView] > Updating left split URL to: " + context.getLeftUrl());
      this.leftSplit.loadUrl(context.getLeftUrl());
    }

    if (context.getRightUrl() !== this.rightSplit?.getCurrentUrl()) {
      console.info("[SplitView] > Updating right split URL to: " + context.getRightUrl());
      this.rightSplit.loadUrl(context.getRightUrl());
    }

    View.activate(context.getActiveSide());
  }
}
