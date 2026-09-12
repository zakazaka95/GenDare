export function AmbientBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* one soft top spotlight, very faint */}
      <div
        className="absolute inset-x-0 top-0 h-[70vh]"
        style={{
          background:
            "radial-gradient(60% 80% at 50% -10%, rgba(255,255,255,0.04), transparent 70%)",
        }}
      />
      {/* cinematic vignette */}
      <div className="absolute inset-0 bg-vignette" />
    </div>
  );
}
