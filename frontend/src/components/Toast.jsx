import { useEffect } from 'react';

export default function Toast({ toast, onDone }) {
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(onDone, toast.kind === 'error' ? 7000 : 4500);
    return () => clearTimeout(t);
  }, [toast, onDone]);
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {toast && <div className={`toast ${toast.kind}`} key={toast.id}>{toast.message}</div>}
    </div>
  );
}
