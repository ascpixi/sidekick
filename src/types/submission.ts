export interface WritableSubmissionFields {
  hoursSpent?: number;
  hoursSpentJustification?: string;
  approved?: boolean;
}

export class YswsSubmission {
  private airtableService: import("../services/airtable").AirtableService | null = null;
  private _baseId: string;
  private _tableName: string;
  
  readonly recordId: string;
  readonly codeUrl: string;
  readonly demoUrl: string;
  readonly howDidYouHearAboutThis: string;
  readonly whatAreWeDoingWell: string;
  readonly howCanWeImprove: string;
  readonly authorFirstName: string;
  readonly authorLastName: string;
  readonly authorEmail: string;
  readonly screenshotUrl: string;
  readonly screenshotWidth?: number;
  readonly screenshotHeight?: number;
  readonly description: string;
  readonly authorGithub: string;
  readonly authorAddress1: string;
  readonly authorAddress2: string;
  readonly authorCity: string;
  readonly authorState: string;
  readonly authorCountry: string;
  readonly authorZip: string;
  readonly authorBirthday: string;
  readonly automationError: string;
  readonly approvedOn: Date | null;
  readonly yswsDbRecordId: string;

  private _hoursSpent: number;
  private _hoursSpentJustification: string;
  private _hackatimeProjectKeys: string;
  private _approved: boolean;
  private _rejected: boolean;

  constructor(
    baseId: string,
    tableName: string,
    recordId: string,
    data: {
      codeUrl: string;
      demoUrl: string;
      howDidYouHearAboutThis: string;
      whatAreWeDoingWell: string;
      howCanWeImprove: string;
      authorFirstName: string;
      authorLastName: string;
      authorEmail: string;
      screenshotUrl: string;
      screenshotWidth?: number;
      screenshotHeight?: number;
      description: string;
      authorGithub: string;
      authorAddress1: string;
      authorAddress2: string;
      authorCity: string;
      authorState: string;
      authorCountry: string;
      authorZip: string;
      authorBirthday: string;
      hoursSpent: number;
      hoursSpentJustification: string;
      hackatimeProjectKeys: string;
      approved: boolean;
      rejected: boolean;
      automationError: string;
      approvedOn: Date | null;
      yswsDbRecordId: string;
    }
  ) {
    this._baseId = baseId;
    this._tableName = tableName;
    this.recordId = recordId;
    this.codeUrl = data.codeUrl;
    this.demoUrl = data.demoUrl;
    this.howDidYouHearAboutThis = data.howDidYouHearAboutThis;
    this.whatAreWeDoingWell = data.whatAreWeDoingWell;
    this.howCanWeImprove = data.howCanWeImprove;
    this.authorFirstName = data.authorFirstName;
    this.authorLastName = data.authorLastName;
    this.authorEmail = data.authorEmail;
    this.screenshotUrl = data.screenshotUrl;
    this.screenshotWidth = data.screenshotWidth;
    this.screenshotHeight = data.screenshotHeight;
    this.description = data.description;
    this.authorGithub = data.authorGithub;
    this.authorAddress1 = data.authorAddress1;
    this.authorAddress2 = data.authorAddress2;
    this.authorCity = data.authorCity;
    this.authorState = data.authorState;
    this.authorCountry = data.authorCountry;
    this.authorZip = data.authorZip;
    this.authorBirthday = data.authorBirthday;
    this.automationError = data.automationError;
    this.approvedOn = data.approvedOn;
    this.yswsDbRecordId = data.yswsDbRecordId;
    this._hoursSpent = data.hoursSpent;
    this._hoursSpentJustification = data.hoursSpentJustification;
    this._hackatimeProjectKeys = data.hackatimeProjectKeys;
    this._approved = data.approved;
    this._rejected = data.rejected;
  }

  // Getters for the writable fields
  get hoursSpent(): number {
    return this._hoursSpent;
  }

  get hoursSpentJustification(): string {
    return this._hoursSpentJustification;
  }

  get hackatimeProjectKeys(): string {
    return this._hackatimeProjectKeys;
  }

  get approved(): boolean {
    return this._approved;
  }

  get rejected(): boolean {
    return this._rejected;
  }

  // Method to set the AirtableService instance (needed for updates)
  setAirtableService(service: import("../services/airtable").AirtableService): void {
    this.airtableService = service;
  }

  // Update method that accepts partial writable fields
  async update(fields: WritableSubmissionFields): Promise<void> {
    if (!this.airtableService) {
      throw new Error("AirtableService not set. Cannot update submission.");
    }

    const airtableFields: Record<string, string | number | boolean> = {};
    
    if (fields.hoursSpent !== undefined) {
      airtableFields["Optional - Override Hours Spent"] = fields.hoursSpent;
    }
    
    if (fields.hoursSpentJustification !== undefined) {
      airtableFields["Optional - Override Hours Spent Justification"] = fields.hoursSpentJustification;
    }
    
    if (fields.approved !== undefined) {
      airtableFields["Automation - Submit to Unified YSWS"] = fields.approved;
    }

    // Send update to Airtable
    await this.airtableService.updateSubmission(
      this._baseId,
      this._tableName,
      this.recordId,
      airtableFields
    );

    // Update internal state
    if (fields.hoursSpent !== undefined) {
      this._hoursSpent = fields.hoursSpent;
    }
    if (fields.hoursSpentJustification !== undefined) {
      this._hoursSpentJustification = fields.hoursSpentJustification;
    }
    if (fields.approved !== undefined) {
      this._approved = fields.approved;
    }
  }

  // Method to update custom fields (like rejection column)
  async updateCustomField(fieldName: string, value: boolean | string | number, isRejectionField = false): Promise<void> {
    if (!this.airtableService) {
      throw new Error("AirtableService not set. Cannot update submission.");
    }

    const airtableFields: Record<string, string | number | boolean> = {
      [fieldName]: value
    };

    // Send update to Airtable
    await this.airtableService.updateSubmission(
      this._baseId,
      this._tableName,
      this.recordId,
      airtableFields
    );

    // Update local state if this is a rejection field
    if (isRejectionField && typeof value === "boolean") {
      this._rejected = value;
    }
  }
}

export interface RawAirtableSubmission {
  "Code URL": string;
  "Playable URL": string;
  "How did you hear about this?": string;
  "What are we doing well?": string;
  "How can we improve?": string;
  "First Name": string;
  "Last Name": string;
  "Email": string;
  "Screenshot": string;
  "Screenshot Width": number | undefined;
  "Screenshot Height": number | undefined;
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
  tableId?: string;
  tableName?: string;
  viewId?: string;
  viewName?: string;
}

export interface BaseSettings {
  rejectedColumn?: string;
  hackatimeProjectsColumn?: string;
  hcbOrgName?: string;
}

export interface AppConfig {
  airtablePAT: string;
  hackatimeAdminKey: string;
  bases: AirtableBase[];
  selectedBaseId?: string;
  baseSettings?: Record<string, BaseSettings>; // Key is baseId
}
