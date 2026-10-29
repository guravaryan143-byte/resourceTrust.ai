import { AlertTriangle, SearchX } from 'lucide-react';

export function LoadingSkeleton({ count = 6 }) {
  return (
    <div className="grid" aria-busy="true" aria-label="Loading resources">
      {Array.from({ length: count }, (_, i) => (
        <div className="card skel" key={i}><div className="visual" /><div className="skel-line w60" /><div className="skel-line w90" /><div className="skel-line w40" /></div>
      ))}
    </div>
  );
}
export function EmptyState({ title, body, action }) {
  return <div className="state"><SearchX size={28} /><h3>{title}</h3><p>{body}</p>{action}</div>;
}
export function ErrorState({ message, onRetry }) {
  return (
    <div className="state error" role="alert"><AlertTriangle size={28} /><h3>Couldn’t load resources</h3><p>{message}</p>
      <button type="button" className="btn primary" onClick={onRetry}>Retry</button></div>
  );
}
