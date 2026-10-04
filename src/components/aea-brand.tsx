import Image from "next/image";

export function AeaLogo({ className = "" }: { className?: string }) {
  return (
    <Image
      unoptimized
      className={`aea-logo ${className}`}
      src="/brand/aea-logo.png"
      alt="AEA — Ateneo Economics Association"
      width={209}
      height={120}
      decoding="async"
    />
  );
}

export function MascotPair({ className = "" }: { className?: string }) {
  return (
    <span className={`aea-mascots ${className}`} aria-hidden="true">
      <Image
        src="/brand/leon.png"
        alt=""
        width={96}
        height={96}
        sizes="110px"
        loading="lazy"
        decoding="async"
      />
      <Image
        src="/brand/percy.png"
        alt=""
        width={96}
        height={96}
        sizes="110px"
        loading="lazy"
        decoding="async"
      />
    </span>
  );
}
