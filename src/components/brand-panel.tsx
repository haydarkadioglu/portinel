export function BrandPanel() {
  return (
    <div className="relative hidden overflow-hidden border-r border-line bg-surface lg:block">
      <div className="grid-bg absolute inset-0 opacity-60" />
      <div className="absolute -right-20 top-1/3 h-80 w-80 rounded-full bg-brand/20 blur-[100px]" />
      <div className="absolute -left-10 bottom-10 h-72 w-72 rounded-full bg-accent/20 blur-[100px]" />

      {/* Animated radar */}
      <div className="relative flex h-full flex-col justify-center px-14">
        <div className="relative mx-auto mb-10 h-56 w-56">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="absolute inset-0 rounded-full border border-brand/20"
              style={{ transform: `scale(${i / 4})` }}
            />
          ))}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                "conic-gradient(from 0deg, rgba(34,211,238,0.35), transparent 30%)",
              animation: "radar 4s linear infinite",
              maskImage: "radial-gradient(circle, #000 60%, transparent 70%)",
              WebkitMaskImage: "radial-gradient(circle, #000 60%, transparent 70%)",
            }}
          />
          <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand shadow-[0_0_16px_#22d3ee]" />
          <span className="absolute left-[70%] top-[30%] h-2 w-2 rounded-full bg-success" />
          <span className="absolute left-[25%] top-[60%] h-2 w-2 rounded-full bg-warning" />
          <span className="absolute left-[55%] top-[78%] h-2 w-2 rounded-full bg-danger" />
        </div>

        <h2 className="max-w-md text-3xl font-bold leading-tight">
          See your perimeter the way an attacker does.
        </h2>
        <p className="mt-3 max-w-md text-sm text-muted">
          Portinel fuses port scanning, TLS analysis, HTTP fingerprinting and
          subdomain discovery into one intelligence platform — with AI-driven
          risk scoring and exportable reports.
        </p>
        <div className="mt-8 grid grid-cols-3 gap-4">
          {[
            ["13", "Scan modules"],
            ["A–F", "Risk grading"],
            ["∞", "Report exports"],
          ].map(([v, l]) => (
            <div key={l} className="panel p-3 text-center">
              <div className="text-xl font-bold text-gradient">{v}</div>
              <div className="text-[0.65rem] text-muted">{l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
