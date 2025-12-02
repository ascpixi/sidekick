export function Accordion({ 
  title, 
  children, 
  className = "",
  defaultOpen = false
}: { 
  title: React.ReactNode; 
  children: React.ReactNode; 
  className?: string;
  defaultOpen?: boolean;
}) {
  return (
    <div className={`collapse collapse-arrow bg-base-100 ${className}`}>
      <input type="checkbox" defaultChecked={defaultOpen} />
      <div className="collapse-title text-lg font-semibold">
        {title}
      </div>
      <div className="collapse-content">
        <div className="space-y-2">
          {children}
        </div>
      </div>
    </div>
  );
}
