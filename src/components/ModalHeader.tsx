import type { ReactNode } from "react";
import { SidekickIcon } from "./SidekickIcon";

interface ModalHeaderProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
}

export function ModalHeader({ title, subtitle, icon }: ModalHeaderProps) {
  return (
    <div className="flex items-center gap-4 mb-6">
      <div className="border border-primary rounded-lg p-3 flex-shrink-0">
        {icon || <SidekickIcon />}
      </div>
      <div className="flex flex-col">
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="text-base-content/70 text-sm">{subtitle}</p>}
      </div>
    </div>
  );
}
