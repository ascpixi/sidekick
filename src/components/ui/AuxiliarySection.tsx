import { ArchiveBoxIcon } from "@heroicons/react/24/outline";
import { Accordion } from "./Accordion";
import { YswsSubmission } from "../../types/submission";

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toString();
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(formatValue).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function AuxiliarySection({ submission }: { submission: YswsSubmission }) {
  const entries = Object.entries(submission.auxiliaryFields)
    .filter(([key]) => !key.startsWith("Loops - "));
  
  if (entries.length === 0) {
    return null;
  }

  return (
    <Accordion 
      title={
        <div className="flex items-center gap-2">
          <ArchiveBoxIcon className="h-5 w-5" />
          Auxiliary
        </div>
      } 
      className="mb-3"
    >
      <div className="pl-4">
        <table className="table table-sm">
          <tbody>
            {entries.map(([key, value]) => (
              <tr key={key}>
                <td className="font-medium text-base-content/70 whitespace-nowrap align-top">{key}</td>
                <td className="break-all">{formatValue(value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Accordion>
  );
}
