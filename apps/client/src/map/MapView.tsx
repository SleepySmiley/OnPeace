import { useEffect, useRef } from 'react';
import { Application } from 'pixi.js';
import type { MapDef } from '@onpeace/engine';
import { Camera } from './camera';
import { MAP_COLORS } from './palette';
import { buildScene, type HoverTarget } from './scene';

/** Altezza della barra in alto (vedi .topbar in styles.css). */
const TOPBAR_HEIGHT = 44;

interface Props {
  map: MapDef;
  onHover: (target: HoverTarget | null) => void;
}

/** Mappa interattiva: rotella per lo zoom, trascinamento per spostarsi. */
export function MapView({ map, onHover }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onHoverRef = useRef(onHover);

  useEffect(() => {
    onHoverRef.current = onHover;
  }, [onHover]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let cleanup = () => {};

    void (async () => {
      await document.fonts.load('600 13px "IBM Plex Sans Condensed"').catch(() => undefined);
      const app = new Application();
      await app.init({
        resizeTo: host,
        background: MAP_COLORS.sea,
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
      });
      if (cancelled) {
        app.destroy(true, { children: true });
        return;
      }
      host.appendChild(app.canvas);
      const canvas = app.canvas;

      const camera = new Camera(map.width, map.height);
      camera.insetTop = TOPBAR_HEIGHT;
      camera.fit(app.screen.width, app.screen.height);
      let fit = camera.scale;
      const scene = buildScene(app, map, () => fit);
      scene.update(camera);

      let drag: { x: number; y: number; moved: boolean } | null = null;
      let lastHover: string | null = null;

      const local = (e: PointerEvent | WheelEvent) => {
        const r = canvas.getBoundingClientRect();
        return [e.clientX - r.left, e.clientY - r.top] as const;
      };
      const emitHover = (target: HoverTarget | null) => {
        const key = target ? `${target.kind}:${target.id}` : null;
        if (key === lastHover) return;
        lastHover = key;
        scene.setHover(target);
        onHoverRef.current(target);
      };

      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        const [sx, sy] = local(e);
        camera.zoomAt(sx, sy, Math.pow(1.0015, -e.deltaY));
        scene.update(camera);
      };
      const onDown = (e: PointerEvent) => {
        drag = { x: e.clientX, y: e.clientY, moved: false };
        canvas.setPointerCapture(e.pointerId);
      };
      const onMove = (e: PointerEvent) => {
        if (drag) {
          const dx = e.clientX - drag.x;
          const dy = e.clientY - drag.y;
          if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
          drag.x = e.clientX;
          drag.y = e.clientY;
          camera.pan(dx, dy);
          scene.update(camera);
          canvas.style.cursor = 'grabbing';
          return;
        }
        const [sx, sy] = local(e);
        const target = scene.hitTest(camera, sx, sy);
        canvas.style.cursor = target?.kind === 'city' ? 'pointer' : 'default';
        emitHover(target);
      };
      const onUp = (e: PointerEvent) => {
        drag = null;
        canvas.style.cursor = 'default';
        if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      };
      const onLeave = () => emitHover(null);
      const onResize = () => {
        const oldFit = fit;
        const zoom = camera.scale / oldFit;
        camera.fit(app.screen.width, app.screen.height);
        fit = camera.scale;
        if (zoom > 1.01) camera.zoomAt(app.screen.width / 2, app.screen.height / 2, zoom);
        scene.update(camera);
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Home' || e.key === '0') {
          camera.fit(app.screen.width, app.screen.height);
          scene.update(camera);
        }
      };

      canvas.addEventListener('wheel', onWheel, { passive: false });
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointerleave', onLeave);
      app.renderer.on('resize', onResize);
      window.addEventListener('keydown', onKey);

      cleanup = () => {
        canvas.removeEventListener('wheel', onWheel);
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointerleave', onLeave);
        app.renderer.off('resize', onResize);
        window.removeEventListener('keydown', onKey);
        app.destroy(true, { children: true });
      };
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [map]);

  return <div ref={hostRef} className="map-host" />;
}
