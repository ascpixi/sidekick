export function Card({ 
  children, 
  className = "" 
}: { 
  children: React.ReactNode; 
  className?: string; 
}) {
  return (
    <div className={`bg-base-100 p-6 rounded-lg ${className}`}>
      {children}
    </div>
  );
}
