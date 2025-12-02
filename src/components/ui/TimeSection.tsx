import { ClockIcon } from "@heroicons/react/24/outline";
import { Accordion } from "./Accordion";

export function TimeSection({
  localHoursSpent,
  localHoursSpentJustification,
  localHackatimeProjectKeys,
  onHoursSpentChange,
  onHoursSpentJustificationChange,
  onHackatimeProjectKeysChange,
  onSyncFromHackatime,
  hasHackatimeIntegration
}: {
  localHoursSpent: number;
  localHoursSpentJustification: string;
  localHackatimeProjectKeys: string;
  onHoursSpentChange: (value: number) => void;
  onHoursSpentJustificationChange: (value: string) => void;
  onHackatimeProjectKeysChange: (value: string) => void;
  onSyncFromHackatime: () => void;
  hasHackatimeIntegration: boolean;
}) {
  return (
    <Accordion 
      title={
        <div className="flex items-center gap-2">
          <ClockIcon className="h-5 w-5" />
          Time
        </div>
      } 
      className="mb-1" 
      defaultOpen
    >
      <div className="pl-4">
        <div className="mb-4 flex items-center gap-2">
          <label className="text-sm font-medium">Hours Spent</label>
          <input
            type="number"
            step="0.1"
            min="0"
            className="input input-bordered input-sm flex-1 !outline-none focus:border-primary"
            value={localHoursSpent || ""}
            onChange={(e) => {
              const value = parseFloat(e.target.value) || 0;
              onHoursSpentChange(value);
            }}
          />
          {hasHackatimeIntegration && (
            <button 
              className="btn btn-primary btn-sm"
              onClick={onSyncFromHackatime}
            >
              <ClockIcon className="h-4 w-4" />
              Sync from Hackatime
            </button>
          )}
        </div>

        {hasHackatimeIntegration && (
          <div className="mb-4 flex items-center gap-2">
            <label className="text-sm font-medium">Hackatime Project Keys</label>
            <input
              type="text"
              className="input input-bordered input-sm flex-1 !outline-none focus:border-primary"
              value={localHackatimeProjectKeys}
              onChange={(e) => onHackatimeProjectKeysChange(e.target.value)}
              placeholder="comma-separated project names"
            />
          </div>
        )}

        <div className="mb-4">
          <label className="text-sm font-medium mb-2 block">Hours Spent Justification</label>
          <textarea
            className="textarea textarea-bordered text-sm w-full h-20 !outline-none focus:border-primary"
            value={localHoursSpentJustification}
            onChange={(e) => onHoursSpentJustificationChange(e.target.value)}
            placeholder="Explain any adjustments to the calculated hours..."
          />
        </div>
      </div>
    </Accordion>
  );
}
