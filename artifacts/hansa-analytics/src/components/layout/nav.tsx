import { Link, useLocation } from "wouter";
import { BarChart2, TrendingDown } from "lucide-react";

const tabs = [
  { path: "/", label: "Sales Dashboard", icon: BarChart2 },
  { path: "/movement", label: "Movement Analytics", icon: TrendingDown },
];

export default function NavBar() {
  const [location] = useLocation();

  return (
    <nav className="flex-shrink-0 h-10 border-b border-border bg-card flex items-stretch px-2 gap-0.5">
      <div className="flex items-center pr-4 pl-2 mr-2 border-r border-border">
        <span className="text-xs font-bold tracking-tight text-foreground">Hansa</span>
      </div>
      {tabs.map((tab) => {
        const active = location === tab.path;
        return (
          <Link
            key={tab.path}
            href={tab.path}
            className={`flex items-center gap-1.5 px-3 text-xs font-medium h-full border-b-2 transition-colors ${
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
