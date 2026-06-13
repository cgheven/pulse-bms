export const TRADES = {
  electrician:   { label: "Electrician",    colorBg: "bg-amber-100",  colorText: "text-amber-700",  colorBorder: "border-amber-200",  topBar: "bg-amber-400"  },
  plumber:       { label: "Plumber",        colorBg: "bg-blue-100",   colorText: "text-blue-700",   colorBorder: "border-blue-200",   topBar: "bg-blue-400"   },
  carpenter:     { label: "Carpenter",      colorBg: "bg-orange-100", colorText: "text-orange-700", colorBorder: "border-orange-200", topBar: "bg-orange-400" },
  painter:       { label: "Painter",        colorBg: "bg-purple-100", colorText: "text-purple-700", colorBorder: "border-purple-200", topBar: "bg-purple-400" },
  generator_tech:{ label: "Generator Tech", colorBg: "bg-red-100",    colorText: "text-red-700",    colorBorder: "border-red-200",    topBar: "bg-red-400"    },
  lift_tech:     { label: "Lift Technician",colorBg: "bg-indigo-100", colorText: "text-indigo-700", colorBorder: "border-indigo-200", topBar: "bg-indigo-400" },
  pest_control:  { label: "Pest Control",   colorBg: "bg-green-100",  colorText: "text-green-700",  colorBorder: "border-green-200",  topBar: "bg-green-400"  },
  cleaner:       { label: "Cleaner",        colorBg: "bg-teal-100",   colorText: "text-teal-700",   colorBorder: "border-teal-200",   topBar: "bg-teal-400"   },
  security:      { label: "Security Guard", colorBg: "bg-slate-100",  colorText: "text-slate-700",  colorBorder: "border-slate-200",  topBar: "bg-slate-400"  },
  hvac:          { label: "AC / HVAC",      colorBg: "bg-sky-100",    colorText: "text-sky-700",    colorBorder: "border-sky-200",    topBar: "bg-sky-400"    },
  mason:         { label: "Mason",          colorBg: "bg-stone-100",  colorText: "text-stone-700",  colorBorder: "border-stone-200",  topBar: "bg-stone-400"  },
  other:         { label: "Other",          colorBg: "bg-gray-100",   colorText: "text-gray-600",   colorBorder: "border-gray-200",   topBar: "bg-gray-400"   },
} as const;

export type TradeKey = keyof typeof TRADES;
export const TRADE_KEYS = Object.keys(TRADES) as TradeKey[];

export function getTrade(key: string) {
  return TRADES[key as TradeKey] ?? TRADES.other;
}

export type ServiceContact = {
  id: string;
  building_id: string;
  name: string;
  trade: string;
  phone: string;
  whatsapp: string | null;
  is_available: boolean;
  notes: string | null;
  sort_order: number;
  created_at: string;
};
