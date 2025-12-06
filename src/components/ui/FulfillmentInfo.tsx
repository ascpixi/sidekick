import { UserIcon } from "@heroicons/react/24/outline";
import { Accordion } from "./Accordion";
import { YswsSubmission, formatAddress } from "../../types/submission";

export function FulfillmentInfo({ submission }: { submission: YswsSubmission }) {
  return (
    <Accordion 
      title={
        <div className="flex items-center gap-2">
          <UserIcon className="h-5 w-5" />
          Fulfillment Information
        </div>
      } 
      className="mb-3"
    >
      <div className="pl-4">
        <div>
          <span className="font-medium">Name:</span> {submission.authorFirstName} {submission.authorLastName}
        </div>
        {formatAddress(submission).length > 0 && (
          <div>
            <span className="font-medium">Address:</span>
            <div className="text-sm text-base-content/70 ml-4 mt-1">
              {formatAddress(submission).map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Accordion>
  );
}
