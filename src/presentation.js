export function groupBadgeLabel(activeCount, totalCount) {
  const active = Math.max(0, Number(activeCount) || 0);
  const total = Math.max(active, Number(totalCount) || 0);
  const inactive = Math.max(0, total - active);
  if (inactive > 0) return `另有${inactive}门`;
  if (active > 1) return `同有${active}门`;
  return `${total}门课程`;
}
