import { getDb } from "../api/queries/connection";
import { randomBytes, scryptSync } from "crypto";
import * as s from "./schema";

// Deterministic PRNG so reseeds look identical
function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260807);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const rint = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const chance = (p: number) => rand() < p;

function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pw, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

const DAY = 24 * 3600 * 1000;
const HOUR = 3600 * 1000;
const now = Date.now();
const at = (dayOffset: number, hour: number, minute = 0) => {
  const d = new Date(now + dayOffset * DAY);
  d.setHours(hour, minute, 0, 0);
  return d;
};

const firstNames = ["Ahmad", "Nurul", "Wei Ming", "Priya", "Rajesh", "Mei Ling", "Hakim", "Siti", "Kumar", "Xin Yi", "Farah", "Jun Hao", "Aishah", "Vikram", "Li Wei", "Zara", "Hafiz", "Anita", "Kai Xuan", "Devi", "Irfan", "Cheryl", "Amirul", "Su Yin", "Nadia", "Arjun", "Pei Shan", "Faiz", "Grace", "Syafiq"];
const lastNames = ["Abdullah", "Tan", "Lim", "Krishnan", "Ng", "Rahman", "Wong", "Subramaniam", "Lee", "Ismail", "Chan", "Nair", "Ong", "Hassan", "Teoh", "Menon", "Chong", "Yusof", "Goh", "Pillai"];
const malayName = () => `${pick(firstNames)} ${pick(lastNames)}`;
const phone = () => `+601${pick(["2", "3", "6", "7", "9"])}-${rint(100, 999)} ${rint(1000, 9999)}`;

const INSERT_CHUNK = 100;

async function insertChunked(db: any, table: any, rows: any[]) {
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    await db.insert(table).values(rows.slice(i, i + INSERT_CHUNK));
  }
}

export async function runSeed() {
  const db = getDb();
  console.log("Seeding Medini AI Dental CRM...");

  // ---------------- Branches (14) ----------------
  const branchDefs = [
    ["HQ", "Medini Flagship", "Iskandar Puteri"],
    ["BKI", "Bukit Indah", "Johor Bahru"],
    ["NUS", "Nusajaya", "Iskandar Puteri"],
    ["SKU", "Skudai", "Johor Bahru"],
    ["JBC", "JB City Square", "Johor Bahru"],
    ["AUS", "Mount Austin", "Johor Bahru"],
    ["PER", "Permas Jaya", "Johor Bahru"],
    ["KUL", "Kulai", "Kulai"],
    ["BPH", "Batu Pahat", "Batu Pahat"],
    ["KLU", "Kluang", "Kluang"],
    ["MUA", "Muar", "Muar"],
    ["SEG", "Segamat", "Segamat"],
    ["MEL", "Melaka Raya", "Melaka"],
    ["BNG", "Bangsar", "Kuala Lumpur"],
  ] as const;
  const branchRows = branchDefs.map(([code, name, city], i) => ({
    code,
    name: `Medini Dental ${name}`,
    city,
    phone: phone(),
    address: `Lot ${rint(1, 99)}, Jalan Medini ${i + 1}, ${city}`,
    whatsappSession: `wa-${code.toLowerCase()}`,
    whatsappConnected: i !== 10, // Muar session temporarily disconnected
  }));
  await insertChunked(db, s.branches, branchRows);
  const branchIds = (await db.select({ id: s.branches.id }).from(s.branches)).map((b) => b.id);

  // ---------------- Users ----------------
  const pw = hashPassword("medini123");
  const doctorSpecs = ["General Dentistry", "Orthodontics", "Endodontics", "Oral Surgery", "Periodontics", "Prosthodontics", "Paediatric Dentistry"];
  const userRows: Array<typeof s.users.$inferInsert> = [
    { branchId: null, role: "hq", name: "Aisha Rahman", username: "hq", email: "aisha@medinidental.com", passwordHash: pw, title: "Chief Executive Officer" },
  ];
  branchDefs.forEach(([, _name], i) => {
    userRows.push(
      { branchId: branchIds[i], role: "branch_manager", name: malayName(), username: `manager.${branchDefs[i][0].toLowerCase()}`, email: `manager.${branchDefs[i][0].toLowerCase()}@medinidental.com`, passwordHash: pw, title: "Branch Manager" },
      { branchId: branchIds[i], role: "branch_admin", name: malayName(), username: `reception.${branchDefs[i][0].toLowerCase()}`, email: `reception.${branchDefs[i][0].toLowerCase()}@medinidental.com`, passwordHash: pw, title: "Receptionist" },
    );
    const docCount = i < 6 ? 3 : 2;
    for (let d = 0; d < docCount; d++) {
      userRows.push({
        branchId: branchIds[i], role: "doctor", name: `Dr. ${malayName()}`,
        username: `dr.${branchDefs[i][0].toLowerCase()}${d + 1}`,
        email: `dr${d + 1}.${branchDefs[i][0].toLowerCase()}@medinidental.com`,
        passwordHash: pw, specialization: pick(doctorSpecs), title: "Dental Surgeon",
      });
    }
  });
  // Friendly demo logins on the flagship branch
  userRows[1].username = "manager";
  userRows[1].name = "Daniel Tan";
  userRows[2].username = "reception";
  userRows[2].name = "Priya Nair";
  userRows[3].username = "doctor";
  userRows[3].name = "Dr. Sarah Lim";
  userRows[3].specialization = "Orthodontics";
  await insertChunked(db, s.users, userRows);
  const allUsers = await db.select().from(s.users);
  const doctors = allUsers.filter((u) => u.role === "doctor");
  const doctorsByBranch = (bid: number) => doctors.filter((u) => u.branchId === bid);

  // ---------------- Chairs ----------------
  const chairRows = branchIds.flatMap((bid) =>
    ["Chair 1", "Chair 2", "Chair 3", "Chair 4"].map((n, i) => ({ branchId: bid, name: n, room: `Room ${i + 1}` })),
  );
  await insertChunked(db, s.chairs, chairRows);
  const chairIds = (await db.select().from(s.chairs));

  // ---------------- Treatments ----------------
  const treatmentDefs = [
    ["CONS", "Consultation & Examination", "General", 80, 20],
    ["SCAL", "Scaling & Polishing", "General", 180, 45],
    ["FILL", "Composite Filling", "Restorative", 250, 40],
    ["XTR", "Tooth Extraction", "Surgery", 300, 30],
    ["RCT", "Root Canal Treatment", "Endodontics", 1200, 90],
    ["CRWN", "Porcelain Crown", "Prosthodontics", 1800, 60],
    ["BRAC", "Braces (Full Treatment)", "Orthodontics", 6500, 60],
    ["IMPL", "Dental Implant", "Surgery", 5500, 90],
    ["WHT", "Teeth Whitening", "Cosmetic", 900, 60],
    ["VENR", "Veneer (per tooth)", "Cosmetic", 1500, 60],
    ["DENT", "Dentures", "Prosthodontics", 2200, 45],
    ["CLN", "Kids Cleaning & Fluoride", "Paediatric", 120, 30],
  ] as const;
  await db.insert(s.treatments).values(
    treatmentDefs.map(([code, name, category, price, durationMin]) => ({ code, name, category, price, durationMin })),
  );
  const treatmentRows = await db.select().from(s.treatments);

  // ---------------- Insurance panels ----------------
  await db.insert(s.insurancePanels).values([
    { name: "AIA Malaysia", contactEmail: "claims@aia.com.my", contactPhone: "+603-2056 1111" },
    { name: "Great Eastern", contactEmail: "dental@greateastern.com", contactPhone: "+603-4259 8888" },
    { name: "Prudential BSN", contactEmail: "claims@prubsn.com.my", contactPhone: "+603-2775 3888" },
    { name: "Allianz Malaysia", contactEmail: "health@allianz.com.my", contactPhone: "+603-2264 1188" },
    { name: "MiCare (TPA)", contactEmail: "providers@micare.com.my", contactPhone: "+603-7628 2888" },
  ]);
  const panels = await db.select().from(s.insurancePanels);

  // ---------------- Patients (240) ----------------
  const sources = ["walkin", "whatsapp", "referral", "campaign"] as const;
  const allergiesPool = [null, null, null, "Penicillin", "Latex", "NSAIDs", "Penicillin, Sulfa drugs"];
  const patientRows: Array<typeof s.patients.$inferInsert> = [];
  for (let i = 0; i < 240; i++) {
    const bid = pick(branchIds);
    const insured = chance(0.35);
    const lastVisitDaysAgo = rint(2, 400);
    patientRows.push({
      branchId: bid,
      mrn: `MDN-${String(10001 + i)}`,
      name: malayName(),
      phone: phone(),
      email: chance(0.6) ? `patient${i}@example.com` : null,
      icNumber: `${rint(70, 99)}${String(rint(1, 12)).padStart(2, "0")}${String(rint(1, 28)).padStart(2, "0")}-${rint(10, 59)}-${rint(1000, 9999)}`,
      dob: `${rint(1960, 2015)}-${String(rint(1, 12)).padStart(2, "0")}-${String(rint(1, 28)).padStart(2, "0")}`,
      gender: chance(0.5) ? "male" : "female",
      allergies: pick(allergiesPool),
      insurancePanelId: insured ? pick(panels).id : null,
      insurancePolicyNo: insured ? `POL-${rint(100000, 999999)}` : null,
      source: pick(sources),
      loyaltyPoints: rint(0, 1200),
      lastVisitAt: new Date(now - lastVisitDaysAgo * DAY),
      nextRecallAt: chance(0.5) ? new Date(now + rint(-20, 60) * DAY) : null,
      createdAt: new Date(now - rint(lastVisitDaysAgo, lastVisitDaysAgo + 500) * DAY),
    });
  }
  await insertChunked(db, s.patients, patientRows);
  const patientList = await db.select().from(s.patients);
  const patientsByBranch = (bid: number) => patientList.filter((p) => p.branchId === bid);

  console.log(`Branches: ${branchIds.length}, users: ${allUsers.length}, patients: ${patientList.length}`);
  process.stdout.write("Seeding appointments, clinical, finance...\n");

  // ---------------- Appointments + clinical + finance ----------------
  const apptRows: Array<typeof s.appointments.$inferInsert> = [];
  const noteRows: Array<typeof s.clinicalNotes.$inferInsert> = [];
  const rxRows: Array<typeof s.prescriptions.$inferInsert> = [];
  const invoiceRows: Array<typeof s.invoices.$inferInsert> = [];
  const itemRows: Array<typeof s.invoiceItems.$inferInsert> = [];
  const paymentRows: Array<typeof s.payments.$inferInsert> = [];
  const claimRows: Array<typeof s.insuranceClaims.$inferInsert> = [];
  let invSeq = 1;
  let apptId = 1; // predicted (serial insert order)

  const diagnoses = ["Dental caries", "Gingivitis", "Pulpitis", "Malocclusion", "Periodontitis", "Tooth sensitivity", "Impacted wisdom tooth", "Bruxism", "Staining / discolouration", "Chipped tooth"];
  const meds: Array<[string, string, string, number]> = [
    ["Amoxicillin 500mg", "1 capsule", "3 times daily", 5],
    ["Ibuprofen 400mg", "1 tablet", "twice daily after meals", 3],
    ["Chlorhexidine mouthwash 0.2%", "10ml rinse", "twice daily", 7],
    ["Paracetamol 500mg", "1-2 tablets", "every 6 hours as needed", 3],
    ["Metronidazole 400mg", "1 tablet", "twice daily", 5],
  ];

  const addInvoiceFor = (_appt: typeof s.appointments.$inferInsert, patientId: number, bid: number, when: Date, treatment: (typeof treatmentRows)[number]) => {
    const total = Number(treatment.price);
    const tax = 0;
    const invId = invSeq;
    const insured = chance(0.25) && total >= 500;
    const insAmt = insured ? Math.round(total * pick([0.5, 0.6, 0.8])) : 0;
    invoiceRows.push({
      branchId: bid, patientId,
      number: `INV-${String(260000 + invSeq)}`,
      status: "issued",
      subtotal: total, tax, total,
      insuranceAmount: insAmt,
      issuedAt: when, dueAt: new Date(when.getTime() + 14 * DAY),
    });
    itemRows.push({ invoiceId: invId, treatmentId: treatment.id, description: treatment.name, qty: 1, unitPrice: total, total });
    if (insured) {
      claimRows.push({
        branchId: bid, invoiceId: invId, patientId,
        panelId: pick(panels).id, claimNo: `CLM-${rint(100000, 999999)}`,
        amount: insAmt,
        status: pick(["submitted", "submitted", "approved", "paid", "rejected"] as const),
        submittedAt: when,
      });
    }
    // payments
    const patientDue = total - insAmt;
    const roll = rand();
    if (roll < 0.62) {
      // fully paid
      paymentRows.push({ branchId: bid, invoiceId: invId, patientId, amount: patientDue, method: pick(["cash", "card", "ewallet", "bank_transfer"] as const), kind: "full", paidAt: when, reference: `RCP-${rint(10000, 99999)}` });
      invoiceRows[invoiceRows.length - 1].status = "paid";
    } else if (roll < 0.85 && patientDue > 300) {
      // deposit + partial
      const dep = Math.round(patientDue * 0.3);
      paymentRows.push({ branchId: bid, invoiceId: invId, patientId, amount: dep, method: pick(["card", "ewallet"] as const), kind: "deposit", paidAt: when, reference: `RCP-${rint(10000, 99999)}` });
      if (chance(0.5)) {
        const part = Math.round((patientDue - dep) * 0.5);
        paymentRows.push({ branchId: bid, invoiceId: invId, patientId, amount: part, method: pick(["cash", "card"] as const), kind: "installment", paidAt: new Date(when.getTime() + rint(7, 30) * DAY), reference: `RCP-${rint(10000, 99999)}` });
      }
      invoiceRows[invoiceRows.length - 1].status = "partial";
    }
    invSeq++;
  };

  // historical + future appointments
  for (const bid of branchIds) {
    const pats = patientsByBranch(bid);
    const docs = doctorsByBranch(bid);
    if (!pats.length || !docs.length) continue;
    const branchChairs = chairIds.filter((c) => c.branchId === bid);
    for (let day = -60; day <= 14; day++) {
      const perDay = day === 0 ? rint(9, 14) : rint(5, 12);
      for (let k = 0; k < perDay; k++) {
        const patient = pick(pats);
        const doctor = pick(docs);
        const treatment = pick(treatmentRows);
        const startHour = rint(9, 17);
        const start = at(day, startHour, pick([0, 15, 30, 45]));
        const end = new Date(start.getTime() + treatment.durationMin * 60000);
        let status: (typeof s.appointmentStatuses)[number];
        let source: "manual" | "ai" | "walkin" = chance(0.45) ? "ai" : chance(0.3) ? "walkin" : "manual";
        if (day < 0) status = chance(0.88) ? "completed" : chance(0.5) ? "no_show" : "cancelled";
        else if (day === 0) {
          if (start.getTime() < now - HOUR) status = pick(["completed", "completed", "in_progress", "no_show"] as const);
          else if (start.getTime() < now + 2 * HOUR) status = pick(["checked_in", "confirmed", "in_progress"] as const);
          else status = pick(["booked", "confirmed"] as const);
        } else status = pick(["booked", "booked", "confirmed"] as const);
        apptRows.push({
          branchId: bid, patientId: patient.id, doctorId: doctor.id,
          chairId: pick(branchChairs).id, treatmentId: treatment.id,
          startAt: start, endAt: end, status, source,
          notes: chance(0.3) ? pick(["Patient requested morning slot", "Follow-up visit", "Sensitive to cold water", "Prefers female dentist", "First visit — referral from friend"]) : null,
        });
        if (status === "completed" && chance(0.85)) {
          noteRows.push({
            branchId: bid, patientId: patient.id, appointmentId: apptId, doctorId: doctor.id,
            diagnosis: pick(diagnoses),
            notes: pick([
              "Patient tolerated procedure well. Post-op instructions given.",
              "Reviewed oral hygiene technique. Advised flossing daily.",
              "Treatment completed without complications. Review in 2 weeks.",
              "Patient reported mild discomfort prior to visit, resolved after treatment.",
              "Discussed long-term treatment plan options with patient.",
            ]),
            procedures: treatment.name,
            createdAt: end,
          });
          if (chance(0.35)) {
            const m = pick(meds);
            rxRows.push({ branchId: bid, patientId: patient.id, doctorId: doctor.id, appointmentId: apptId, medication: m[0], dosage: m[1], frequency: m[2], durationDays: m[3] });
          }
          addInvoiceFor(apptRows[apptRows.length - 1], patient.id, bid, end, treatment);
        }
        apptId++;
      }
    }
  }

  await insertChunked(db, s.appointments, apptRows);
  await insertChunked(db, s.clinicalNotes, noteRows);
  await insertChunked(db, s.prescriptions, rxRows);
  await insertChunked(db, s.invoices, invoiceRows);
  await insertChunked(db, s.invoiceItems, itemRows);
  await insertChunked(db, s.payments, paymentRows);
  await insertChunked(db, s.insuranceClaims, claimRows);

  // Flagship split-payment showcase: RM10,000 = RM2,000 deposit + RM5,000 insurance + RM3,000 balance
  const showcasePatient = patientList.find((p) => p.branchId === branchIds[0])!;
  const showcaseInvId = invSeq;
  await db.insert(s.invoices).values({
    branchId: branchIds[0], patientId: showcasePatient.id,
    number: `INV-${String(260000 + invSeq)}`,
    status: "partial",
    subtotal: 10000, tax: 0, total: 10000, insuranceAmount: 5000,
    notes: "Full mouth rehabilitation — split payment showcase",
    issuedAt: new Date(now - 20 * DAY), dueAt: new Date(now + 10 * DAY),
  });
  await db.insert(s.invoiceItems).values([
    { invoiceId: showcaseInvId, treatmentId: treatmentRows.find((t) => t.code === "IMPL")!.id, description: "Dental Implant x2", qty: 2, unitPrice: 5500, total: 11000 },
    { invoiceId: showcaseInvId, treatmentId: null, description: "Package discount", qty: 1, unitPrice: -1000, total: -1000 },
  ]);
  await db.insert(s.payments).values([
    { branchId: branchIds[0], invoiceId: showcaseInvId, patientId: showcasePatient.id, amount: 2000, method: "card", kind: "deposit", reference: "RCP-88001", paidAt: new Date(now - 20 * DAY) },
    { branchId: branchIds[0], invoiceId: showcaseInvId, patientId: showcasePatient.id, amount: 5000, method: "insurance", kind: "insurance", reference: "CLM-772211", paidAt: new Date(now - 12 * DAY) },
    { branchId: branchIds[0], invoiceId: showcaseInvId, patientId: showcasePatient.id, amount: 1500, method: "ewallet", kind: "installment", reference: "RCP-88045", paidAt: new Date(now - 5 * DAY) },
  ]);
  await db.insert(s.insuranceClaims).values({
    branchId: branchIds[0], invoiceId: showcaseInvId, patientId: showcasePatient.id,
    panelId: panels[0].id, claimNo: "CLM-772211", amount: 5000, status: "paid", submittedAt: new Date(now - 18 * DAY),
  });
  invSeq++;

  console.log(`Appointments: ${apptRows.length}, invoices: ${invSeq - 1}, payments: ${paymentRows.length + 3}`);
  process.stdout.write("Seeding WhatsApp, AI, marketing, operations...\n");

  // ---------------- Treatment plans ----------------
  const planRows: Array<typeof s.treatmentPlans.$inferInsert> = [];
  const planItemRows: Array<typeof s.treatmentPlanItems.$inferInsert> = [];
  let planId = 1;
  for (let i = 0; i < 40; i++) {
    const patient = pick(patientList);
    const docs = doctorsByBranch(patient.branchId);
    if (!docs.length) continue;
    planRows.push({
      branchId: patient.branchId, patientId: patient.id, doctorId: pick(docs).id,
      title: pick(["Smile makeover plan", "Orthodontic correction plan", "Full mouth rehabilitation", "Implant restoration plan", "Periodontal therapy plan"]),
      status: pick(["proposed", "accepted", "in_progress", "completed"] as const),
    });
    const n = rint(2, 5);
    for (let k = 0; k < n; k++) {
      const t = pick(treatmentRows);
      planItemRows.push({
        planId, treatmentId: t.id, description: t.name,
        toothNo: chance(0.6) ? String(rint(11, 48)) : null,
        qty: 1, price: t.price, status: chance(0.4) ? "done" : "pending",
      });
    }
    planId++;
  }
  await insertChunked(db, s.treatmentPlans, planRows);
  await insertChunked(db, s.treatmentPlanItems, planItemRows);

  // ---------------- Documents / imaging ----------------
  const docRows: Array<typeof s.documents.$inferInsert> = [];
  const docKinds = [
    ["xray", "Periapical X-Ray"], ["xray", "Bitewing X-Ray"], ["opg", "OPG Panoramic"],
    ["cbct", "CBCT Scan"], ["photo", "Intraoral Photo"], ["before_after", "Before & After"],
    ["consent", "Consent Form"], ["document", "Referral Letter"],
  ] as const;
  for (let i = 0; i < 90; i++) {
    const patient = pick(patientList);
    const [kind, title] = pick(docKinds);
    docRows.push({
      branchId: patient.branchId, patientId: patient.id, kind, title,
      fileUrl: null,
      createdAt: new Date(now - rint(1, 300) * DAY),
    });
  }
  await insertChunked(db, s.documents, docRows);

  // ---------------- WhatsApp conversations ----------------
  const waScripts: Array<{ agent: string; msgs: Array<[string, string]> }> = [
    {
      agent: "booking",
      msgs: [
        ["patient", "Hi, I want to book scaling appointment this weekend"],
        ["ai", "Hi! This is Medini Dental's AI assistant 😊 I'd be happy to help you book a Scaling & Polishing. We have Saturday 10:30am with Dr. Sarah Lim or Sunday 2:00pm with Dr. Amir. Which do you prefer?"],
        ["patient", "Saturday 10:30 please"],
        ["ai", "Done! ✅ Your appointment is confirmed:\n\n📅 Saturday, 10:30am\n🦷 Scaling & Polishing\n👩‍⚕️ Dr. Sarah Lim\n📍 Medini Dental Flagship, Iskandar Puteri\n\nWe'll send a reminder the day before. See you soon!"],
      ],
    },
    {
      agent: "receptionist",
      msgs: [
        ["patient", "How much is braces?"],
        ["ai", "Our full braces treatment starts from RM6,500, which includes consultations, adjustments and retainers. We also offer 0% installment plans up to 12 months. Would you like me to book a free orthodontic consultation?"],
        ["patient", "Yes please, next Tuesday"],
        ["ai", "I have Tuesday 11:00am or 4:30pm with Dr. Sarah Lim (Orthodontics). Which time works for you?"],
      ],
    },
    {
      agent: "recall",
      msgs: [
        ["ai", "Hi Mr. Tan! It's been 6 months since your last scaling at Medini Dental 🦷 Regular cleaning keeps your gums healthy. Would you like to book your recall visit this week?"],
        ["patient", "ok Thursday evening got?"],
        ["ai", "Yes! Thursday 6:00pm with Dr. Chen is available. Shall I confirm this slot for you?"],
        ["patient", "confirm"],
        ["ai", "Confirmed ✅ Thursday 6:00pm, Scaling & Polishing with Dr. Chen. Reply R to reschedule anytime."],
      ],
    },
    {
      agent: "payment_reminder",
      msgs: [
        ["ai", "Dear Ms. Priya, a gentle reminder that invoice INV-260412 for RM750.00 is outstanding. You can pay online or at any Medini Dental branch. Reply HELP for assistance."],
        ["patient", "Can I pay half first?"],
        ["ai", "Of course! You can make a partial payment of RM375 now and the balance within 14 days. I'll note this on your account. Would you like the payment link?"],
        ["patient", "yes"],
        ["ai", "Here's your secure payment link: pay.medini.my/p8k2 — thank you! 💚"],
      ],
    },
    {
      agent: "receptionist",
      msgs: [
        ["patient", "my tooth pain very bad, can come today?"],
        ["ai", "I'm sorry to hear that! Tooth pain shouldn't wait. Let me check today's emergency slots… Dr. Kumar has an opening at 3:45pm today. Shall I book you in?"],
        ["patient", "yes please"],
        ["ai", "Booked ✅ Today 3:45pm with Dr. Kumar. Please come 10 minutes early. If the pain worsens, take Paracetamol and avoid chewing on that side."],
        ["staff", "Hi, this is Priya from reception — I've flagged you as priority walk-in too, see you at 3:45pm!"],
      ],
    },
  ];
  const convRows: Array<typeof s.waConversations.$inferInsert> = [];
  const msgRows: Array<typeof s.waMessages.$inferInsert> = [];
  let convId = 1;
  for (const bid of branchIds) {
    const n = rint(2, 4);
    const pats = patientsByBranch(bid);
    for (let i = 0; i < n; i++) {
      const script = pick(waScripts);
      const patient = pats.length && chance(0.8) ? pick(pats) : null;
      const name = patient ? patient.name : malayName();
      const baseTime = now - rint(0, 5) * DAY - rint(0, 8) * HOUR;
      convRows.push({
        branchId: bid, patientId: patient?.id ?? null,
        phone: patient ? patient.phone : phone(),
        contactName: name,
        status: script.msgs.some(([sndr]) => sndr === "staff") ? "human_takeover" : pick(["ai_handled", "ai_handled", "closed"] as const),
        aiAgent: script.agent,
        unreadCount: chance(0.3) ? rint(1, 3) : 0,
        lastMessageAt: new Date(baseTime + script.msgs.length * 5 * 60000),
      });
      script.msgs.forEach(([sender, body], k) => {
        msgRows.push({
          conversationId: convId,
          direction: sender === "patient" ? "inbound" : "outbound",
          sender: sender as "patient" | "ai" | "staff",
          body,
          status: sender === "patient" ? "read" : pick(["delivered", "read"] as const),
          createdAt: new Date(baseTime + k * 5 * 60000),
        });
      });
      convId++;
    }
  }
  await insertChunked(db, s.waConversations, convRows);
  await insertChunked(db, s.waMessages, msgRows);

  // ---------------- AI logs ----------------
  const aiActions: Array<[string, string, string]> = [
    ["receptionist", "Answered enquiry", "Responded to pricing question about teeth whitening"],
    ["booking", "Appointment booked", "Booked Scaling & Polishing via WhatsApp"],
    ["booking", "Slot recommended", "Recommended Dr. Sarah Lim based on specialization match"],
    ["followup", "Follow-up scheduled", "Created 2-week post-RCT follow-up reminder"],
    ["recall", "Recall message sent", "6-month hygiene recall sent to patient"],
    ["payment_reminder", "Reminder sent", "Outstanding balance reminder for invoice"],
    ["campaign", "Campaign drafted", "Drafted birthday promotion broadcast"],
    ["review", "Review requested", "Sent Google review request after completed visit"],
    ["analyst", "Insight generated", "Flagged 18% no-show rate increase at Skudai branch"],
    ["receptionist", "Escalated to human", "Low confidence (0.42) on insurance coverage question — handed to reception"],
  ];
  const logRows: Array<typeof s.aiLogs.$inferInsert> = [];
  for (let i = 0; i < 140; i++) {
    const [agent, action, detail] = pick(aiActions);
    logRows.push({
      branchId: pick(branchIds), agent: agent as (typeof s.aiAgents)[number],
      action, detail,
      confidence: Number((0.4 + rand() * 0.6).toFixed(3)),
      escalated: action.includes("Escalated"),
      createdAt: new Date(now - rint(0, 14) * DAY - rint(0, 23) * HOUR),
    });
  }
  await insertChunked(db, s.aiLogs, logRows);

  // ---------------- AI prompts + knowledge base ----------------
  await db.insert(s.aiPrompts).values([
    { agent: "receptionist", name: "Receptionist system prompt", prompt: "You are Medini Dental's AI receptionist. Be warm, concise and professional. Answer questions about treatments, prices, branches and hours using the knowledge base. Never give medical diagnoses. Escalate to a human when confidence is below 0.6." },
    { agent: "booking", name: "Booking manager prompt", prompt: "You are the AI booking manager. Check doctor schedules and chair availability before offering slots. Always confirm date, time, doctor, treatment and branch in a structured summary. Offer the nearest branch when the patient shares a location." },
    { agent: "recall", name: "Recall agent prompt", prompt: "You send friendly 6-month hygiene recall messages. Personalise with the patient's name and last treatment. Offer two concrete slots. Keep messages under 60 words." },
    { agent: "payment_reminder", name: "Payment reminder prompt", prompt: "Send polite payment reminders. Always state the invoice number and exact amount. Offer partial payment when the outstanding balance exceeds RM500. Never threaten or pressure the patient." },
  ]);
  await db.insert(s.knowledgeBase).values([
    { category: "Pricing", question: "How much is scaling and polishing?", answer: "Scaling & Polishing is RM180 at all Medini Dental branches. First-visit packages with consultation are RM220." },
    { category: "Pricing", question: "How much are braces?", answer: "Full braces treatment starts from RM6,500 including adjustments and retainers. 0% installment plans up to 12 months are available." },
    { category: "Hours", question: "What are the opening hours?", answer: "All branches are open daily 9am–9pm, including weekends and public holidays except Hari Raya Aidilfitri (first 2 days)." },
    { category: "Insurance", question: "Which insurance panels do you accept?", answer: "We are panel clinics for AIA, Great Eastern, Prudential BSN, Allianz and MiCare. Bring your IC and insurance card for cashless visits." },
    { category: "Emergency", question: "Do you accept emergency walk-ins?", answer: "Yes. Emergency slots are reserved daily at every branch. Patients in severe pain are prioritised and typically seen within 30 minutes." },
    { category: "Treatment", question: "Is teeth whitening safe?", answer: "Yes. We use professional-grade whitening supervised by dentists. A consultation (RM80) is required first to check enamel and gum health." },
  ]);

  // ---------------- Campaigns ----------------
  await db.insert(s.campaigns).values([
    { branchId: null, name: "August Merdeka Whitening Promo", type: "promotion", segment: "All active patients", message: "Merdeka Special! 🇲🇾 31% off Teeth Whitening this August at all Medini Dental branches. Book now!", status: "running", sentCount: 4210, deliveredCount: 4088, respondedCount: 312, scheduledAt: new Date(now - 3 * DAY) },
    { branchId: null, name: "6-Month Hygiene Recall Wave 34", type: "recall", segment: "Recall due ≤ 14 days", message: "Time for your 6-month dental check-up! Book your scaling appointment today.", status: "completed", sentCount: 860, deliveredCount: 847, respondedCount: 233, scheduledAt: new Date(now - 9 * DAY) },
    { branchId: branchIds[3], name: "Skudai Birthday Club — August", type: "birthday", segment: "Birthdays this month", message: "Happy Birthday! 🎂 Enjoy a free polishing with any treatment this month at Medini Dental Skudai.", status: "running", sentCount: 96, deliveredCount: 94, respondedCount: 21, scheduledAt: new Date(now - 1 * DAY) },
    { branchId: null, name: "Google Review Drive Q3", type: "review", segment: "Completed visits, rating ≥ 4", message: "Thank you for visiting Medini Dental! Would you mind leaving us a quick Google review?", status: "running", sentCount: 1502, deliveredCount: 1489, respondedCount: 402, scheduledAt: new Date(now - 15 * DAY) },
    { branchId: branchIds[0], name: "Flagship Invisalign Open Day", type: "broadcast", segment: "Orthodontic interest list", message: "Join our Invisalign Open Day on 23 August — free 3D smile scan and consultation!", status: "scheduled", sentCount: 0, deliveredCount: 0, respondedCount: 0, scheduledAt: new Date(now + 6 * DAY) },
  ]);

  // ---------------- Operations ----------------
  await db.insert(s.tasks).values([
    { branchId: branchIds[0], title: "Restock composite resin (A2 shade)", status: "in_progress", dueAt: new Date(now + 2 * DAY) },
    { branchId: branchIds[0], title: "Autoclave quarterly validation", status: "open", dueAt: new Date(now + 5 * DAY) },
    { branchId: branchIds[1], title: "Fix dental chair 2 hydraulic leak", status: "open", dueAt: new Date(now + 1 * DAY) },
    { branchId: branchIds[2], title: "Update price list display boards", status: "done", dueAt: new Date(now - 1 * DAY) },
  ]);
  await db.insert(s.incidentLogs).values([
    { branchId: branchIds[0], title: "Compressor alarm triggered", severity: "medium", status: "resolved", detail: "Main air compressor overheated at 2pm. Vendor serviced same day." },
    { branchId: branchIds[4], title: "Water supply interruption", severity: "high", status: "open", detail: "Building-wide water cut. Afternoon appointments moved to Chair 3 with portable unit." },
    { branchId: branchIds[7], title: "Patient slipped in lobby", severity: "medium", status: "resolved", detail: "Wet floor near entrance. First aid given, no injury. Wet-floor sign now mandatory." },
  ]);

  // ---------------- Settings ----------------
  await db.insert(s.settings).values([
    { key: "company", value: JSON.stringify({ name: "Medini Dental Group", registrationNo: "201501023456 (1144552-X)", email: "hello@medinidental.com", phone: "+607-509 8888", website: "www.medinidental.com", address: "Suite 8, Medini 9, Persiaran Medini Sentral, 79250 Iskandar Puteri, Johor" }) },
    { key: "branding", value: JSON.stringify({ primaryColor: "#0d9d6c", logoText: "Medini Dental", tagline: "AI-first dental care" }) },
    { key: "notifications", value: JSON.stringify({ emailNotifications: true, whatsappReminders: true, reminderHoursBefore: 24, dailyClosingReport: true }) },
    { key: "ai", value: JSON.stringify({ confidenceThreshold: 0.6, autoEscalate: true, languages: ["English", "Bahasa Malaysia", "Mandarin"] }) },
  ]);

  console.log("Seed complete.");
}

const isMain = !!process.argv[1] && /seed\.(ts|js|mts)$/.test(process.argv[1]);
if (isMain) {
  runSeed().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
