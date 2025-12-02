import { DocumentTextIcon } from "@heroicons/react/24/outline";
import { Accordion } from "./Accordion";
import { ExpandableText } from "./ExpandableText";
import { YswsSubmission } from "../../types/submission";

export function SubmissionDetails({
  submission,
  onImagePreview
}: {
  submission: YswsSubmission;
  onImagePreview: (imageUrl: string) => void;
}) {
  return (
    <Accordion 
      title={
        <div className="flex items-center gap-2">
          <DocumentTextIcon className="h-5 w-5" />
          Project Details
        </div>
      } 
      className="mb-1" 
      defaultOpen
    >
      <div className="pl-4">
        <div className="mb-4">
          <h4 className="text-sm font-medium mb-2">Description</h4>
          <ExpandableText text={submission.description} maxLines={3} />
        </div>

        {submission.screenshotUrl && (
          <div className="mb-4">
            <h4 className="text-sm font-medium mb-2">Screenshot</h4>
            <div className="max-w-md">
              {submission.screenshotWidth && submission.screenshotHeight ? (
                <div 
                  className="w-full rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                  style={{ aspectRatio: `${submission.screenshotWidth} / ${submission.screenshotHeight}` }}
                  onClick={() => onImagePreview(submission.screenshotUrl!)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onImagePreview(submission.screenshotUrl!);
                    }
                  }}
                >
                  <img 
                    src={submission.screenshotUrl} 
                    alt="Project screenshot" 
                    className="w-full h-full object-cover"
                    width={submission.screenshotWidth}
                    height={submission.screenshotHeight}
                  />
                </div>
              ) : (
                <img 
                  src={submission.screenshotUrl} 
                  alt="Project screenshot" 
                  className="w-full h-auto rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => onImagePreview(submission.screenshotUrl!)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onImagePreview(submission.screenshotUrl!);
                    }
                  }}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </Accordion>
  );
}
