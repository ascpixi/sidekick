import { KeyIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";

interface InputProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  linkText?: string;
  linkHref?: string;
  type?: "text" | "password" | "url" | "search";
  required?: boolean;
}

export function Input({ 
  label, 
  placeholder, 
  value, 
  onChange, 
  linkText, 
  linkHref, 
  type = "text", 
  required = false 
}: InputProps) {
  const getIcon = () => {
    switch (type) {
      case "password":
        return <KeyIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-base-content/50 z-10 pointer-events-none" />;
      case "search":
        return <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-base-content/50 z-10 pointer-events-none" />;
      default:
        return null;
    }
  };

  const getInputClass = () => {
    const baseClass = "input input-bordered w-full focus:outline-none focus:ring-0 focus:border-primary";
    const hasIcon = type === "password" || type === "search";
    return hasIcon ? `${baseClass} pl-10 pr-4` : baseClass;
  };

  return (
    <div className="form-control w-full">
      {label && (
        <label className="label">
          <span className="label-text">{label}</span>
        </label>
      )}
      {linkText && linkHref && (
        <div className="mb-2 w-full">
          <a 
            href={linkHref} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-xs text-primary no-underline"
          >
            {linkText}
          </a>
        </div>
      )}
      <div className="relative">
        {getIcon()}
        <input
          type={type === "search" ? "text" : type}
          placeholder={placeholder}
          className={getInputClass()}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
        />
      </div>
    </div>
  );
}
