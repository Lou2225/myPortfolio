"use client";

import { useEffect, useRef } from "react";
import { usePortfolio } from "@/context/PortfolioContext";
import {
  APPEARANCE_SYNC_EVENT,
  resolveAccentBaseHex,
  resolveEffectiveReducedMotion,
  resolveEffectiveTheme,
} from "@/lib/appearance";
import {
  BACKDROP_FRAGMENT_SHADER,
  BACKDROP_VERTEX_SHADER,
  STARFIELD_CONFIG,
  STARS_FRAGMENT_SHADER,
  STARS_VERTEX_SHADER,
  createPerspectiveMatrix4,
  createViewMatrix4,
  resolveStarfieldPalette,
  unprojectNdcToZ0Plane,
} from "@/lib/webglStarfield";
import type { PortfolioTheme } from "@/types/portfolio";

interface CompiledProgram {
  program: WebGLProgram;
  vertexShader: WebGLShader;
  fragmentShader: WebGLShader;
}

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function linkProgram(
  gl: WebGLRenderingContext,
  vertexSource: string,
  fragmentSource: string
): CompiledProgram | null {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertexShader || !fragmentShader) {
    if (vertexShader) gl.deleteShader(vertexShader);
    if (fragmentShader) gl.deleteShader(fragmentShader);
    return null;
  }

  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    return null;
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    return null;
  }

  return { program, vertexShader, fragmentShader };
}

function readRuntimeTheme(fallbackMode: "dark" | "light" | "system"): PortfolioTheme {
  if (typeof document !== "undefined") {
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr === "light" || attr === "dark") return attr;
  }
  return resolveEffectiveTheme(fallbackMode);
}

function readRuntimeAccent(fallbackHex: string): string {
  if (typeof document !== "undefined") {
    const inlineAccent = document.documentElement.style
      .getPropertyValue("--accent")
      .trim();
    if (/^#[0-9a-fA-F]{6}$/.test(inlineAccent)) {
      return inlineAccent;
    }
  }
  return fallbackHex;
}

/**
 * Lightweight single-pass WebGL Starfield Tunnel background for the public portfolio.
 * Adapts to live Appearance Studio theme & accent tokens, caps DPR, pauses when hidden,
 * and paints a zero-RAF static backdrop when Reduced Motion is active.
 */
export function StarfieldCanvas() {
  const { appearance } = usePortfolio();
  const enabled = appearance.ambientStarfield !== false;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const appearanceRef = useRef(appearance);

  useEffect(() => {
    appearanceRef.current = appearance;
  }, [appearance]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let initTimerId = 0;
    let idleHandle = 0;
    let cleanupWebgl: (() => void) | null = null;

    const boot = () => {
      if (disposed || !canvasRef.current) return;

      const gl =
        canvas.getContext("webgl2", {
          alpha: true,
          antialias: false,
          depth: false,
          stencil: false,
          failIfMajorPerformanceCaveat: true,
          powerPreference: "high-performance",
        }) ||
        canvas.getContext("webgl", {
          alpha: true,
          antialias: false,
          depth: false,
          stencil: false,
          failIfMajorPerformanceCaveat: true,
          powerPreference: "high-performance",
        });

      if (!gl) return;

      const backdropProg = linkProgram(
        gl,
        BACKDROP_VERTEX_SHADER,
        BACKDROP_FRAGMENT_SHADER
      );
      const starsProg = linkProgram(
        gl,
        STARS_VERTEX_SHADER,
        STARS_FRAGMENT_SHADER
      );
      if (!backdropProg || !starsProg) {
        if (backdropProg) {
          gl.deleteProgram(backdropProg.program);
          gl.deleteShader(backdropProg.vertexShader);
          gl.deleteShader(backdropProg.fragmentShader);
        }
        if (starsProg) {
          gl.deleteProgram(starsProg.program);
          gl.deleteShader(starsProg.vertexShader);
          gl.deleteShader(starsProg.fragmentShader);
        }
        return;
      }

      // Fullscreen triangle-strip quad for corner nebula glow
      const quadBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW
      );

      // Adaptive star budget: ultra-lightweight on mobile/low-core devices
      const isNarrow = window.innerWidth < 768;
      const lowCores =
        typeof navigator.hardwareConcurrency === "number" &&
        navigator.hardwareConcurrency <= 4;
      const starCount = isNarrow ? 550 : lowCores ? 1200 : 1800;

      // Interleaved buffer: [x, y, z, scale, phase, palette, bright] = 7 floats
      const strideFloats = 7;
      const starData = new Float32Array(starCount * strideFloats);
      for (let i = 0; i < starCount; i++) {
        const base = i * strideFloats;
        starData[base] = (Math.random() - 0.5) * 24;
        starData[base + 1] = (Math.random() - 0.5) * 16;
        starData[base + 2] = (Math.random() - 0.5) * STARFIELD_CONFIG.depth;
        starData[base + 3] = 0.5 + Math.pow(Math.random(), 1.4) * 2.5;
        starData[base + 4] = Math.random();
        starData[base + 5] = Math.floor(Math.random() * 3);
        starData[base + 6] = 0.7 + Math.random() * 0.6;
      }

      const starBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, starBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, starData, gl.STATIC_DRAW);

      const bgLoc = {
        aPosition: gl.getAttribLocation(backdropProg.program, "aPosition"),
        iTime: gl.getUniformLocation(backdropProg.program, "iTime"),
        uOpacity: gl.getUniformLocation(backdropProg.program, "uOpacity"),
        uFlameAmt: gl.getUniformLocation(backdropProg.program, "uFlameAmt"),
        uIsLight: gl.getUniformLocation(backdropProg.program, "uIsLight"),
        uFlameA: gl.getUniformLocation(backdropProg.program, "uFlameA"),
        uFlameB: gl.getUniformLocation(backdropProg.program, "uFlameB"),
      };

      const stLoc = {
        aPosition: gl.getAttribLocation(starsProg.program, "aPosition"),
        aScale: gl.getAttribLocation(starsProg.program, "aScale"),
        aPhase: gl.getAttribLocation(starsProg.program, "aPhase"),
        aPalette: gl.getAttribLocation(starsProg.program, "aPalette"),
        aBright: gl.getAttribLocation(starsProg.program, "aBright"),
        uViewMatrix: gl.getUniformLocation(starsProg.program, "uViewMatrix"),
        uProjectionMatrix: gl.getUniformLocation(
          starsProg.program,
          "uProjectionMatrix"
        ),
        uTime: gl.getUniformLocation(starsProg.program, "uTime"),
        uSize: gl.getUniformLocation(starsProg.program, "uSize"),
        uDrift: gl.getUniformLocation(starsProg.program, "uDrift"),
        uDepth: gl.getUniformLocation(starsProg.program, "uDepth"),
        uTwinkle: gl.getUniformLocation(starsProg.program, "uTwinkle"),
        uRotZ: gl.getUniformLocation(starsProg.program, "uRotZ"),
        uCursor: gl.getUniformLocation(starsProg.program, "uCursor"),
        uRepelRadius: gl.getUniformLocation(starsProg.program, "uRepelRadius"),
        uRepelStrength: gl.getUniformLocation(
          starsProg.program,
          "uRepelStrength"
        ),
        uActivity: gl.getUniformLocation(starsProg.program, "uActivity"),
        uColorA: gl.getUniformLocation(starsProg.program, "uColorA"),
        uColorB: gl.getUniformLocation(starsProg.program, "uColorB"),
        uColorC: gl.getUniformLocation(starsProg.program, "uColorC"),
        uOpacity: gl.getUniformLocation(starsProg.program, "uOpacity"),
        uBrightness: gl.getUniformLocation(starsProg.program, "uBrightness"),
        uIsLight: gl.getUniformLocation(starsProg.program, "uIsLight"),
      };

      let dpr = Math.min(window.devicePixelRatio || 1, 1.25);
      let aspect = Math.max(window.innerWidth, 1) / Math.max(window.innerHeight, 1);
      let projMatrix = createPerspectiveMatrix4(45, aspect, 0.1, 80);

      let currentTheme = readRuntimeTheme(appearanceRef.current.defaultTheme);
      let palette = resolveStarfieldPalette(
        readRuntimeAccent(resolveAccentBaseHex(appearanceRef.current)),
        currentTheme
      );
      let reducedMotion = resolveEffectiveReducedMotion(appearanceRef.current);

      const syncAppearanceTokens = () => {
        const currentApp = appearanceRef.current;
        currentTheme = readRuntimeTheme(currentApp.defaultTheme);
        palette = resolveStarfieldPalette(
          readRuntimeAccent(resolveAccentBaseHex(currentApp)),
          currentTheme
        );
        const nextReduced = resolveEffectiveReducedMotion(currentApp);
        const switchedFromReduced = reducedMotion && !nextReduced;
        reducedMotion = nextReduced;
        if (reducedMotion) {
          stopLoop();
          renderFrame(performance.now(), true);
        } else if (switchedFromReduced && !document.hidden) {
          t0 = performance.now() / 1000;
          startLoop();
        }
      };

      const resize = () => {
        const w = Math.max(window.innerWidth, 1);
        const h = Math.max(window.innerHeight, 1);
        dpr = w < 768 ? 1 : Math.min(window.devicePixelRatio || 1, 1.25);
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
        gl.viewport(0, 0, canvas.width, canvas.height);
        aspect = w / h;
        projMatrix = createPerspectiveMatrix4(45, aspect, 0.1, 80);
      };

      // Scroll state (double-damped as specified)
      let scrollTarget = 0;
      let scrollSmooth = 0;
      let scrollCurrent = 0;
      const updateScrollTarget = () => {
        const maxScroll = Math.max(
          document.documentElement.scrollHeight - window.innerHeight,
          1
        );
        scrollTarget = Math.max(0, Math.min(1, window.scrollY / maxScroll));
      };

      // Pointer void & parallax state (fine desktop pointers only)
      const finePointerMq = window.matchMedia?.("(hover: hover) and (pointer: fine)");
      let finePointerEnabled = Boolean(finePointerMq?.matches);
      let pointerActive = false;
      let pointerLastMoveMs = 0;
      const mouseNdc = { x: 0, y: 0 };
      const mouseSmooth = { x: 0, y: 0 };
      const pointerWorld = { x: 0, y: 0, z: 0 };
      let pointerActivity = 0;

      const onMouseMove = (e: MouseEvent) => {
        if (!finePointerEnabled || reducedMotion) return;
        const w = Math.max(window.innerWidth, 1);
        const h = Math.max(window.innerHeight, 1);
        mouseNdc.x = (e.clientX / w) * 2 - 1;
        mouseNdc.y = -((e.clientY / h) * 2 - 1);
        pointerActive = true;
        pointerLastMoveMs = performance.now();
      };

      const onMouseOut = () => {
        pointerActive = false;
      };

      const onFinePointerChange = (e: MediaQueryListEvent) => {
        finePointerEnabled = e.matches;
        if (!finePointerEnabled) {
          pointerActive = false;
          mouseNdc.x = 0;
          mouseNdc.y = 0;
        }
      };

      let driftAccum = 0;
      let rotZ = 0;
      const appearStartMs = performance.now();
      let t0 = appearStartMs / 1000;
      let rafId = 0;

      const renderFrame = (nowMs: number, staticFreeze = false) => {
        const nowSec = nowMs / 1000;
        const dt = staticFreeze ? 0 : Math.min(0.05, Math.max(0, nowSec - t0));
        t0 = nowSec;

        if (!staticFreeze) {
          scrollSmooth += (scrollTarget - scrollSmooth) * 0.1;
          scrollCurrent += (scrollSmooth - scrollCurrent) * 0.06;

          const targetMouseX = finePointerEnabled ? mouseNdc.x : 0;
          const targetMouseY = finePointerEnabled ? mouseNdc.y : 0;
          mouseSmooth.x += (targetMouseX - mouseSmooth.x) * 0.06;
          mouseSmooth.y += (targetMouseY - mouseSmooth.y) * 0.06;

          driftAccum +=
            dt * (STARFIELD_CONFIG.drift + scrollCurrent * STARFIELD_CONFIG.scrollDrift);
          rotZ +=
            dt * (STARFIELD_CONFIG.spin + scrollCurrent * STARFIELD_CONFIG.scrollSpin);
        }

        const camX = (staticFreeze ? 0 : mouseSmooth.x) * STARFIELD_CONFIG.parallax;
        const camY = (staticFreeze ? 0 : mouseSmooth.y) * STARFIELD_CONFIG.parallax;
        const camZ =
          5 - (staticFreeze ? scrollTarget : scrollCurrent) * STARFIELD_CONFIG.scrollPush;

        if (!staticFreeze) {
          if (finePointerEnabled && pointerActive) {
            const [wx, wy, wz] = unprojectNdcToZ0Plane(
              mouseNdc.x,
              mouseNdc.y,
              camX,
              camY,
              camZ,
              45,
              aspect
            );
            pointerWorld.x += (wx - pointerWorld.x) * 0.12;
            pointerWorld.y += (wy - pointerWorld.y) * 0.12;
            pointerWorld.z += (wz - pointerWorld.z) * 0.12;
          } else {
            pointerWorld.x += (0 - pointerWorld.x) * 0.12;
            pointerWorld.y += (0 - pointerWorld.y) * 0.12;
            pointerWorld.z += (0 - pointerWorld.z) * 0.12;
          }

          const idleSec = (nowMs - pointerLastMoveMs) / 1000;
          const want = finePointerEnabled && pointerActive && idleSec < 3 ? 1 : 0;
          pointerActivity += (want - pointerActivity) * 0.06;
        } else {
          pointerActivity = 0;
        }

        const elapsedMs = nowMs - appearStartMs;
        const appearFade = staticFreeze
          ? 1
          : Math.max(0, Math.min(1, (elapsedMs - 300) / 1400));

        const viewMatrix = createViewMatrix4(camX, camY, camZ, camX, camY, -10);

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND);

        // Pass 1: Corner warp nebula aura (softened in light mode so paper canvas breathes)
        if (palette.flameAmt > 0.001) {
          gl.blendFuncSeparate(
            gl.SRC_ALPHA,
            gl.ONE_MINUS_SRC_ALPHA,
            gl.ONE,
            gl.ONE_MINUS_SRC_ALPHA
          );
          gl.useProgram(backdropProg.program);
          gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
          if (bgLoc.aPosition >= 0) {
            gl.enableVertexAttribArray(bgLoc.aPosition);
            gl.vertexAttribPointer(bgLoc.aPosition, 2, gl.FLOAT, false, 0, 0);
          }
          gl.uniform1f(bgLoc.iTime, staticFreeze ? 1.2 : nowSec);
          gl.uniform1f(bgLoc.uOpacity, appearFade);
          gl.uniform1f(bgLoc.uFlameAmt, palette.flameAmt);
          gl.uniform1f(bgLoc.uIsLight, palette.isLight ? 1 : 0);
          gl.uniform3fv(bgLoc.uFlameA, palette.flameA);
          gl.uniform3fv(bgLoc.uFlameB, palette.flameB);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }

        // Pass 2: 3D parallax starfield tunnel points
        if (palette.isLight) {
          gl.blendFuncSeparate(
            gl.SRC_ALPHA,
            gl.ONE_MINUS_SRC_ALPHA,
            gl.ONE,
            gl.ONE_MINUS_SRC_ALPHA
          );
        } else {
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        }

        gl.useProgram(starsProg.program);
        gl.bindBuffer(gl.ARRAY_BUFFER, starBuffer);

        const byteStride = strideFloats * 4;
        if (stLoc.aPosition >= 0) {
          gl.enableVertexAttribArray(stLoc.aPosition);
          gl.vertexAttribPointer(stLoc.aPosition, 3, gl.FLOAT, false, byteStride, 0);
        }
        if (stLoc.aScale >= 0) {
          gl.enableVertexAttribArray(stLoc.aScale);
          gl.vertexAttribPointer(stLoc.aScale, 1, gl.FLOAT, false, byteStride, 12);
        }
        if (stLoc.aPhase >= 0) {
          gl.enableVertexAttribArray(stLoc.aPhase);
          gl.vertexAttribPointer(stLoc.aPhase, 1, gl.FLOAT, false, byteStride, 16);
        }
        if (stLoc.aPalette >= 0) {
          gl.enableVertexAttribArray(stLoc.aPalette);
          gl.vertexAttribPointer(stLoc.aPalette, 1, gl.FLOAT, false, byteStride, 20);
        }
        if (stLoc.aBright >= 0) {
          gl.enableVertexAttribArray(stLoc.aBright);
          gl.vertexAttribPointer(stLoc.aBright, 1, gl.FLOAT, false, byteStride, 24);
        }

        gl.uniformMatrix4fv(stLoc.uViewMatrix, false, viewMatrix);
        gl.uniformMatrix4fv(stLoc.uProjectionMatrix, false, projMatrix);
        gl.uniform1f(stLoc.uTime, staticFreeze ? 0 : nowSec);
        gl.uniform1f(
          stLoc.uSize,
          STARFIELD_CONFIG.pointSize * dpr * (palette.isLight ? 1.05 : 0.85)
        );
        gl.uniform1f(stLoc.uDrift, driftAccum);
        gl.uniform1f(stLoc.uDepth, STARFIELD_CONFIG.depth);
        gl.uniform1f(stLoc.uTwinkle, staticFreeze ? 0 : STARFIELD_CONFIG.twinkle);
        gl.uniform1f(stLoc.uRotZ, rotZ);
        gl.uniform3f(
          stLoc.uCursor,
          pointerWorld.x,
          pointerWorld.y,
          pointerWorld.z
        );
        gl.uniform1f(stLoc.uRepelRadius, STARFIELD_CONFIG.repelRadius);
        gl.uniform1f(stLoc.uRepelStrength, STARFIELD_CONFIG.repelStrength);
        gl.uniform1f(stLoc.uActivity, pointerActivity);
        gl.uniform3fv(stLoc.uColorA, palette.colorA);
        gl.uniform3fv(stLoc.uColorB, palette.colorB);
        gl.uniform3fv(stLoc.uColorC, palette.colorC);
        gl.uniform1f(stLoc.uOpacity, appearFade * palette.maxOpacity);
        gl.uniform1f(stLoc.uBrightness, palette.brightness);
        gl.uniform1f(stLoc.uIsLight, palette.isLight ? 1 : 0);

        gl.drawArrays(gl.POINTS, 0, starCount);
      };

      const tick = (nowMs: number) => {
        if (disposed || document.hidden || reducedMotion) {
          rafId = 0;
          return;
        }
        renderFrame(nowMs, false);
        rafId = requestAnimationFrame(tick);
      };

      const startLoop = () => {
        if (disposed || rafId || reducedMotion || document.hidden) return;
        t0 = performance.now() / 1000;
        rafId = requestAnimationFrame(tick);
      };

      const stopLoop = () => {
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = 0;
        }
      };

      const onVisibilityChange = () => {
        if (document.hidden) {
          stopLoop();
        } else {
          syncAppearanceTokens();
          startLoop();
        }
      };

      const onResize = () => {
        resize();
        updateScrollTarget();
        if (reducedMotion) {
          renderFrame(performance.now(), true);
        }
      };

      resize();
      updateScrollTarget();

      window.addEventListener("resize", onResize, { passive: true });
      window.addEventListener("scroll", updateScrollTarget, { passive: true });
      window.addEventListener("mousemove", onMouseMove, { passive: true });
      window.addEventListener("mouseout", onMouseOut, { passive: true });
      finePointerMq?.addEventListener("change", onFinePointerChange);
      document.addEventListener("visibilitychange", onVisibilityChange);
      window.addEventListener(APPEARANCE_SYNC_EVENT, syncAppearanceTokens);

      const docObserver = new MutationObserver(syncAppearanceTokens);
      docObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme", "data-motion", "style"],
      });

      if (reducedMotion) {
        renderFrame(performance.now(), true);
      } else {
        startLoop();
      }

      cleanupWebgl = () => {
        stopLoop();
        docObserver.disconnect();
        window.removeEventListener("resize", onResize);
        window.removeEventListener("scroll", updateScrollTarget);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseout", onMouseOut);
        finePointerMq?.removeEventListener("change", onFinePointerChange);
        document.removeEventListener("visibilitychange", onVisibilityChange);
        window.removeEventListener(APPEARANCE_SYNC_EVENT, syncAppearanceTokens);

        gl.deleteBuffer(quadBuffer);
        gl.deleteBuffer(starBuffer);
        gl.deleteProgram(backdropProg.program);
        gl.deleteShader(backdropProg.vertexShader);
        gl.deleteShader(backdropProg.fragmentShader);
        gl.deleteProgram(starsProg.program);
        gl.deleteShader(starsProg.vertexShader);
        gl.deleteShader(starsProg.fragmentShader);
      };
    };

    // Boot WebGL only after initial hydration/LCP settles: immediately on first user
    // interaction (after preloader window) or calmly in deep idle (~4.2s) so GLSL
    // compilation never competes with initial page render or TBT.
    const winWithIdle = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    let booted = false;
    const triggerBootOnce = () => {
      if (disposed || booted || document.hidden) return;
      booted = true;
      detachIntentListeners();
      if (initTimerId) {
        window.clearTimeout(initTimerId);
        initTimerId = 0;
      }
      if (typeof winWithIdle.requestIdleCallback === "function") {
        idleHandle = winWithIdle.requestIdleCallback(boot, { timeout: 400 });
      } else {
        boot();
      }
    };

    const handleUserIntent = () => triggerBootOnce();
    const attachIntentListeners = () => {
      window.addEventListener("pointerdown", handleUserIntent, { passive: true, once: true });
      window.addEventListener("wheel", handleUserIntent, { passive: true, once: true });
      window.addEventListener("touchstart", handleUserIntent, { passive: true, once: true });
      window.addEventListener("scroll", handleUserIntent, { passive: true, once: true });
      window.addEventListener("keydown", handleUserIntent, { passive: true, once: true });
    };
    const detachIntentListeners = () => {
      window.removeEventListener("pointerdown", handleUserIntent);
      window.removeEventListener("wheel", handleUserIntent);
      window.removeEventListener("touchstart", handleUserIntent);
      window.removeEventListener("scroll", handleUserIntent);
      window.removeEventListener("keydown", handleUserIntent);
    };

    const scheduleBoot = () => {
      if (disposed || booted) return;
      attachIntentListeners();
      initTimerId = window.setTimeout(() => {
        triggerBootOnce();
      }, 4200);
    };

    const onWindowLoad = () => scheduleBoot();
    if (document.readyState === "complete") {
      scheduleBoot();
    } else {
      window.addEventListener("load", onWindowLoad, { once: true });
    }

    return () => {
      disposed = true;
      detachIntentListeners();
      window.removeEventListener("load", onWindowLoad);
      if (idleHandle && typeof winWithIdle.cancelIdleCallback === "function") {
        winWithIdle.cancelIdleCallback(idleHandle);
      }
      if (initTimerId) {
        window.clearTimeout(initTimerId);
      }
      cleanupWebgl?.();
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-0 pointer-events-none select-none overflow-hidden"
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
