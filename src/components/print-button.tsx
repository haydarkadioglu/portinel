"use client";

export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="btn btn-primary !py-1.5 !text-xs">
      🖨️ Print / Save PDF
    </button>
  );
}
