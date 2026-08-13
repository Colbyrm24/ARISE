export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="mb-10 flex flex-col items-center gap-2">
        <span className="text-2xl font-semibold tracking-[0.2em] text-foreground">
          ARISE
        </span>
        <span className="text-sm text-muted-foreground">Private coaching, done right.</span>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
