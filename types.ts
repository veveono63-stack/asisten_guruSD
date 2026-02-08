
export type UserStatus = 'pending' | 'approved' | 'rejected';
export type UserRole = 'admin' | 'teacher';

export interface User {
  id: string; // This will correspond to the Firebase Auth UID
  fullName: string;
  schoolName: string;
  className: string;
  email: string;
  username: string;
  status: UserStatus;
  role: UserRole;
}

export interface RegistrationData {
  fullName: string;
  schoolName: string;
  className: string;
  email: string;
  username: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  user?: User;
}

export interface SchoolIdentity {
  schoolName: string;
  npsn: string;
  nss: string;
  address: string;
  postalCode: string;
  phone: string;
  subdistrict: string;
  district: string;
  city: string;
  province: string;
  website: string;
  email: string;
  principalName: string;
  principalNip: string;
}

export interface Teacher {
  id: string;
  nip: string;
  nik: string;
  nuptk: string;
  fullName: string;
  gender: 'Laki-laki' | 'Perempuan';
  birthPlace: string;
  birthDate: string;
  employmentStatus: 'PNS' | 'PPPK' | 'GTT/GTY' | 'Honor Sekolah';
  position: string;
  lastEducation: string;
  religion: string;
  address: string;
  phone: string;
  email: string;
}

export interface Subject {
  id: string;
  code: string;
  name: string;
  hours: number;
}

export interface StudentAddress {
  street: string;
  rtRw: string;
  dusun: string;
  desa: string;
  kecamatan: string;
}

export interface StudentParents {
  ayah: string;
  ibu: string;
  wali: string;
}

export interface Student {
  id: string; // uuid for react key
  fullName: string;
  nickname: string;
  gender: 'L' | 'P' | '';
  nis: string;
  nisn: string;
  birthPlace: string;
  birthDate: string;
  religion: string;
  address: StudentAddress;
  parents: StudentParents;
  phone: string;
}

export interface AcademicEvent {
  id: string; // a unique id like uuid or timestamp
  date: string; // "YYYY-MM-DD"
  description: string;
  type: 'event' | 'holiday' | 'assessment';
}

export interface ClassSectionMember {
  id: string; // uuid
  name: string;
}

export interface ClassSection {
  id: string; // uuid
  name: string;
  members: ClassSectionMember[];
}

export interface ClassStructure {
  president: string;
  vicePresident: string;
  secretary1: string;
  secretary2: string;
  treasurer1: string;
  treasurer2: string;
  sections: ClassSection[];
}

export interface ScheduleSubject {
    senin: string;
    selasa: string;
    rabu: string;
    kamis: string;
    jumat: string;
    sabtu: string;
}

export interface ScheduleTimeSlot {
    id: string;
    lessonNumber: string;
    timeRange: string;
    subjects: ScheduleSubject;
}

export interface ClassScheduleData {
    timeSlots: ScheduleTimeSlot[];
}

export interface PiketScheduleData {
  quota: number;
  senin: string[]; // Array of student fullNames
  selasa: string[];
  rabu: string[];
  kamis: string[];
  jumat: string[];
  sabtu: string[];
}

export interface ClassAgreementData {
  agreements: string[];
}

export interface SeatingConfig {
    tablesPerRow: number;
    tablesPerColumn: number;
    studentsPerTable: number;
    totalTables: number;
}

export interface SeatingChartData {
    config: SeatingConfig;
    arrangement: string[][];
    teacherDeskPosition: 'front-left' | 'front-center' | 'front-right';
    lastRowPosition: 'left' | 'center' | 'right';
    lastRowSubPosition?: 'left' | 'right';
}

export interface InventoryItem {
  id: string;
  itemName: string;
  quantity: number;
  conditionGood: number;
  conditionLightDamage: number;
  conditionMediumDamage: number;
  conditionHeavyDamage: number;
  description: string;
}

export interface InventoryListData {
    items: InventoryItem[];
}

export interface SavingsTransaction {
  id: string; // uuid for react key
  date: string; // "YYYY-MM-DD" or empty
  deposit: number;
  withdrawal: number;
  balance: number;
  signature: string;
  notes: string;
}

export interface StudentSavings {
  studentId: string; // Corresponds to student's main ID
  studentName: string; // For display, might become stale if student name changes
  transactions: SavingsTransaction[];
}

export interface StudentSavingsData {
  savings: StudentSavings[];
}

export interface SupervisionLogEntry {
  id: string;
  date: string; // Tanggal
  supervisorName: string;
  position: string;
  subjectMatter: string; // Perihal
  result: string;
  feedback: string; // Kesan/Saran
  signature: string;
}

export interface SupervisionLogData {
  entries: SupervisionLogEntry[];
}

export interface MeetingMinuteEntry {
  id: string;
  dateTime: string; // Hari/Tanggal
  agenda: string; // Acara
  presenter: string; // Penyampai
  details: string; // Uraian, Kesimpulan
}

export interface MeetingMinutesData {
  entries: MeetingMinuteEntry[];
}

export interface GuidanceCounselingEntry {
  id: string;
  date: string;
  studentName: string;
  problem: string; // Masalah / Perilaku / Topik
  service: string; // Bentuk Layanan / Tindak Lanjut
  result: string; // Hasil
  description: string; // Keterangan
}

export interface GuidanceCounselingData {
  entries: GuidanceCounselingEntry[];
}

// New Types for Extracurricular
export interface ExtracurricularEntry {
    id: string;
    materi: string;
    rencanaPelaksanaan: string; // Minggu ke... Bulan...
    tanggal: string; // Date string YYYY-MM-DD
    jmlSiswa: number | string;
    hadir: number | string;
    tidakHadir: number | string;
    keterangan: string;
    signature: string; // Placeholder for visual checkmark or empty
}

export interface ExtracurricularActivity {
    id: string;
    name: string; // e.g. "Pramuka"
    pembina: string; // Nama Pembina
    entries: ExtracurricularEntry[];
}

export interface ExtracurricularData {
    activities: ExtracurricularActivity[];
}

export interface KKTPItem {
  id: string; // for react key
  text: string;
}

export interface LearningObjectiveItem {
  id: string;
  text: string;
  kktp?: KKTPItem[];
}

export interface LearningOutcomeItem {
  id: string; // for react key
  text: string;
  objectives?: LearningObjectiveItem[];
}

export interface LearningOutcomeElement {
  id: string; // for react key
  elementName: string;
  outcomes: LearningOutcomeItem[];
}

export interface LearningOutcomesData {
    elements: LearningOutcomeElement[];
}

export interface ATPRow {
  id: string;
  element: string;
  learningGoalPathway: string;
  material: string;
  materialScope: string;
}

export interface ATPData {
    rows: ATPRow[];
}

export interface KKTPAchievementLevels {
    belumTercapai: string;
    tercapaiSebagian: string;
    tuntas: string;
    tuntasPlus: string;
}

export interface KKTPIntervals {
    interval1: string; // e.g., "< 60"
    interval2: string; // e.g., "60 - 72"
    interval3: string; // e.g., "73 - 86"
    interval4: string; // e.g., "87 - 100"
}

export interface KKTPRow {
  id: string; // Composite key: `${originalId}_${atpIndex}`
  originalId: string;
  material: string;
  learningGoalPathway: string; // A single ATP line
  kktp: KKTPAchievementLevels;
}


export interface KKTPData {
    intervals: KKTPIntervals;
    rows: KKTPRow[];
}

export interface ProtaRow {
  id: string; // from ATPRow id
  material: string;
  learningGoalPathway: string;
  materialScope: string;
  alokasiWaktu: number;
}

export interface ProtaData {
    ganjilRows: ProtaRow[];
    genapRows: ProtaRow[];
}

export interface ProsemBulanCheckboxes {
  // bulan 1-6, minggu 1-5
  b1_m1: boolean; b1_m2: boolean; b1_m3: boolean; b1_m4: boolean; b1_m5: boolean;
  b2_m1: boolean; b2_m2: boolean; b2_m3: boolean; b2_m4: boolean; b2_m5: boolean;
  b3_m1: boolean; b3_m2: boolean; b3_m3: boolean; b3_m4: boolean; b3_m5: boolean;
  b4_m1: boolean; b4_m2: boolean; b4_m3: boolean; b4_m4: boolean; b4_m5: boolean;
  b5_m1: boolean; b5_m2: boolean; b5_m3: boolean; b5_m4: boolean; b5_m5: boolean;
  b6_m1: boolean; b6_m2: boolean; b6_m3: boolean; b6_m4: boolean; b6_m5: boolean;
}

export interface ProsemRow {
  // Derived from PROTA/ATP
  id: string; // Composite key: `${protaRowId}_${lingkupIndex}` or `${protaRowId}_slm`
  protaRowId: string; // To group by Materi/Tema
  materi: string;
  atp: string; // The full ATP text block from PROTA
  lingkupMateri: string; // A single line from PROTA's lingkup materi OR "Sumatif Lingkup Materi (SLM)"

  // Stored in Firestore
  alokasiWaktu: number;
  pekan: ProsemBulanCheckboxes;
  keterangan: string;
  isSLM?: boolean;
}

export interface ProsemData {
    rows: ProsemRow[];
}

export interface ModulAjar {
  id: string; // matches protaRowId (Topic ID)
  identifikasi: string[]; // Array of selected dimensions (e.g., ['Keimanan', 'Kreativitas'])
  tujuanPembelajaran: string; // from Prosem/ATP
  modelPembelajaran: string; 
  metodePembelajaran: string; 
  kemitraan: string;
  // Split Lingkungan Pembelajaran
  lingkunganFisik: string; // "Ruang Fisik/Virtual"
  lingkunganBudaya: string; // "Budaya Belajar"
  digital: string;
  pengalaman: string; // The full text for meetings
  // Split Asesmen
  asesmenAwal: string;
  asesmenFormatif: string;
  asesmenSumatif: string;
}

export interface ModulAjarData {
  [key: string]: ModulAjar; // key is protaRowId
}

export interface KokurikulerTheme {
    id: string;
    name: string;
    description: string;
    totalJp?: number;
    status?: 'aktif' | 'tidak aktif';
}

// New Types for Activities
export interface KokurikulerDimension {
    name: string; // e.g., "Beriman..."
    elements: string[]; // e.g., ["Akhlak beragama", "Akhlak pribadi"]
}

export interface KokurikulerActivity {
    id: string;
    themeId: string; // Links to KokurikulerTheme.id
    name: string;
    goal: string; // Tujuan Akhir
    dimensions: KokurikulerDimension[]; // Selected dimensions
    activityJp?: number; // New: Alokasi Waktu Kegiatan
    executionWeek?: string; // New: Pelaksanaan (Minggu Efektif ke...)
    relatedSubjects?: string[]; // New: Mata Pelajaran Terkait
}

export interface KokurikulerPlanning {
    activityId: string;
    // C. Praktik Pedagogis
    modelPembelajaran: string;
    metodePembelajaran: string;
    // D. Lingkungan Belajar
    ruangFisik: string;
    budayaBelajar: string;
    // E. Kemitraan
    kemitraan: string;
    // F. Digital
    digital: string;
    // G. Kegiatan (Per minggu)
    kegiatanMingguan: { mingguKe: number; deskripsi: string }[];
    // H. Asesmen
    asesmenAwal: string;
    asesmenFormatif: string;
    asesmenSumatif: string;
}

export interface KokurikulerData {
    themes: KokurikulerTheme[];
    activities?: KokurikulerActivity[];
    planning?: Record<string, KokurikulerPlanning>;
}
