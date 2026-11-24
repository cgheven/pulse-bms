// Shared, framework-neutral data: rendered in the client landing page and read
// server-side to build FAQPage JSON-LD. Kept out of the "use client" module so
// a React Server Component can import the real array (not a client reference).
export const landingFaqs = [
  {
    q: "What is a building management system?",
    a: "A building management system is software that runs the day-to-day admin of an apartment building or society — maintenance billing, payment collection, resident and flat records, staff payroll, expenses and building finances — in one place, instead of across WhatsApp groups and Excel sheets. Pulse BMS is built for apartment buildings and housing societies in Pakistan.",
  },
  {
    q: "How does Pulse help collect maintenance?",
    a: "Pulse generates a maintenance invoice for every flat each month, tracks who has paid, partly paid or defaulted, and lets you send one-tap WhatsApp reminders. You can see collections, outstanding dues and defaulters at a glance, and export the whole ledger to PDF or Excel.",
  },
  {
    q: "Can residents see the building's finances?",
    a: "Yes. Residents get their own portal to view dues, download receipts and see the building's income, expenses and bank balance — full transparency, so there are no arguments about where the money went.",
  },
  {
    q: "Does it work for apartment societies in Pakistan?",
    a: "Pulse is built for Pakistan: amounts in PKR, CNIC and +92 phone fields, Pakistani maintenance and union workflows, and WhatsApp-first reminders. It suits everything from a single apartment building to a multi-block society.",
  },
  {
    q: "How long does setup take?",
    a: "Most buildings are live in under 15 minutes. Import your existing flats and residents from an Excel template, and the guided Quick Setup walks you through the rest — no technical skills needed.",
  },
  {
    q: "Is Pulse free to start?",
    a: "Yes — Pulse is free to start with no credit card required, and our Karachi-based team helps you get your building onboarded.",
  },
];
