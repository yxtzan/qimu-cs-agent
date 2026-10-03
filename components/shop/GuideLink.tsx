"use client";

import { OPEN_GUIDE_EVENT } from "./DemoGuide";

/** 页脚里的「演示指南」小链接。 */
export function GuideLink() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_GUIDE_EVENT))}
      className="text-brand underline-offset-4 hover:underline"
    >
      演示指南
    </button>
  );
}
