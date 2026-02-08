
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch, addDoc, deleteDoc, WriteBatch } from 'firebase/firestore';
import { db } from '../firebase/config';
/* COMMENT: Fixed incorrect type import name 'GuidanceCounselingBook' to 'GuidanceCounselingData' */
/* COMMENT: Removed duplicate import of LearningOutcomeItem on line 5 */
import { SchoolIdentity, Student, Subject, Teacher, User, UserStatus, AcademicEvent, ClassStructure, ClassScheduleData, PiketScheduleData, ClassAgreementData, SeatingChartData, InventoryListData, InventoryItem, StudentSavingsData, StudentSavings, SavingsTransaction, SupervisionLogData, SupervisionLogEntry, MeetingMinutesData, GuidanceCounselingData, LearningOutcomeElement, LearningOutcomesData, LearningOutcomeItem, LearningObjectiveItem, ATPData, KKTPData, KKTPAchievementLevels, KKTPIntervals, ATPRow, KKTPRow, ProtaData, ProtaRow, ProsemData, ProsemRow, ProsemBulanCheckboxes, ModulAjar, ModulAjarData, KokurikulerTheme, KokurikulerActivity, KokurikulerPlanning, ExtracurricularData, ExtracurricularActivity } from '../types';
import { Type } from '@google/genai';
import { generateContentWithRotation } from './geminiService';

// --- Helpers ---
const getAcademicYearDocId = (year: string) => year.replace('/', '-');
const getClassDocId = (classLevel: string) => classLevel ? classLevel.toLowerCase().replace(' ', '-') : 'unknown-class';
const getPhaseDocId = (classLevel: string): string => {
    if (!classLevel) return 'fase-unknown';
    const romanMap: { [key: string]: number } = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6 };
    const roman = classLevel.replace('Kelas ', '');
    const classNumber = romanMap[roman] || 0;
    if (classNumber <= 2) return 'fase-a';
    if (classNumber <= 4) return 'fase-b';
    return 'fase-c';
};

const getPathRoot = (userId?: string) => userId ? `teachersData/${userId}/schoolData` : 'schoolData';

export const defaultSchedule: ClassScheduleData = {
    timeSlots: [
        { id: '1', lessonNumber: '1', timeRange: '07:00 - 07:35', subjects: { senin: 'Upacara', selasa: '', rabu: '', kamis: '', jumat: '', sabtu: '' } },
        { id: '2', lessonNumber: '2', timeRange: '07:35 - 08:10', subjects: { senin: '', selasa: '', rabu: '', kamis: '', jumat: '', sabtu: '' } },
        { id: '3', lessonNumber: '3', timeRange: '08:10 - 08:45', subjects: { senin: '', selasa: '', rabu: '', kamis: '', jumat: '', sabtu: '' } },
        { id: 'break', lessonNumber: '-', timeRange: '08:45 - 09:15', subjects: { senin: 'Istirahat', selasa: 'Istirahat', rabu: 'Istirahat', kamis: 'Istirahat', jumat: 'Istirahat', sabtu: 'Istirahat' } },
        { id: '4', lessonNumber: '4', timeRange: '09:15 - 09:50', subjects: { senin: '', selasa: '', rabu: '', kamis: '', jumat: '', sabtu: '' } },
        { id: '5', lessonNumber: '5', timeRange: '09:50 - 10:25', subjects: { senin: '', selasa: '', rabu: '', kamis: '', jumat: '', sabtu: '' } },
        { id: '6', lessonNumber: '6', timeRange: '10:25 - 11:00', subjects: { senin: '', selasa: '', rabu: '', kamis: '', jumat: '', sabtu: '' } },
    ]
};

// --- User Management ---
export const getTeacherUsers = async (): Promise<User[]> => {
    try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('role', '==', 'teacher'));
        const querySnapshot = await getDocs(q);
        const users: User[] = [];
        querySnapshot.forEach((doc) => {
            users.push({ id: doc.id, ...doc.data() } as User);
        });
        return users;
    } catch (error) {
        throw new Error("Gagal mengambil data pengguna.");
    }
};

export const updateUserStatus = async (userId: string, status: UserStatus): Promise<void> => {
    try {
        const userDocRef = doc(db, 'users', userId);
        await updateDoc(userDocRef, { status });
    } catch (error) {
        throw new Error("Gagal memperbarui status pengguna.");
    }
};

/**
 * Menghapus pengguna dan melakukan pembersihan data secara menyeluruh (Deep Clean).
 * Menggunakan Multi-Batch untuk menghindari limit 500 operasi Firestore.
 */
export const deleteUser = async (userId: string, username: string): Promise<void> => {
    try {
        const userDocRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userDocRef);
        if (!userSnap.exists()) {
            throw new Error("Pengguna tidak ditemukan di database.");
        }
        
        const userData = userSnap.data() as User;
        const years = ['2024-2025', '2025-2026', '2026-2027', '2027-2028'];
        const semesters = ['ganjil', 'genap'];
        const classDocId = getClassDocId(userData.className);
        const phaseDocId = getPhaseDocId(userData.className);

        let currentBatch = writeBatch(db);
        let operationCount = 0;

        const commitIfFull = async () => {
            if (operationCount >= 400) { 
                await currentBatch.commit();
                currentBatch = writeBatch(db);
                operationCount = 0;
            }
        };

        // 1. Hapus Dokumen Identitas Utama
        currentBatch.delete(userDocRef);
        operationCount++;
        currentBatch.delete(doc(db, 'usernames', username.toLowerCase()));
        operationCount++;
        currentBatch.delete(doc(db, `teachersData/${userId}/schoolData`, 'identity'));
        operationCount++;

        // 2. Iterasi Tahun Ajaran
        for (const yearId of years) {
            const yearPath = `teachersData/${userId}/schoolData/${yearId}`;
            const classPath = `${yearPath}/${classDocId}`;

            // Hapus Administrasi Umum Kelas
            const adminDocs = [
                'studentList', 'teacherProfile', 'classStructure', 'classSchedule', 
                'piketSchedule', 'classAgreement', 'seatingChart', 'inventoryList', 'studentSavings'
            ];
            
            for (const docName of adminDocs) {
                currentBatch.delete(doc(db, classPath, docName));
                operationCount++;
                await commitIfFull();
            }

            for (const sem of semesters) {
                currentBatch.delete(doc(db, classPath, `supervisionLog-${sem}`));
                operationCount++;
                currentBatch.delete(doc(db, classPath, `meetingMinutes-${sem}`));
                operationCount++;
                currentBatch.delete(doc(db, classPath, `extracurricular-${sem}`));
                operationCount++;
                await commitIfFull();
            }

            // 3. Hapus Perangkat Pembelajaran (dengan pengamanan ekstra)
            try {
                const subjectsRef = collection(db, classPath, 'data', 'subjects');
                const subSnap = await getDocs(subjectsRef);
                
                for (const subDoc of subSnap.docs) {
                    const subId = subDoc.id;
                    
                    currentBatch.delete(doc(db, yearPath, phaseDocId, 'data', 'subjects', subId, 'learningOutcomes', 'main'));
                    operationCount++;
                    currentBatch.delete(doc(db, yearPath, phaseDocId, 'data', 'subjects', subId, 'learningObjectives', 'main'));
                    operationCount++;
                    await commitIfFull();

                    for (const sem of semesters) {
                        const docId = `${subId}_${sem}`;
                        currentBatch.delete(doc(db, classPath, 'data', 'atp', docId));
                        operationCount++;
                        currentBatch.delete(doc(db, classPath, 'data', 'kktp', docId));
                        operationCount++;
                        currentBatch.delete(doc(db, classPath, 'data', 'prosem', docId));
                        operationCount++;
                        currentBatch.delete(doc(db, classPath, 'data', 'modulAjar', docId));
                        operationCount++;
                        await commitIfFull();
                    }

                    currentBatch.delete(doc(db, classPath, 'data', 'prota', subId));
                    operationCount++;
                    currentBatch.delete(subDoc.ref);
                    operationCount++;
                    await commitIfFull();
                }
            } catch (e) {
                console.warn(`Folder data untuk tahun ${yearId} tidak ditemukan atau kosong.`);
            }

            // Hapus Program Kokurikuler
            for (const sem of semesters) {
                currentBatch.delete(doc(db, yearPath, phaseDocId, 'data', 'programKokurikuler', sem));
                operationCount++;
                await commitIfFull();
            }
        }

        if (operationCount > 0) {
            await currentBatch.commit();
        }
        
        console.log(`Deep Clean user ${userId} selesai.`);
    } catch (error: any) {
        console.error("Deep delete failure:", error);
        throw new Error(error.message || "Gagal menghapus seluruh data guru.");
    }
};

// --- School Identity ---
export const getSchoolIdentity = async (userId?: string): Promise<SchoolIdentity | null> => {
    try {
        const docRef = doc(db, getPathRoot(userId), 'identity');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return docSnap.data() as SchoolIdentity;
        }
        return null;
    } catch (error) {
        console.error("Firestore getSchoolIdentity Error:", error);
        throw new Error("Gagal mengambil data identitas sekolah.");
    }
};

export const updateSchoolIdentity = async (data: SchoolIdentity, userId?: string): Promise<void> => {
    try {
        const docRef = doc(db, getPathRoot(userId), 'identity');
        await setDoc(docRef, data, { merge: true });

        // SINKRONISASI: Jika userId ada, perbarui kolom schoolName di profil user utama
        if (userId) {
            const userRef = doc(db, 'users', userId);
            await updateDoc(userRef, { schoolName: data.schoolName });
        }
    } catch (error) {
        throw new Error("Gagal memperbarui identitas sekolah.");
    }
};

// --- Teacher Profile ---
export const getTeacherProfile = async (academicYear: string, classLevel: string, userId?: string): Promise<Teacher> => {
    try {
        const yearDocId = getAcademicYearDocId(academicYear);
        const classDocId = getClassDocId(classLevel);
        const docRef = doc(db, getPathRoot(userId), yearDocId, classDocId, 'teacherProfile');
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            return { id: docSnap.id, ...docSnap.data() } as Teacher;
        }
        return { id: 'blank', fullName: '', nip: '', nuptk: '', position: `Guru ${classLevel}` } as any;
    } catch (error) {
        console.error("Firestore getTeacherProfile Error:", error);
        throw new Error("Gagal mengambil data profil guru.");
    }
};

export const updateTeacherProfile = async (academicYear: string, classLevel: string, data: Omit<Teacher, 'id'>, userId?: string): Promise<void> => {
    try {
        const yearDocId = getAcademicYearDocId(academicYear);
        const classDocId = getClassDocId(classLevel);
        const docRef = doc(db, getPathRoot(userId), yearDocId, classDocId, 'teacherProfile');
        await setDoc(docRef, data, { merge: true });
    } catch (error) {
        throw new Error("Gagal memperbarui profil guru.");
    }
};

// --- Mata Pelajaran ---
export const getSubjects = async (academicYear: string, classLevel: string, userId?: string): Promise<Subject[]> => {
    try {
        const yearDocId = getAcademicYearDocId(academicYear);
        const classDocId = getClassDocId(classLevel);
        const subjectsRef = collection(db, getPathRoot(userId), yearDocId, classDocId, 'data', 'subjects');
        const querySnapshot = await getDocs(subjectsRef);
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Subject));
    } catch (error) {
        return [];
    }
};

export const addSubject = async (academicYear: string, classLevel: string, subjectData: Omit<Subject, 'id'>, userId?: string): Promise<Subject> => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const docId = subjectData.code.toLowerCase().replace(/[\s/()]/g, '-');
    const subjectDocRef = doc(db, getPathRoot(userId), yearDocId, classDocId, 'data', 'subjects', docId);
    await setDoc(subjectDocRef, subjectData);
    return { id: docId, ...subjectData };
};

export const updateSubject = async (academicYear: string, classLevel: string, subjectId: string, subjectData: Partial<Omit<Subject, 'id'>>, userId?: string): Promise<void> => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const subjectDocRef = doc(db, getPathRoot(userId), yearDocId, classDocId, 'data', 'subjects', subjectId);
    await updateDoc(subjectDocRef, subjectData);
};

export const deleteSubject = async (academicYear: string, classLevel: string, subjectId: string, userId?: string): Promise<void> => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const docRef = doc(db, getPathRoot(userId), yearDocId, classDocId, 'data', 'subjects', subjectId);
    await deleteDoc(docRef);
};

// --- Fungsi Khusus: Tarik Mata Pelajaran dari Induk ---
export const pullSubjectsToTeacher = async (academicYear: string, classLevel: string, userId: string) => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const rootPath = getPathRoot(userId);
    
    const adminSubjectsRef = collection(db, 'schoolData', yearDocId, classDocId, 'data', 'subjects');
    const adminSnap = await getDocs(adminSubjectsRef);
    
    if (adminSnap.empty) {
        throw new Error("Daftar pelajaran di induk admin belum diisi untuk kelas ini.");
    }
    
    const batch = writeBatch(db);
    const pulledSubjects: Subject[] = [];

    adminSnap.forEach(docSnap => {
        const data = docSnap.data();
        const teacherSubRef = doc(db, rootPath, yearDocId, classDocId, 'data', 'subjects', docSnap.id);
        batch.set(teacherSubRef, data);
        pulledSubjects.push({ id: docSnap.id, ...data } as Subject);
    });
    
    await batch.commit();
    return pulledSubjects;
};

// --- Siswa ---
export const getStudents = async (academicYear: string, classLevel: string, userId?: string): Promise<Student[]> => {
    try {
        const yearDocId = getAcademicYearDocId(academicYear);
        const classDocId = getClassDocId(classLevel);
        const docRef = doc(db, getPathRoot(userId), yearDocId, classDocId, 'studentList');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().students) {
            return docSnap.data().students as Student[];
        }
        return Array.from({ length: 25 }, (_, i) => ({ id: `default-${i}`, fullName: '', nickname: '', address: {}, parents: {} } as any));
    } catch (error) {
        return [];
    }
};

export const updateStudents = async (academicYear: string, classLevel: string, students: Student[], userId?: string): Promise<void> => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const docRef = doc(db, getPathRoot(userId), yearDocId, classDocId, 'studentList');
    await setDoc(docRef, { students });
};

// --- Kalender Pendidikan ---
export const getCalendarEvents = async (academicYear: string, userId?: string): Promise<AcademicEvent[]> => {
    try {
        const yearDocId = getAcademicYearDocId(academicYear);
        const docRef = doc(db, getPathRoot(userId), yearDocId, 'calendarData', 'events');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().events) {
            return docSnap.data().events as AcademicEvent[];
        }
        return [];
    } catch (error) {
        return [];
    }
};

export const saveCalendarEvents = async (academicYear: string, events: AcademicEvent[], userId?: string): Promise<void> => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const docRef = doc(db, getPathRoot(userId), yearDocId, 'calendarData', 'events');
    await setDoc(docRef, { events });
};

// --- Fungsi Khusus Kalender: Tarik Kalender dari Induk ---
export const pullCalendarDataToTeacher = async (academicYear: string, userId: string) => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const rootPath = getPathRoot(userId);
    
    const adminRef = doc(db, 'schoolData', yearDocId, 'calendarData', 'events');
    const adminSnap = await getDoc(adminRef);
    
    if (adminSnap.exists()) {
        const teacherCalRef = doc(db, rootPath, yearDocId, 'calendarData', 'events');
        await setDoc(teacherCalRef, adminSnap.data());
        return adminSnap.data().events as AcademicEvent[];
    } else {
        throw new Error("Data kalender di induk admin belum diisi.");
    }
};

// --- Struktur Organisasi ---
export const getClassStructure = async (academicYear: string, classLevel: string, userId?: string): Promise<ClassStructure> => {
    try {
        const yearDocId = getAcademicYearDocId(academicYear);
        const classDocId = getClassDocId(classLevel);
        const docRef = doc(db, getPathRoot(userId), yearDocId, classDocId, 'classStructure');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) return docSnap.data() as ClassStructure;
        return { president: '', vicePresident: '', secretary1: '', secretary2: '', treasurer1: '', treasurer2: '', sections: [] };
    } catch (error) {
        return { president: '', vicePresident: '', secretary1: '', secretary2: '', treasurer1: '', treasurer2: '', sections: [] };
    }
};

export const updateClassStructure = async (academicYear: string, classLevel: string, data: ClassStructure, userId?: string): Promise<void> => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const docRef = doc(db, getPathRoot(userId), yearDocId, classDocId, 'classStructure');
    await setDoc(docRef, data);
};

// --- Jadwal Pelajaran ---
export const getClassSchedule = async (academicYear: string, classLevel: string, userId?: string): Promise<ClassScheduleData> => {
    try {
        const yearDocId = getAcademicYearDocId(academicYear);
        const classDocId = getClassDocId(classLevel);
        const docRef = doc(db, getPathRoot(userId), yearDocId, classDocId, 'classSchedule');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) return docSnap.data() as ClassScheduleData;
        return { timeSlots: [] };
    } catch (error) {
        return { timeSlots: [] };
    }
};

export const updateClassSchedule = async (academicYear: string, classLevel: string, data: ClassScheduleData, userId?: string): Promise<void> => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const docRef = doc(db, getPathRoot(userId), yearDocId, classDocId, 'classSchedule');
    await setDoc(docRef, data);
};

// --- Fungsi Khusus Jadwal: Tarik Jadwal dari Induk ---
export const pullClassScheduleToTeacher = async (academicYear: string, classLevel: string, userId: string) => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const rootPath = getPathRoot(userId);
    
    const adminRef = doc(db, 'schoolData', yearDocId, classDocId, 'classSchedule');
    const adminSnap = await getDoc(adminRef);
    
    if (adminSnap.exists()) {
        const teacherRef = doc(db, rootPath, yearDocId, classDocId, 'classSchedule');
        await setDoc(teacherRef, adminSnap.data());
        return adminSnap.data() as ClassScheduleData;
    } else {
        throw new Error("Data jadwal di induk admin belum diisi untuk kelas ini.");
    }
};

// --- Jadwal Piket ---
export const getPiketSchedule = async (academicYear: string, classLevel: string, userId?: string): Promise<PiketScheduleData> => {
    try {
        const yearDocId = getAcademicYearDocId(academicYear);
        const classDocId = getClassDocId(classLevel);
        const docRef = doc(db, getPathRoot(userId), yearDocId, classDocId, 'piketSchedule');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) return docSnap.data() as PiketScheduleData;
        return { quota: 1, senin: [], selasa: [], rabu: [], kamis: [], jumat: [], sabtu: [] };
    } catch (error) {
        return { quota: 1, senin: [], selasa: [], rabu: [], kamis: [], jumat: [], sabtu: [] };
    }
};

export const updatePiketSchedule = async (academicYear: string, classLevel: string, data: PiketScheduleData, userId?: string): Promise<void> => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const docRef = doc(db, getPathRoot(userId), yearDocId, classDocId, 'piketSchedule');
    await setDoc(docRef, data);
};

// --- Kesepakatan Kelas ---
export const getClassAgreement = async (academicYear: string, classLevel: string, userId?: string): Promise<ClassAgreementData> => {
    try {
        const yearDocId = getAcademicYearDocId(academicYear);
        const classDocId = getClassDocId(classLevel);
        const docRef = doc(db, getPathRoot(userId), yearDocId, classDocId, 'classAgreement');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) return docSnap.data() as ClassAgreementData;
        return { agreements: [] };
    } catch (error) {
        return { agreements: [] };
    }
};

export const updateClassAgreement = async (academicYear: string, classLevel: string, data: ClassAgreementData, userId?: string): Promise<void> => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const docRef = doc(db, getPathRoot(userId), yearDocId, classDocId, 'classAgreement');
    await setDoc(docRef, data);
};

// Fungsi Khusus Kesepakatan: Tarik dari Induk
export const pullClassAgreementToTeacher = async (academicYear: string, classLevel: string, userId: string) => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const rootPath = getPathRoot(userId);
    
    const adminRef = doc(db, 'schoolData', yearDocId, classDocId, 'classAgreement');
    const adminSnap = await getDoc(adminRef);
    
    if (adminSnap.exists()) {
        const teacherRef = doc(db, rootPath, yearDocId, classDocId, 'classAgreement');
        await setDoc(teacherRef, adminSnap.data());
        return adminSnap.data() as ClassAgreementData;
    } else {
        throw new Error("Data kesepakatan di induk admin belum diisi untuk kelas ini.");
    }
};

// --- Denah Tempat Duduk ---
export const getSeatingChart = async (academicYear: string, classLevel: string, userId?: string): Promise<SeatingChartData> => {
    try {
        const yearDocId = getAcademicYearDocId(academicYear);
        const classDocId = getClassDocId(classLevel);
        const docRef = doc(db, getPathRoot(userId), yearDocId, classDocId, 'seatingChart');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.arrangement) data.arrangement = data.arrangement.map((item: any) => item.seats || []);
            return data as SeatingChartData;
        }
        return { config: { tablesPerRow: 4, tablesPerColumn: 5, studentsPerTable: 2, totalTables: 20 }, arrangement: [], teacherDeskPosition: 'front-center', lastRowPosition: 'left' } as any;
    } catch (error) {
        return { config: { tablesPerRow: 4, tablesPerColumn: 5, studentsPerTable: 2, totalTables: 20 }, arrangement: [], teacherDeskPosition: 'front-center', lastRowPosition: 'left' } as any;
    }
};

export const updateSeatingChart = async (academicYear: string, classLevel: string, data: SeatingChartData, userId?: string): Promise<void> => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const docRef = doc(db, getPathRoot(userId), yearDocId, classDocId, 'seatingChart');
    const firestoreCompatibleData = { ...data, arrangement: data.arrangement.map(seats => ({ seats: seats })) };
    await setDoc(docRef, firestoreCompatibleData);
};

// --- Inventaris ---
const defaultInventoryItemsList = [
    'Papan Tulis', 'Spidol Papan Tulis', 'Penghapus Papan Tulis', 'Meja Guru', 'Kursi Guru',
    'Meja Siswa', 'Kursi Siswa', 'Lemari Penyimpanan', 'Rak Buku', 'Peta Indonesia',
    'Peta Dunia', 'Gambar Presiden & Wakil Presiden', 'Lambang Garuda Pancasila', 'Struktur Organisasi Kelas',
    'Jadwal Piket Kelas', 'Jadwal Pelajaran', 'Sapu Ijuk', 'Sapu Lidi', 'Pengki',
    'Tempat Sampah', 'Jam Dinding', 'Buku Paket Tematik', 'Kain Pel', 'Ember', 'Pengharum Ruangan'
];
export const getInventoryList = async (academicYear: string, classLevel: string, userId?: string): Promise<InventoryListData> => {
    try {
        const yearDocId = getAcademicYearDocId(academicYear);
        const classDocId = getClassDocId(classLevel);
        const docRef = doc(db, getPathRoot(userId), yearDocId, classDocId, 'inventoryList');
        const docSnap = await getDoc(docRef);
        const defaultItems = defaultInventoryItemsList.map((name, index) => ({
            id: `default-${index}`, itemName: name, quantity: 0, conditionGood: 0, conditionLightDamage: 0, conditionMediumDamage: 0, conditionHeavyDamage: 0, description: ''
        }));
        if (docSnap.exists() && docSnap.data().items) return { items: docSnap.data().items };
        return { items: defaultItems };
    } catch (error) {
        return { items: [] };
    }
};

export const updateInventoryList = async (academicYear: string, classLevel: string, data: InventoryListData, userId?: string): Promise<void> => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const docRef = doc(db, getPathRoot(userId), yearDocId, classDocId, 'inventoryList');
    await setDoc(docRef, data);
};

// --- Tabungan Siswa ---
export const getStudentSavings = async (academicYear: string, classLevel: string, userId?: string): Promise<StudentSavingsData> => {
    try {
        const yearDocId = getAcademicYearDocId(academicYear);
        const classDocId = getClassDocId(classLevel);
        const docRef = doc(db, getPathRoot(userId), yearDocId, classDocId, 'studentSavings');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) return docSnap.data() as StudentSavingsData;
        return { savings: [] };
    } catch (error) {
        return { savings: [] };
    }
};

export const updateStudentSavings = async (academicYear: string, classLevel: string, data: StudentSavingsData, userId?: string): Promise<void> => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const docRef = doc(db, getPathRoot(userId), yearDocId, classDocId, 'studentSavings');
    await setDoc(docRef, data);
};

// --- Supervisi & Notulen ---
export const getSupervisionLog = async (academicYear: string, classLevel: string, semester: string, userId?: string): Promise<SupervisionLogData> => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const docRef = doc(db, getPathRoot(userId), yearDocId, classDocId, `supervisionLog-${semester.toLowerCase()}`);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? (docSnap.data() as SupervisionLogData) : { entries: [] };
};

export const updateSupervisionLog = async (academicYear: string, classLevel: string, semester: string, data: SupervisionLogData, userId?: string): Promise<void> => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const docRef = doc(db, getPathRoot(userId), yearDocId, classDocId, `supervisionLog-${semester.toLowerCase()}`);
    await setDoc(docRef, data);
};

export const getMeetingMinutes = async (academicYear: string, classLevel: string, semester: string, userId?: string): Promise<MeetingMinutesData> => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const docRef = doc(db, getPathRoot(userId), yearDocId, classDocId, `meetingMinutes-${semester.toLowerCase()}`);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? (docSnap.data() as MeetingMinutesData) : { entries: [] };
};

export const updateMeetingMinutes = async (academicYear: string, classLevel: string, semester: string, data: MeetingMinutesData, userId?: string): Promise<void> => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const docRef = doc(db, getPathRoot(userId), yearDocId, classDocId, `meetingMinutes-${semester.toLowerCase()}`);
    await setDoc(docRef, data);
};

export const getExtracurricularData = async (academicYear: string, classLevel: string, semester: string, userId?: string): Promise<ExtracurricularData> => {
    try {
        const yearDocId = getAcademicYearDocId(academicYear);
        const classDocId = getClassDocId(classLevel);
        const docRef = doc(db, getPathRoot(userId), yearDocId, classDocId, `extracurricular-${semester.toLowerCase()}`);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) return docSnap.data() as ExtracurricularData;
        return { activities: [{ id: 'pramuka-default', name: 'PRAMUKA', pembina: '', entries: Array.from({ length: 18 }, () => ({ id: crypto.randomUUID(), materi: '', rencanaPelaksanaan: '', tanggal: '', jmlSiswa: '', hadir: '', tidakHadir: '', keterangan: '', signature: '' })) }] };
    } catch (error) {
        return { activities: [] };
    }
};

export const updateExtracurricularData = async (academicYear: string, classLevel: string, semester: string, data: ExtracurricularData, userId?: string): Promise<void> => {
    try {
        const yearDocId = getAcademicYearDocId(academicYear);
        const classDocId = getClassDocId(classLevel);
        const docRef = doc(db, getPathRoot(userId), yearDocId, classDocId, `extracurricular-${semester.toLowerCase()}`);
        await setDoc(docRef, data);
    } catch (error) {
        throw new Error("Gagal memperbarui data ekstrakurikuler.");
    }
};

// --- Perencanaan Pembelajaran ---
export const getLearningOutcomes = async (academicYear: string, classLevel: string, subjectId: string, userId?: string): Promise<LearningOutcomesData> => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const phaseDocId = getPhaseDocId(classLevel);
    const docRef = doc(db, getPathRoot(userId), yearDocId, phaseDocId, 'data', 'subjects', subjectId, 'learningOutcomes', 'main');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) return docSnap.data() as LearningOutcomesData;
    return { elements: [] };
};

export const updateLearningOutcomes = async (academicYear: string, classLevel: string, subjectId: string, data: LearningOutcomesData, userId?: string): Promise<void> => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const phaseDocId = getPhaseDocId(classLevel);
    const docRef = doc(db, getPathRoot(userId), yearDocId, phaseDocId, 'data', 'subjects', subjectId, 'learningOutcomes', 'main');
    await setDoc(docRef, data);
};

// Fungsi Khusus: Tarik CP dari Induk
export const pullLearningOutcomesToTeacher = async (academicYear: string, classLevel: string, subjectId: string, userId: string) => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const phaseDocId = getPhaseDocId(classLevel);
    
    const adminRef = doc(db, 'schoolData', yearDocId, phaseDocId, 'data', 'subjects', subjectId, 'learningOutcomes', 'main');
    const adminSnap = await getDoc(adminRef);
    
    if (!adminSnap.exists()) {
        throw new Error("Data Capaian Pembelajaran di induk admin belum diisi untuk mata pelajaran ini.");
    }
    
    const teacherRef = doc(db, `teachersData/${userId}/schoolData`, yearDocId, phaseDocId, 'data', 'subjects', subjectId, 'learningOutcomes', 'main');
    await setDoc(teacherRef, adminSnap.data());
    return adminSnap.data() as LearningOutcomesData;
};

export const getLearningObjectives = async (academicYear: string, classLevel: string, subjectId: string, userId?: string): Promise<LearningOutcomesData> => {
    const cpData = await getLearningOutcomes(academicYear, classLevel, subjectId, userId);
    const yearDocId = getAcademicYearDocId(academicYear);
    const phaseDocId = getPhaseDocId(classLevel);
    const docRef = doc(db, getPathRoot(userId), yearDocId, phaseDocId, 'data', 'subjects', subjectId, 'learningObjectives', 'main');
    const docSnap = await getDoc(docRef);
    let objectivesMap = docSnap.exists() ? docSnap.data().objectivesMap || {} : {};
    
    const mergedElements = cpData.elements.map(el => ({
        ...el, outcomes: el.outcomes.map(cp => ({ ...cp, objectives: objectivesMap[cp.id] || [] }))
    }));
    return { elements: mergedElements };
};

export const updateLearningObjectives = async (academicYear: string, classLevel: string, subjectId: string, data: LearningOutcomesData, userId?: string): Promise<void> => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const phaseDocId = getPhaseDocId(classLevel);
    const docRef = doc(db, getPathRoot(userId), yearDocId, phaseDocId, 'data', 'subjects', subjectId, 'learningObjectives', 'main');
    const objectivesMap: any = {};
    data.elements.forEach(el => el.outcomes.forEach(cp => { if (cp.objectives) objectivesMap[cp.id] = cp.objectives; }));
    await setDoc(docRef, { objectivesMap });
};

// Fungsi Khusus: Tarik TP dari Induk
export const pullLearningObjectivesToTeacher = async (academicYear: string, classLevel: string, subjectId: string, userId: string) => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const phaseDocId = getPhaseDocId(classLevel);
    
    const adminRef = doc(db, 'schoolData', yearDocId, phaseDocId, 'data', 'subjects', subjectId, 'learningObjectives', 'main');
    const adminSnap = await getDoc(adminRef);
    
    if (!adminSnap.exists()) {
        throw new Error("Data Tujuan Pembelajaran di induk admin belum diisi untuk mata pelajaran ini.");
    }
    
    const teacherRef = doc(db, `teachersData/${userId}/schoolData`, yearDocId, phaseDocId, 'data', 'subjects', subjectId, 'learningObjectives', 'main');
    await setDoc(teacherRef, adminSnap.data());
    return adminSnap.data(); // Contains objectivesMap
};

export const getATPData = async (academicYear: string, classLevel: string, subjectCode: string, semester: string, userId?: string): Promise<ATPData> => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const docId = `${subjectCode}_${semester.toLowerCase()}`;
    const docRef = doc(db, getPathRoot(userId), yearDocId, classDocId, 'data', 'atp', docId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) return docSnap.data() as ATPData;
    return { rows: [] };
};

export const updateATPData = async (academicYear: string, classLevel: string, subjectCode: string, semester: string, data: ATPData, userId?: string): Promise<void> => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const docId = `${subjectCode}_${semester.toLowerCase()}`;
    const docRef = doc(db, getPathRoot(userId), yearDocId, classDocId, 'data', 'atp', docId);
    await setDoc(docRef, data);
};

// Fungsi Khusus: Tarik ATP dari Induk
export const pullATPDataToTeacher = async (academicYear: string, classLevel: string, subjectCode: string, userId: string) => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const rootPath = getPathRoot(userId);
    
    const semesters = ['Ganjil', 'Genap'];
    const results = { ganjil: { rows: [] } as ATPData, genap: { rows: [] } as ATPData };

    for (const sem of semesters) {
        const docId = `${subjectCode}_${sem.toLowerCase()}`;
        const adminRef = doc(db, 'schoolData', yearDocId, classDocId, 'data', 'atp', docId);
        const adminSnap = await getDoc(adminRef);
        
        if (adminSnap.exists()) {
            const teacherRef = doc(db, rootPath, yearDocId, classDocId, 'data', 'atp', docId);
            await setDoc(teacherRef, adminSnap.data());
            if (sem === 'Ganjil') results.ganjil = adminSnap.data() as ATPData;
            else results.genap = adminSnap.data() as ATPData;
        }
    }
    
    if (results.ganjil.rows.length === 0 && results.genap.rows.length === 0) {
        throw new Error("Data Alur Tujuan Pembelajaran di induk admin belum diisi untuk mata pelajaran ini.");
    }
    
    return results;
};

export const getKKTP = async (academicYear: string, classLevel: string, subjectCode: string, semester: string, userId?: string): Promise<KKTPData> => {
    const atpData = await getATPData(academicYear, classLevel, subjectCode, semester, userId);
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const docId = `${subjectCode}_${semester.toLowerCase()}`;
    const docRef = doc(db, getPathRoot(userId), yearDocId, classDocId, 'data', 'kktp', docId);
    const docSnap = await getDoc(docRef);
    const defaultIntervals = { interval1: '< 60', interval2: '60 - 72', interval3: '73 - 86', interval4: '87 - 100' };
    
    let intervals = docSnap.exists() ? docSnap.data().intervals || defaultIntervals : defaultIntervals;
    let kktpMap = docSnap.exists() ? docSnap.data().kktpMap || {} : {};
    
    const flattenedRows: KKTPRow[] = [];
    atpData.rows.forEach(atpRow => {
        const atpLines = atpRow.learningGoalPathway.split('\n').filter(line => line.trim() !== '');
        atpLines.forEach((line, index) => {
            const compositeId = `${atpRow.id}_${index}`;
            flattenedRows.push({ id: compositeId, originalId: atpRow.id, material: atpRow.material, learningGoalPathway: line.trim(), kktp: kktpMap[compositeId] || { belumTercapai: '', tercapaiSebagian: '', tuntas: '', tuntasPlus: '' } });
        });
    });
    return { intervals, rows: flattenedRows };
};

export const updateKKTP = async (academicYear: string, classLevel: string, subjectCode: string, semester: string, data: KKTPData, userId?: string): Promise<void> => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const docId = `${subjectCode}_${semester.toLowerCase()}`;
    const docRef = doc(db, getPathRoot(userId), yearDocId, classDocId, 'data', 'kktp', docId);
    const kktpMap: any = {};
    data.rows.forEach(row => { if (row.kktp) kktpMap[row.id] = row.kktp; });
    await setDoc(docRef, { intervals: data.intervals, kktpMap });
};

// Fungsi Khusus: Tarik KKTP dari Induk
export const pullKKTPToTeacher = async (academicYear: string, classLevel: string, subjectCode: string, semester: string, userId: string) => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const rootPath = getPathRoot(userId);
    const docId = `${subjectCode}_${semester.toLowerCase()}`;
    
    const adminRef = doc(db, 'schoolData', yearDocId, classDocId, 'data', 'kktp', docId);
    const adminSnap = await getDoc(adminRef);
    
    if (!adminSnap.exists()) {
        throw new Error("Data KKTP di induk admin belum diisi untuk mata pelajaran dan semester ini.");
    }
    
    const teacherRef = doc(db, rootPath, yearDocId, classDocId, 'data', 'kktp', docId);
    await setDoc(teacherRef, adminSnap.data());
    return adminSnap.data() as KKTPData;
};

export const getProta = async (academicYear: string, classLevel: string, subjectCode: string, userId?: string): Promise<ProtaData> => {
    const atpGanjil = await getATPData(academicYear, classLevel, subjectCode, 'Ganjil', userId);
    const atpGenap = await getATPData(academicYear, classLevel, subjectCode, 'Genap', userId);
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const docRef = doc(db, getPathRoot(userId), yearDocId, classDocId, 'data', 'prota', subjectCode);
    const docSnap = await getDoc(docRef);
    let alokasiWaktuMap = docSnap.exists() ? docSnap.data().alokasiWaktuMap || {} : {};
    
    const protaGanjilRows = atpGanjil.rows.map(r => ({ ...r, alokasiWaktu: alokasiWaktuMap[r.id] || 0 }));
    const protaGenapRows = atpGenap.rows.map(r => ({ ...r, alokasiWaktu: alokasiWaktuMap[r.id] || 0 }));
    return { ganjilRows: protaGanjilRows as any, genapRows: protaGenapRows as any };
};

export const updateProta = async (academicYear: string, classLevel: string, subjectCode: string, data: ProtaData, userId?: string): Promise<void> => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const docRef = doc(db, getPathRoot(userId), yearDocId, classDocId, 'data', 'prota', subjectCode);
    const combinedRows = [...data.ganjilRows, ...data.genapRows];
    const alokasiWaktuMap = combinedRows.reduce((acc, row) => { acc[row.id] = row.alokasiWaktu || 0; return acc; }, {} as any);
    await setDoc(docRef, { alokasiWaktuMap });
};

// Fungsi Khusus: Tarik PROTA dari Induk
export const pullProtaToTeacher = async (academicYear: string, classLevel: string, subjectCode: string, userId: string) => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const rootPath = getPathRoot(userId);
    
    const adminRef = doc(db, 'schoolData', yearDocId, classDocId, 'data', 'prota', subjectCode);
    const adminSnap = await getDoc(adminRef);
    
    if (!adminSnap.exists()) {
        throw new Error("Data alokasi waktu PROTA di induk admin belum diisi untuk mata pelajaran ini.");
    }
    
    const teacherRef = doc(db, rootPath, yearDocId, classDocId, 'data', 'prota', subjectCode);
    await setDoc(teacherRef, adminSnap.data());
    return adminSnap.data(); // Contains alokasiWaktuMap
};

export const getProsem = async (academicYear: string, classLevel: string, subjectCode: string, semester: 'Ganjil' | 'Genap', userId?: string): Promise<ProsemData> => {
    const protaData = await getProta(academicYear, classLevel, subjectCode, userId);
    const protaRowsForSemester = semester === 'Ganjil' ? protaData.ganjilRows : protaData.genapRows;
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const docId = `${subjectCode}_${semester.toLowerCase()}`;
    const docRef = doc(db, getPathRoot(userId), yearDocId, classDocId, 'data', 'prosem', docId);
    const docSnap = await getDoc(docRef);
    let storedData = docSnap.exists() ? docSnap.data() : {};
    
    const prosemRows: ProsemRow[] = [];
    protaRowsForSemester.forEach(protaRow => {
        const lingkupMateriLines = (protaRow.materialScope || '').split('\n').filter(line => line.trim() !== '');
        lingkupMateriLines.forEach((lingkup, index) => {
            const id = `${protaRow.id}_${index}`;
            const storedRow = storedData[id] || {};
            prosemRows.push({ id, protaRowId: protaRow.id, materi: protaRow.material, atp: protaRow.learningGoalPathway, lingkupMateri: lingkup, alokasiWaktu: storedRow.alokasiWaktu || 0, pekan: storedRow.pekan || { b1_m1: false }, keterangan: storedRow.keterangan || '', isSLM: false });
        });
    });
    return { rows: prosemRows };
};

export const updateProsem = async (academicYear: string, classLevel: string, subjectCode: string, semester: 'Ganjil' | 'Genap', data: ProsemData, userId?: string): Promise<void> => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const docId = `${subjectCode}_${semester.toLowerCase()}`;
    const docRef = doc(db, getPathRoot(userId), yearDocId, classDocId, 'data', 'prosem', docId);
    const dataToStore: any = {};
    data.rows.forEach(row => { dataToStore[row.id] = { alokasiWaktu: row.alokasiWaktu || 0, pekan: row.pekan, keterangan: row.keterangan || '' }; });
    await setDoc(docRef, dataToStore);
};

// Fungsi Khusus: Tarik PROSEM dari Induk
export const pullProsemToTeacher = async (academicYear: string, classLevel: string, subjectCode: string, semester: 'Ganjil' | 'Genap', userId: string) => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const rootPath = getPathRoot(userId);
    const docId = `${subjectCode}_${semester.toLowerCase()}`;
    
    const adminRef = doc(db, 'schoolData', yearDocId, classDocId, 'data', 'prosem', docId);
    const adminSnap = await getDoc(adminRef);
    
    if (!adminSnap.exists()) {
        throw new Error("Data PROSEM di induk admin belum diisi untuk mata pelajaran dan semester ini.");
    }
    
    const teacherRef = doc(db, rootPath, yearDocId, classDocId, 'data', 'prosem', docId);
    await setDoc(teacherRef, adminSnap.data());
    return adminSnap.data();
};

// --- Modul Ajar ---
export const getModulAjar = async (academicYear: string, classLevel: string, subjectCode: string, semester: 'Ganjil' | 'Genap', userId?: string): Promise<ModulAjarData> => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const docId = `${subjectCode}_${semester.toLowerCase()}`;
    const docRef = doc(db, getPathRoot(userId), yearDocId, classDocId, 'data', 'modulAjar', docId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) return docSnap.data() as ModulAjarData;
    return {};
};

export const updateModulAjar = async (academicYear: string, classLevel: string, subjectCode: string, semester: 'Ganjil' | 'Genap', data: ModulAjarData, userId?: string): Promise<void> => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const docId = `${subjectCode}_${semester.toLowerCase()}`;
    const docRef = doc(db, getPathRoot(userId), yearDocId, classDocId, 'data', 'modulAjar', docId);
    await setDoc(docRef, data);
};

// Fungsi Khusus: Tarik MODUL AJAR dari Induk
export const pullModulAjarToTeacher = async (academicYear: string, classLevel: string, subjectCode: string, semester: 'Ganjil' | 'Genap', userId: string) => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const rootPath = getPathRoot(userId);
    const docId = `${subjectCode}_${semester.toLowerCase()}`;
    
    const adminRef = doc(db, 'schoolData', yearDocId, classDocId, 'data', 'modulAjar', docId);
    const adminSnap = await getDoc(adminRef);
    
    if (!adminSnap.exists()) {
        throw new Error("Data Modul Ajar di induk admin belum diisi untuk mata pelajaran dan semester ini.");
    }
    
    const teacherRef = doc(db, rootPath, yearDocId, classDocId, 'data', 'modulAjar', docId);
    await setDoc(teacherRef, adminSnap.data());
    return adminSnap.data() as ModulAjarData;
};

// --- Program Kokurikuler ---
export const getKokurikulerThemes = async (academicYear: string, classLevel: string, semester: 'Ganjil' | 'Genap', userId?: string): Promise<KokurikulerTheme[]> => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const phaseDocId = getPhaseDocId(classLevel);
    const docRef = doc(db, getPathRoot(userId), yearDocId, phaseDocId, 'data', 'programKokurikuler', semester.toLowerCase());
    const docSnap = await getDoc(docRef);
    if (docSnap.exists() && docSnap.data().themes) return docSnap.data().themes;
    return [];
};

export const updateKokurikulerThemes = async (academicYear: string, classLevel: string, semester: 'Ganjil' | 'Genap', themes: KokurikulerTheme[], userId?: string): Promise<void> => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const phaseDocId = getPhaseDocId(classLevel);
    const docRef = doc(db, getPathRoot(userId), yearDocId, phaseDocId, 'data', 'programKokurikuler', semester.toLowerCase());
    await setDoc(docRef, { themes }, { merge: true });
};

export const getKokurikulerActivities = async (academicYear: string, classLevel: string, semester: 'Ganjil' | 'Genap', userId?: string): Promise<KokurikulerActivity[]> => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const phaseDocId = getPhaseDocId(classLevel);
    const docRef = doc(db, getPathRoot(userId), yearDocId, phaseDocId, 'data', 'programKokurikuler', semester.toLowerCase());
    const docSnap = await getDoc(docRef);
    if (docSnap.exists() && docSnap.data().activities) return docSnap.data().activities;
    return [];
};

export const updateKokurikulerActivities = async (academicYear: string, classLevel: string, semester: 'Ganjil' | 'Genap', activities: KokurikulerActivity[], userId?: string): Promise<void> => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const phaseDocId = getPhaseDocId(classLevel);
    const docRef = doc(db, getPathRoot(userId), yearDocId, phaseDocId, 'data', 'programKokurikuler', semester.toLowerCase());
    await setDoc(docRef, { activities }, { merge: true });
};

export const getKokurikulerPlanning = async (academicYear: string, classLevel: string, semester: 'Ganjil' | 'Genap', userId?: string): Promise<Record<string, KokurikulerPlanning>> => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const phaseDocId = getPhaseDocId(classLevel);
    const docRef = doc(db, getPathRoot(userId), yearDocId, phaseDocId, 'data', 'programKokurikuler', semester.toLowerCase());
    const docSnap = await getDoc(docRef);
    return docSnap.exists() && docSnap.data().planning ? docSnap.data().planning : {};
};

export const updateKokurikulerPlanning = async (academicYear: string, classLevel: string, semester: 'Ganjil' | 'Genap', planning: Record<string, KokurikulerPlanning>, userId?: string): Promise<void> => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const phaseDocId = getPhaseDocId(classLevel);
    const docRef = doc(db, getPathRoot(userId), yearDocId, phaseDocId, 'data', 'programKokurikuler', semester.toLowerCase());
    await setDoc(docRef, { planning }, { merge: true });
};

// Fungsi Khusus: Tarik KOKURIKULER dari Induk
export const pullKokurikulerToTeacher = async (academicYear: string, classLevel: string, semester: 'Ganjil' | 'Genap', userId: string) => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const phaseDocId = getPhaseDocId(classLevel);
    const rootPath = getPathRoot(userId);
    const sem = semester.toLowerCase();

    const adminRef = doc(db, 'schoolData', yearDocId, phaseDocId, 'data', 'programKokurikuler', sem);
    const adminSnap = await getDoc(adminRef);

    if (!adminSnap.exists()) {
        throw new Error("Data Program Kokurikuler di induk admin belum diisi untuk semester ini.");
    }

    const teacherRef = doc(db, rootPath, yearDocId, phaseDocId, 'data', 'programKokurikuler', sem);
    await setDoc(teacherRef, adminSnap.data());
    return adminSnap.data();
};

// --- FUNGSI KHUSUS: Tarik Data dari Induk (Admin) ke Guru ---
export const pullMasterDataToTeacher = async (academicYear: string, classLevel: string, userId: string, onProgress: (msg: string) => void) => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const phaseDocId = getPhaseDocId(classLevel);
    const rootPath = getPathRoot(userId);

    onProgress('Menarik Kalender Pendidikan...');
    const adminCalRef = doc(db, 'schoolData', yearDocId, 'calendarData', 'events');
    const adminCalSnap = await getDoc(adminCalRef);
    if (adminCalSnap.exists()) {
        await setDoc(doc(db, rootPath, yearDocId, 'calendarData', 'events'), adminCalSnap.data());
    }

    onProgress('Mengambil daftar mata pelajaran...');
    const subjects = await getSubjects(academicYear, classLevel);
    
    for (const subj of subjects) {
        onProgress(`Menarik CP & TP: ${subj.name}...`);
        const subjId = subj.code.toLowerCase();
        const adminCpRef = doc(db, 'schoolData', yearDocId, phaseDocId, 'data', 'subjects', subjId, 'learningOutcomes', 'main');
        const adminCpSnap = await getDoc(adminCpRef);
        if (adminCpSnap.exists()) await setDoc(doc(db, rootPath, yearDocId, phaseDocId, 'data', 'subjects', subjId, 'learningOutcomes', 'main'), adminCpSnap.data());
        const adminTpRef = doc(db, 'schoolData', yearDocId, phaseDocId, 'data', 'subjects', subjId, 'learningObjectives', 'main');
        const adminTpSnap = await getDoc(adminTpRef);
        if (adminTpSnap.exists()) await setDoc(doc(db, rootPath, yearDocId, phaseDocId, 'data', 'subjects', subjId, 'learningObjectives', 'main'), adminTpSnap.data());
    }

    const semesters = ['ganjil', 'genap'];
    for (const subj of subjects) {
        const subjId = subj.code.toLowerCase();
        for (const sem of semesters) {
            onProgress(`Menarik ATP & Prosem: ${subj.name} (${sem})...`);
            const adminAtpRef = doc(db, 'schoolData', yearDocId, classDocId, 'data', 'atp', `${subjId}_${sem}`);
            const adminAtpSnap = await getDoc(adminAtpRef);
            if (adminAtpSnap.exists()) await setDoc(doc(db, rootPath, yearDocId, classDocId, 'data', 'atp', `${subjId}_${sem}`), adminAtpSnap.data());
            const adminKktpRef = doc(db, 'schoolData', yearDocId, classDocId, 'data', 'kktp', `${subjId}_${sem}`);
            const adminKktpSnap = await getDoc(adminKktpRef);
            if (adminKktpSnap.exists()) await setDoc(doc(db, rootPath, yearDocId, classDocId, 'data', 'kktp', `${subjId}_${sem}`), adminKktpSnap.data());
            const adminPsRef = doc(db, 'schoolData', yearDocId, classDocId, 'data', 'prosem', `${subjId}_${sem}`);
            const adminPsSnap = await getDoc(adminPsRef);
            if (adminPsSnap.exists()) await setDoc(doc(db, rootPath, yearDocId, classDocId, 'data', 'prosem', `${subjId}_${sem}`), adminPsSnap.data());
        }
        onProgress(`Menarik PROTA: ${subj.name}...`);
        const adminProtaRef = doc(db, 'schoolData', yearDocId, classDocId, 'data', 'prota', subjId);
        const adminProtaSnap = await getDoc(adminProtaRef);
        if (adminProtaSnap.exists()) await setDoc(doc(db, rootPath, yearDocId, classDocId, 'data', 'prota', subjId), adminProtaSnap.data());
    }

    for (const sem of semesters) {
        onProgress(`Menarik Program Kokurikuler (${sem})...`);
        const adminKoRef = doc(db, 'schoolData', yearDocId, phaseDocId, 'data', 'programKokurikuler', sem);
        const adminKoSnap = await getDoc(adminKoRef);
        if (adminKoSnap.exists()) await setDoc(doc(db, rootPath, yearDocId, phaseDocId, 'data', 'programKokurikuler', sem), adminKoSnap.data());
    }
    onProgress('Sinkronisasi selesai!');
};

export const generateBulkKktpForAll = async (academicYear: string, onProgress: (message: string) => void): Promise<{ success: boolean; message: string }> => {
    onProgress('Memulai proses...');
    const classLevels = ['Kelas I', 'Kelas II', 'Kelas III', 'Kelas IV', 'Kelas V', 'Kelas VI'];
    try {
        for (const classLevel of classLevels) {
            const subjects = await getSubjects(academicYear, classLevel);
            for (const subject of subjects) {
                const subjectId = subject.code.toLowerCase();
                const semesters: ('Ganjil' | 'Genap')[] = ['Ganjil', 'Genap'];
                for (const semester of semesters) {
                    onProgress(`Memproses ${subject.name} - ${classLevel} - Semester ${semester}...`);
                    const kktpData = await getKKTP(academicYear, classLevel, subjectId, semester);
                    const atpsToGenerate = kktpData.rows.filter(row => row.learningGoalPathway.trim());
                    if (atpsToGenerate.length === 0) continue;
                    const prompt = `Buatkan deskripsi KKTP untuk: ${atpsToGenerate.map(row => `- ID: "${row.id}", ATP: "${row.learningGoalPathway}"`).join('\n')}`;
                    try {
                        const response = await generateContentWithRotation({
                            model: 'gemini-3-flash-preview',
                            contents: prompt,
                            config: { responseMimeType: "application/json", responseSchema: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, kktp: { type: Type.OBJECT, properties: { belumTercapai: { type: Type.STRING }, tercapaiSebagian: { type: Type.STRING }, tuntas: { type: Type.STRING }, tuntasPlus: { type: Type.STRING } } } } } } },
                        });
                        const results = JSON.parse(response.text.trim());
                        const updatedRows = kktpData.rows.map(row => {
                            const res = results.find((r:any) => r.id === row.id);
                            return res ? { ...row, kktp: res.kktp } : row;
                        });
                        await updateKKTP(academicYear, classLevel, subjectId, semester, { ...kktpData, rows: updatedRows });
                    } catch (e) {}
                }
            }
        }
        return { success: true, message: 'Proses generate KKTP massal selesai.' };
    } catch (error: any) {
        return { success: false, message: `Proses gagal: ${error.message}` };
    }
};
