export function warnBeforeUnload(event: BeforeUnloadEvent): void {
  event.preventDefault();
}
