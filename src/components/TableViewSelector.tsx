import { useState, useEffect, useCallback } from "react";
import { ModalHeader } from "./ModalHeader";
import { Input } from "./Input";
import { AirtableService, type AirtableTable, type AirtableView } from "../services/airtable";
import { Cog6ToothIcon } from "@heroicons/react/24/outline";

interface TableViewSelectorProps {
  baseId: string;
  baseName: string;
  airtablePAT: string;
  onSelect: (tableId: string, tableName: string, viewId?: string, viewName?: string) => void;
  onCancel: () => void;
}

export function TableViewSelector({ 
  baseId, 
  baseName, 
  airtablePAT, 
  onSelect, 
  onCancel 
}: TableViewSelectorProps) {
  const [tables, setTables] = useState<AirtableTable[]>([]);
  const [selectedTable, setSelectedTable] = useState<AirtableTable | null>(null);
  const [selectedView, setSelectedView] = useState<AirtableView | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchTables = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const airtableBaseId = AirtableService.extractBaseIdFromUrl(baseId) || baseId;
      const airtableService = new AirtableService(airtablePAT);
      const schema = await airtableService.fetchBaseSchema(airtableBaseId);
      setTables(schema.tables);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to fetch tables");
    } finally {
      setIsLoading(false);
    }
  }, [baseId, airtablePAT]);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  const handleTableSelect = (table: AirtableTable) => {
    setSelectedTable(table);
    setSelectedView(null); // Reset view selection when table changes
  };

  const handleViewSelect = (view: AirtableView | null) => {
    setSelectedView(view);
  };

  const handleConfirm = () => {
    if (!selectedTable) return;
    
    onSelect(
      selectedTable.id,
      selectedTable.name,
      selectedView?.id,
      selectedView?.name
    );
  };

  const filteredTables = tables.filter(table => 
    table.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-4xl p-12">
        <ModalHeader
          title={`Configure ${baseName}`}
          subtitle="Select a table and view to use for submissions"
          icon={<Cog6ToothIcon className="w-8 h-8 text-primary" />}
        />
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Tables Column */}
          <div>
            <h3 className="font-semibold mb-4">Select Table</h3>
            
            <div className="mb-4">
              <Input
                label=""
                type="search"
                placeholder="Search tables..."
                value={searchTerm}
                onChange={setSearchTerm}
              />
            </div>
            
            <div className="max-h-64 overflow-y-auto border border-base-content/20 rounded-lg">
              {isLoading ? (
                <div className="flex items-center justify-center p-8">
                  <span className="loading loading-spinner loading-md"></span>
                  <span className="ml-2">Loading tables...</span>
                </div>
              ) : error ? (
                <div className="p-8 text-center text-error">
                  <div className="text-sm">Failed to load tables</div>
                  <div className="text-xs text-base-content/70 mt-1">{error}</div>
                  <button 
                    onClick={fetchTables}
                    className="btn btn-sm btn-primary mt-4"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <>
                  {filteredTables.map((table) => (
                    <button
                      key={table.id}
                      onClick={() => handleTableSelect(table)}
                      className={`w-full p-4 text-left hover:bg-base-200 border-b border-base-content/10 last:border-b-0 ${
                        selectedTable?.id === table.id ? "bg-primary/10 border-l-4 border-l-primary" : ""
                      }`}
                    >
                      <div className="font-medium">{table.name}</div>
                      {table.description && (
                        <div className="text-xs text-base-content/70 mt-1">{table.description}</div>
                      )}
                    </button>
                  ))}
                  
                  {filteredTables.length === 0 && !isLoading && (
                    <div className="p-8 text-center text-base-content/70">
                      {searchTerm ? "No tables match your search" : "No tables found"}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          
          {/* Views Column */}
          <div>
            <h3 className="font-semibold mb-4">Select View (Optional)</h3>
            
            {!selectedTable ? (
              <div className="p-8 text-center text-base-content/70">
                Select a table to see available views
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto border border-base-content/20 rounded-lg">
                <button
                  onClick={() => handleViewSelect(null)}
                  className={`w-full p-4 text-left hover:bg-base-200 border-b border-base-content/10 ${
                    selectedView === null ? "bg-primary/10 border-l-4 border-l-primary" : ""
                  }`}
                >
                  <div className="font-medium">Default View</div>
                  <div className="text-xs text-base-content/70 mt-1">Use the table's default view</div>
                </button>
                
                {selectedTable.views.map((view) => (
                  <button
                    key={view.id}
                    onClick={() => handleViewSelect(view)}
                    className={`w-full p-4 text-left hover:bg-base-200 border-b border-base-content/10 last:border-b-0 ${
                      selectedView?.id === view.id ? "bg-primary/10 border-l-4 border-l-primary" : ""
                    }`}
                  >
                    <div className="font-medium">{view.name}</div>
                    <div className="text-xs text-base-content/70 mt-1">Type: {view.type}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        
        <div className="modal-action">
          <button 
            type="button" 
            className="btn"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button 
            type="button" 
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={!selectedTable}
          >
            Confirm Selection
          </button>
        </div>
      </div>
    </div>
  );
}
