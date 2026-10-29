import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Accessible modal / drawer: focus trap, Escape to close, scroll lock, focus restored on close.
export default function Dialog({ open, onClose, label, variant = 'modal', children }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const node = ref.current;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    (node.querySelector('[data-autofocus]') || node.querySelector(FOCUSABLE) || node).focus();

    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); return; }
      if (e.key !== 'Tab') return;
      const items = [...node.querySelectorAll(FOCUSABLE)];
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0]; const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className={`dlg-root ${variant}`} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dlg" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} ref={ref}>
        <button type="button" className="dlg-close" onClick={onClose} aria-label="Close dialog"><X size={18} /></button>
        {children}
      </div>
    </div>,
    document.body,
  );
}
