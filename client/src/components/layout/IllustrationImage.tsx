type IllustrationImageProps = {
  src: string;
  alt: string;
};

export function IllustrationImage({ src, alt }: IllustrationImageProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- data URLのため、next/imageは使わない
    <img src={src} alt={alt} className="w-full rounded-md border border-zinc-200 dark:border-zinc-700" />
  );
}
