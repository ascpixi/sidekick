import type { ReactElement } from "react";
import { linkify } from "../../utils";
import type { HackatimeTrustLog } from "../../services/hackatime";

export function TrustAlert({
  variant,
  icon,
  message,
  trustLogs,
}: {
  variant: "warning" | "error";
  icon: ReactElement;
  message: string;
  trustLogs: HackatimeTrustLog[];
}) {
  return (
    <div role="alert" className={`alert alert-${variant} mt-6`}>
      {icon}
      <div>
        <p>{message}</p>
        {trustLogs.length > 0 && (
          <ul className="mt-2 text-sm list-disc list-inside">
            {trustLogs.map(log => (
              <li key={log.id}>
                <span className="font-semibold">{log.previous_trust_level} → {log.new_trust_level}</span>
                {log.reason && <span className="whitespace-pre-wrap">: {linkify(log.reason)}</span>}
                {log.notes && <span className="opacity-70 whitespace-pre-wrap"> ({linkify(log.notes)})</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
