import type { RawAirtableSubmission } from "../types/submission";
import { YswsSubmission } from "../types/submission";
import { transformAirtableSubmission } from "../utils/submission";

interface AirtableRecord {
  id: string;
  fields: {
    [key: string]: string | number | boolean | string[] | null | undefined;
  };
  createdTime: string;
}

interface AirtableResponse {
  records: AirtableRecord[];
  offset?: string;
}

export interface AirtableField {
  id: string;
  name: string;
  type: string;
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
  fields: AirtableField[];
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

  async fetchSubmissions(baseId: string, tableName: string, viewId?: string, rejectedColumn?: string, hackatimeProjectsColumn?: string): Promise<YswsSubmission[]> {
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

    return records.map((record) => this.mapRecordToSubmission(record, baseId, tableName, rejectedColumn, hackatimeProjectsColumn));
  }

  private mapRecordToSubmission(record: AirtableRecord, baseId: string, tableName: string, rejectedColumn?: string, hackatimeProjectsColumn?: string): YswsSubmission {
    const fields = record.fields;
    
    const rawSubmission: RawAirtableSubmission = {
      "Code URL": (fields["Code URL"] as string) || "",
      "Playable URL": (fields["Playable URL"] as string) || "",
      "How did you hear about this?": (fields["How did you hear about this?"] as string) || "",
      "What are we doing well?": (fields["What are we doing well?"] as string) || "",
      "How can we improve?": (fields["How can we improve?"] as string) || "",
      "First Name": (fields["First Name"] as string) || "",
      "Last Name": (fields["Last Name"] as string) || "",
      "Email": (fields["Email"] as string) || "",
      "Screenshot": fields["Screenshot"] ? (Array.isArray(fields["Screenshot"]) ? (fields["Screenshot"][0] as unknown as { url: string })?.url : (fields["Screenshot"] as string)) || "" : "",
      "Screenshot Width": fields["Screenshot"] && Array.isArray(fields["Screenshot"]) ? (fields["Screenshot"][0] as unknown as { width: number })?.width : undefined,
      "Screenshot Height": fields["Screenshot"] && Array.isArray(fields["Screenshot"]) ? (fields["Screenshot"][0] as unknown as { height: number })?.height : undefined,
      "Description": (fields["Description"] as string) || "",
      "GitHub Username": (fields["GitHub Username"] as string) || "",
      "Address (Line 1)": (fields["Address (Line 1)"] as string) || "",
      "Address (Line 2)": (fields["Address (Line 2)"] as string) || "",
      "City": (fields["City"] as string) || "",
      "State / Province": (fields["State / Province"] as string) || "",
      "Country": (fields["Country"] as string) || "",
      "ZIP / Postal Code": (fields["ZIP / Postal Code"] as string) || "",
      "Birthday": (fields["Birthday"] as string) || "",
      "Optional - Override Hours Spent": (fields["Optional - Override Hours Spent"] as string) || "",
      "Optional - Override Hours Spent Justification": (fields["Optional - Override Hours Spent Justification"] as string) || "",
      "Automation - Submit to Unified YSWS": fields["Automation - Submit to Unified YSWS"] ? String(fields["Automation - Submit to Unified YSWS"]) : "",
      "Automation - Error": (fields["Automation - Error"] as string) || "",
      "Automation - First Submitted At": (fields["Automation - First Submitted At"] as string) || "",
      "Automation - YSWS Record ID": (fields["Automation - YSWS Record ID"] as string) || "",
      ...(rejectedColumn && { [rejectedColumn]: fields[rejectedColumn] }),
      ...(hackatimeProjectsColumn && { [hackatimeProjectsColumn]: fields[hackatimeProjectsColumn] }),
    };

    const submission = transformAirtableSubmission(rawSubmission, record.id, baseId, tableName, rejectedColumn, hackatimeProjectsColumn);
    submission.setAirtableService(this);
    return submission;
  }

  async updateSubmission(baseId: string, tableName: string, recordId: string, fields: Record<string, string | number | boolean>): Promise<void> {
    if (!this.accessToken) {
      throw new Error("Airtable access token is required");
    }

    const url = `${this.baseUrl}/${baseId}/${encodeURIComponent(tableName)}/${recordId}`;
    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update submission: ${response.status} ${response.statusText}`);
    }
  }

  async createField(baseId: string, tableId: string, fieldName: string, fieldType: string): Promise<AirtableField> {
    const response = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables/${tableId}/fields`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: fieldName,
        type: fieldType,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create field: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  getFieldsByType(table: AirtableTable, type: string): AirtableField[] {
    return table.fields.filter(field => field.type === type);
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
