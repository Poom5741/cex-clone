export default function LoadingSkeleton() {
  return (
    <div className="w-full h-[85vh] flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="inline-block">
          <div className="w-16 h-16 border-4 border-amber/20 border-t-amber rounded-full animate-spin"></div>
        </div>
        <p className="font-mono text-amber text-glow animate-pulse">INITIALIZING TERMINAL...</p>
      </div>
    </div>
  );
}
