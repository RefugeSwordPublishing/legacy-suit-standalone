import { Card } from '@/components/ui/card';
import { Link } from 'react-router-dom';

export default function StatsBar({ stats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {stats.map((stat, i) => {
        const isClickable = stat.href || stat.onClick;
        const inner = (
          <Card key={i} className={`p-4 border border-border ${isClickable ? 'hover:border-accent/40 hover:shadow-md transition-all cursor-pointer' : ''}`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${stat.bgColor}`}>
                <stat.icon className={`w-5 h-5 ${stat.iconColor}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          </Card>
        );
        if (stat.href) return <Link key={i} to={stat.href}>{inner}</Link>;
        if (stat.onClick) return <div key={i} onClick={stat.onClick}>{inner}</div>;
        return <div key={i}>{inner}</div>;
      })}
    </div>
  );
}