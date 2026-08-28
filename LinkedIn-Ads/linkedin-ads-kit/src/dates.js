export function dayStamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function fileStamp(date = new Date()) {
  return date.toISOString().replaceAll(":", "-").replace(".", "-");
}
