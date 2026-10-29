import { Wrench, Building2, Cpu, Cog, Camera, CalendarDays, FlaskConical, Package } from 'lucide-react';

const MAP = [
  [/lab|science|research/i, FlaskConical], [/tool|equip|drill|saw/i, Wrench], [/space|room|office|work/i, Building2],
  [/electr|laptop|monitor|comput|3d|print/i, Cpu], [/machin|cnc|laser|mill|lathe/i, Cog], [/studio|camera|photo|creative|video/i, Camera],
  [/event|hall|venue/i, CalendarDays],
];
export const iconFor = (category) => (MAP.find(([re]) => re.test(category)) || [null, Package])[1];

// No image field exists in the API, so every card gets a designed placeholder derived from its id/category.
export default function ResourceVisual({ id, category }) {
  const Icon = iconFor(category);
  const a = (id * 47) % 100; const b = (id * 29 + 30) % 100;
  return (
    <div className="visual" aria-hidden="true">
      <svg viewBox="0 0 200 120" preserveAspectRatio="xMidYMid slice">
        <defs><pattern id={`g${id}`} width="16" height="16" patternUnits="userSpaceOnUse"><path d="M16 0H0V16" fill="none" stroke="rgba(255,255,255,.06)" /></pattern></defs>
        <rect width="200" height="120" fill={`url(#g${id})`} />
        <circle cx={20 + a * 1.4} cy={20 + b * 0.6} r={34 + (a % 20)} fill="none" stroke="rgba(91,140,255,.35)" />
        <circle cx={150 - b * 0.8} cy={90 - a * 0.4} r="3" fill="#C6FF3D" />
        <path d={`M${20 + a * 1.4} ${20 + b * 0.6} L${150 - b * 0.8} ${90 - a * 0.4}`} stroke="rgba(198,255,61,.35)" />
      </svg>
      <Icon size={34} strokeWidth={1.4} />
    </div>
  );
}
