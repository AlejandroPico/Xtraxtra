export function pullDistance(start, end) {
  const dy = end.y - start.y, dx = Math.abs(end.x - start.x);
  return dy > 12 && dy > dx * 1.4 ? Math.min(dy * .45, 110) : 0;
}
export const shouldRefresh = distance => distance >= 60;
export function isClosingSwipe(start, end) {
  const dx = end.x - start.x, dy = Math.abs(end.y - start.y);
  return dx < -65 && -dx > dy * 1.5;
}
