// Shared PDF rendering hook using pdfjs-dist (browser-only).
import { useEffect, useRef, useState } from "react";

// Lazy load pdfjs to avoid SSR issues
async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  // Use the bundled worker via ?url
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjs;
}

export type PdfPageInfo = { pageNumber: number; width: number; height: number };

export function usePdfDocument(url: string | null) {
  const [pages, setPages] = useState<PdfPageInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const docRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    if (!url) { setPages([]); return; }
    setLoading(true); setError(null);
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const doc = await pdfjs.getDocument({ url }).promise;
        if (cancelled) return;
        docRef.current = doc;
        const infos: PdfPageInfo[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const vp = page.getViewport({ scale: 1 });
          infos.push({ pageNumber: i, width: vp.width, height: vp.height });
        }
        if (!cancelled) setPages(infos);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "PDF kon niet geladen worden");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  return { doc: docRef, pages, loading, error };
}

export function PdfPageCanvas({
  doc, pageNumber, renderWidth,
}: {
  doc: React.MutableRefObject<any>;
  pageNumber: number;
  renderWidth: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    let renderTask: any;
    (async () => {
      const d = doc.current;
      if (!d || !canvasRef.current) return;
      const page = await d.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const scale = renderWidth / base.width;
      const vp = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = vp.width * ratio;
      canvas.height = vp.height * ratio;
      canvas.style.width = `${vp.width}px`;
      canvas.style.height = `${vp.height}px`;
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      renderTask = page.render({ canvasContext: ctx, viewport: vp, canvas });
      try { await renderTask.promise; } catch { /* cancelled */ }
    })();
    return () => { cancelled = true; if (renderTask) try { renderTask.cancel(); } catch {} };
  }, [doc, pageNumber, renderWidth]);
  return <canvas ref={canvasRef} className="block" />;
}
