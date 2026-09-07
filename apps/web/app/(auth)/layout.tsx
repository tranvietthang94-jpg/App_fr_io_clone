export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen bg-bg-primary">
      <div
        className="relative hidden min-h-screen w-[55%] overflow-hidden lg:block"
        aria-hidden="true"
      >
        <img
          src="/login-suite.png"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/35 via-black/45 to-bg-primary" />
        <div className="absolute bottom-8 left-8 z-10">
          <p className="text-2xl font-bold tracking-tight text-white">
            R<span className="text-accent-green">.</span>Frame
          </p>
        </div>
      </div>
      <div className="flex min-h-screen w-full items-center justify-center px-6 py-10 lg:w-[45%] lg:px-14">
        <div className="w-full max-w-md space-y-8">{children}</div>
      </div>
    </div>
  );
}
