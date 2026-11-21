import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import writeXlsxFile, { type Row, type SheetData } from 'write-excel-file/browser';
import type { FieldVisit, NFHS5District } from '../types';
import { KARNATAKA_DISTRICTS, KARNATAKA_NFHS5_BASELINE } from '../data/nfhs5Karnataka';

export function exportVisitsToPdf(visits: FieldVisit[], filterSummary: string): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const generatedAt = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text('AshaSakhi-AI — Karnataka ASHA Field Visit Register', 40, 42);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Generated: ${generatedAt}  |  Scope: ${filterSummary}  |  Total Records: ${visits.length}`, 40, 58);

  const highCount = visits.filter((v) => v.risk_level === 'High').length;
  const modCount = visits.filter((v) => v.risk_level === 'Moderate').length;
  const lowCount = visits.filter((v) => v.risk_level === 'Low').length;
  doc.text(
    `Clinical Risk Summary — High Risk: ${highCount}   Moderate Risk: ${modCount}   Low Risk: ${lowCount}`,
    40,
    73
  );

  autoTable(doc, {
    startY: 88,
    head: [
      [
        'Visit Date',
        'Beneficiary',
        'Category',
        'District / Village',
        'Vitals (BP / Hb)',
        'IFA / Immunization',
        'Risk Tier',
        'Recommended Clinical Action',
      ],
    ],
    body: visits.map((v) => [
      v.visit_date,
      `${v.beneficiary_name}${v.beneficiary_age !== null ? ` (${v.beneficiary_age}y)` : ''}`,
      v.beneficiary_category,
      `${v.district} / ${v.village}`,
      `${v.bp_systolic && v.bp_diastolic ? `${v.bp_systolic}/${v.bp_diastolic}` : '—'} | ${
        v.hemoglobin_gdl !== null ? `${v.hemoglobin_gdl} g/dL` : '—'
      }`,
      `${v.ifa_tablets_given} tabs · ${v.immunization_status}`,
      v.risk_level,
      v.recommended_action || 'Routine follow-up',
    ]),
    styles: {
      fontSize: 8.2,
      cellPadding: 5,
      textColor: [15, 23, 42],
      lineColor: [226, 232, 240],
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: [15, 118, 110],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 64 },
      1: { cellWidth: 92 },
      2: { cellWidth: 82 },
      3: { cellWidth: 102 },
      4: { cellWidth: 96 },
      5: { cellWidth: 105 },
      6: { cellWidth: 56 },
      7: { cellWidth: 'auto' },
    },
  });

  doc.save(`AshaSakhi-Karnataka-Register-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function exportNfhs5DistrictPdf(district: NFHS5District): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text(`NFHS-5 Karnataka District Health Profile — ${district.district}`, 40, 44);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Division: ${district.division}  |  Source: NFHS-5 (2019–21) MoHFW Fact Sheet  |  Key PHCs: ${district.samplePhcs.join(', ')}`,
    40,
    62
  );

  const rows = [
    ['Institutional Births (%)', `${district.institutionalBirthsPct.toFixed(1)}%`, `${KARNATAKA_NFHS5_BASELINE.institutionalBirthsPct.toFixed(1)}%`],
    ['Mothers with 4+ ANC Visits (%)', `${district.fourPlusAncPct.toFixed(1)}%`, `${KARNATAKA_NFHS5_BASELINE.fourPlusAncPct.toFixed(1)}%`],
    ['Mothers Consuming IFA >= 100 Days (%)', `${district.ifa100DaysPct.toFixed(1)}%`, `${KARNATAKA_NFHS5_BASELINE.ifa100DaysPct.toFixed(1)}%`],
    ['Children (12–23m) Fully Immunized (%)', `${district.fullImmunizationPct.toFixed(1)}%`, `${KARNATAKA_NFHS5_BASELINE.fullImmunizationPct.toFixed(1)}%`],
    ['Exclusive Breastfeeding (<6m) (%)', `${district.exclusiveBreastfeedingPct.toFixed(1)}%`, `${KARNATAKA_NFHS5_BASELINE.exclusiveBreastfeedingPct.toFixed(1)}%`],
    ['Children Under 5 Stunted (%)', `${district.childStuntingPct.toFixed(1)}%`, `${KARNATAKA_NFHS5_BASELINE.childStuntingPct.toFixed(1)}%`],
    ['Children Under 5 Wasted (%)', `${district.childWastingPct.toFixed(1)}%`, `${KARNATAKA_NFHS5_BASELINE.childWastingPct.toFixed(1)}%`],
    ['Children Under 5 Underweight (%)', `${district.childUnderweightPct.toFixed(1)}%`, `${KARNATAKA_NFHS5_BASELINE.childUnderweightPct.toFixed(1)}%`],
    ['Pregnant Women Anaemic (<11.0 g/dL) (%)', `${district.pregnantAnaemiaPct.toFixed(1)}%`, `${KARNATAKA_NFHS5_BASELINE.pregnantAnaemiaPct.toFixed(1)}%`],
    ['All Women (15–49y) Anaemic (%)', `${district.allWomenAnaemiaPct.toFixed(1)}%`, `${KARNATAKA_NFHS5_BASELINE.allWomenAnaemiaPct.toFixed(1)}%`],
    ['Children (6–59m) Anaemic (%)', `${district.childAnaemiaPct.toFixed(1)}%`, `${KARNATAKA_NFHS5_BASELINE.childAnaemiaPct.toFixed(1)}%`],
  ];

  autoTable(doc, {
    startY: 82,
    head: [['NFHS-5 Public Health Indicator', district.district, 'Karnataka State Baseline']],
    body: rows,
    headStyles: { fillColor: [15, 118, 110], textColor: [255, 255, 255] },
    styles: { fontSize: 9.5, cellPadding: 7 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  doc.save(`NFHS5-Karnataka-${district.district.replace(/\s+/g, '-')}.pdf`);
}

function headerRow(labels: string[]): Row {
  return labels.map((label) => ({
    value: label,
    fontWeight: 'bold' as const,
  }));
}

export async function exportWorkbookToExcel(visits: FieldVisit[]): Promise<void> {
  const visitData: SheetData = [
    headerRow([
      'Visit ID',
      'Visit Date',
      'ASHA Worker',
      'Beneficiary Name',
      'Age',
      'Category',
      'District',
      'Village',
      'PHC Center',
      'Language',
      'BP Systolic',
      'BP Diastolic',
      'Hemoglobin (g/dL)',
      'Weight (kg)',
      'Gestational Weeks',
      'Immunization Status',
      'IFA Tablets Given',
      'Symptoms',
      'Risk Level',
      'Risk Flags',
      'Recommended Action',
      'Follow-up Date',
      'Latitude',
      'Longitude',
    ]),
    ...visits.map((v): Row => [
      { value: v.id, type: Number },
      { value: v.visit_date, type: String },
      { value: v.worker_name, type: String },
      { value: v.beneficiary_name, type: String },
      { value: v.beneficiary_age ?? undefined, type: Number },
      { value: v.beneficiary_category, type: String },
      { value: v.district, type: String },
      { value: v.village, type: String },
      { value: v.phc_center, type: String },
      { value: v.language.toUpperCase(), type: String },
      { value: v.bp_systolic ?? undefined, type: Number },
      { value: v.bp_diastolic ?? undefined, type: Number },
      { value: v.hemoglobin_gdl ?? undefined, type: Number },
      { value: v.weight_kg ?? undefined, type: Number },
      { value: v.gestational_weeks ?? undefined, type: Number },
      { value: v.immunization_status, type: String },
      { value: v.ifa_tablets_given, type: Number },
      { value: v.symptoms, type: String },
      { value: v.risk_level, type: String },
      { value: v.risk_flags.join('; '), type: String },
      { value: v.recommended_action, type: String },
      { value: v.follow_up_date, type: String },
      { value: v.lat, type: Number },
      { value: v.lng, type: Number },
    ]),
  ];

  const nfhsData: SheetData = [
    headerRow([
      'District',
      'Division',
      'Institutional Births (%)',
      '4+ ANC Visits (%)',
      'IFA >= 100 Days (%)',
      'Full Immunization 12-23m (%)',
      'Exclusive Breastfeeding (%)',
      'Child Stunting <5y (%)',
      'Child Wasting <5y (%)',
      'Child Underweight <5y (%)',
      'Pregnant Women Anaemia (%)',
      'All Women Anaemia (%)',
      'Child Anaemia 6-59m (%)',
    ]),
    ...KARNATAKA_DISTRICTS.map((d): Row => [
      { value: d.district, type: String },
      { value: d.division, type: String },
      { value: d.institutionalBirthsPct, type: Number },
      { value: d.fourPlusAncPct, type: Number },
      { value: d.ifa100DaysPct, type: Number },
      { value: d.fullImmunizationPct, type: Number },
      { value: d.exclusiveBreastfeedingPct, type: Number },
      { value: d.childStuntingPct, type: Number },
      { value: d.childWastingPct, type: Number },
      { value: d.childUnderweightPct, type: Number },
      { value: d.pregnantAnaemiaPct, type: Number },
      { value: d.allWomenAnaemiaPct, type: Number },
      { value: d.childAnaemiaPct, type: Number },
    ]),
  ];

  await writeXlsxFile([
    { sheet: 'ASHA Field Visits', data: visitData },
    { sheet: 'NFHS-5 Karnataka', data: nfhsData },
  ]).toFile(`AshaSakhi-Karnataka-Export-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function exportVisitsToExcel(visits: FieldVisit[], _filterSummary?: string): Promise<void> {
  return exportWorkbookToExcel(visits);
}

export function exportReportsSummaryToPdf(summary: import('../types').ReportsSummary): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const generatedAt = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text('AshaSakhi — Village & Sub-Centre Health Summary Report', 40, 44);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Generated: ${generatedAt}  |  Source: Locally Collected AshaSakhi Application Records`, 40, 60);

  const t = summary.totals;
  autoTable(doc, {
    startY: 78,
    head: [['Program Metric', 'Recorded Count']],
    body: [
      ['Registered Village Families', String(t.families)],
      ['Registered People in Directory', String(t.people)],
      ['Total Household Field Visits', String(t.visits)],
      ['Pregnant / Postnatal Women Tracked', `${t.pregnantWomen} (${t.highRiskPregnancies} High-Risk)`],
      ['Registered Children (0–5y)', String(t.children)],
      ['Children with Logged Vaccinations', `${t.vaccinatedChildren} (${t.totalVaccinesLogged} total doses)`],
      ['Health Checkups Completed / Pending', `${t.completedCheckups} Completed · ${t.pendingCheckups} Pending`],
      ['Danger Alerts Active / Resolved', `${t.activeAlerts} Active · ${t.resolvedAlerts} Resolved`],
      ['Saved Voice Assistant Interactions', String(t.voiceInteractions)],
    ],
    headStyles: { fillColor: [31, 111, 92], textColor: [255, 255, 255] },
    styles: { fontSize: 9.5, cellPadding: 6 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 340;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('Village-Wise Coverage Breakdown', 40, finalY + 26);

  autoTable(doc, {
    startY: finalY + 36,
    head: [['Village', 'District', 'Families', 'People', 'Visits', 'Checkups', 'Active Alerts']],
    body: summary.villageStats.map((v) => [
      v.village,
      v.district,
      String(v.families),
      String(v.people),
      String(v.visits),
      String(v.checkups),
      String(v.activeAlerts),
    ]),
    headStyles: { fillColor: [31, 111, 92], textColor: [255, 255, 255] },
    styles: { fontSize: 9, cellPadding: 5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  doc.save(`AshaSakhi-Summary-Report-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export async function exportReportsSummaryToExcel(summary: import('../types').ReportsSummary): Promise<void> {
  const t = summary.totals;
  const overviewData: SheetData = [
    headerRow(['Metric', 'Value']),
    [{ value: 'Registered Families', type: String }, { value: t.families, type: Number }],
    [{ value: 'Registered People', type: String }, { value: t.people, type: Number }],
    [{ value: 'Total Field Visits', type: String }, { value: t.visits, type: Number }],
    [{ value: 'Pregnant Women Tracked', type: String }, { value: t.pregnantWomen, type: Number }],
    [{ value: 'High-Risk Pregnancies', type: String }, { value: t.highRiskPregnancies, type: Number }],
    [{ value: 'Registered Children (0-5y)', type: String }, { value: t.children, type: Number }],
    [{ value: 'Vaccinated Children', type: String }, { value: t.vaccinatedChildren, type: Number }],
    [{ value: 'Completed Health Checkups', type: String }, { value: t.completedCheckups, type: Number }],
    [{ value: 'Pending Follow-up Checkups', type: String }, { value: t.pendingCheckups, type: Number }],
    [{ value: 'Active Danger Alerts', type: String }, { value: t.activeAlerts, type: Number }],
    [{ value: 'Resolved Danger Alerts', type: String }, { value: t.resolvedAlerts, type: Number }],
    [{ value: 'Saved Voice Interactions', type: String }, { value: t.voiceInteractions, type: Number }],
  ];

  const villageData: SheetData = [
    headerRow(['Village', 'District', 'Families', 'People', 'Visits', 'Checkups', 'Active Alerts']),
    ...summary.villageStats.map((v): Row => [
      { value: v.village, type: String },
      { value: v.district, type: String },
      { value: v.families, type: Number },
      { value: v.people, type: Number },
      { value: v.visits, type: Number },
      { value: v.checkups, type: Number },
      { value: v.activeAlerts, type: Number },
    ]),
  ];

  await writeXlsxFile([
    { sheet: 'Program Totals', data: overviewData },
    { sheet: 'Village Breakdown', data: villageData },
  ]).toFile(`AshaSakhi-Summary-Report-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

