export const skillTone = (idx) => {
  const tones = [
    "border-sky-200 bg-sky-50 text-sky-700",
    "border-emerald-200 bg-emerald-50 text-emerald-700",
    "border-amber-200 bg-amber-50 text-amber-700",
    "border-violet-200 bg-violet-50 text-violet-700",
    "border-rose-200 bg-rose-50 text-rose-700",
    "border-cyan-200 bg-cyan-50 text-cyan-700",
  ];
  return tones[idx % tones.length];
};
