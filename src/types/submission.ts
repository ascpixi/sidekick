export interface Submission {
  "Code URL": string;
  "Playable URL": string;
  "How did you hear about this?": string;
  "What are we doing well?": string;
  "How can we improve?": string;
  "First Name": string;
  "Last Name": string;
  "Email": string;
  "Screenshot": string;
  "Description": string;
  "GitHub Username": string;
  "Address (Line 1)": string;
  "Address (Line 2)": string;
  "City": string;
  "State / Province": string;
  "Country": string;
  "ZIP / Postal Code": string;
  "Birthday": string;
  "Optional - Override Hours Spent": string;
  "Optional - Override Hours Spent Justification": string;
  "Automation - Submit to Unified YSWS": string;
  "Automation - Error": string;
  "Automation - First Submitted At": string;
  "Automation - YSWS Record ID": string;
}

export interface AirtableBase {
  id: string;
  name: string;
  url: string;
}

export interface AppConfig {
  airtablePAT: string;
  hackatimeAdminKey: string;
  bases: AirtableBase[];
  selectedBaseId?: string;
}
