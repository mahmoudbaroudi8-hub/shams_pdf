import React, { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, ZoomIn } from 'lucide-react';

export type A4ZoomMode = 'fit' | '75' | '100';

interface ResponsiveA4PreviewProps {
  html: string;
  onCardClick?: (productId: string) => void;
  className?: string;
  showZoomBar?: boolean;
  defaultZoomMode?: A4ZoomMode;
}

const A4_WIDTH_PX = 794;

export const ResponsiveA4Preview: React.FC<ResponsiveA4PreviewProps> = ({
  html,
  onCardClick,
  className = '',
  showZoomBar = true,
  defaultZoomMode = 'fit',
}) => {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(A4_WIDTH_PX);
  const [contentHeight, setContentHeight] = useState<number>(0);
  const [zoomMode, setZoomMode] = useState<A4ZoomMode>(defaultZoomMode);

  useEffect(() => {
    const outer = outerRef.current;
    if (!outer || typeof ResizeObserver === 'undefined') return;

    const updateWidth = () => {
      const w = outer.clientWidth;
      if (w > 0) setContainerWidth(w);
    };
    updateWidth();

    const ro = new ResizeObserver(updateWidth);
    ro.observe(outer);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const inner = innerRef.current;
    if (!inner || typeof ResizeObserver === 'undefined') return;

    const updateHeight = () => {
      const h = inner.scrollHeight;
      if (h > 0) setContentHeight(h);
    };
    updateHeight();

    const ro = new ResizeObserver(updateHeight);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [html, zoomMode, containerWidth]);

  const availableWidth = Math.max(260, containerWidth - 8);
  const fitScale = Math.min(1.6, Math.max(0.28, availableWidth / A4_WIDTH_PX));

  const scale =
    zoomMode === 'fit'
      ? fitScale
      : zoomMode === '75'
        ? Math.min(0.75, fitScale < 0.75 ? fitScale : 0.75)
        : 1;

  const isScaled = Math.abs(scale - 1) > 0.005;
  const scaledHeight =
    isScaled && contentHeight > 0 ? Math.ceil(contentHeight * scale) + 12 : undefined;
  const displayPercent = Math.round(scale * 100);

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onCardClick) return;
    const cardEl = (e.target as HTMLElement).closest('.print-card[data-product-id]');
    if (cardEl) {
      const pid = cardEl.getAttribute('data-product-id');
      if (pid) onCardClick(pid);
    }
  };

  return (
    <div ref={outerRef} className={`w-full flex flex-col items-center ${className}`}>
      {showZoomBar && (
        <div className="w-full mb-2.5 px-2.5 py-1.5 bg-white/90 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-[11px] shadow-2xs">
          <div className="flex items-center gap-1.5 text-slate-600 font-bold">
            <ZoomIn size={13} className="text-orange-600 shrink-0" />
            <span>حجم عرض الصفحة:</span>
            <span dir="ltr" className="font-mono font-extrabold text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded">
              {displayPercent}%
            </span>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg">
            <button
              type="button"
              onClick={() => setZoomMode('fit')}
              className={`flex items-center gap-1 px-2 py-1 rounded-md font-bold transition-colors cursor-pointer ${
                zoomMode === 'fit'
                  ? 'bg-white text-orange-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="ملائمة عرض الكتالوج تلقائياً لحجم الشاشة"
            >
              <Minimize2 size={11} />
              <span>ملائم للشاشة</span>
            </button>
            <button
              type="button"
              onClick={() => setZoomMode('75')}
              className={`px-2 py-1 rounded-md font-mono font-bold transition-colors cursor-pointer ${
                zoomMode === '75'
                  ? 'bg-white text-orange-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              75%
            </button>
            <button
              type="button"
              onClick={() => setZoomMode('100')}
              className={`flex items-center gap-1 px-2 py-1 rounded-md font-mono font-bold transition-colors cursor-pointer ${
                zoomMode === '100'
                  ? 'bg-white text-orange-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="عرض بالحجم الكامل 100%"
            >
              <Maximize2 size={11} />
              <span>100%</span>
            </button>
          </div>
        </div>
      )}

      <div
        className={`w-full ${zoomMode === '100' && availableWidth < A4_WIDTH_PX ? 'overflow-x-auto pb-2' : 'overflow-hidden'}`}
      >
        <div
          className="relative w-full mx-auto"
          style={{
            height: scaledHeight,
            minHeight: isScaled && !scaledHeight ? 360 : undefined,
          }}
        >
          <div
            ref={innerRef}
            onClick={handleContainerClick}
            className="flex flex-col items-center gap-6"
            style={
              isScaled
                ? {
                    width: A4_WIDTH_PX,
                    position: 'absolute',
                    top: 0,
                    left: '50%',
                    transform: `translateX(-50%) scale(${scale})`,
                    transformOrigin: 'top center',
                  }
                : {
                    width: zoomMode === '100' ? A4_WIDTH_PX : '100%',
                    maxWidth: A4_WIDTH_PX,
                    margin: '0 auto',
                  }
            }
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
    </div>
  );
};
