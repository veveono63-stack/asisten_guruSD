
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch, addDoc, deleteDoc, WriteBatch } from 'firebase/firestore';
import { db } from '../firebase/config';
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

        currentBatch.delete(userDocRef);
        operationCount++;
        currentBatch.delete(doc(db, 'usernames', username.toLowerCase()));
        operationCount++;
        currentBatch.delete(doc(db, `teachersData/${userId}/schoolData`, 'identity'));
        operationCount++;

        for (const yearId of years) {
            const yearPath = `teachersData/${userId}/schoolData/${yearId}`;
            const classPath = `${yearPath}/${classDocId}`;

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

            try {
                const subjectsRef = collection(db, classPath, 'data', 'subjects');
                const subSnap = await getDocs(subjectsRef);
                
                for (const subDoc of subSnap.docs) {
                    const subId = subDoc.id;
                    currentBatch.delete(doc(db, classPath, 'data', 'subjects', subId, 'learningOutcomes', 'main'));
                    operationCount++;
                    currentBatch.delete(doc(db, classPath, 'data', 'subjects', subId, 'learningObjectives', 'main'));
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

            for (const sem of semesters) {
                currentBatch.delete(doc(db, yearPath, phaseDocId, 'data', 'programKokurikuler', sem));
                operationCount++;
                await commitIfFull();
            }
        }

        if (operationCount > 0) {
            await currentBatch.commit();
        }
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
        throw new Error("Gagal mengambil data identitas sekolah.");
    }
};

export const updateSchoolIdentity = async (data: SchoolIdentity, userId?: string): Promise<void> => {
    try {
        const docRef = doc(db, getPathRoot(userId), 'identity');
        await setDoc(docRef, data, { merge: true });
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

export const pullSubjectsToTeacher = async (academicYear: string, classLevel: string, userId: string) => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const rootPath = getPathRoot(userId);
    const adminSubjectsRef = collection(db, 'schoolData', yearDocId, classDocId, 'data', 'subjects');
    const adminSnap = await getDocs(adminSubjectsRef);
    if (adminSnap.empty) throw new Error("Daftar pelajaran di induk admin belum diisi untuk kelas ini.");
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

// --- Perencanaan Pembelajaran (CP & TP) ---
// Diperbarui agar mendukung penyimpanan per KELAS dengan fallback ke FASE
export const getLearningOutcomes = async (academicYear: string, classLevel: string, subjectId: string, userId?: string): Promise<LearningOutcomesData> => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const root = getPathRoot(userId);
    
    // 1. Coba ambil dari path per Kelas (Struktur Baru)
    const classDocRef = doc(db, root, yearDocId, classDocId, 'data', 'subjects', subjectId, 'learningOutcomes', 'main');
    const classSnap = await getDoc(classDocRef);
    if (classSnap.exists()) return classSnap.data() as LearningOutcomesData;

    // 2. Fallback: Ambil dari path per Fase (Struktur Lama/Data Awal)
    const phaseDocId = getPhaseDocId(classLevel);
    const phaseDocRef = doc(db, root, yearDocId, phaseDocId, 'data', 'subjects', subjectId, 'learningOutcomes', 'main');
    const phaseSnap = await getDoc(phaseDocRef);
    if (phaseSnap.exists()) return phaseSnap.data() as LearningOutcomesData;

    return { elements: [] };
};

export const updateLearningOutcomes = async (academicYear: string, classLevel: string, subjectId: string, data: LearningOutcomesData, userId?: string): Promise<void> => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const root = getPathRoot(userId);
    
    // Simpan HANYA ke path per Kelas untuk menjaga isolasi data antar kelas
    const docRef = doc(db, root, yearDocId, classDocId, 'data', 'subjects', subjectId, 'learningOutcomes', 'main');
    await setDoc(docRef, data);
};

export const pullLearningOutcomesToTeacher = async (academicYear: string, classLevel: string, subjectId: string, userId: string) => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    
    // Ambil nama mapel guru untuk pencocokan berbasis nama jika ID (kode) tidak cocok
    const teacherSubRef = doc(db, `teachersData/${userId}/schoolData`, yearDocId, classDocId, 'data', 'subjects', subjectId);
    const teacherSubSnap = await getDoc(teacherSubRef);
    const teacherSubName = teacherSubSnap.exists() ? teacherSubSnap.data().name : null;

    // Coba ambil langsung dari path Kelas milik Admin (Induk)
    const adminRef = doc(db, 'schoolData', yearDocId, classDocId, 'data', 'subjects', subjectId, 'learningOutcomes', 'main');
    let adminSnap = await getDoc(adminRef);

    // Jika tidak ketemu dengan ID, coba cari berdasarkan NAMA mapel di daftar mapel Admin pada kelas yang sama
    if (!adminSnap.exists() && teacherSubName) {
        const adminSubjectsRef = collection(db, 'schoolData', yearDocId, classDocId, 'data', 'subjects');
        const adminSubjectsSnap = await getDocs(adminSubjectsRef);
        const matchingAdminSub = adminSubjectsSnap.docs.find(d => 
            d.data().name.toLowerCase().trim() === teacherSubName.toLowerCase().trim()
        );
        
        if (matchingAdminSub) {
            const adminRefByName = doc(db, 'schoolData', yearDocId, classDocId, 'data', 'subjects', matchingAdminSub.id, 'learningOutcomes', 'main');
            adminSnap = await getDoc(adminRefByName);
        }
    }
    
    if (!adminSnap || !adminSnap.exists()) throw new Error(`Data Capaian Pembelajaran di induk admin belum diisi untuk ${classLevel}.`);
    
    // Simpan ke Guru di path per KELAS
    const teacherRef = doc(db, `teachersData/${userId}/schoolData`, yearDocId, classDocId, 'data', 'subjects', subjectId, 'learningOutcomes', 'main');
    await setDoc(teacherRef, adminSnap.data());
    return adminSnap.data() as LearningOutcomesData;
};

export const getLearningObjectives = async (academicYear: string, classLevel: string, subjectId: string, userId?: string): Promise<LearningOutcomesData> => {
    const cpData = await getLearningOutcomes(academicYear, classLevel, subjectId, userId);
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const root = getPathRoot(userId);
    
    // 1. Coba path Kelas
    const classRef = doc(db, root, yearDocId, classDocId, 'data', 'subjects', subjectId, 'learningObjectives', 'main');
    let docSnap = await getDoc(classRef);
    
    // 2. Fallback path Fase
    if (!docSnap.exists()) {
        const phaseDocId = getPhaseDocId(classLevel);
        const phaseRef = doc(db, root, yearDocId, phaseDocId, 'data', 'subjects', subjectId, 'learningObjectives', 'main');
        docSnap = await getDoc(phaseRef);
    }

    let objectivesMap = docSnap.exists() ? docSnap.data().objectivesMap || {} : {};
    const mergedElements = cpData.elements.map(el => ({
        ...el, outcomes: el.outcomes.map(cp => ({ ...cp, objectives: objectivesMap[cp.id] || [] }))
    }));
    return { elements: mergedElements };
};

export const updateLearningObjectives = async (academicYear: string, classLevel: string, subjectId: string, data: LearningOutcomesData, userId?: string): Promise<void> => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const root = getPathRoot(userId);
    
    const docRef = doc(db, root, yearDocId, classDocId, 'data', 'subjects', subjectId, 'learningObjectives', 'main');
    const objectivesMap: any = {};
    data.elements.forEach(el => el.outcomes.forEach(cp => { if (cp.objectives) objectivesMap[cp.id] = cp.objectives; }));
    await setDoc(docRef, { objectivesMap });
};

export const pullLearningObjectivesToTeacher = async (academicYear: string, classLevel: string, subjectId: string, userId: string) => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);

    // Ambil nama mapel guru untuk pencocokan berbasis nama jika ID (kode) tidak cocok
    const teacherSubRef = doc(db, `teachersData/${userId}/schoolData`, yearDocId, classDocId, 'data', 'subjects', subjectId);
    const teacherSubSnap = await getDoc(teacherSubRef);
    const teacherSubName = teacherSubSnap.exists() ? teacherSubSnap.data().name : null;

    // Coba ambil langsung dari path Kelas milik Admin (Induk)
    const adminRef = doc(db, 'schoolData', yearDocId, classDocId, 'data', 'subjects', subjectId, 'learningObjectives', 'main');
    let adminSnap = await getDoc(adminRef);

    // Jika tidak ketemu dengan ID, coba cari berdasarkan NAMA mapel di daftar mapel Admin pada kelas yang sama
    if (!adminSnap.exists() && teacherSubName) {
        const adminSubjectsRef = collection(db, 'schoolData', yearDocId, classDocId, 'data', 'subjects');
        const adminSubjectsSnap = await getDocs(adminSubjectsRef);
        const matchingAdminSub = adminSubjectsSnap.docs.find(d => 
            d.data().name.toLowerCase().trim() === teacherSubName.toLowerCase().trim()
        );
        
        if (matchingAdminSub) {
            const adminRefByName = doc(db, 'schoolData', yearDocId, classDocId, 'data', 'subjects', matchingAdminSub.id, 'learningObjectives', 'main');
            adminSnap = await getDoc(adminRefByName);
        }
    }

    if (!adminSnap || !adminSnap.exists()) throw new Error(`Data Tujuan Pembelajaran di induk admin belum diisi untuk ${classLevel}.`);
    
    const teacherRef = doc(db, `teachersData/${userId}/schoolData`, yearDocId, classDocId, 'data', 'subjects', subjectId, 'learningObjectives', 'main');
    await setDoc(teacherRef, adminSnap.data());
    return adminSnap.data();
};

// --- Other Data Functions (Struktur Organisasi, Jadwal, etc.) ---
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

export const getInventoryList = async (academicYear: string, classLevel: string, userId?: string): Promise<InventoryListData> => {
    try {
        const yearDocId = getAcademicYearDocId(academicYear);
        const classDocId = getClassDocId(classLevel);
        const docRef = doc(db, getPathRoot(userId), yearDocId, classDocId, 'inventoryList');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().items) return { items: docSnap.data().items };
        return { items: [] };
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

export const pullATPDataToTeacher = async (academicYear: string, classLevel: string, subjectCode: string, userId: string) => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const rootPath = getPathRoot(userId);
    const semesters = ['Ganjil', 'Genap'];
    const results = { ganjil: { rows: [] } as ATPData, genap: { rows: [] } as ATPData };

    // Ambil nama mapel guru untuk pencocokan berbasis nama jika ID (kode) tidak cocok
    const teacherSubRef = doc(db, `teachersData/${userId}/schoolData`, yearDocId, classDocId, 'data', 'subjects', subjectCode);
    const teacherSubSnap = await getDoc(teacherSubRef);
    const teacherSubName = teacherSubSnap.exists() ? teacherSubSnap.data().name : null;

    for (const sem of semesters) {
        const docId = `${subjectCode}_${sem.toLowerCase()}`;
        const adminRef = doc(db, 'schoolData', yearDocId, classDocId, 'data', 'atp', docId);
        let adminSnap = await getDoc(adminRef);

        // Fallback: Cari berdasarkan nama jika ID tidak ketemu
        if (!adminSnap.exists() && teacherSubName) {
            const adminSubjectsRef = collection(db, 'schoolData', yearDocId, classDocId, 'data', 'subjects');
            const adminSubjectsSnap = await getDocs(adminSubjectsRef);
            const matchingAdminSub = adminSubjectsSnap.docs.find(d => 
                d.data().name.toLowerCase().trim() === teacherSubName.toLowerCase().trim()
            );
            if (matchingAdminSub) {
                const adminRefByName = doc(db, 'schoolData', yearDocId, classDocId, 'data', 'atp', `${matchingAdminSub.id}_${sem.toLowerCase()}`);
                adminSnap = await getDoc(adminRefByName);
            }
        }

        if (adminSnap.exists()) {
            const teacherRef = doc(db, rootPath, yearDocId, classDocId, 'data', 'atp', docId);
            await setDoc(teacherRef, adminSnap.data());
            if (sem === 'Ganjil') results.ganjil = adminSnap.data() as ATPData;
            else results.genap = adminSnap.data() as ATPData;
        }
    }
    if (results.ganjil.rows.length === 0 && results.genap.rows.length === 0) throw new Error("Data Alur Tujuan Pembelajaran di induk admin belum diisi untuk mata pelajaran ini.");
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

export const pullKKTPToTeacher = async (academicYear: string, classLevel: string, subjectCode: string, semester: string, userId: string) => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const rootPath = getPathRoot(userId);
    const docId = `${subjectCode}_${semester.toLowerCase()}`;
    const adminRef = doc(db, 'schoolData', yearDocId, classDocId, 'data', 'kktp', docId);
    let adminSnap = await getDoc(adminRef);

    // Fallback: Cari berdasarkan nama jika ID tidak ketemu
    if (!adminSnap.exists()) {
        const teacherSubRef = doc(db, `teachersData/${userId}/schoolData`, yearDocId, classDocId, 'data', 'subjects', subjectCode);
        const teacherSubSnap = await getDoc(teacherSubRef);
        const teacherSubName = teacherSubSnap.exists() ? teacherSubSnap.data().name : null;

        if (teacherSubName) {
            const adminSubjectsRef = collection(db, 'schoolData', yearDocId, classDocId, 'data', 'subjects');
            const adminSubjectsSnap = await getDocs(adminSubjectsRef);
            const matchingAdminSub = adminSubjectsSnap.docs.find(d => 
                d.data().name.toLowerCase().trim() === teacherSubName.toLowerCase().trim()
            );
            if (matchingAdminSub) {
                const adminRefByName = doc(db, 'schoolData', yearDocId, classDocId, 'data', 'kktp', `${matchingAdminSub.id}_${semester.toLowerCase()}`);
                adminSnap = await getDoc(adminRefByName);
            }
        }
    }

    if (!adminSnap.exists()) throw new Error("Data KKTP di induk admin belum diisi untuk mata pelajaran dan semester ini.");
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

export const pullProtaToTeacher = async (academicYear: string, classLevel: string, subjectCode: string, userId: string) => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const rootPath = getPathRoot(userId);
    const adminRef = doc(db, 'schoolData', yearDocId, classDocId, 'data', 'prota', subjectCode);
    let adminSnap = await getDoc(adminRef);

    // Fallback: Cari berdasarkan nama jika ID tidak ketemu
    if (!adminSnap.exists()) {
        const teacherSubRef = doc(db, `teachersData/${userId}/schoolData`, yearDocId, classDocId, 'data', 'subjects', subjectCode);
        const teacherSubSnap = await getDoc(teacherSubRef);
        const teacherSubName = teacherSubSnap.exists() ? teacherSubSnap.data().name : null;

        if (teacherSubName) {
            const adminSubjectsRef = collection(db, 'schoolData', yearDocId, classDocId, 'data', 'subjects');
            const adminSubjectsSnap = await getDocs(adminSubjectsRef);
            const matchingAdminSub = adminSubjectsSnap.docs.find(d => 
                d.data().name.toLowerCase().trim() === teacherSubName.toLowerCase().trim()
            );
            if (matchingAdminSub) {
                const adminRefByName = doc(db, 'schoolData', yearDocId, classDocId, 'data', 'prota', matchingAdminSub.id);
                adminSnap = await getDoc(adminRefByName);
            }
        }
    }

    if (!adminSnap.exists()) throw new Error("Data alokasi waktu PROTA di induk admin belum diisi untuk mata pelajaran ini.");
    const teacherRef = doc(db, rootPath, yearDocId, classDocId, 'data', 'prota', subjectCode);
    await setDoc(teacherRef, adminSnap.data());
    return adminSnap.data();
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
    
    const defaultPekan: ProsemBulanCheckboxes = {
        b1_m1: false, b1_m2: false, b1_m3: false, b1_m4: false, b1_m5: false,
        b2_m1: false, b2_m2: false, b2_m3: false, b2_m4: false, b2_m5: false,
        b3_m1: false, b3_m2: false, b3_m3: false, b3_m4: false, b3_m5: false,
        b4_m1: false, b4_m2: false, b4_m3: false, b4_m4: false, b4_m5: false,
        b5_m1: false, b5_m2: false, b5_m3: false, b5_m4: false, b5_m5: false,
        b6_m1: false, b6_m2: false, b6_m3: false, b6_m4: false, b6_m5: false,
    };

    const prosemRows: ProsemRow[] = [];
    protaRowsForSemester.forEach(protaRow => {
        const lingkupMateriLines = (protaRow.materialScope || '').split('\n').filter(line => line.trim() !== '');
        lingkupMateriLines.forEach((lingkup, index) => {
            const id = `${protaRow.id}_${index}`;
            const storedRow = storedData[id] || {};
            prosemRows.push({ 
                id, 
                protaRowId: protaRow.id, 
                materi: protaRow.material, 
                atp: protaRow.learningGoalPathway, 
                lingkupMateri: lingkup, 
                alokasiWaktu: storedRow.alokasiWaktu || 0, 
                pekan: storedRow.pekan || { ...defaultPekan }, 
                keterangan: storedRow.keterangan || '', 
                isSLM: false 
            });
        });
        
        // Pastikan baris SLM selalu ada untuk setiap materi Prota
        const slmId = `${protaRow.id}_slm`;
        const storedSLM = storedData[slmId] || {};
        prosemRows.push({
            id: slmId,
            protaRowId: protaRow.id,
            materi: protaRow.material,
            atp: protaRow.learningGoalPathway,
            lingkupMateri: "SUMATIF LINGKUP MATERI",
            alokasiWaktu: storedSLM.alokasiWaktu || 2,
            pekan: storedSLM.pekan || { ...defaultPekan },
            keterangan: storedSLM.keterangan || '',
            isSLM: true
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

export const pullProsemToTeacher = async (academicYear: string, classLevel: string, subjectCode: string, semester: 'Ganjil' | 'Genap', userId: string) => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const rootPath = getPathRoot(userId);
    const docId = `${subjectCode}_${semester.toLowerCase()}`;
    const adminRef = doc(db, 'schoolData', yearDocId, classDocId, 'data', 'prosem', docId);
    const adminSnap = await getDoc(adminRef);
    if (!adminSnap.exists()) throw new Error("Data PROSEM di induk admin belum diisi untuk mata pelajaran dan semester ini.");
    const teacherRef = doc(db, rootPath, yearDocId, classDocId, 'data', 'prosem', docId);
    await setDoc(teacherRef, adminSnap.data());
    return adminSnap.data();
};

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

export const pullModulAjarToTeacher = async (academicYear: string, classLevel: string, subjectCode: string, semester: 'Ganjil' | 'Genap', userId: string) => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const classDocId = getClassDocId(classLevel);
    const rootPath = getPathRoot(userId);
    const docId = `${subjectCode}_${semester.toLowerCase()}`;
    const adminRef = doc(db, 'schoolData', yearDocId, classDocId, 'data', 'modulAjar', docId);
    const adminSnap = await getDoc(adminRef);
    if (!adminSnap.exists()) throw new Error("Data Modul Ajar di induk admin belum diisi untuk mata pelajaran dan semester ini.");
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

export const pullKokurikulerToTeacher = async (academicYear: string, classLevel: string, semester: 'Ganjil' | 'Genap', userId: string) => {
    const yearDocId = getAcademicYearDocId(academicYear);
    const phaseDocId = getPhaseDocId(classLevel);
    const rootPath = getPathRoot(userId);
    const sem = semester.toLowerCase();
    const adminRef = doc(db, 'schoolData', yearDocId, phaseDocId, 'data', 'programKokurikuler', sem);
    const adminSnap = await getDoc(adminRef);
    if (!adminSnap.exists()) throw new Error("Data Program Kokurikuler di induk admin belum diisi untuk semester ini.");
    const teacherRef = doc(db, rootPath, yearDocId, phaseDocId, 'data', 'programKokurikuler', sem);
    await setDoc(teacherRef, adminSnap.data());
    return adminSnap.data();
};
