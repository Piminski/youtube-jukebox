const VIEWPORT_LOCK =
  "width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content";

/** Block pinch/double-finger zoom after touch interaction (iOS ignores meta alone). */
export function bindZoomPrevention(): () => void {
  const meta = document.querySelector('meta[name="viewport"]');

  const lockMeta = () => {
    if (meta && meta.getAttribute("content") !== VIEWPORT_LOCK) {
      meta.setAttribute("content", VIEWPORT_LOCK);
    }
  };

  const onTouchMove = (e: TouchEvent) => {
    if (e.touches.length > 1) e.preventDefault();
  };

  const onGesture = (e: Event) => {
    e.preventDefault();
  };

  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey) e.preventDefault();
  };

  const vv = window.visualViewport;
  const onVvChange = () => {
    if (vv && vv.scale > 1.01) {
      lockMeta();
      window.scrollTo(0, 0);
    }
  };

  lockMeta();
  document.addEventListener("touchmove", onTouchMove, { passive: false });
  document.addEventListener("gesturestart", onGesture, { passive: false });
  document.addEventListener("gesturechange", onGesture, { passive: false });
  document.addEventListener("gestureend", onGesture, { passive: false });
  document.addEventListener("wheel", onWheel, { passive: false });
  document.addEventListener("touchend", lockMeta, { passive: true });
  vv?.addEventListener("resize", onVvChange);
  vv?.addEventListener("scroll", onVvChange);

  return () => {
    document.removeEventListener("touchmove", onTouchMove);
    document.removeEventListener("gesturestart", onGesture);
    document.removeEventListener("gesturechange", onGesture);
    document.removeEventListener("gestureend", onGesture);
    document.removeEventListener("wheel", onWheel);
    document.removeEventListener("touchend", lockMeta);
    vv?.removeEventListener("resize", onVvChange);
    vv?.removeEventListener("scroll", onVvChange);
  };
}

/** Keep CSS in sync with the visible viewport (above mobile browser chrome). */
export function bindVisualViewport(): () => void {
  const root = document.documentElement;
  const vv = window.visualViewport;

  const update = () => {
    const w = vv?.width || window.innerWidth;
    const h = vv?.height || window.innerHeight;
    const offsetTop = vv?.offsetTop || 0;
    const offsetLeft = vv?.offsetLeft || 0;
    const shellW = Math.min(480, w);
    const shellLeft = offsetLeft + Math.max(0, (w - shellW) / 2);

    root.style.setProperty("--vvh", `${h}px`);
    root.style.setProperty("--vvw", `${w}px`);
    root.style.setProperty("--vv-offset-top", `${offsetTop}px`);
    root.style.setProperty("--vv-offset-left", `${offsetLeft}px`);
    root.style.setProperty("--mobile-shell-width", `${shellW}px`);
    root.style.setProperty("--mobile-shell-left", `${shellLeft}px`);
    root.style.setProperty("--mobile-shell-center-x", `${offsetLeft + w / 2}px`);
    const bottomInset = Math.max(0, window.innerHeight - offsetTop - h);
    root.style.setProperty("--vv-bottom-inset", `${bottomInset}px`);
  };

  update();
  vv?.addEventListener("resize", update);
  vv?.addEventListener("scroll", update);
  window.addEventListener("orientationchange", update);
  window.addEventListener("resize", update);

  return () => {
    vv?.removeEventListener("resize", update);
    vv?.removeEventListener("scroll", update);
    window.removeEventListener("orientationchange", update);
    window.removeEventListener("resize", update);
    root.style.removeProperty("--vvh");
    root.style.removeProperty("--vvw");
    root.style.removeProperty("--vv-offset-top");
    root.style.removeProperty("--vv-offset-left");
    root.style.removeProperty("--vv-bottom-inset");
    root.style.removeProperty("--mobile-shell-width");
    root.style.removeProperty("--mobile-shell-left");
    root.style.removeProperty("--mobile-shell-center-x");
  };
}
