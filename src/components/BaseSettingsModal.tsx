import { useState, useEffect, useCallback } from "react";
import { WrenchScrewdriverIcon } from "@heroicons/react/24/outline";
import type { BaseSettings, AirtableBase } from "../types/submission";
import type { AirtableTable } from "../services/airtable";
import { AirtableService } from "../services/airtable";
import { ModalHeader } from "./ModalHeader";
import { Input } from "./Input";

interface BaseSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  base: AirtableBase;
  settings: BaseSettings | undefined;
  onSave: (baseId: string, settings: BaseSettings) => void;
  airtablePAT: string;
}

export function BaseSettingsModal({ 
  isOpen, 
  onClose, 
  base, 
  settings, 
  onSave, 
  airtablePAT 
}: BaseSettingsModalProps) {
  const [formData, setFormData] = useState<BaseSettings>({
    rejectedColumn: settings?.rejectedColumn || "",
    hackatimeProjectsColumn: settings?.hackatimeProjectsColumn || "",
    hcbOrgName: settings?.hcbOrgName || "",
  });

  const [tables, setTables] = useState<AirtableTable[]>([]);
  const [selectedTable, setSelectedTable] = useState<AirtableTable | null>(null);
  const [isLoadingSchema, setIsLoadingSchema] = useState(false);
  const [isCreatingColumn, setIsCreatingColumn] = useState<string | null>(null);
  const [isColumnNameModalOpen, setIsColumnNameModalOpen] = useState(false);
  const [pendingColumnType, setPendingColumnType] = useState<{
    type: string;
    settingKey: keyof BaseSettings;
    suggestedName: string;
  } | null>(null);
  const [newColumnName, setNewColumnName] = useState("");

  const loadBaseSchema = useCallback(async () => {
    setIsLoadingSchema(true);
    try {
      const airtableService = new AirtableService(airtablePAT);
      const baseId = AirtableService.extractBaseIdFromUrl(base.id) || base.id;
      const schema = await airtableService.fetchBaseSchema(baseId);

      // Filter out YSWS Config table
      const filteredTables = schema.tables.filter(table => 
        table.name.toLowerCase() !== "ysws config"
      );
      setTables(filteredTables);

      // Auto-select the main submission table
      const mainTable = filteredTables.find(table => 
        table.name.toLowerCase() === "ysws project submission"
      ) || filteredTables[0];
      
      if (mainTable) {
        setSelectedTable(mainTable);
      }
    } finally {
      setIsLoadingSchema(false);
    }
  }, [airtablePAT, base.id]);

  useEffect(() => {
    if (isOpen && base.id && airtablePAT) {
      loadBaseSchema();
    }
  }, [isOpen, base.id, airtablePAT, loadBaseSchema]);

  async function createColumn(fieldName: string, fieldType: string, settingKey: keyof BaseSettings) {
    if (!selectedTable) return;

    setIsCreatingColumn(fieldName);
    try {
      const airtableService = new AirtableService(airtablePAT);
      const baseId = AirtableService.extractBaseIdFromUrl(base.id) || base.id;
      
      await airtableService.createField(baseId, selectedTable.id, fieldName, fieldType);
      
      // Refresh the schema
      await loadBaseSchema();
      
      // Auto-select the newly created field
      setFormData(prev => ({
        ...prev,
        [settingKey]: fieldName
      }));
    } finally {
      setIsCreatingColumn(null);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave(base.id, formData);
    onClose();
  }

  function handleInputChange(field: keyof BaseSettings, value: string) {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  }

  function handleCreateNewColumn(type: string, settingKey: keyof BaseSettings, suggestedName: string) {
    setPendingColumnType({ type, settingKey, suggestedName });
    setNewColumnName(suggestedName);
    setIsColumnNameModalOpen(true);
  }

  async function createColumnWithName() {
    if (!pendingColumnType || !newColumnName.trim()) return;
    
    await createColumn(newColumnName.trim(), pendingColumnType.type, pendingColumnType.settingKey);
    
    setIsColumnNameModalOpen(false);
    setPendingColumnType(null);
    setNewColumnName("");
  }

  const checkboxFields = selectedTable 
    ? new AirtableService(airtablePAT).getFieldsByType(selectedTable, "checkbox").filter(field => {
        const fieldName = field.name.toLowerCase();
        // Ignore these checkbox columns for rejected column selection
        return fieldName !== "automation - submit to unified ysws" && 
               fieldName !== "idv_verified";
      })
    : [];

  const textFields = selectedTable 
    ? new AirtableService(airtablePAT).getFieldsByType(selectedTable, "singleLineText").filter(field => {
        const fieldName = field.name.toLowerCase();
        // Ignore well-known short text columns for hackatime projects column selection
        const ignoredFields = [
          "first name", "last name", "github username", 
          "address (line 1)", "address (line 2)", "city", "state / province", 
          "country", "zip / postal code", "automation - ysws record id", 
          "slack id", "idv_rec"
        ];
        return !ignoredFields.includes(fieldName);
      })
    : [];

  if (!isOpen) return null;

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-2xl p-8">
        <ModalHeader
          title="Configure Base Settings"
          subtitle={`Settings for ${base.name}`}
          icon={<WrenchScrewdriverIcon className="w-8 h-8 text-primary" />}
        />

        <form onSubmit={handleSubmit} className="space-y-8">
          {isLoadingSchema ? (
            <div className="flex items-center justify-center p-8">
              <span className="loading loading-spinner loading-md"></span>
              <span className="ml-2">Loading base schema...</span>
            </div>
          ) : (
            <>
              {/* Table Selection */}
              {tables.length > 1 && (
                <div>
                  <label className="label">
                    <span className="label-text font-medium">Table</span>
                  </label>
                  <select 
                    className="select select-bordered w-full focus:!outline-none focus:!border-primary"
                    value={selectedTable?.id || ""}
                    onChange={(e) => {
                      const table = tables.find(t => t.id === e.target.value);
                      setSelectedTable(table || null);
                    }}
                  >
                    <option value="">Select a table</option>
                    {tables.map(table => (
                      <option key={table.id} value={table.id}>
                        {table.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {selectedTable && (
                <>
                  {/* Rejected Column */}
                  <div>
                    <label className="label">
                      <span className="label-text font-medium">Rejected Column</span>
                    </label>
                    <p className="text-xs text-base-content/60 mb-3">
                      Checkbox field to mark submissions as rejected. If unset, rejecting will not be available.
                    </p>
                    <select 
                      className="select select-bordered w-full focus:!outline-none focus:!border-primary"
                      value={formData.rejectedColumn || ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === "__create_new__") {
                          handleCreateNewColumn("checkbox", "rejectedColumn", "Rejected");
                        } else {
                          handleInputChange("rejectedColumn", value);
                        }
                      }}
                    >
                      <option value="">(none)</option>
                      {checkboxFields.map(field => (
                        <option key={field.id} value={field.name}>
                          {field.name}
                        </option>
                      ))}
                      <option value="__create_new__" className="text-primary">
                        + Create new column
                      </option>
                    </select>
                  </div>

                  {/* Hackatime Projects Column */}
                  <div>
                    <label className="label">
                      <span className="label-text font-medium">Hackatime Projects Column</span>
                    </label>
                    <p className="text-xs text-base-content/60 mb-3">
                      Text field containing Hackatime project keys. If unset, Hackatime features will not be available.
                    </p>
                    <select 
                      className="select select-bordered w-full focus:!outline-none focus:!border-primary"
                      value={formData.hackatimeProjectsColumn || ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === "__create_new__") {
                          handleCreateNewColumn("singleLineText", "hackatimeProjectsColumn", "Hackatime project names");
                        } else {
                          handleInputChange("hackatimeProjectsColumn", value);
                        }
                      }}
                    >
                      <option value="">(none)</option>
                      {textFields.map(field => (
                        <option key={field.id} value={field.name}>
                          {field.name}
                        </option>
                      ))}
                      <option value="__create_new__" className="text-primary">
                        + Create new column
                      </option>
                    </select>
                  </div>

                  {/* HCB Org Name */}
                  <div>
                    <label className="label">
                      <span className="label-text font-medium">HCB Organization Name</span>
                    </label>
                    <p className="text-xs text-base-content/60 mb-3">
                      Optional - If set, will add helper buttons related to HCB (Hack Club Bank).
                    </p>
                    <Input
                      label=""
                      type="text"
                      placeholder="ysws-iplace"
                      value={formData.hcbOrgName || ""}
                      onChange={(value) => handleInputChange("hcbOrgName", value)}
                    />
                  </div>
                </>
              )}
            </>
          )}

          <div className="modal-action">
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn btn-primary font-normal"
              disabled={isLoadingSchema}
            >
              Save Settings
            </button>
          </div>
        </form>
      </div>

      {/* Column Name Modal */}
      {isColumnNameModalOpen && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Create New Column</h3>
            <p className="py-4">
              Enter a name for the new {pendingColumnType?.type === "checkbox" ? "checkbox" : "text"} column:
            </p>
            <Input
              label=""
              type="text"
              placeholder={pendingColumnType?.suggestedName || "Column name"}
              value={newColumnName}
              onChange={setNewColumnName}
            />
            <div className="modal-action">
              <button 
                type="button" 
                className="btn btn-outline"
                onClick={() => {
                  setIsColumnNameModalOpen(false);
                  setPendingColumnType(null);
                  setNewColumnName("");
                }}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="btn btn-primary"
                disabled={!newColumnName.trim() || !!isCreatingColumn}
                onClick={createColumnWithName}
              >
                {isCreatingColumn ? (
                  <>
                    <span className="loading loading-spinner loading-xs"></span>
                    Creating...
                  </>
                ) : (
                  "Create Column"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
