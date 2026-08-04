export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  utilities: "Utilities",
  repairs: "Repairs",
  supplies: "Supplies",
  other: "Other",
  salaries: "Salaries (legacy)",
};

export const EXPENSE_FILTER_CATEGORIES: Record<string, string> = {
  utilities: "Utilities",
  repairs: "Repairs",
  supplies: "Supplies",
  other: "Other",
};

export const EXPENSE_SUBCATEGORY_LABELS: Record<string, string> = {
  corridor_electricity: "Corridor Electricity",
  electricity_corridor: "Corridor Electricity",
  water_motor:          "Water Motor",
  lift_service:         "Lift Service",
  generator_diesel:     "Generator Diesel",
  generator_oil:        "Generator Oil",
  internet:             "Internet / Wi-Fi",
  gas:                  "Gas",
  water_tanker:         "Water Tanker",
  water_supply:         "Water Supply",
  lineman:              "Lineman",
  bulbs:                "Bulbs / LEDs",
  wiring:               "Electrical Wiring",
  plumbing:             "Plumbing",
  led_panels:           "LED Panels",
  painting:             "Painting",
  lift_repair:          "Lift Repair",
  lift:                 "Lift Repair",
  generator:            "Generator Service",
  pest_control:         "Pest Control",
  pest:                 "Pest Control",
  carpentry:            "Carpentry",
  roof_leak:            "Roof / Tank Leak",
  chowkidar:            "Chowkidar Salary",
  sweeper:              "Sweeper Salary",
  lift_operator:        "Lift Operator Salary",
  generator_tech:       "Generator Tech Salary",
  bonus:                "Bonus / Eidi",
  overtime:             "Overtime",
  cleaning:             "Cleaning Supplies",
  paint:                "Paint Supplies",
  stationery:           "Stationery",
  hardware:             "Hardware / Tools",
};

export function prettifyExpenseSubcategory(s: string | null | undefined): string {
  if (!s) return "";
  if (EXPENSE_SUBCATEGORY_LABELS[s]) return EXPENSE_SUBCATEGORY_LABELS[s];
  return s
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}
