export const buddyStyles = `
:host { all: initial; color-scheme: light; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
.anchor { bottom: 20px; position: fixed; right: 20px; z-index: 2147483646; }
:host([data-corner="left"]) .anchor { left: 20px; right: auto; }
button, input { font: inherit; }
.launcher { align-items: center; background: #111827; border: 1px solid rgba(255,255,255,.28); border-radius: 999px; box-shadow: 0 12px 32px rgba(15,23,42,.24); color: white; cursor: pointer; display: inline-flex; font-size: 13px; font-weight: 700; gap: 8px; min-height: 44px; padding: 0 16px; }
.launcher::before { background: #34c759; border-radius: 50%; content: ""; height: 9px; width: 9px; }
.panel { background: rgba(255,255,255,.98); border: 1px solid #d0d5dd; border-radius: 18px; box-shadow: 0 22px 60px rgba(15,23,42,.24); color: #182230; overflow: hidden; width: min(360px, calc(100vw - 32px)); }
.header { align-items: center; border-bottom: 1px solid #e4e7ec; display: flex; justify-content: space-between; padding: 14px 16px; }
.header strong { font-size: 14px; }
.close { background: transparent; border: 0; border-radius: 8px; color: #475467; cursor: pointer; min-height: 36px; min-width: 36px; }
.body { display: grid; gap: 12px; padding: 16px; }
.body h2, .body p { margin: 0; }
.body h2 { font-size: 16px; }
.body p, .body small { color: #526071; font-size: 13px; line-height: 1.45; }
.counts { display: grid; gap: 8px; grid-template-columns: repeat(3, 1fr); }
.count { background: #f6f7f8; border: 1px solid #e4e7ec; border-radius: 10px; padding: 10px; }
.count strong, .count span { display: block; }
.count strong { font-size: 17px; }
.count span { color: #667085; font-size: 11px; margin-top: 2px; }
form { display: grid; gap: 10px; }
label { color: #344054; display: grid; font-size: 12px; font-weight: 700; gap: 5px; }
input { border: 1px solid #cfd4dc; border-radius: 9px; color: #182230; min-height: 42px; padding: 0 11px; text-transform: uppercase; }
.review-form { gap: 12px; }
.review-list { border: 1px solid #e4e7ec; border-radius: 12px; display: grid; max-height: 240px; overflow: auto; }
.review-field { align-items: center; display: grid; font-size: 13px; font-weight: 650; gap: 2px 9px; grid-template-columns: 20px 1fr; padding: 11px 12px; }
.review-field + .review-field { border-top: 1px solid #eef0f3; }
.review-field input { grid-row: 1 / span 2; height: 16px; min-height: 0; padding: 0; text-transform: none; width: 16px; }
.review-field small { font-size: 11px; font-weight: 500; grid-column: 2; }
.guarantee { border-top: 1px solid #eef0f3; padding-top: 10px; }
.capture-details { border: 1px solid #e4e7ec; border-radius: 12px; margin: 0; padding: 4px 12px; }
.capture-details div { display: grid; gap: 2px; grid-template-columns: 72px 1fr; padding: 8px 0; }
.capture-details div + div { border-top: 1px solid #eef0f3; }
.capture-details dt { color: #667085; font-size: 11px; }
.capture-details dd { font-size: 12px; font-weight: 650; margin: 0; }
.primary { background: #111827; border: 0; border-radius: 9px; color: white; cursor: pointer; min-height: 42px; padding: 0 14px; }
.primary:disabled { cursor: not-allowed; opacity: .45; }
button:focus-visible, input:focus-visible { outline: 3px solid #2563eb; outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; } }
`;
