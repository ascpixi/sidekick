import type { RawAirtableSubmission, YswsSubmission } from "../types/submission";
import { transformAirtableSubmission } from "../utils/submission";

interface AirtableRecord {
  id: string;
  fields: {
    [key: string]: any;
  };
  createdTime: string;
}

interface AirtableResponse {
  records: AirtableRecord[];
  offset?: string;
}

export interface AirtableView {
  id: string;
  name: string;
  type: string;
}

export interface AirtableTable {
  id: string;
  name: string;
  description?: string;
  primaryFieldId: string;
  views: AirtableView[];
}

export interface AirtableBaseSchema {
  tables: AirtableTable[];
}

export class AirtableService {
  private baseUrl = "https://api.airtable.com/v0";
  private accessToken: string;
  
  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  async fetchBaseSchema(baseId: string): Promise<AirtableBaseSchema> {
    if (!this.accessToken) {
      throw new Error("Airtable access token is required");
    }

    const url = `${this.baseUrl}/meta/bases/${baseId}/tables`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch base schema: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  async fetchSubmissions(baseId: string, tableName: string, viewId?: string): Promise<YswsSubmission[]> {
    if (!this.accessToken) 
      throw new Error("Airtable access token is required");

    const url = `${this.baseUrl}/${baseId}/${encodeURIComponent(tableName)}`;
    const records: AirtableRecord[] = [];
    let offset: string | undefined;

    do {
      const params = new URLSearchParams();
      if (viewId) params.append("view", viewId);
      if (offset) params.append("offset", offset);

      const response = await fetch(`${url}?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      if (!response.ok) 
        throw new Error(`Failed to fetch submissions: ${response.status} ${response.statusText}`);

      const data: AirtableResponse = await response.json();
      records.push(...data.records);
      offset = data.offset;
    } while (offset);

    return records.map(this.mapRecordToSubmission);
  }

  private mapRecordToSubmission(record: AirtableRecord): YswsSubmission {
    const fields = record.fields;
    
    const rawSubmission: RawAirtableSubmission = {
      "Code URL": fields["Code URL"] || "",
      "Playable URL": fields["Playable URL"] || "",
      "How did you hear about this?": fields["How did you hear about this?"] || "",
      "What are we doing well?": fields["What are we doing well?"] || "",
      "How can we improve?": fields["How can we improve?"] || "",
      "First Name": fields["First Name"] || "",
      "Last Name": fields["Last Name"] || "",
      "Email": fields["Email"] || "",
      "Screenshot": fields["Screenshot"] ? (Array.isArray(fields["Screenshot"]) ? fields["Screenshot"][0]?.url : fields["Screenshot"]) || "" : "",
      "Description": fields["Description"] || "",
      "GitHub Username": fields["GitHub Username"] || "",
      "Address (Line 1)": fields["Address (Line 1)"] || "",
      "Address (Line 2)": fields["Address (Line 2)"] || "",
      "City": fields["City"] || "",
      "State / Province": fields["State / Province"] || "",
      "Country": fields["Country"] || "",
      "ZIP / Postal Code": fields["ZIP / Postal Code"] || "",
      "Birthday": fields["Birthday"] || "",
      "Optional - Override Hours Spent": fields["Optional - Override Hours Spent"] || "",
      "Optional - Override Hours Spent Justification": fields["Optional - Override Hours Spent Justification"] || "",
      "Automation - Submit to Unified YSWS": fields["Automation - Submit to Unified YSWS"] || "",
      "Automation - Error": fields["Automation - Error"] || "",
      "Automation - First Submitted At": fields["Automation - First Submitted At"] || "",
      "Automation - YSWS Record ID": fields["Automation - YSWS Record ID"] || "",
    };

    return transformAirtableSubmission(rawSubmission);
  }

  static extractBaseIdFromUrl(url: string): string | null {
    // Handle both full URLs and just base IDs
    if (url.includes("airtable.com")) {
      const match = url.match(/app[a-zA-Z0-9]+/);
      return match ? match[0] : null;
    }
    
    // If it's already a base ID, return it
    if (url.startsWith("app")) {
      return url;
    }
    
    return null;
  }
}
