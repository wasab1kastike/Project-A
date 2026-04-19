export function floorToMinute(value: Date) {
  const next = new Date(value);
  next.setSeconds(0, 0);
  return next;
}

export function addHours(value: Date, hours: number) {
  const next = new Date(value);
  next.setHours(next.getHours() + hours);
  return next;
}

export function addMinutes(value: Date, minutes: number) {
  const next = new Date(value);
  next.setMinutes(next.getMinutes() + minutes);
  return next;
}
