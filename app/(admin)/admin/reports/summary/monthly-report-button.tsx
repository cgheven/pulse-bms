"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MonthlyReportDialog } from "@/components/admin/reports/monthly-report-dialog";

export function MonthlyReportButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <FileDown className="w-4 h-4 mr-2" />
        Monthly Report
      </Button>
      <MonthlyReportDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
