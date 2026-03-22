const CARET_MIRROR_PROPERTIES = [
  "direction",
  "boxSizing",
  "width",
  "height",
  "overflowX",
  "overflowY",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "fontStyle",
  "fontVariant",
  "fontWeight",
  "fontStretch",
  "fontSize",
  "fontSizeAdjust",
  "lineHeight",
  "fontFamily",
  "textAlign",
  "textTransform",
  "textIndent",
  "textDecoration",
  "letterSpacing",
  "wordSpacing",
  "tabSize",
] as const;

export type TextareaCaretRect = {
  top: number;
  left: number;
  right: number;
  height: number;
};

export class TextareaCaretMirror {
  private readonly element: HTMLTextAreaElement;
  private readonly mirror: HTMLDivElement;
  private readonly beforeTextNode: Text;
  private readonly afterSpan: HTMLSpanElement;
  private readonly afterTextNode: Text;
  private readonly handleResize: () => void;
  private computed: CSSStyleDeclaration | null = null;

  constructor(element: HTMLTextAreaElement) {
    this.element = element;
    this.mirror = document.createElement("div");
    this.beforeTextNode = document.createTextNode("");
    this.afterSpan = document.createElement("span");
    this.afterTextNode = document.createTextNode("");
    this.handleResize = () => {
      this.refresh();
    };

    this.mirror.setAttribute("aria-hidden", "true");
    this.mirror.style.position = "absolute";
    this.mirror.style.top = "0";
    this.mirror.style.left = "-9999px";
    this.mirror.style.visibility = "hidden";
    this.mirror.style.pointerEvents = "none";
    this.mirror.style.whiteSpace = "pre-wrap";
    this.mirror.style.wordWrap = "break-word";
    this.mirror.style.overflowWrap = "break-word";
    this.mirror.style.overflow = "hidden";

    this.afterSpan.appendChild(this.afterTextNode);
    this.mirror.appendChild(this.beforeTextNode);
    this.mirror.appendChild(this.afterSpan);
    document.body.appendChild(this.mirror);

    this.refresh();
    window.addEventListener("resize", this.handleResize);
  }

  get(positionLeft: number, positionRight = positionLeft): TextareaCaretRect {
    const computed = this.computed ?? window.getComputedStyle(this.element);
    const borderLeft = Number.parseFloat(computed.borderLeftWidth) || 0;
    const borderTop = Number.parseFloat(computed.borderTopWidth) || 0;

    this.beforeTextNode.nodeValue = this.element.value.slice(0, positionLeft);
    if (this.beforeTextNode.nodeValue.endsWith("\n")) {
      this.beforeTextNode.nodeValue += "\u200b";
    }

    this.afterTextNode.nodeValue = this.element.value.slice(positionLeft) || ".";
    const left = this.afterSpan.offsetLeft + borderLeft;

    this.beforeTextNode.nodeValue = this.element.value.slice(0, positionRight);
    if (this.beforeTextNode.nodeValue.endsWith("\n")) {
      this.beforeTextNode.nodeValue += "\u200b";
    }

    this.afterTextNode.nodeValue = this.element.value.slice(positionRight) || ".";
    let right = this.afterSpan.offsetLeft + borderLeft;
    if (right <= left) {
      right = this.mirror.offsetWidth + borderLeft;
    }

    return {
      top: this.afterSpan.offsetTop + borderTop,
      left,
      right,
      height:
        Number.parseFloat(computed.lineHeight) ||
        this.afterSpan.getBoundingClientRect().height ||
        22,
    };
  }

  destroy() {
    window.removeEventListener("resize", this.handleResize);
    this.mirror.remove();
  }

  refresh() {
    const computed = window.getComputedStyle(this.element);
    this.computed = computed;
    const mirrorStyle = this.mirror.style;

    CARET_MIRROR_PROPERTIES.forEach((property) => {
      (
        mirrorStyle as CSSStyleDeclaration & Record<(typeof property), string>
      )[property] = (
        computed as CSSStyleDeclaration & Record<(typeof property), string>
      )[property];
    });

    mirrorStyle.width = computed.width;
    mirrorStyle.height = computed.height;
  }
}
