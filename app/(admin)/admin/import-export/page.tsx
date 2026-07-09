"use client";

import { useRef, useState, useTransition } from "react";
import * as XLSX from "xlsx";
import {
  Download,
  Upload,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileSpreadsheet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  importFlats,
  importResidents,
  importOutstandingDues,
  importStaff,
  importVehicles,
  importBillAccounts,
  importBankAccounts,
  exportFlats,
  exportResidents,
  type ImportResult,
} from "@/app/actions/import";

// ── Sheet definitions ─────────────────────────────────────────────────────────

const SHEET_FLATS        = "Flats";
const SHEET_RESIDENTS    = "Residents";
const SHEET_DUES         = "Outstanding Dues";
const SHEET_STAFF        = "Staff";
const SHEET_VEHICLES     = "Vehicles";
const SHEET_BILL_ACCTS   = "Bill Accounts";
const SHEET_BANK_ACCTS   = "Bank Accounts";

type SheetKey = "flats" | "residents" | "dues" | "staff" | "vehicles" | "billAccounts" | "bankAccounts";

const SHEETS: Array<{
  key: SheetKey;
  name: string;
  label: string;
  headers: string[];
  example: string[][];
  hints?: string;
}> = [
  {
    key: "flats",
    name: SHEET_FLATS,
    label: "Flats",
    headers: ["flat_number", "floor", "block", "size_sqft", "monthly_fee", "notes"],
    example: [
      ["A-101", "1", "A", "1200", "5000", "Corner unit"],
      ["B-201", "2", "B", "",     "4500", ""],
    ],
    hints: "flat_number is required. monthly_fee in Rs (numbers only, no Rs symbol).",
  },
  {
    key: "residents",
    name: SHEET_RESIDENTS,
    label: "Residents",
    headers: [
      "flat_number", "full_name", "relationship", "phone", "cnic",
      "email", "move_in_date", "entry_fee_paid", "is_primary",
    ],
    example: [
      ["A-101", "Muhammad Ahmed", "owner",  "03001234567", "42101-1234567-1", "ahmed@gmail.com", "15/01/2024", "10000", "yes"],
      ["A-101", "Fatima Ahmed",   "family", "03009876543", "",                "",                "",           "",      "no"],
      ["B-201", "Ali Hassan",     "tenant", "03331234567", "42201-9876543-2", "",                "01/03/2024", "5000",  "yes"],
    ],
    hints: "relationship: owner / tenant / family. Date format: DD/MM/YYYY. is_primary: yes/no. Import flats first.",
  },
  {
    key: "dues",
    name: SHEET_DUES,
    label: "Outstanding Dues",
    headers: ["flat_number", "outstanding_dues", "notes"],
    example: [
      ["A-101", "15000", "3 months unpaid before joining"],
      ["B-201", "5000",  ""],
    ],
    hints: "Use only for balances that existed before joining the system. Sets the opening dues on the flat.",
  },
  {
    key: "staff",
    name: SHEET_STAFF,
    label: "Staff",
    headers: ["full_name", "role", "phone", "cnic", "monthly_salary", "join_date", "notes"],
    example: [
      ["Ahmed Khan",    "chowkidar",     "03001234567", "42101-1234567-1", "22000", "01/01/2024", "Day shift"],
      ["Umar Farooq",   "sweeper",       "03339876543", "",                "15000", "",           ""],
      ["Bilal Hussain", "lift_man",      "03211234567", "",                "18000", "15/02/2024", ""],
      ["Tariq Ahmed",   "generator_tech","03451234567", "",                "25000", "",           ""],
    ],
    hints: "role options: chowkidar, sweeper, lift_man, generator_tech, plumber, electrician, other. Salary in Rs.",
  },
  {
    key: "vehicles",
    name: SHEET_VEHICLES,
    label: "Vehicles",
    headers: ["flat_number", "plate_number", "vehicle_type", "make", "model", "color", "notes"],
    example: [
      ["A-101", "ABC-123", "car",  "Toyota", "Corolla", "White", ""],
      ["A-101", "XY-7890", "bike", "Honda",  "CD70",    "Black", "Second vehicle"],
      ["B-201", "LEA-456", "car",  "Suzuki", "Alto",    "Silver",""],
    ],
    hints: "vehicle_type: car / bike / ev / other. Plate number will be saved in uppercase. Import flats first.",
  },
  {
    key: "billAccounts",
    name: SHEET_BILL_ACCTS,
    label: "Bill Accounts",
    headers: [
      "provider", "custom_provider", "nickname", "account_number", "location", "notes",
    ],
    example: [
      ["k_electric",   "",              "Block A KE",       "1234567890",  "Block A",  "Main connection"],
      ["ssgc",         "",              "Building Gas",     "9876543210",  "",         ""],
      ["kwsb",         "",              "Water Board",      "WB-123456",   "",         ""],
      ["nayatel",      "",              "Lobby Internet",   "NET-789",     "Lobby",    "50 Mbps"],
      ["stormfiber",   "",              "Roof WiFi",        "SF-456",      "Roof",     ""],
      ["other",        "Generator AMC", "Generator Service","AMC-2024",    "Basement", "Annual contract"],
    ],
    hints: "provider keys: k_electric, ssgc, kwsb, lesco, mepco, iesco, fesco, hesco, sngpl, ptcl, nayatel, stormfiber, transworld, kone, schindler, otis, other. Fill custom_provider only when provider=other.",
  },
  {
    key: "bankAccounts",
    name: SHEET_BANK_ACCTS,
    label: "Bank Accounts",
    headers: ["name", "type", "account_number", "notes"],
    example: [
      ["HBL Maintenance", "bank", "1234-5678901-01", "Main maintenance collection"],
      ["MCB Fund",        "bank", "0123-4567890-02", "Emergency fund"],
      ["Office Cash",     "cash", "",                "Petty cash on hand"],
    ],
    hints: "type: bank or cash. Opening balance is set separately in Settings after import.",
  },
];

const COLUMN_LABELS: Record<string, string> = {
  flat_number:      "Flat No.*",
  floor:            "Floor",
  block:            "Block",
  size_sqft:        "Size (sqft)",
  monthly_fee:      "Monthly Fee (Rs)",
  notes:            "Notes",
  full_name:        "Full Name*",
  relationship:     "Type",
  phone:            "Phone",
  cnic:             "CNIC",
  email:            "Email",
  move_in_date:     "Move-in Date",
  entry_fee_paid:   "Entry Fee (Rs)",
  is_primary:       "Primary?",
  outstanding_dues: "Outstanding Dues (Rs)*",
  role:             "Role*",
  monthly_salary:   "Monthly Salary (Rs)*",
  join_date:        "Join Date",
  plate_number:     "Plate No.*",
  vehicle_type:     "Type",
  make:             "Make",
  model:            "Model",
  color:            "Color",
  provider:         "Provider*",
  custom_provider:  "Custom Provider Name",
  nickname:         "Nickname*",
  account_number:   "Account No.*",
  location:         "Location",
  name:             "Account Name*",
  type:             "Type (bank/cash)*",
};

// ── XLSX helpers ──────────────────────────────────────────────────────────────

function downloadTemplate() {
  const wb = XLSX.utils.book_new();

  for (const sheet of SHEETS) {
    const data = [sheet.headers, ...sheet.example];
    if (sheet.hints) data.push([`NOTE: ${sheet.hints}`]);
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws["!cols"] = sheet.headers.map(() => ({ wch: 22 }));
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }

  XLSX.writeFile(wb, "pulse-bms-onboarding-template.xlsx");
}

function parseXLSXFile(file: File): Promise<Record<SheetKey, Record<string, string>[]>> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array", cellDates: false });

        function readSheet(sheetName: string): Record<string, string>[] {
          const ws = wb.Sheets[sheetName];
          if (!ws) return [];
          const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
            defval: "",
            raw: false,
          });
          return rows
            .filter((row) => {
              // Skip the hints row (first cell starts with "NOTE:")
              const firstVal = Object.values(row)[0];
              return !String(firstVal ?? "").startsWith("NOTE:");
            })
            .map((row) => {
              const out: Record<string, string> = {};
              for (const [k, v] of Object.entries(row)) {
                const key = k
                  .trim()
                  .toLowerCase()
                  .replace(/\s+/g, "_")
                  .replace(/[^a-z0-9_]/g, "");
                out[key] = String(v ?? "").trim();
              }
              return out;
            })
            .filter((row) => Object.values(row).some((v) => v !== ""));
        }

        resolve({
          flats:        readSheet(SHEET_FLATS),
          residents:    readSheet(SHEET_RESIDENTS),
          dues:         readSheet(SHEET_DUES),
          staff:        readSheet(SHEET_STAFF),
          vehicles:     readSheet(SHEET_VEHICLES),
          billAccounts: readSheet(SHEET_BILL_ACCTS),
          bankAccounts: readSheet(SHEET_BANK_ACCTS),
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsArrayBuffer(file);
  });
}

function downloadExport(filename: string, headers: string[], rows: Record<string, unknown>[]) {
  const wb = XLSX.utils.book_new();
  const data = [headers, ...rows.map((r) => headers.map((h) => r[h] ?? ""))];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = headers.map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  XLSX.writeFile(wb, filename);
}

// ── UI components ─────────────────────────────────────────────────────────────

function ResultBanner({ result }: { result: ImportResult }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {result.success > 0 && (
          <div className="flex items-center gap-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
            <CheckCircle2 className="w-4 h-4" />
            {result.success} imported
          </div>
        )}
        {result.failed > 0 && (
          <div className="flex items-center gap-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
            <XCircle className="w-4 h-4" />
            {result.failed} failed
          </div>
        )}
      </div>
      {result.errors.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 divide-y divide-red-100 max-h-40 overflow-y-auto">
          {result.errors.map((e, i) => (
            <div key={i} className="flex gap-3 px-4 py-2 text-sm">
              <span className="shrink-0 text-red-400 font-mono text-xs pt-0.5">Row {e.row}</span>
              <span className="text-red-700 font-medium shrink-0">{e.label}</span>
              <span className="text-red-600">{e.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PreviewTable({ headers, rows }: { headers: string[]; rows: Record<string, string>[] }) {
  const preview = rows.slice(0, 6);
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="min-w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-3 py-2 text-left text-xs text-muted-foreground font-medium w-10">#</th>
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 text-left text-xs text-muted-foreground font-medium whitespace-nowrap">
                {COLUMN_LABELS[h] ?? h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {preview.map((row, i) => (
            <tr key={i} className="hover:bg-muted/20">
              <td className="px-3 py-2 text-muted-foreground text-xs">{i + 2}</td>
              {headers.map((h) => (
                <td key={h} className="px-3 py-2 whitespace-nowrap max-w-[160px] truncate">
                  {row[h] || <span className="text-muted-foreground/40">—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 6 && (
        <div className="px-4 py-2 text-xs text-muted-foreground border-t border-border bg-muted/20">
          Showing 6 of {rows.length} rows
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type ParsedSheets = Record<SheetKey, Record<string, string>[]>;
type SheetResults = Partial<Record<SheetKey, ImportResult>>;

const IMPORT_FNS: Record<SheetKey, (rows: Record<string, string>[]) => Promise<ImportResult>> = {
  flats:        importFlats,
  residents:    importResidents,
  dues:         importOutstandingDues,
  staff:        importStaff,
  vehicles:     importVehicles,
  billAccounts: importBillAccounts,
  bankAccounts: importBankAccounts,
};

export default function ImportExportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName]     = useState("");
  const [parsed, setParsed]         = useState<ParsedSheets | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [results, setResults]       = useState<SheetResults | null>(null);
  const [isPending, startTransition] = useTransition();

  const [exportError, setExportError] = useState<string | null>(null);
  const [isExporting, startExport]    = useTransition();

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParseError(null);
    setParsed(null);
    setResults(null);

    parseXLSXFile(file)
      .then((sheets) => {
        const total = Object.values(sheets).reduce((s, a) => s + a.length, 0);
        if (total === 0) {
          setParseError(
            "No data found. Make sure the sheet names match exactly: Flats, Residents, Outstanding Dues, Staff, Vehicles, Bill Accounts, Bank Accounts."
          );
        } else {
          setParsed(sheets);
        }
      })
      .catch(() =>
        setParseError("Could not read the file. Upload a valid .xlsx Excel file.")
      );
  }

  function handleImport() {
    if (!parsed) return;
    startTransition(async () => {
      const out: SheetResults = {};
      for (const sheet of SHEETS) {
        const rows = parsed[sheet.key];
        if (rows.length > 0) {
          out[sheet.key] = await IMPORT_FNS[sheet.key](rows);
        }
      }
      setResults(out);
      setParsed(null);
      setFileName("");
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  function reset() {
    setParsed(null); setFileName(""); setParseError(null); setResults(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleExport(type: "flats" | "residents") {
    startExport(async () => {
      try {
        if (type === "flats") {
          const rows = await exportFlats();
          downloadExport("flats-export.xlsx",
            ["flat_number", "floor", "block", "size_sqft", "monthly_fee", "outstanding_dues", "notes"],
            rows
          );
        } else {
          const rows = await exportResidents();
          downloadExport("residents-export.xlsx",
            ["flat_number", "full_name", "relationship", "phone", "cnic", "email", "move_in_date", "entry_fee_paid", "is_primary"],
            rows
          );
        }
        setExportError(null);
      } catch (err) {
        setExportError(err instanceof Error ? err.message : "Export failed");
      }
    });
  }

  const sheetCountsWithData = parsed
    ? SHEETS.filter((s) => parsed[s.key].length > 0)
    : [];
  const totalRows = sheetCountsWithData.reduce(
    (sum, s) => sum + (parsed?.[s.key].length ?? 0),
    0
  );

  const defaultPreviewTab =
    sheetCountsWithData[0]?.key ?? "flats";

  return (
    <div className="space-y-6 animate-fade-up max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Import / Export</h1>
        <p className="text-muted-foreground mt-1">
          One Excel file with 7 sheets — fill in what you have and upload.
          Empty sheets are skipped automatically.
        </p>
      </div>

      {/* Step 1 — download */}
      <div className="card-soft space-y-3">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <Download className="w-4 h-4 text-muted-foreground" />
          Step 1 — Download Template
        </h2>
        <p className="text-sm text-muted-foreground">
          One file, 7 sheets. Fill in what applies to your building. Each sheet has
          example rows and column hints built in. Save as-is (do not rename the sheets).
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={downloadTemplate} className="gap-2">
            <Download className="w-4 h-4" />
            Download Template (.xlsx)
          </Button>
          <div className="flex flex-wrap gap-1.5">
            {SHEETS.map((s) => (
              <span key={s.key} className="bg-muted text-muted-foreground rounded px-2 py-1 text-xs font-medium">
                {s.name}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Step 2 — upload */}
      <div className="card-soft space-y-4">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <Upload className="w-4 h-4 text-muted-foreground" />
          Step 2 — Upload Filled File
        </h2>

        <label
          htmlFor="xlsx-upload"
          className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-xl p-8 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
        >
          <FileSpreadsheet className="w-9 h-9 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">
            {fileName || "Click to choose your filled template (.xlsx)"}
          </span>
          {fileName && (
            <span className="text-xs text-muted-foreground">Click to choose a different file</span>
          )}
          <input
            id="xlsx-upload"
            ref={fileRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={handleFile}
          />
        </label>

        {parseError && (
          <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            {parseError}
          </div>
        )}
      </div>

      {/* Step 3 — preview */}
      {parsed && totalRows > 0 && (
        <div className="card-soft space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-semibold text-foreground">
              Step 3 — Preview &amp; Import
            </h2>
            <button onClick={reset} className="text-xs text-muted-foreground hover:text-foreground underline">
              Clear
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {sheetCountsWithData.map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1 text-xs font-medium bg-primary/10 text-primary rounded-full px-2.5 py-0.5">
                {parsed[s.key].length} {s.label}
              </span>
            ))}
          </div>

          <Tabs defaultValue={defaultPreviewTab}>
            <TabsList>
              {sheetCountsWithData.map((s) => (
                <TabsTrigger key={s.key} value={s.key}>
                  {s.label} ({parsed[s.key].length})
                </TabsTrigger>
              ))}
            </TabsList>
            {sheetCountsWithData.map((s) => (
              <TabsContent key={s.key} value={s.key}>
                {s.hints && (
                  <p className="text-xs text-muted-foreground mb-3 mt-1">{s.hints}</p>
                )}
                <PreviewTable headers={s.headers} rows={parsed[s.key]} />
              </TabsContent>
            ))}
          </Tabs>

          <Button
            onClick={handleImport}
            disabled={isPending}
            className="btn-big gap-2"
          >
            {isPending ? (
              <>
                <span className="w-4 h-4 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" />
                Importing…
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Import All ({totalRows} rows across {sheetCountsWithData.length} sheets)
              </>
            )}
          </Button>
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="card-soft space-y-5">
          <h2 className="font-semibold text-foreground">Import Results</h2>
          {SHEETS.filter((s) => results[s.key]).map((s) => (
            <div key={s.key}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {s.label}
              </p>
              <ResultBanner result={results[s.key]!} />
            </div>
          ))}
        </div>
      )}

      {/* Export */}
      <div className="card-soft space-y-3">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
          Export Existing Data
        </h2>
        <p className="text-sm text-muted-foreground">
          Download current building data to share with the client or keep as a backup.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport("flats")}
            disabled={isExporting}
            className="gap-2"
          >
            <Download className="w-4 h-4" />
            Export Flats
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport("residents")}
            disabled={isExporting}
            className="gap-2"
          >
            <Download className="w-4 h-4" />
            Export Residents
          </Button>
        </div>
        {exportError && <p className="text-xs text-red-600">{exportError}</p>}
      </div>
    </div>
  );
}
