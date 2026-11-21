import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { PatientFullReportData } from '../types';

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return 'Not recorded';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function safeVal(val: string | number | null | undefined, suffix = ''): string {
  if (val === null || val === undefined || String(val).trim() === '') {
    return 'Not recorded';
  }
  return `${val}${suffix}`;
}

function getCursorY(doc: jsPDF, fallback: number): number {
  const lastTable = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable;
  return lastTable?.finalY ? lastTable.finalY + 18 : fallback;
}

function ensureSpace(doc: jsPDF, y: number, needed = 90): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed > pageHeight - 48) {
    doc.addPage();
    return 48;
  }
  return y;
}

function drawSectionHeading(doc: jsPDF, num: string, title: string, y: number): number {
  const safeY = ensureSpace(doc, y, 70);
  doc.setFillColor(240, 246, 244);
  doc.roundedRect(36, safeY - 12, doc.internal.pageSize.getWidth() - 72, 20, 3, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(31, 111, 92);
  doc.text(`${num}. ${title}`, 44, safeY + 2);
  return safeY + 16;
}

/**
 * Generates a clean, authentic A4 PDF report for ONE selected patient using strictly
 * existing database records (never fabricates or invents missing clinical values).
 */
export function buildPatientReportPdf(
  report: PatientFullReportData,
  mode: 'full' | 'summary' = 'full'
): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const { patient } = report;
  const generatedLabel = formatDateTime(report.generated_at);
  const reportId = `ASHA-RPT-${patient.person_code}-${report.generated_at.slice(0, 10).replace(/-/g, '')}`;

  // 1. ASHASAKHI AI REPORT HEADING
  doc.setFillColor(31, 111, 92);
  doc.rect(0, 0, pageWidth, 74, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(255, 255, 255);
  doc.text('AshaSakhi AI — Individual Patient Health Report', 36, 32);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(218, 242, 235);
  doc.text(
    mode === 'summary'
      ? 'Concise Clinical Summary · Prepared strictly from existing ASHA field records'
      : 'Complete Longitudinal Patient Report · Prepared strictly from existing ASHA field records',
    36,
    49
  );
  doc.text(`Report ID: ${reportId}   |   Generated: ${generatedLabel}`, 36, 63);

  let y = 96;

  // 2. PATIENT IDENTIFICATION DETAILS & 3. BASIC PATIENT INFORMATION
  y = drawSectionHeading(doc, '1', 'Patient Identification & Basic Information', y);
  autoTable(doc, {
    startY: y,
    margin: { left: 36, right: 36 },
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 5, textColor: [15, 23, 42], lineColor: [215, 223, 213] },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: [248, 250, 248], cellWidth: 115 },
      1: { cellWidth: 145 },
      2: { fontStyle: 'bold', fillColor: [248, 250, 248], cellWidth: 115 },
      3: { cellWidth: 'auto' },
    },
    body: [
      ['Patient ID', patient.person_code, 'Full Name', patient.full_name],
      ['Age / Gender', `${patient.age} yrs / ${patient.gender}`, 'Health Category', patient.category],
      ['Blood Group', safeVal(patient.blood_group), 'Registered Phone', safeVal(patient.phone)],
      ['Village / District', `${patient.village}, ${patient.district}`, 'Family ID / Head', patient.family_code ? `${patient.family_code} (${patient.head_name || 'Linked'})` : 'Not linked'],
      ['Address', safeVal(patient.address), 'Relation to Head', safeVal(patient.relation_to_head)],
      ['Known Conditions', safeVal(patient.chronic_conditions), 'Registered On', formatDateTime(patient.created_at)],
    ],
  });
  y = getCursorY(doc, y + 110);

  // SHORT SUMMARY SNAPSHOT TABLE
  const latestCheckup = report.checkups[0] || null;
  const latestVisit = report.visits[0] || null;
  const latestMaternal = report.maternalRecords[0] || null;
  const activeAlertsCount = report.alerts.filter((a) => a.status !== 'Resolved').length;
  const upcomingApptsCount = report.appointments.filter((a) => a.status === 'Scheduled').length;

  y = drawSectionHeading(doc, '2', 'Clinical Record Summary (Recorded Data Only)', y);
  autoTable(doc, {
    startY: y,
    margin: { left: 36, right: 36 },
    theme: 'grid',
    head: [['Home Visits', 'Checkups', 'Maternal / Child', 'Scheduled Appts', 'Active Alerts', 'Latest Vitals']],
    body: [
      [
        String(report.visits.length),
        String(report.checkups.length),
        `${report.maternalRecords.length} ANC / ${report.childRecords.length} Child`,
        String(upcomingApptsCount),
        String(activeAlertsCount),
        latestCheckup
          ? `BP ${latestCheckup.bp_systolic ?? '—'}/${latestCheckup.bp_diastolic ?? '—'} | Hb ${latestCheckup.hemoglobin_gdl ?? '—'}`
          : latestVisit
          ? `BP ${latestVisit.bp_systolic ?? '—'}/${latestVisit.bp_diastolic ?? '—'} | Hb ${latestVisit.hemoglobin_gdl ?? '—'}`
          : 'Not recorded',
      ],
    ],
    headStyles: { fillColor: [31, 111, 92], textColor: [255, 255, 255], fontSize: 8.2 },
    styles: { fontSize: 8.5, cellPadding: 5, textColor: [15, 23, 42] },
  });
  y = getCursorY(doc, y + 60);

  // If Short Summary mode, print concise highlights & stop at 1 clean page
  if (mode === 'summary') {
    if (latestMaternal) {
      y = drawSectionHeading(doc, '3', 'Pregnancy & ANC Snapshot', y);
      autoTable(doc, {
        startY: y,
        margin: { left: 36, right: 36 },
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 5 },
        head: [['Status', 'LMP / EDD', 'ANC Visits', 'IFA Tablets', 'High Risk', 'Next ANC Date']],
        headStyles: { fillColor: [31, 111, 92], textColor: [255, 255, 255] },
        body: [
          [
            safeVal(latestMaternal.postnatal_status),
            `${safeVal(latestMaternal.lmp_date)} / ${safeVal(latestMaternal.edd_date)}`,
            String(latestMaternal.anc_visits_completed),
            String(latestMaternal.ifa_tablets_total),
            latestMaternal.high_risk ? `Yes (${latestMaternal.high_risk_reasons || 'Flagged'})` : 'No',
            safeVal(latestMaternal.next_anc_date),
          ],
        ],
      });
      y = getCursorY(doc, y + 60);
    }

    y = drawSectionHeading(doc, latestMaternal ? '4' : '3', 'Upcoming Appointments & Active Alerts', y);
    const nextAppts = report.appointments
      .filter((a) => a.status === 'Scheduled')
      .slice(0, 3)
      .map((a) => `${a.appointment_date} ${a.appointment_time} — ${a.appointment_type}: ${a.purpose}`);
    const openAlerts = report.alerts
      .filter((a) => a.status !== 'Resolved')
      .slice(0, 3)
      .map((a) => `[${a.severity}] ${a.danger_signs.join(', ')} (${a.status})`);

    autoTable(doc, {
      startY: y,
      margin: { left: 36, right: 36 },
      theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 5 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 150, fillColor: [248, 250, 248] } },
      body: [
        ['Scheduled Follow-ups', nextAppts.length > 0 ? nextAppts.join('\n') : 'No scheduled appointments recorded'],
        ['Important Health Alerts', openAlerts.length > 0 ? openAlerts.join('\n') : 'No active health alerts recorded'],
        [
          'Latest Observation',
          latestCheckup?.observations || latestVisit?.recommended_action || latestVisit?.notes || 'Not recorded',
        ],
      ],
    });
    applyPdfFooters(doc, reportId, generatedLabel);
    return doc;
  }

  // =========================================================================
  // FULL DETAILED 13-SECTION REPORT (STRICTLY REAL EXISTING PATIENT RECORDS)
  // =========================================================================

  // 4. PREGNANCY DETAILS (WHERE APPLICABLE)
  y = drawSectionHeading(doc, '3', 'Pregnancy & Maternal Details', y);
  if (report.maternalRecords.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.8);
    doc.setTextColor(100, 116, 139);
    doc.text('Not applicable / No maternal or pregnancy record on file for this patient.', 40, y + 4);
    y += 22;
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: 36, right: 36 },
      theme: 'grid',
      headStyles: { fillColor: [31, 111, 92], textColor: [255, 255, 255], fontSize: 8 },
      styles: { fontSize: 8.2, cellPadding: 4.5 },
      head: [['Stage', 'LMP / EDD', 'G / P', 'BP / Hb', 'IFA & Nutrition', 'High Risk & Reasons', 'Next ANC']],
      body: report.maternalRecords.map((m) => [
        safeVal(m.postnatal_status),
        `${safeVal(m.lmp_date)}\n${safeVal(m.edd_date)}`,
        `G${m.gravida} P${m.para}`,
        `${safeVal(m.bp_reading)} / ${m.hemoglobin_gdl !== null ? `${m.hemoglobin_gdl} g/dL` : 'Not recorded'}`,
        `${m.ifa_tablets_total} tabs · ${safeVal(m.nutrition_status)}`,
        m.high_risk ? `High Risk: ${m.high_risk_reasons || 'Flagged'}` : 'Standard Risk',
        safeVal(m.next_anc_date),
      ]),
    });
    y = getCursorY(doc, y + 70);
  }

  // 5. ANC VISIT HISTORY
  y = drawSectionHeading(doc, '4', 'ANC Visit History', y);
  const ancVisits = report.visits.filter(
    (v) =>
      v.beneficiary_category === 'Pregnant Woman' ||
      v.gestational_weeks !== null ||
      /anc|antenatal|pregnancy/i.test(`${v.purpose} ${v.notes}`)
  );
  const ancAppointments = report.appointments.filter((a) => a.appointment_type === 'Antenatal Checkup');

  if (ancVisits.length === 0 && ancAppointments.length === 0 && report.maternalRecords.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.8);
    doc.setTextColor(100, 116, 139);
    doc.text('No ANC visit history recorded for this patient.', 40, y + 4);
    y += 22;
  } else {
    const ancRows: string[][] = [
      ...ancVisits.map((v) => [
        v.visit_date,
        v.gestational_weeks !== null ? `${v.gestational_weeks} wks` : 'Not recorded',
        v.bp_systolic && v.bp_diastolic ? `${v.bp_systolic}/${v.bp_diastolic} mmHg` : 'Not recorded',
        v.hemoglobin_gdl !== null ? `${v.hemoglobin_gdl} g/dL` : 'Not recorded',
        `${v.ifa_tablets_given} tabs`,
        v.recommended_action || v.notes || 'Recorded ANC visit',
      ]),
      ...ancAppointments.map((a) => [
        `${a.appointment_date} (${a.status})`,
        'Appointment',
        '—',
        '—',
        '—',
        `${a.purpose}${a.notes ? ` — ${a.notes}` : ''}`,
      ]),
    ];
    if (ancRows.length === 0 && latestMaternal) {
      ancRows.push([
        formatDateTime(latestMaternal.created_at),
        `${latestMaternal.anc_visits_completed} completed`,
        safeVal(latestMaternal.bp_reading),
        latestMaternal.hemoglobin_gdl !== null ? `${latestMaternal.hemoglobin_gdl} g/dL` : 'Not recorded',
        `${latestMaternal.ifa_tablets_total} tabs`,
        safeVal(latestMaternal.notes),
      ]);
    }
    autoTable(doc, {
      startY: y,
      margin: { left: 36, right: 36 },
      theme: 'grid',
      headStyles: { fillColor: [31, 111, 92], textColor: [255, 255, 255], fontSize: 8 },
      styles: { fontSize: 8.2, cellPadding: 4.5 },
      head: [['Date', 'Gestation / Type', 'BP', 'Hemoglobin', 'IFA Given', 'Notes / Action']],
      body: ancRows,
    });
    y = getCursorY(doc, y + 70);
  }

  // 6. BLOOD PRESSURE & OTHER RECORDED VITALS
  y = drawSectionHeading(doc, '5', 'Blood Pressure & Recorded Vitals', y);
  const vitalsRows: string[][] = [
    ...report.checkups.map((c) => [
      c.checkup_date,
      'Health Checkup',
      c.bp_systolic && c.bp_diastolic ? `${c.bp_systolic}/${c.bp_diastolic} mmHg` : 'Not recorded',
      c.temperature_c !== null ? `${c.temperature_c} °C` : 'Not recorded',
      c.weight_kg !== null ? `${c.weight_kg} kg` : 'Not recorded',
      c.blood_sugar_mgdl !== null ? `${c.blood_sugar_mgdl} mg/dL` : 'Not recorded',
      c.hemoglobin_gdl !== null ? `${c.hemoglobin_gdl} g/dL` : 'Not recorded',
      c.spo2_pct !== null ? `${c.spo2_pct}%` : 'Not recorded',
    ]),
    ...report.visits
      .filter(
        (v) =>
          v.bp_systolic !== null ||
          v.weight_kg !== null ||
          v.blood_sugar_mgdl !== null ||
          v.hemoglobin_gdl !== null
      )
      .map((v) => [
        v.visit_date,
        'Home Visit',
        v.bp_systolic && v.bp_diastolic ? `${v.bp_systolic}/${v.bp_diastolic} mmHg` : 'Not recorded',
        'Not recorded',
        v.weight_kg !== null ? `${v.weight_kg} kg` : 'Not recorded',
        v.blood_sugar_mgdl !== null ? `${v.blood_sugar_mgdl} mg/dL` : 'Not recorded',
        v.hemoglobin_gdl !== null ? `${v.hemoglobin_gdl} g/dL` : 'Not recorded',
        'Not recorded',
      ]),
  ];

  if (vitalsRows.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.8);
    doc.setTextColor(100, 116, 139);
    doc.text('No blood pressure or vital sign measurements recorded yet.', 40, y + 4);
    y += 22;
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: 36, right: 36 },
      theme: 'grid',
      headStyles: { fillColor: [31, 111, 92], textColor: [255, 255, 255], fontSize: 7.8 },
      styles: { fontSize: 7.8, cellPadding: 4 },
      head: [['Date', 'Source', 'BP', 'Temp', 'Weight', 'Blood Sugar', 'Hb', 'SpO2']],
      body: vitalsRows,
    });
    y = getCursorY(doc, y + 70);
  }

  // 7. HEALTH OBSERVATIONS
  y = drawSectionHeading(doc, '6', 'Health Observations & Clinical Notes', y);
  const observationRows: string[][] = [
    ...report.checkups.map((c) => [
      c.checkup_date,
      'Checkup',
      safeVal(c.symptoms),
      c.observations || c.summary || 'Not recorded',
      c.clinical_flags.length > 0 ? c.clinical_flags.join('; ') : 'None flagged',
    ]),
    ...report.visits
      .filter((v) => v.symptoms || v.notes || v.recommended_action || v.risk_flags.length > 0)
      .map((v) => [
        v.visit_date,
        'Home Visit',
        safeVal(v.symptoms),
        v.notes || v.recommended_action || 'Not recorded',
        v.risk_flags.length > 0 ? v.risk_flags.join('; ') : `${v.risk_level} Risk`,
      ]),
  ];

  if (observationRows.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.8);
    doc.setTextColor(100, 116, 139);
    doc.text('No clinical observations recorded yet.', 40, y + 4);
    y += 22;
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: 36, right: 36 },
      theme: 'grid',
      headStyles: { fillColor: [31, 111, 92], textColor: [255, 255, 255], fontSize: 8 },
      styles: { fontSize: 8.1, cellPadding: 4.5 },
      head: [['Date', 'Source', 'Reported Symptoms', 'Observation / Action', 'Flags / Risk']],
      body: observationRows,
    });
    y = getCursorY(doc, y + 70);
  }

  // 8. VACCINATION DETAILS
  y = drawSectionHeading(doc, '7', 'Vaccination & Immunization Details', y);
  const vaccineRows: string[][] = [
    ...report.childRecords.map((c) => [
      c.dob || 'Not recorded',
      c.vaccines_completed.length > 0 ? c.vaccines_completed.join(', ') : 'None recorded',
      safeVal(c.next_vaccine),
      safeVal(c.next_vaccine_date),
      `${safeVal(c.nutrition_status)}${c.current_weight_kg !== null ? ` · Wt ${c.current_weight_kg} kg` : ''}`,
    ]),
    ...report.visits
      .filter((v) => v.immunization_status && v.immunization_status !== 'Checked')
      .map((v) => [
        v.visit_date,
        v.immunization_status,
        'From visit register',
        safeVal(v.follow_up_date),
        safeVal(v.purpose),
      ]),
  ];

  if (vaccineRows.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.8);
    doc.setTextColor(100, 116, 139);
    doc.text('No vaccination records logged for this patient.', 40, y + 4);
    y += 22;
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: 36, right: 36 },
      theme: 'grid',
      headStyles: { fillColor: [31, 111, 92], textColor: [255, 255, 255], fontSize: 8 },
      styles: { fontSize: 8.2, cellPadding: 4.5 },
      head: [['DOB / Date', 'Vaccines Completed / Status', 'Next Vaccine', 'Next Due Date', 'Growth / Context']],
      body: vaccineRows,
    });
    y = getCursorY(doc, y + 70);
  }

  // 9. PREVIOUS HOME VISIT HISTORY
  y = drawSectionHeading(doc, '8', 'Previous Home Visit History', y);
  if (report.visits.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.8);
    doc.setTextColor(100, 116, 139);
    doc.text('No previous home visits recorded for this patient.', 40, y + 4);
    y += 22;
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: 36, right: 36 },
      theme: 'grid',
      headStyles: { fillColor: [31, 111, 92], textColor: [255, 255, 255], fontSize: 8 },
      styles: { fontSize: 8.1, cellPadding: 4.5 },
      head: [['Visit Date', 'Purpose', 'Status', 'Risk', 'Recommended Action', 'Recorded By']],
      body: report.visits.map((v) => [
        v.visit_date,
        safeVal(v.purpose),
        v.status,
        v.risk_level,
        v.recommended_action || v.notes || 'Not recorded',
        safeVal(v.worker_name),
      ]),
    });
    y = getCursorY(doc, y + 70);
  }

  // 10. FOLLOW-UP APPOINTMENTS
  y = drawSectionHeading(doc, '9', 'Follow-up & Scheduled Appointments', y);
  if (report.appointments.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.8);
    doc.setTextColor(100, 116, 139);
    doc.text('No scheduled or past appointments recorded in the Smart Calendar.', 40, y + 4);
    y += 22;
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: 36, right: 36 },
      theme: 'grid',
      headStyles: { fillColor: [31, 111, 92], textColor: [255, 255, 255], fontSize: 8 },
      styles: { fontSize: 8.1, cellPadding: 4.5 },
      head: [['Date & Time', 'Type', 'Purpose', 'Status', 'Reminder', 'Notes']],
      body: report.appointments.map((a) => [
        `${a.appointment_date} ${a.appointment_time}`,
        a.appointment_type,
        a.purpose,
        a.status,
        a.reminder_sent ? 'Sent' : 'Pending',
        safeVal(a.notes),
      ]),
    });
    y = getCursorY(doc, y + 70);
  }

  // 11. IMPORTANT HEALTH ALERTS
  y = drawSectionHeading(doc, '10', 'Important Health & Danger Alerts', y);
  if (report.alerts.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.8);
    doc.setTextColor(100, 116, 139);
    doc.text('No emergency or danger alerts recorded for this patient.', 40, y + 4);
    y += 22;
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: 36, right: 36 },
      theme: 'grid',
      headStyles: { fillColor: [184, 50, 50], textColor: [255, 255, 255], fontSize: 8 },
      styles: { fontSize: 8.1, cellPadding: 4.5 },
      head: [['Date', 'Severity', 'Category', 'Danger Signs', 'Referral / Guidance', 'Status']],
      body: report.alerts.map((a) => [
        a.created_at.slice(0, 10),
        a.severity,
        a.category,
        a.danger_signs.join(', ') || 'Not recorded',
        `${a.referral_facility} — ${a.guidance}`,
        a.status,
      ]),
    });
    y = getCursorY(doc, y + 70);
  }

  // 12. RECENT HEALTH UPDATES (Notifications, Call Follow-ups, Voice Consultations)
  y = drawSectionHeading(doc, '11', 'Recent Health Updates, Call Logs & Voice Consultations', y);
  const updateRows: string[][] = [
    ...report.notifications.slice(0, 8).map((n) => [
      formatDateTime(n.created_at),
      `${n.channel} (${n.category})`,
      n.message_body,
      n.delivery_status,
    ]),
    ...report.callLogs.slice(0, 8).map((c) => [
      formatDateTime(c.call_initiated_at),
      'Phone Call Log',
      c.notes || `Phone: ${c.phone_number}`,
      c.outcome,
    ]),
    ...report.voiceInteractions.slice(0, 5).map((vi) => [
      formatDateTime(vi.created_at),
      'Voice Guidance',
      vi.guidance_text.slice(0, 220),
      vi.emergency_detected ? 'Emergency Flagged' : 'Saved',
    ]),
  ];

  if (updateRows.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.8);
    doc.setTextColor(100, 116, 139);
    doc.text('No recent health updates, call logs, or voice consultations recorded.', 40, y + 4);
    y += 22;
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: 36, right: 36 },
      theme: 'grid',
      headStyles: { fillColor: [31, 111, 92], textColor: [255, 255, 255], fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 4.5 },
      head: [['Date & Time', 'Update Type', 'Details', 'Status / Outcome']],
      body: updateRows,
    });
    y = getCursorY(doc, y + 70);
  }

  // 13. REPORT GENERATION DATE & AUTHENTICITY FOOTER
  applyPdfFooters(doc, reportId, generatedLabel);
  return doc;
}

function applyPdfFooters(doc: jsPDF, reportId: string, generatedLabel: string): void {
  const totalPages = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(215, 223, 213);
    doc.line(36, pageHeight - 36, pageWidth - 36, pageHeight - 36);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `AshaSakhi AI Confidential Patient Record · ${reportId} · Generated ${generatedLabel}`,
      36,
      pageHeight - 22
    );
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - 36, pageHeight - 22, { align: 'right' });
  }
}

export function downloadPatientReportPdf(
  report: PatientFullReportData,
  mode: 'full' | 'summary' = 'full'
): void {
  const doc = buildPatientReportPdf(report, mode);
  const safeName = report.patient.full_name.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  const suffix = mode === 'summary' ? 'Summary' : 'Full_Report';
  const datePart = report.generated_at.slice(0, 10);
  doc.save(`AshaSakhi_${report.patient.person_code}_${safeName}_${suffix}_${datePart}.pdf`);
}

export function createPatientReportPdfBlobUrl(
  report: PatientFullReportData,
  mode: 'full' | 'summary' = 'full'
): string {
  const doc = buildPatientReportPdf(report, mode);
  const blob = doc.output('blob');
  return URL.createObjectURL(blob);
}
