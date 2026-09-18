export default function LandscapeOnly({ children }) {
  return (
    <>
      {/* Portrait blocker for mobile/tablet */}
      <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-background text-center p-8 md:hidden landscape:hidden">
        <div className="text-5xl mb-4">📱</div>
        <h2 className="text-xl font-bold text-foreground mb-2">Rotate Your Device</h2>
        <p className="text-muted-foreground text-sm">The Crew Schedule works best in landscape mode. Please rotate your device sideways.</p>
      </div>
      <style>{`
        @media (max-width: 1024px) and (orientation: portrait) {
          .landscape-required { display: none !important; }
        }
      `}</style>
      <div className="landscape-required">
        {children}
      </div>
    </>
  );
}