const MODAL_LOCK_EVENT = "app-modal-lock-changed";
const MODAL_LOCK_COUNT_KEY = "__app_modal_lock_count__";

function getWindowObject(): any {
  if (typeof window === "undefined") return null;
  return window as any;
}

function emitModalLockChange(count: number): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MODAL_LOCK_EVENT, { detail: { count } }));
}

export function getModalLockCount(): number {
  const win = getWindowObject();
  if (!win) return 0;
  const value = Number(win[MODAL_LOCK_COUNT_KEY] ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function isAnyAppModalOpen(): boolean {
  return getModalLockCount() > 0;
}

export function acquireModalLock(): void {
  const win = getWindowObject();
  if (!win) return;
  const nextCount = getModalLockCount() + 1;
  win[MODAL_LOCK_COUNT_KEY] = nextCount;
  emitModalLockChange(nextCount);
}

export function releaseModalLock(): void {
  const win = getWindowObject();
  if (!win) return;
  const nextCount = Math.max(0, getModalLockCount() - 1);
  win[MODAL_LOCK_COUNT_KEY] = nextCount;
  emitModalLockChange(nextCount);
}

export { MODAL_LOCK_EVENT };
