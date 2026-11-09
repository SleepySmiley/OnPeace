import { useEffect, useRef } from 'react';
import { Application } from 'pixi.js';
import type { MapDef, Point } from '@onpeace/engine';
import type { DraftMarker, MapViewModel } from '../game/viewModel';
import { Camera } from './camera';
import { MAP_COLORS } from './palette';
import { buildScene, type HitTarget, type Scene } from './scene';

/** Altezza della barra in alto (vedi .topbar in styles.css). */
const TOPBAR_HEIGHT = 48;

export interface MapClick {
  hit: HitTarget | null;
  world: Point;
  shift: boolean;
}

interface Props {
  map: MapDef;
  view: MapViewModel;
  draft: DraftMarker | null;
  /** Centra la mappa sul punto (a ogni nuovo seq). */
  focus?: { pos: Point; seq: number } | null;
  onHover: (target: HitTarget | null) => void;
  onClick: (click: MapClick) => void;
  /** Posizione del cursore in coordinate mappa (per l'anteprima dei percorsi). */
  onPointer?: (world: Point, hit: HitTarget | null) => void;
  /** Tasto destro o Esc. */
  onCancel?: () => void;
  /** La pila si può trascinare (cursore a mano aperta). */
  draggable?: (hit: HitTarget) => boolean;
  /** Inizio del trascinamento di una pila: false = la mappa si sposta come al solito. */
  onDragStart?: (hit: HitTarget) => boolean;
  /** Rilascio della pila trascinata (posizione, cosa c'è sotto, Maiusc premuto). */
  onDrop?: (drop: MapClick) => void;
}

/**
 * Mappa interattiva: rotella per lo zoom, trascinamento per spostarsi, clic per scegliere.
 * Trascinando una propria pila (se `onDragStart` la accetta) si dà un ordine di movimento.
 */
export function MapView({
  map,
  view,
  draft,
  focus,
  onHover,
  onClick,
  onPointer,
  onCancel,
  draggable,
  onDragStart,
  onDrop,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const centerRef = useRef<((p: Point) => void) | null>(null);
  const handlers = useRef({ onHover, onClick, onPointer, onCancel, draggable, onDragStart, onDrop });
  const latest = useRef({ view, draft });

  useEffect(() => {
    handlers.current = { onHover, onClick, onPointer, onCancel, draggable, onDragStart, onDrop };
  }, [onHover, onClick, onPointer, onCancel, draggable, onDragStart, onDrop]);

  useEffect(() => {
    latest.current.view = view;
    sceneRef.current?.setView(view);
  }, [view]);

  useEffect(() => {
    latest.current.draft = draft;
    sceneRef.current?.setDraft(draft);
  }, [draft]);

  useEffect(() => {
    if (focus) centerRef.current?.(focus.pos);
  }, [focus]);

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
      sceneRef.current = scene;
      scene.setView(latest.current.view);
      scene.setDraft(latest.current.draft);
      scene.update(camera);

      centerRef.current = (p: Point) => {
        // almeno un po' di zoom, poi il punto al centro della parte libera dello schermo
        if (camera.scale < fit * 1.6) camera.scale = fit * 1.6;
        camera.x = app.screen.width / 2 - p[0] * camera.scale;
        camera.y = TOPBAR_HEIGHT + (app.screen.height - TOPBAR_HEIGHT) / 2 - p[1] * camera.scale;
        scene.update(camera);
      };

      /** Pressione in corso: `unit` = si trascina una pila (ordine), altrimenti si sposta la mappa. */
      let drag: { x: number; y: number; moved: boolean; hit: HitTarget | null; unit: boolean } | null = null;
      const cursorFor = (target: HitTarget | null) =>
        target?.kind === 'stack' && handlers.current.draggable?.(target)
          ? 'grab'
          : target?.kind === 'city' || target?.kind === 'stack'
            ? 'pointer'
            : 'default';
      let lastHover: string | null = null;

      const local = (e: PointerEvent | WheelEvent | MouseEvent) => {
        const r = canvas.getBoundingClientRect();
        return [e.clientX - r.left, e.clientY - r.top] as const;
      };
      const emitHover = (target: HitTarget | null) => {
        const key = target ? `${target.kind}:${target.id}` : null;
        if (key === lastHover) return;
        lastHover = key;
        scene.setHover(target);
        handlers.current.onHover(target);
      };

      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        const [sx, sy] = local(e);
        camera.zoomAt(sx, sy, Math.pow(1.0015, -e.deltaY));
        scene.update(camera);
      };
      const onDown = (e: PointerEvent) => {
        if (e.button !== 0) return;
        const [sx, sy] = local(e);
        drag = { x: e.clientX, y: e.clientY, moved: false, hit: scene.hitTest(camera, sx, sy), unit: false };
        canvas.setPointerCapture(e.pointerId);
      };
      const onMove = (e: PointerEvent) => {
        const [sx, sy] = local(e);
        if (drag) {
          const dx = e.clientX - drag.x;
          const dy = e.clientY - drag.y;
          if (!drag.moved) {
            if (Math.abs(dx) + Math.abs(dy) < 4) return;
            drag.moved = true;
            // oltre la soglia: si trascina la pila (se si può) o si sposta la mappa
            drag.unit = drag.hit?.kind === 'stack' && (handlers.current.onDragStart?.(drag.hit) ?? false);
          }
          if (drag.unit) {
            const target = scene.hitTest(camera, sx, sy);
            canvas.style.cursor = 'grabbing';
            emitHover(target);
            handlers.current.onPointer?.(camera.toWorld(sx, sy), target);
            return;
          }
          drag.x = e.clientX;
          drag.y = e.clientY;
          camera.pan(dx, dy);
          scene.update(camera);
          canvas.style.cursor = 'grabbing';
          return;
        }
        const target = scene.hitTest(camera, sx, sy);
        canvas.style.cursor = cursorFor(target);
        emitHover(target);
        handlers.current.onPointer?.(camera.toWorld(sx, sy), target);
      };
      const onUp = (e: PointerEvent) => {
        const ended = drag;
        drag = null;
        if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
        if (!ended) return;
        const [sx, sy] = local(e);
        const hit = scene.hitTest(camera, sx, sy);
        canvas.style.cursor = cursorFor(hit);
        const at = { hit, world: camera.toWorld(sx, sy), shift: e.shiftKey };
        if (ended.unit) handlers.current.onDrop?.(at);
        else if (!ended.moved) handlers.current.onClick(at);
      };
      // pressione interrotta (es. cambio di finestra): un trascinamento di pila si annulla
      const onPointerCancel = () => {
        if (drag?.unit) handlers.current.onCancel?.();
        drag = null;
        canvas.style.cursor = 'default';
      };
      const onLeave = () => emitHover(null);
      const onContext = (e: MouseEvent) => {
        e.preventDefault();
        handlers.current.onCancel?.();
      };
      const onResize = () => {
        const zoom = camera.scale / fit;
        camera.fit(app.screen.width, app.screen.height);
        fit = camera.scale;
        if (zoom > 1.01) camera.zoomAt(app.screen.width / 2, app.screen.height / 2, zoom);
        scene.update(camera);
      };
      const onKey = (e: KeyboardEvent) => {
        if ((e.target as HTMLElement | null)?.closest('input, textarea, select')) return;
        if (e.key === 'Escape') handlers.current.onCancel?.();
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
      canvas.addEventListener('pointercancel', onPointerCancel);
      canvas.addEventListener('contextmenu', onContext);
      app.renderer.on('resize', onResize);
      window.addEventListener('keydown', onKey);

      cleanup = () => {
        canvas.removeEventListener('wheel', onWheel);
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointerleave', onLeave);
        canvas.removeEventListener('pointercancel', onPointerCancel);
        canvas.removeEventListener('contextmenu', onContext);
        app.renderer.off('resize', onResize);
        window.removeEventListener('keydown', onKey);
        sceneRef.current = null;
        centerRef.current = null;
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
