export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="mb-10 flex flex-col items-center gap-2">
        <span className="display-wide text-3xl text-foreground glow">
          ARISE
        </span>
        <span className="text-sm text-muted-foreground">Private coaching, done right.</span>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
