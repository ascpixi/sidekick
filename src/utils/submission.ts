import type { RawAirtableSubmission } from "../types/submission";
import { YswsSubmission } from "../types/submission";

export function transformAirtableSubmission(
  raw: RawAirtableSubmission, 
  recordId: string, 
  baseId: string, 
  tableName: string,
  rejectedColumn?: string,
  hackatimeProjectsColumn?: string
): YswsSubmission {
  return new YswsSubmission(baseId, tableName, recordId, {
    codeUrl: raw["Code URL"] || "",
    demoUrl: raw["Playable URL"] || "",
    howDidYouHearAboutThis: raw["How did you hear about this?"] || "",
    whatAreWeDoingWell: raw["What are we doing well?"] || "",
    howCanWeImprove: raw["How can we improve?"] || "",
    authorFirstName: raw["First Name"] || "",
    authorLastName: raw["Last Name"] || "",
    authorEmail: raw["Email"] || "",
    screenshotUrl: raw["Screenshot"] || "",
    screenshotWidth: raw["Screenshot Width"],
    screenshotHeight: raw["Screenshot Height"],
    description: raw["Description"] || "",
    authorGithub: (raw["GitHub Username"] || "").replace(/^@/, ""),
    authorAddress1: raw["Address (Line 1)"] || "",
    authorAddress2: raw["Address (Line 2)"] || "",
    authorCity: raw["City"] || "",
    authorState: raw["State / Province"] || "",
    authorCountry: raw["Country"] || "",
    authorZip: raw["ZIP / Postal Code"] || "",
    authorBirthday: raw["Birthday"] || "",
    hoursSpent: parseFloat(raw["Optional - Override Hours Spent"]) || 0,
    hoursSpentJustification: raw["Optional - Override Hours Spent Justification"] || "",
    hackatimeProjectKeys: hackatimeProjectsColumn ? (raw as unknown as Record<string, unknown>)[hackatimeProjectsColumn] as string || "" : "",
    // A submission is considered "approved" if it has been processed by automation 
    // and has a YSWS Record ID. The "Submit to Unified YSWS" field is just the trigger.
    approved: !!raw["Automation - YSWS Record ID"],
    rejected: rejectedColumn ? !!(raw as unknown as Record<string, unknown>)[rejectedColumn] : false,
    automationError: raw["Automation - Error"] || "",
    approvedOn: raw["Automation - First Submitted At"] ? new Date(raw["Automation - First Submitted At"]) : null,
    yswsDbRecordId: raw["Automation - YSWS Record ID"] || ""
  });
}

export function getSubmissionTitle(submission: YswsSubmission): string {
  if (!submission.codeUrl) 
    return `${submission.authorFirstName} ${submission.authorLastName}`;
  
  if (submission.codeUrl.includes("github.com/")) 
    return submission.codeUrl.replace(/^https?:\/\/github\.com\//, "");
  
  return submission.codeUrl;
}

export function formatAddress(submission: YswsSubmission): string[] {
  const addressParts: string[] = [];
  
  if (submission.authorAddress1) addressParts.push(submission.authorAddress1);
  if (submission.authorAddress2) addressParts.push(submission.authorAddress2);
  
  const cityStateZip = [submission.authorCity, submission.authorState, submission.authorZip]
    .filter(Boolean)
    .join(", ");
  
  if (cityStateZip) addressParts.push(cityStateZip);
  if (submission.authorCountry) addressParts.push(submission.authorCountry);
  
  return addressParts;
}
