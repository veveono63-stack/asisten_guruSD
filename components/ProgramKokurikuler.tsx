
import React, { useState, useEffect, useMemo } from 'react';
import { PencilIcon, SparklesIcon, TrashIcon, ArrowDownTrayIcon, ChevronDownIcon, XCircleIcon, ArrowPathIcon } from './Icons';
import { KokurikulerTheme, KokurikulerActivity, KokurikulerDimension, Subject, KokurikulerPlanning, SchoolIdentity, Teacher } from '../types';
import { getKokurikulerThemes, updateKokurikulerThemes, getKokurikulerActivities, updateKokurikulerActivities, getSubjects, getKokurikulerPlanning, updateKokurikulerPlanning, getSchoolIdentity, getTeacherProfile, pullKokurikulerToTeacher } from '../services/adminService';
import Notification, { NotificationType } from './Notification';
import { generateContentWithRotation } from '../services/geminiService';
import { Type } from '@google/genai';

declare const jspdf: any;

interface ProgramKokurikulerProps {
    selectedClass: string;
    selectedYear: string;
    userId?: string;
}

type TabType = 'tema' | 'kegiatan' | 'perencanaan';

// Data Statis Dimensi Profil Pelajar Pancasila & Sub-elemen
const DIMENSIONS_DATA: { [key: string]: string[] } = {
    "Keimanan dan ketakwaan terhadap Tuhan Yang Maha Esa": [
        "Hubungan dengan Tuhan Yang Maha Esa",
        "Hubungan dengan sesama manusia",
        "Hubungan dengan Lingkungan Alam"
    ],
    "Kewargaan": [
        "Kewargaan Lokal",
        "Kewargaan Nasional",
        "Kewargaan Global"
    ],
    "Penalaran kritis": [
        "Penyampaian Argumentasi",
        "Pengambilan Keputusan",
        "Penyelesaian Masalah"
    ],
    "Kreativitas": [
        "Gagasan baru",
        "Fleksibilitas berpikir",
        "Karya"
    ],
    "Kemandirian": [
        "Bertanggung Jawab",
        "Kepemimpinan",
        "Pengembangan Diri"
    ],
    "Kolaborasi": [
        "Peduli",
        "Berbagi",
        "Kerja sama"
    ],
    "Komunikasi": [
        "Menyimak",
        "Berbicara",
        "Membaca",
        "Menulis"
    ],
    "Kesehatan": [
        "Hidup bersih dan sehat",
        "Kebugaran, kesehatan fisik, dan kesehatan mental",
        "Kesehatan Lingkungan"
    ]
};

const DIMENSION_KEYS = Object.keys(DIMENSIONS_DATA);

// Subject Short Names Mapping
const subjectShortNames: { [key: string]: string } = {
    'Pendidikan Agama Islam Dan Budi Pekerti': 'PABP',
    'Pendidikan Pancasila': 'P. Pancasila',
    'Bahasa Indonesia': 'B. Indonesia',
    'Matematika': 'Matematika',
    'Ilmu Pengetahuan Alam Dan Sosial': 'IPAS',
    'Pendidikan Jasmani, Olahraga, Dan Kesehatan': 'PJOK',
    'Seni Rupa': 'Seni Rupa',
    'Seni Musik': 'Seni Musik',
    'Seni Tari': 'Seni Tari',
    'Seni Teater': 'Seni Teater',
    'Bahasa Inggris': 'B. Inggris',
    'Bahasa Inggris (Opsional)': 'B. Inggris',
    'Bahasa Jawa': 'B. Jawa',
    'Pendidikan Lingkungan Hidup': 'PLH',
    'Koding Dan Kecerdasan Artificial': 'Koding & KA',
};

const DEFAULT_THEMES = [
    "Generasi Sehat dan Bugar",
    "Peduli dan berbagi",
    "Aku cinta Indonesia",
    "Hidup hemat dan produktif",
    "Berkarya untuk sesama dan bangsa",
    "Gaya hidup berkelanjutan"
];

// Safe ID Generator
const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

const ProgramKokurikuler: React.FC<ProgramKokurikulerProps> = ({ selectedClass, selectedYear, userId }) => {
    const [activeTab, setActiveTab] = useState<TabType>('tema');
    const [selectedSemester, setSelectedSemester] = useState<'Ganjil' | 'Genap'>('Ganjil');
    
    // Data States
    const [themes, setThemes] = useState<KokurikulerTheme[]>([]);
    const [activities, setActivities] = useState<KokurikulerActivity[]>([]);
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [planningData, setPlanningData] = useState<Record<string, KokurikulerPlanning>>({}); // Map ActivityId -> Plan
    const [schoolIdentity, setSchoolIdentity] = useState<SchoolIdentity | null>(null);
    const [teacher, setTeacher] = useState<Teacher | null>(null);
    
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isPulling, setIsPulling] = useState(false);
    const [isPullModalOpen, setIsPullModalOpen] = useState(false);
    const [notification, setNotification] = useState<{ message: string; type: NotificationType } | null>(null);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    
    // Tab 3 State
    const [activeActivityId, setActiveActivityId] = useState<string | null>(null);
    const [isPdfDropdownOpen, setIsPdfDropdownOpen] = useState(false);
    const [isTab2PdfDropdownOpen, setIsTab2PdfDropdownOpen] = useState(false);
    const [signatureDate, setSignatureDate] = useState(new Date().toISOString().split('T')[0]);

    // Theme Modal State
    const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
    const [currentTheme, setCurrentTheme] = useState<KokurikulerTheme | null>(null);
    const [themeForm, setThemeForm] = useState<{name: string, description: string, totalJp: number, status: 'aktif' | 'tidak aktif'}>({ name: '', description: '', totalJp: 0, status: 'tidak aktif' });
    const [themeToDelete, setThemeToDelete] = useState<KokurikulerTheme | null>(null);

    // Activity Modal State
    const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
    const [currentActivity, setCurrentActivity] = useState<KokurikulerActivity | null>(null);
    const [activityForm, setActivityForm] = useState<{
        themeId: string;
        name: string;
        goal: string;
        dimensions: KokurikulerDimension[];
        activityJp: number;
        executionWeek: string;
        relatedSubjects: string[];
    }>({ themeId: '', name: '', goal: '', dimensions: [], activityJp: 0, executionWeek: '', relatedSubjects: [] });
    
    // Activity Delete State
    const [activityToDelete, setActivityToDelete] = useState<KokurikulerActivity | null>(null);
    
    // Dimension Selector State (inside Activity Modal)
    const [selectedDimKey, setSelectedDimKey] = useState<string>('');
    const [selectedSubElements, setSelectedSubElements] = useState<string[]>([]);

    const phaseInfo = useMemo(() => {
        const romanMap: { [key: string]: number } = {
            'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6
        };
        const roman = selectedClass.replace('Kelas ', '');
        const classNumber = romanMap[roman] || 0;

        if (classNumber <= 2) return { phase: 'A', jpPerWeek: 6, classes: 'KELAS I - II', totalJP: 108, multiple: 6 };
        if (classNumber <= 4) return { phase: 'B', jpPerWeek: 7, classes: 'KELAS III - IV', totalJP: 126, multiple: 7 };
        return { phase: 'C', jpPerWeek: 7, classes: 'KELAS V - VI', totalJP: 126, multiple: 7 };
    }, [selectedClass]);

    // Fetch Data
    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            setNotification(null);
            try {
                const [themesData, activitiesData, subjectsData, planData, identity, teacherData] = await Promise.all([
                    getKokurikulerThemes(selectedYear, selectedClass, selectedSemester, userId),
                    getKokurikulerActivities(selectedYear, selectedClass, selectedSemester, userId),
                    getSubjects(selectedYear, selectedClass, userId),
                    getKokurikulerPlanning(selectedYear, selectedClass, selectedSemester, userId),
                    getSchoolIdentity(userId),
                    getTeacherProfile(selectedYear, selectedClass, userId)
                ]);

                // If no themes exist, populate with defaults
                if (themesData.length === 0) {
                    const defaultThemesData: KokurikulerTheme[] = DEFAULT_THEMES.map(name => ({
                        id: generateId(),
                        name: name,
                        description: '',
                        totalJp: 0,
                        status: 'tidak aktif'
                    }));
                    setThemes(defaultThemesData);
                } else {
                    setThemes(themesData.map(t => ({...t, status: t.status || 'tidak aktif'})));
                }

                setActivities(activitiesData);
                setSubjects(subjectsData);
                setPlanningData(planData as Record<string, KokurikulerPlanning>);
                setSchoolIdentity(identity);
                setTeacher(teacherData);

                // Set default active activity if available and none selected
                if (activitiesData.length > 0 && !activeActivityId) {
                    setActiveActivityId(activitiesData[0].id);
                }

            } catch (error: any) {
                setNotification({ message: error.message || 'Gagal memuat data.', type: 'error' });
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [selectedYear, selectedClass, selectedSemester, userId]);

    // --- Pull Handler ---
    const handlePullFromMaster = async () => {
        if (!userId) return;
        setIsPulling(true);
        setNotification(null);
        try {
            await pullKokurikulerToTeacher(selectedYear, selectedClass, selectedSemester, userId);
            
            // Refresh data
            const [themesData, activitiesData, planData] = await Promise.all([
                getKokurikulerThemes(selectedYear, selectedClass, selectedSemester, userId),
                getKokurikulerActivities(selectedYear, selectedClass, selectedSemester, userId),
                getKokurikulerPlanning(selectedYear, selectedClass, selectedSemester, userId)
            ]);

            setThemes(themesData);
            setActivities(activitiesData);
            setPlanningData(planData as Record<string, KokurikulerPlanning>);
            
            if (activitiesData.length > 0) {
                setActiveActivityId(activitiesData[0].id);
            }

            setNotification({ message: 'Program Kokurikuler berhasil ditarik dari induk.', type: 'success' });
            setIsPullModalOpen(false);
        } catch (error: any) {
            setNotification({ message: error.message, type: 'error' });
        } finally {
            setIsPulling(false);
        }
    };

    // --- Theme Handlers ---
    const handleAddThemeClick = () => {
        setCurrentTheme(null);
        setThemeForm({ name: '', description: '', totalJp: 0, status: 'tidak aktif' });
        setIsThemeModalOpen(true);
    };

    const handleEditThemeClick = (theme: KokurikulerTheme) => {
        setCurrentTheme(theme);
        setThemeForm({ name: theme.name, description: theme.description, totalJp: theme.totalJp || 0, status: theme.status || 'tidak aktif' });
        setIsThemeModalOpen(true);
    };

    const handleDeleteThemeClick = (theme: KokurikulerTheme) => {
        setThemeToDelete(theme);
    };

    const confirmDeleteTheme = async () => {
        if (!themeToDelete) return;
        setIsSaving(true);
        try {
            const updatedThemes = themes.filter(t => t.id !== themeToDelete.id);
            await updateKokurikulerThemes(selectedYear, selectedClass, selectedSemester, updatedThemes, userId);
            setThemes(updatedThemes);
            setNotification({ message: 'Tema berhasil dihapus.', type: 'success' });
            setThemeToDelete(null);
        } catch (error: any) {
            setNotification({ message: error.message, type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveTheme = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            let updatedThemes = [...themes];
            if (currentTheme) {
                updatedThemes = updatedThemes.map(t => t.id === currentTheme.id ? { ...t, ...themeForm } : t);
            } else {
                updatedThemes.push({ id: generateId(), ...themeForm });
            }
            await updateKokurikulerThemes(selectedYear, selectedClass, selectedSemester, updatedThemes, userId);
            setThemes(updatedThemes);
            setNotification({ message: 'Tema berhasil disimpan.', type: 'success' });
            setIsThemeModalOpen(false);
        } catch (error: any) {
            setNotification({ message: error.message, type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleGenerateThemesAI = async () => {
        const activeThemes = themes.filter(t => t.status === 'aktif');
        if (activeThemes.length === 0) {
            setNotification({ message: 'Harap aktifkan minimal 1 tema terlebih dahulu.', type: 'error' });
            return;
        }

        setIsGenerating(true);
        setNotification({ message: 'AI sedang menyusun deskripsi dan alokasi waktu...', type: 'info' });

        try {
            const prompt = `
                Anda adalah ahli kurikulum Sekolah Dasar (Kurikulum Merdeka).
                Tugas Anda: Mengisi deskripsi dan mengalokasikan Jam Pelajaran (JP) untuk tema-tema kokurikuler yang AKTIF.

                Konteks:
                - Fase: ${phaseInfo.phase}
                - Total Target JP Semester Ini: ${phaseInfo.totalJP} JP (Wajib Tepat).
                - Aturan Alokasi: Setiap tema aktif harus memiliki JP berupa kelipatan ${phaseInfo.multiple}.
                - Jumlah Total JP semua tema aktif harus sama persis dengan ${phaseInfo.totalJP}.
                - Tema yang TIDAK AKTIF harus memiliki 0 JP and deskripsi kosong.

                Daftar Tema:
                ${JSON.stringify(themes.map(t => ({ id: t.id, name: t.name, status: t.status })), null, 2)}

                Instruksi:
                1. Buat deskripsi singkat (2-3 kalimat) yang menarik untuk setiap tema yang berstatus 'aktif'.
                2. Distribusikan ${phaseInfo.totalJP} JP kepada tema-tema yang berstatus 'aktif'.
                3. Pastikan pembagian JP adil (proporsional) dan memenuhi aturan kelipatan ${phaseInfo.multiple}.
                4. Kembalikan data dalam format Array JSON yang berisi objek: { "id": "...", "description": "...", "totalJp": number }.
            `;

            const response = await generateContentWithRotation({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                id: { type: Type.STRING },
                                description: { type: Type.STRING },
                                totalJp: { type: Type.NUMBER }
                            },
                            required: ["id", "description", "totalJp"]
                        }
                    }
                }
            });

            const results = JSON.parse(response.text.trim());
            
            if (Array.isArray(results)) {
                const resultMap = new Map(results.map((item: any) => [item.id, item]));
                
                const updatedThemes = themes.map(t => {
                    const aiData = resultMap.get(t.id);
                    if (t.status === 'aktif' && aiData) {
                        return { ...t, description: aiData.description, totalJp: aiData.totalJp };
                    } else {
                        return { ...t, totalJp: 0 }; 
                    }
                });

                await updateKokurikulerThemes(selectedYear, selectedClass, selectedSemester, updatedThemes, userId);
                setThemes(updatedThemes);
                setNotification({ message: 'Deskripsi dan Alokasi JP berhasil dibuat oleh AI!', type: 'success' });
            } else {
                throw new Error('Format respon AI tidak valid.');
            }

        } catch (error: any) {
            setNotification({ message: 'Gagal generate AI: ' + error.message, type: 'error' });
        } finally {
            setIsGenerating(false);
        }
    };

    // --- Activity Handlers ---
    const handleAddActivityClick = (themeId: string) => {
        setCurrentActivity(null);
        setActivityForm({ themeId, name: '', goal: '', dimensions: [], activityJp: 0, executionWeek: '', relatedSubjects: [] });
        setSelectedDimKey('');
        setSelectedSubElements([]);
        setIsActivityModalOpen(true);
    };

    const handleEditActivityClick = (e: React.MouseEvent, activity: KokurikulerActivity) => {
        e.preventDefault();
        setCurrentActivity(activity);
        setActivityForm({
            themeId: activity.themeId,
            name: activity.name,
            goal: activity.goal,
            dimensions: activity.dimensions,
            activityJp: activity.activityJp || 0,
            executionWeek: activity.executionWeek || '',
            relatedSubjects: activity.relatedSubjects || []
        });
        setSelectedDimKey('');
        setSelectedSubElements([]);
        setIsActivityModalOpen(true);
    };

    const handleDeleteActivityClick = (e: React.MouseEvent, activity: KokurikulerActivity) => {
        e.preventDefault();
        setActivityToDelete(activity);
    };

    const confirmDeleteActivity = async () => {
        if (!activityToDelete) return;
        setIsSaving(true);
        try {
            const updatedActivities = activities.filter(a => a.id !== activityToDelete.id);
            await updateKokurikulerActivities(selectedYear, selectedClass, selectedSemester, updatedActivities, userId);
            setActivities(updatedActivities);
            setNotification({ message: 'Kegiatan berhasil dihapus.', type: 'success' });
            setActivityToDelete(null);
        } catch (error: any) {
            setNotification({ message: error.message, type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddDimensionToForm = () => {
        if (!selectedDimKey || selectedSubElements.length === 0) return;
        
        setActivityForm(prev => {
            const existingIndex = prev.dimensions.findIndex(d => d.name === selectedDimKey);
            const newDims = [...prev.dimensions];
            
            if (existingIndex >= 0) {
                const existingElements = new Set(newDims[existingIndex].elements);
                selectedSubElements.forEach(el => existingElements.add(el));
                newDims[existingIndex] = { ...newDims[existingIndex], elements: Array.from(existingElements) };
            } else {
                newDims.push({ name: selectedDimKey, elements: selectedSubElements });
            }
            return { ...prev, dimensions: newDims };
        });
        
        setSelectedSubElements([]);
    };

    const handleRemoveDimensionFromForm = (dimName: string) => {
        setActivityForm(prev => ({
            ...prev,
            dimensions: prev.dimensions.filter(d => d.name !== dimName)
        }));
    };

    const handleSubjectToggle = (subjectName: string) => {
        setActivityForm(prev => {
            const currentSubjects = prev.relatedSubjects || [];
            if (currentSubjects.includes(subjectName)) {
                return { ...prev, relatedSubjects: currentSubjects.filter(s => s !== subjectName) };
            } else {
                return { ...prev, relatedSubjects: [...currentSubjects, subjectName] };
            }
        });
    };

    const handleSaveActivity = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (activityForm.dimensions.length < 2) {
            alert("Minimal pilih 2 Dimensi Profil Lulusan.");
            return;
        }

        if (activityForm.relatedSubjects.length === 0) {
            alert("Pilih minimal 1 Mata Pelajaran Terkait.");
            return;
        }

        const activeTheme = themes.find(t => t.id === activityForm.themeId);
        if (activeTheme) {
            const currentTotal = activities
                .filter(a => a.themeId === activeTheme.id && a.id !== currentActivity?.id)
                .reduce((sum, a) => sum + (a.activityJp || 0), 0);
            
            if (currentTotal + activityForm.activityJp > (activeTheme.totalJp || 0)) {
                alert(`Total JP kegiatan melebihi alokasi JP tema (${activeTheme.totalJp} JP). Sisa JP tersedia: ${(activeTheme.totalJp || 0) - currentTotal} JP.`);
                return;
            }
        }

        setIsSaving(true);
        try {
            let updatedActivities = [...activities];
            if (currentActivity) {
                updatedActivities = updatedActivities.map(a => a.id === currentActivity.id ? { ...a, ...activityForm } : a);
            } else {
                updatedActivities.push({ id: generateId(), ...activityForm });
            }
            await updateKokurikulerActivities(selectedYear, selectedClass, selectedSemester, updatedActivities, userId);
            setActivities(updatedActivities);
            setNotification({ message: 'Kegiatan berhasil disimpan.', type: 'success' });
            setIsActivityModalOpen(false);
        } catch (error: any) {
            setNotification({ message: error.message, type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleGenerateActivitiesAI = async () => {
        const activeThemes = themes.filter(t => t.status === 'aktif');
        if (activeThemes.length === 0) {
            setNotification({ message: 'Tidak ada tema aktif. Silakan aktifkan tema di Tab 1.', type: 'error' });
            return;
        }

        setIsGenerating(true);
        setNotification({ message: 'AI sedang melengkapi kegiatan kokurikuler...', type: 'info' });

        try {
            // Prepare context for AI
            const existingActivitiesPayload = activeThemes.map(theme => {
                const themeActs = activities.filter(a => a.themeId === theme.id).map(a => ({
                    id: a.id,
                    name: a.name,
                    goal: a.goal,
                    dimensions: a.dimensions,
                    relatedSubjects: a.relatedSubjects,
                    activityJp: a.activityJp
                }));
                return {
                    themeId: theme.id,
                    themeName: theme.name,
                    themeTotalJp: theme.totalJp,
                    currentActivities: themeActs
                };
            });

            // Logic to determine mandatory subjects based on phase
            const isPhaseA = phaseInfo.phase === 'A';
            const mandatorySubjectsList = [
                "Pendidikan Agama Islam Dan Budi Pekerti",
                "Pendidikan Pancasila",
                "Bahasa Indonesia",
                "Matematika",
                "Pendidikan Jasmani, Olahraga, Dan Kesehatan"
            ];
            
            // Add IPAS for Phase B/C
            if (!isPhaseA) {
                mandatorySubjectsList.push("Ilmu Pengetahuan Alam Dan Sosial");
            }

            // Dynamically add Art subjects that actually exist in the subjects list
            const availableArtSubjects = subjects
                .filter(s => s.name.startsWith('Seni'))
                .map(s => s.name);
            
            if (availableArtSubjects.length > 0) {
                mandatorySubjectsList.push(...availableArtSubjects);
            }

            const prompt = `
                Anda adalah asisten guru SD (Kurikulum Merdeka). Tugas: Melengkapi atau membuat kegiatan kokurikuler (P5).
                
                Daftar Mata Pelajaran Tersedia: ${subjects.map(s => s.name).join(', ')}
                Daftar Dimensi Tersedia: ${JSON.stringify(DIMENSIONS_DATA)}

                Data Input (Tema Aktif & Kegiatannya):
                ${JSON.stringify(existingActivitiesPayload, null, 2)}

                Parameter Waktu & Logika:
                - Fase: ${phaseInfo.phase}
                - Target JP per Minggu: ${phaseInfo.jpPerWeek} JP.
                - Total Minggu Efektif dalam 1 Semester: 18 Minggu.
                - Total Alokasi Penuh Semester: ${phaseInfo.totalJP} JP.

                ATURAN KHUSUS (PRIORITAS TINGGI):
                1. Iterasi setiap Tema.
                2. Cek Total JP Tema. Jika Total JP Tema = ${phaseInfo.totalJP} (Alokasi Penuh Semester) DAN hanya ada 1 kegiatan:
                   - Field 'executionWeek' WAJIB diisi: "Minggu ke-1 s.d. Minggu ke-18".
                   - Field 'relatedSubjects' WAJIB mencakup SEMUA mapel wajib berikut: ${mandatorySubjectsList.join(', ')}.
                3. Jika Tema memiliki beberapa kegiatan (JP terbagi):
                   - Hitung durasi minggu = (activityJp / ${phaseInfo.jpPerWeek}).
                   - Distribusikan minggu secara berurutan.
                   - Pilih mapel yang relevan saja.

                Instruksi Umum:
                1. Jika Tema BELUM punya kegiatan: Buat minimal 1 kegiatan yang relevan. Alokasi JP kegiatan = Total JP Tema.
                2. Jika Tema SUDAH punya kegiatan tapi belum lengkap (field kosong): Lengkapi field tersebut berdasarkan nama kegiatan.
                3. Field 'dimensions': Harus array objek { "name": "Dimensi...", "elements": ["Sub-elemen1", ...] }. Pilih minimal 2 dimensi.
                4. Field 'activityJp': Pastikan total JP semua kegiatan dalam satu tema = Total JP Tema tersebut.

                Output WAJIB JSON Array of Objects (KokurikulerActivity):
                [
                  {
                    "themeId": "...", // ID tema terkait
                    "id": "...", // Gunakan ID lama jika update, atau string baru unik jika create
                    "name": "...",
                    "goal": "...",
                    "dimensions": [ { "name": "...", "elements": ["..."] } ],
                    "relatedSubjects": ["..."],
                    "activityJp": 123,
                    "executionWeek": "..."
                  }
                ]
            `;

            const response = await generateContentWithRotation({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                themeId: { type: Type.STRING },
                                id: { type: Type.STRING },
                                name: { type: Type.STRING },
                                goal: { type: Type.STRING },
                                dimensions: {
                                    type: Type.ARRAY,
                                    items: {
                                        type: Type.OBJECT,
                                        properties: {
                                            name: { type: Type.STRING },
                                            elements: { type: Type.ARRAY, items: { type: Type.STRING } }
                                        },
                                        required: ["name", "elements"]
                                    }
                                },
                                relatedSubjects: { type: Type.ARRAY, items: { type: Type.STRING } },
                                activityJp: { type: Type.NUMBER },
                                executionWeek: { type: Type.STRING }
                            },
                            required: ["themeId", "name", "goal", "dimensions", "relatedSubjects", "activityJp", "executionWeek"]
                        }
                    }
                }
            });

            const results = JSON.parse(response.text.trim());

            if (Array.isArray(results)) {
                const newActivities = [...activities];
                
                results.forEach((aiAct: any) => {
                    const existingIndex = newActivities.findIndex(a => a.id === aiAct.id);
                    if (existingIndex !== -1) {
                        // Update existing
                        newActivities[existingIndex] = { ...newActivities[existingIndex], ...aiAct };
                    } else {
                        // Add new (ensure ID is unique locally if AI gave a duplicate or placeholder)
                        const isIdTaken = newActivities.some(a => a.id === aiAct.id);
                        const finalId = (aiAct.id && !isIdTaken && aiAct.id.length > 5) ? aiAct.id : generateId();
                        newActivities.push({ ...aiAct, id: finalId });
                    }
                });

                await updateKokurikulerActivities(selectedYear, selectedClass, selectedSemester, newActivities, userId);
                setActivities(newActivities);
                setNotification({ message: 'Kegiatan berhasil dilengkapi oleh AI!', type: 'success' });
            } else {
                throw new Error('Format respon AI tidak valid.');
            }

        } catch (error: any) {
            setNotification({ message: 'Gagal generate AI: ' + error.message, type: 'error' });
        } finally {
            setIsGenerating(false);
        }
    };

    // --- Tab 3: Planning Handlers ---

    const handlePlanChange = (field: keyof KokurikulerPlanning, value: any) => {
        if (!activeActivityId) return;
        setPlanningData(prev => ({
            ...prev,
            [activeActivityId]: {
                ...prev[activeActivityId],
                activityId: activeActivityId,
                [field]: value
            }
        }));
    };

    const handleWeeklyActivityChange = (index: number, value: string) => {
        if (!activeActivityId) return;
        const currentPlan = planningData[activeActivityId] || {};
        const activities = [...(currentPlan.kegiatanMingguan || [])];
        if (activities[index]) {
            activities[index] = { ...activities[index], deskripsi: value };
        } else {
            activities[index] = { mingguKe: index + 1, deskripsi: value };
        }
        handlePlanChange('kegiatanMingguan', activities);
    };

    const handleSavePlanning = async () => {
        setIsSaving(true);
        setNotification(null);
        try {
            await updateKokurikulerPlanning(selectedYear, selectedClass, selectedSemester, planningData, userId);
            setNotification({ message: 'Perencanaan kokurikuler berhasil disimpan.', type: 'success' });
        } catch (error: any) {
            setNotification({ message: error.message, type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleGeneratePlanningAI = async () => {
        if (!activeActivityId) return;
        
        const activity = activities.find(a => a.id === activeActivityId);
        const theme = themes.find(t => t.id === activity?.themeId);
        
        if (!activity || !theme) {
            setNotification({ message: 'Data kegiatan tidak ditemukan.', type: 'error' });
            return;
        }

        setIsGenerating(true);
        setNotification({ message: 'AI sedang menyusun perencanaan lengkap...', type: 'info' });

        try {
            // Hitung durasi minggu
            const totalWeeks = Math.ceil((activity.activityJp || 0) / phaseInfo.jpPerWeek) || 1;

            const prompt = `
                Peran: Ahli Kurikulum Merdeka (P5) Sekolah Dasar.
                Tugas: Lengkapi formulir perencanaan kegiatan kokurikuler secara detail.

                Konteks Kegiatan:
                - Tema: ${theme.name}
                - Judul Kegiatan: ${activity.name}
                - Tujuan Akhir: ${activity.goal}
                - Alokasi Waktu: ${activity.activityJp} JP (${totalWeeks} Minggu Efektif).
                - Dimensi Terkait: ${activity.dimensions.map(d => `${d.name}`).join(', ')}.

                Instruksi Pengisian:
                1. **Praktik Pedagogis**: Tentukan Model (misal: PBL) dan Metode (misal: Diskusi) yang sesuai.
                2. **Lingkungan Belajar**: Deskripsikan setting Ruang Fisik/Virtual dan Budaya Belajar yang mendukung.
                3. **Kemitraan**: Siapa saja yang terlibat (Guru Kelas, Guru Mapel lain, Orang tua, Mitra luar).
                4. **Digital**: Teknologi apa yang dipakai (misal: YouTube, Kamera HP, Quizizz).
                5. **Kegiatan Mingguan**:
                   - Buat rencana untuk ${totalWeeks} minggu.
                   - Setiap minggu harus berisi minimal 5 langkah konkret dan berurutan.
                   - Gunakan penomoran 1., 2., 3. dst.
                   - **CRITICAL**: Pisahkan setiap langkah dengan baris baru (newline / '\\n'). Jangan digabung dalam satu paragraf.
                6. **Asesmen**:
                   - Formatif: Teknik penilaian proses (misal: Jurnal, Observasi). Gunakan numbering jika lebih dari satu, pisahkan dengan baris baru.
                   - Sumatif: Teknik penilaian akhir (misal: Pameran Karya, Rubrik Produk). Gunakan numbering jika lebih dari satu, pisahkan dengan baris baru.

                Output JSON:
                {
                    "modelPembelajaran": "...",
                    "metodePembelajaran": "...",
                    "ruangFisik": "...",
                    "budayaBelajar": "...",
                    "kemitraan": "...",
                    "digital": "...",
                    "kegiatanMingguan": [
                        { "mingguKe": 1, "deskripsi": "1. Langkah satu...\n2. Langkah dua..." },
                        { "mingguKe": 2, "deskripsi": "..." }
                        // ... lanjutkan sampai minggu ke-${totalWeeks}
                    ],
                    "asesmenFormatif": "1. Observasi...\n2. Jurnal...",
                    "asesmenSumatif": "1. Pameran...\n2. Portofolio..."
                }
            `;

            const response = await generateContentWithRotation({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            modelPembelajaran: { type: Type.STRING },
                            metodePembelajaran: { type: Type.STRING },
                            ruangFisik: { type: Type.STRING },
                            budayaBelajar: { type: Type.STRING },
                            kemitraan: { type: Type.STRING },
                            digital: { type: Type.STRING },
                            kegiatanMingguan: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        mingguKe: { type: Type.INTEGER },
                                        deskripsi: { type: Type.STRING }
                                    },
                                    required: ["mingguKe", "deskripsi"]
                                }
                            },
                            asesmenFormatif: { type: Type.STRING },
                            asesmenSumatif: { type: Type.STRING }
                        },
                        required: ["modelPembelajaran", "metodePembelajaran", "ruangFisik", "budayaBelajar", "kemitraan", "digital", "kegiatanMingguan", "asesmenFormatif", "asesmenSumatif"]
                    }
                }
            });

            const result = JSON.parse(response.text.trim());
            
            setPlanningData(prev => ({
                ...prev,
                [activeActivityId]: {
                    activityId: activeActivityId,
                    ...result
                }
            }));
            
            setNotification({ message: 'Perencanaan berhasil digenerate!', type: 'success' });

        } catch (error: any) {
            setNotification({ message: 'Gagal generate AI: ' + error.message, type: 'error' });
        } finally {
            setIsGenerating(false);
        }
    };

    // --- PDF Handlers ---

    const handleDownloadTab2PDF = async (signatureOption: 'none' | 'teacher' | 'both') => {
        setIsGeneratingPDF(true);
        setIsTab2PdfDropdownOpen(false);
        setNotification({ message: 'Mempersiapkan PDF Daftar Kegiatan...', type: 'info' });
        await new Promise(resolve => setTimeout(resolve, 50));

        if (!schoolIdentity || !teacher) {
            setNotification({ message: 'Gagal membuat PDF: Data sekolah/guru tidak lengkap.', type: 'error' });
            setIsGeneratingPDF(false);
            return;
        }

        try {
            const { jsPDF } = jspdf;
            const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [330, 215] }); // F4 Landscape

            const margin = { top: 20, right: 10, bottom: 20, left: 10 };
            const pageWidth = 330;
            let y = margin.top;

            // HEADER
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(14);
            pdf.text('PROGRAM KOKURIKULER', pageWidth / 2, y, { align: 'center' });
            y += 7;
            pdf.setFontSize(12);
            pdf.text(schoolIdentity.schoolName.toUpperCase(), pageWidth / 2, y, { align: 'center' });
            y += 6;
            pdf.text(`${selectedClass.toUpperCase()} FASE ${phaseInfo.phase} SEMESTER ${selectedSemester.toUpperCase()}`, pageWidth / 2, y, { align: 'center' });
            y += 6;
            pdf.text(`TAHUN AJARAN ${selectedYear}`, pageWidth / 2, y, { align: 'center' });
            y += 10;

            // TABLE DATA PREPARATION
            const activeThemes = themes.filter(t => t.status === 'aktif');
            const body: any[] = [];

            activeThemes.forEach(theme => {
                const themeActs = activities.filter(a => a.themeId === theme.id);
                // Use Uppercase for Title to visually distinguish it, instead of bolding cell
                const themeText = `${theme.name.toUpperCase()}\n\n${theme.description || ''}`;

                if (themeActs.length === 0) {
                    body.push([
                        { content: themeText, styles: { valign: 'top' } },
                        '-', '-', '-', '-', '-', '-'
                    ]);
                } else {
                    themeActs.forEach((act, index) => {
                        // Format: Dimension Name \n - subelement
                        const dimensionsText = act.dimensions.map(d => `${d.name}\n${d.elements.map(e => `• ${e}`).join('\n')}`).join('\n\n');
                        const mapelText = act.relatedSubjects ? act.relatedSubjects.map(s => `• ${subjectShortNames[s] || s}`).join('\n') : '-';
                        
                        body.push([
                            { content: themeText, rowSpan: index === 0 ? themeActs.length : 1, styles: { valign: 'top' } },
                            act.name,
                            act.goal,
                            dimensionsText,
                            mapelText,
                            `${act.activityJp || 0} JP`,
                            act.executionWeek || '-'
                        ]);
                    });
                }
            });

            // GENERATE TABLE
            (pdf as any).autoTable({
                head: [['Tema', 'Nama Kegiatan', 'Tujuan Akhir', 'Profil Lulusan', 'Mapel Terkait', 'Waktu', 'Pelaksanaan']],
                body: body,
                startY: y,
                theme: 'grid',
                headStyles: {
                    fillColor: [255, 255, 255], 
                    textColor: 0, 
                    fontStyle: 'bold',
                    halign: 'center', valign: 'middle', lineColor: 0, lineWidth: 0.1
                },
                styles: { 
                    fontSize: 9, 
                    lineColor: 0, 
                    lineWidth: 0.1, 
                    cellPadding: 2, 
                    valign: 'top',
                    textColor: 0
                },
                columnStyles: {
                    0: { cellWidth: 50 }, // Tema
                    1: { cellWidth: 40 },
                    2: { cellWidth: 50 },
                    3: { cellWidth: 60 },
                    4: { cellWidth: 40 },
                    5: { cellWidth: 20, halign: 'center' },
                    6: { cellWidth: 40 }
                },
                margin: { left: margin.left, right: margin.right }
            });

            y = (pdf as any).lastAutoTable.finalY + 15;

            // SIGNATURES
            if (signatureOption !== 'none') {
                if (y > 215 - 50) { // Check page break
                    pdf.addPage();
                    y = margin.top + 10;
                }

                pdf.setFontSize(11);
                pdf.setFont('helvetica', 'normal');
                const formattedDate = new Date(signatureDate + 'T00:00:00Z').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
                
                const principalX = margin.left + 50;
                const teacherX = pageWidth - margin.right - 50;

                if (signatureOption === 'both') {
                    pdf.text('Mengetahui,', principalX, y, { align: 'center' });
                    pdf.text('Kepala Sekolah', principalX, y + 6, { align: 'center' });
                    pdf.setFont('helvetica', 'bold');
                    pdf.text(schoolIdentity.principalName, principalX, y + 28, { align: 'center' });
                    pdf.setFont('helvetica', 'normal');
                    pdf.text(`NIP. ${schoolIdentity.principalNip}`, principalX, y + 34, { align: 'center' });
                }

                if (signatureOption === 'teacher' || signatureOption === 'both') {
                    pdf.text(`${schoolIdentity.city || '...................'}, ${formattedDate}`, teacherX, y, { align: 'center' });
                    pdf.text(`Wali Kelas ${selectedClass.replace('Kelas ', '')}`, teacherX, y + 6, { align: 'center' });
                    pdf.setFont('helvetica', 'bold');
                    pdf.text(teacher.fullName, teacherX, y + 28, { align: 'center' });
                    pdf.setFont('helvetica', 'normal');
                    pdf.text(`NIP. ${teacher.nip}`, teacherX, y + 34, { align: 'center' });
                }
            }

            pdf.save(`Daftar-Kegiatan-Kokurikuler-${selectedClass.replace(' ', '_')}.pdf`);
            setNotification({ message: 'PDF Daftar Kegiatan berhasil dibuat.', type: 'success' });

        } catch (e) {
            console.error(e);
            setNotification({ message: 'Gagal membuat PDF.', type: 'error' });
        } finally {
            setIsGeneratingPDF(false);
        }
    };

    const handleDownloadTab3PDF = async (signatureOption: 'none' | 'teacher' | 'both') => {
        if (!activeActivityId || !schoolIdentity || !teacher) {
            setNotification({ message: 'Data tidak lengkap.', type: 'error' });
            return;
        }
        
        const activity = activities.find(a => a.id === activeActivityId);
        const plan = planningData[activeActivityId];
        const theme = themes.find(t => t.id === activity?.themeId);

        if (!activity || !plan || !theme) {
            setNotification({ message: 'Data perencanaan belum disimpan/lengkap.', type: 'error' });
            return;
        }

        setIsGeneratingPDF(true); 
        setIsPdfDropdownOpen(false);
        setNotification({ message: 'Mempersiapkan PDF...', type: 'info' });
        await new Promise(r => setTimeout(r, 50));

        try {
            const { jsPDF } = jspdf;
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [215, 330] });
            const margin = { top: 15, left: 20, right: 15, bottom: 15 };
            const pageWidth = 215;
            const pageHeight = 330; // F4
            const contentWidth = pageWidth - margin.left - margin.right;
            let y = margin.top;

            // Helper to add text block
            const addTextBlock = (title: string, text: string, indent: number = 7) => {
                if (y > 310) { pdf.addPage(); y = margin.top; }
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(11);
                pdf.text(title, margin.left, y);
                y += 5;
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(11);
                
                // Indent content text
                const contentX = margin.left + indent;
                const availableWidth = contentWidth - indent;

                // Handle simple text (splitTextToSize wraps it)
                // But for lists inside we want hanging indent
                y = printMixedText(text, contentX, y, availableWidth, 5, indent);
                y += 5;
            };

            const addLabelValue = (label: string, value: string) => {
                pdf.setFont('helvetica', 'normal');
                pdf.text(label, margin.left, y);
                pdf.text(": " + value, margin.left + 40, y);
                y += 6;
            };
            
            // Logic for wrapping value next to label (for Pedagogis)
            const addWrappedLabelValue = (label: string, value: string, indent: number) => {
                pdf.text(label, margin.left + indent, y);
                const labelWidth = pdf.getStringUnitWidth(label) * pdf.internal.getFontSize() / pdf.internal.scaleFactor;
                const valueX = margin.left + indent + labelWidth + 2;
                const valueWidth = contentWidth - (indent + labelWidth + 2);
                const lines = pdf.splitTextToSize(value || '-', valueWidth);
                pdf.text(lines, valueX, y);
                y += (lines.length * 5) + 2;
            }

            // Improved text printer with hanging indent support
            const printMixedText = (text: string, x: number, startY: number, maxWidth: number, lineHeight: number, baseIndent: number): number => {
                const lines = (text || '-').split('\n');
                let cursorY = startY;

                lines.forEach(line => {
                    const cleanLine = line.trim();
                    if (!cleanLine) {
                        cursorY += lineHeight;
                        return;
                    }

                    // Detect bullet or number at start
                    // Matches: "1. ", "1)", "a.", "•", "-", "*"
                    const match = cleanLine.match(/^(\d+[\.\)]|[a-zA-Z][\.\)]|[•\-\*])\s/);
                    let hangingIndent = 0;
                    if (match) {
                        const marker = match[0];
                        hangingIndent = pdf.getStringUnitWidth(marker) * pdf.internal.getFontSize() / pdf.internal.scaleFactor;
                    }

                    // Split long line into wrapped lines
                    const wrappedLines = pdf.splitTextToSize(cleanLine, maxWidth);
                    
                    wrappedLines.forEach((wLine: string, index: number) => {
                        // Check Page Break
                        if (cursorY > 310) { // Limit set to 310mm to avoid cutting off at bottom
                            pdf.addPage();
                            cursorY = margin.top;
                        }

                        let printX = x;
                        // If it's a wrapped line (index > 0) of a bulleted item, indent it to align with text
                        if (index > 0 && hangingIndent > 0) {
                            printX = x + hangingIndent;
                        }

                        pdf.text(wLine, printX, cursorY);
                        cursorY += lineHeight;
                    });
                });
                
                return cursorY;
            };

            // HEADER
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(12);
            pdf.text("PERENCANAAN KEGIATAN KOKURIKULER", pageWidth / 2, y, { align: 'center' });
            y += 10;

            // IDENTITY
            pdf.setFontSize(11);
            pdf.setFont('helvetica', 'normal');
            addLabelValue("Satuan Pendidikan", schoolIdentity.schoolName);
            addLabelValue("Kelas", selectedClass.replace('Kelas ', ''));
            addLabelValue("Fase", phaseInfo.phase);
            addLabelValue("Tema", theme.name);
            
            // Handle multi-line activity name
            const activityNameLines = pdf.splitTextToSize(": " + activity.name, contentWidth - 40);
            pdf.text("Nama Kegiatan", margin.left, y);
            pdf.text(activityNameLines, margin.left + 40, y);
            y += (activityNameLines.length * 6);

            addLabelValue("Alokasi Waktu", `${activity.activityJp} JP`);
            y += 2; // Reduced gap
            
            pdf.setLineWidth(0.5);
            pdf.line(margin.left, y, pageWidth - margin.right, y);
            y += 8;

            // Content Sections
            // A. DIMENSI PROFIL LULUSAN
            const contentIndent = 6; 

            addTextBlock("A. DIMENSI PROFIL LULUSAN", 
                activity.dimensions.map(d => `• ${d.name}: ${d.elements.join(', ')}`).join('\n'), 
                contentIndent
            );

            addTextBlock("B. TUJUAN KEGIATAN", activity.goal, contentIndent);

            pdf.setFont('helvetica', 'bold');
            pdf.text("C. PRAKTIK PEDAGOGIS", margin.left, y);
            y += 5;
            pdf.setFont('helvetica', 'normal');
            addWrappedLabelValue("Model:", plan.modelPembelajaran, contentIndent);
            addWrappedLabelValue("Metode:", plan.metodePembelajaran, contentIndent);
            y += 4; // Extra spacing

            pdf.setFont('helvetica', 'bold');
            pdf.text("D. LINGKUNGAN BELAJAR", margin.left, y);
            y += 5;
            pdf.setFont('helvetica', 'normal');
            addWrappedLabelValue("Ruang Fisik/Virtual:", plan.ruangFisik, contentIndent);
            addWrappedLabelValue("Budaya Belajar:", plan.budayaBelajar, contentIndent);
            y += 4;

            addTextBlock("E. KEMITRAAN PEMBELAJARAN", plan.kemitraan, contentIndent);
            addTextBlock("F. PEMANFAATAN DIGITAL", plan.digital, contentIndent);

            // G. KEGIATAN MINGGUAN
            if (y > 310) { pdf.addPage(); y = margin.top; }
            pdf.setFont('helvetica', 'bold');
            pdf.text("G. KEGIATAN MINGGUAN", margin.left, y);
            y += 6;
            pdf.setFont('helvetica', 'normal');
            if (plan.kegiatanMingguan && plan.kegiatanMingguan.length > 0) {
                plan.kegiatanMingguan.forEach(week => {
                    if (y > 310) { pdf.addPage(); y = margin.top; }
                    pdf.setFont('helvetica', 'bold');
                    pdf.text(`Minggu ke-${week.mingguKe}`, margin.left + contentIndent, y);
                    y += 5;
                    pdf.setFont('helvetica', 'normal');
                    // Use printMixedText to handle hanging indents within weekly activities
                    y = printMixedText(week.deskripsi, margin.left + contentIndent, y, contentWidth - contentIndent, 5, contentIndent);
                    y += 4;
                });
            } else {
                pdf.text("-", margin.left + contentIndent, y);
                y += 6;
            }
            y += 2;

            // H. ASESMEN
            if (y > 310) { pdf.addPage(); y = margin.top; }
            pdf.setFont('helvetica', 'bold');
            pdf.text("H. ASESMEN", margin.left, y);
            y += 6;
            pdf.setFont('helvetica', 'normal');
            
            pdf.text("Formatif:", margin.left + contentIndent, y);
            y += 5;
            const subContentIndent = contentIndent;
            y = printMixedText(plan.asesmenFormatif, margin.left + subContentIndent, y, contentWidth - subContentIndent, 5, subContentIndent);
            y += 3;

            pdf.text("Sumatif:", margin.left + contentIndent, y);
            y += 5;
            y = printMixedText(plan.asesmenSumatif, margin.left + subContentIndent, y, contentWidth - subContentIndent, 5, subContentIndent);
            y += 5;

            // Signatures
            if (y > 280) { pdf.addPage(); y = margin.top; }
            y += 10;
            
            const formattedDate = new Date(signatureDate + 'T00:00:00Z').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
            const teacherX = pageWidth - margin.right - 60;
            const principalX = margin.left + 10;

            if (signatureOption !== 'none') {
                if (signatureOption === 'both') {
                    pdf.text('Mengetahui,', principalX, y);
                    pdf.text('Kepala Sekolah', principalX, y + 5);
                    pdf.setFont('helvetica', 'bold');
                    pdf.text(schoolIdentity.principalName, principalX, y + 25);
                    pdf.setFont('helvetica', 'normal');
                    pdf.text(`NIP. ${schoolIdentity.principalNip}`, principalX, y + 30);
                }
                
                if (['teacher', 'both'].includes(signatureOption)) {
                    pdf.text(`${schoolIdentity.city || '.......'}, ${formattedDate}`, teacherX, y);
                    pdf.text(`Wali Kelas ${selectedClass.replace('Kelas ', '')}`, teacherX, y + 5);
                    pdf.setFont('helvetica', 'bold');
                    pdf.text(teacher.fullName, teacherX, y + 25);
                    pdf.setFont('helvetica', 'normal');
                    pdf.text(`NIP. ${teacher.nip}`, teacherX, y + 30);
                }
            }

            pdf.save(`Perencanaan-Kokurikuler-${activity.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
            setNotification({ message: 'PDF berhasil dibuat.', type: 'success' });

        } catch (error) {
            console.error(error);
            setNotification({ message: 'Gagal membuat PDF.', type: 'error' });
        } finally {
            setIsGeneratingPDF(false);
        }
    };

    return (
        <div className="bg-white p-8 rounded-xl shadow-lg min-h-[500px]">
            {notification && <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}

            {/* Header & Tabs */}
            <div className="flex justify-between items-center mb-4 gap-4">
                <div>
                   {userId && (
                        <button 
                            onClick={() => setIsPullModalOpen(true)}
                            disabled={isPulling}
                            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold shadow flex items-center space-x-2 disabled:bg-purple-400 text-sm"
                        >
                            {isPulling ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <SparklesIcon className="w-4 h-4" />}
                            <span>Tarik dari Induk</span>
                        </button>
                    )}
                </div>
                <div className="flex items-center space-x-2 bg-gray-50 p-2 rounded-lg border border-gray-200">
                    <label className="text-sm font-medium text-gray-700">Pilih Semester:</label>
                    <select value={selectedSemester} onChange={(e) => setSelectedSemester(e.target.value as any)} className="block w-32 pl-3 pr-8 py-1 border-gray-300 rounded-md text-sm">
                        <option value="Ganjil">Ganjil</option><option value="Genap">Genap</option>
                    </select>
                </div>
            </div>

            <div className="mb-8 text-center border-b pb-6">
                <h1 className="text-2xl font-bold text-gray-800 uppercase">PROGRAM KOKURIKULER</h1>
                <h2 className="text-lg font-bold text-gray-700 uppercase">{selectedClass.toUpperCase()} (FASE {phaseInfo.phase}) SEMESTER {selectedSemester.toUpperCase()}</h2>
                <h3 className="text-lg font-bold text-gray-700 uppercase">TAHUN AJARAN {selectedYear}</h3>
            </div>

            <div className="border-b border-gray-200 mb-6">
                <nav className="-mb-px flex space-x-2 justify-center">
                    {['tema', 'kegiatan', 'perencanaan'].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab as TabType)}
                            className={`whitespace-nowrap py-3 px-6 border-b-2 font-medium text-sm transition-all duration-200 ${
                                activeTab === tab ? 'border-indigo-600 text-indigo-600 bg-indigo-50 rounded-t-lg' : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            {tab === 'tema' && '1. Daftar Tema'}
                            {tab === 'kegiatan' && '2. Kegiatan Kokurikuler'}
                            {tab === 'perencanaan' && '3. Perencanaan Kokurikuler'}
                        </button>
                    ))}
                </nav>
            </div>

            {/* Content Area */}
            <div className="bg-gray-50 rounded-lg border border-dashed border-gray-300 p-6 min-h-[300px]">
                
                {/* TAB 1: TEMA */}
                {activeTab === 'tema' && (
                    <div>
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-semibold text-gray-800">Daftar Tema Kokurikuler</h3>
                            <div className="flex gap-2">
                                <button onClick={handleGenerateThemesAI} disabled={isSaving || isGenerating} className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 flex items-center gap-2 disabled:bg-purple-400">
                                    {isGenerating ? <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : <SparklesIcon className="w-5 h-5"/>} 
                                    Generate Deskripsi & Alokasi JP (AI)
                                </button>
                                <button onClick={handleAddThemeClick} disabled={isSaving} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 flex items-center gap-2">
                                    <SparklesIcon className="w-5 h-5"/> Tambah Tema
                                </button>
                            </div>
                        </div>
                        {themes.length === 0 ? (
                            <div className="text-center py-10 text-gray-500">Belum ada tema.</div>
                        ) : (
                            <div className="overflow-x-auto bg-white rounded-lg shadow border border-gray-200">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-100">
                                        <tr>
                                            <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider w-10">No</th>
                                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider w-1/4">Tema</th>
                                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Deskripsi</th>
                                            <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider w-24">Alokasi (JP)</th>
                                            <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider w-32">Status</th>
                                            <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider w-24">Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {themes.map((theme, index) => (
                                            <tr key={theme.id} className="hover:bg-gray-50">
                                                <td className="px-4 py-3 text-center text-sm text-gray-500">{index + 1}</td>
                                                <td className="px-4 py-3 text-sm font-medium text-gray-900">{theme.name}</td>
                                                <td className="px-4 py-3 text-sm text-gray-600">
                                                    {theme.description || <span className="text-gray-400 italic">Belum ada deskripsi</span>}
                                                </td>
                                                <td className="px-4 py-3 text-center text-sm font-bold text-indigo-600">{theme.totalJp || 0}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${theme.status === 'aktif' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                        {theme.status === 'aktif' ? 'Aktif' : 'Tidak Aktif'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center text-sm font-medium">
                                                    <button onClick={() => handleEditThemeClick(theme)} className="text-indigo-600 hover:text-indigo-900 mr-3"><PencilIcon className="w-5 h-5"/></button>
                                                    <button onClick={() => handleDeleteThemeClick(theme)} className="text-red-600 hover:text-red-900"><TrashIcon className="w-5 h-5"/></button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <div className="mt-4 text-xs text-gray-500 text-right">
                            * Alokasi waktu harus kelipatan {phaseInfo.multiple} JP. Total Target: {phaseInfo.totalJP} JP.
                        </div>
                    </div>
                )}

                {/* TAB 2: KEGIATAN */}
                {activeTab === 'kegiatan' && (
                    <div>
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-semibold text-gray-800">Daftar Kegiatan Kokurikuler</h3>
                            <div className="flex space-x-2">
                                <div className="relative">
                                    <button 
                                        onClick={() => setIsTab2PdfDropdownOpen(!isTab2PdfDropdownOpen)} 
                                        disabled={isGeneratingPDF}
                                        className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 font-semibold shadow flex items-center space-x-2 disabled:bg-gray-400"
                                    >
                                        <ArrowDownTrayIcon className="w-5 h-5"/> <span>{isGeneratingPDF ? 'Memproses...' : 'Download PDF'}</span>
                                    </button>
                                    {isTab2PdfDropdownOpen && (
                                        <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10 border" onMouseLeave={() => setIsTab2PdfDropdownOpen(false)}>
                                            <ul className="py-1">
                                                <li><button onClick={() => handleDownloadTab2PDF('none')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Tanpa TTD</button></li>
                                                <li><button onClick={() => handleDownloadTab2PDF('teacher')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">TTD Wali Kelas</button></li>
                                                <li><button onClick={() => handleDownloadTab2PDF('both')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">TTD Wali Kelas & KS</button></li>
                                            </ul>
                                        </div>
                                    )}
                                </div>
                                <button onClick={handleGenerateActivitiesAI} disabled={isSaving || isGenerating} className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 flex items-center gap-2 disabled:bg-purple-400">
                                    {isGenerating ? <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : <SparklesIcon className="w-5 h-5"/>} 
                                    Lengkapi Kegiatan dengan AI
                                </button>
                            </div>
                        </div>
                        {themes.filter(t => t.status === 'aktif').length === 0 ? (
                            <div className="text-center text-gray-500 py-8 bg-white rounded border">
                                <p>Belum ada tema yang <strong>Aktif</strong>.</p>
                                <button onClick={() => setActiveTab('tema')} className="mt-2 text-indigo-600 underline">Ke tab Daftar Tema</button> untuk mengaktifkan.
                            </div>
                        ) : (
                            <div className="overflow-x-auto bg-white rounded-lg shadow border border-gray-200">
                                <table className="min-w-full divide-y divide-gray-200 border-collapse">
                                    <thead className="bg-gray-100">
                                        <tr>
                                            <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider w-10 border-r border-gray-200">No</th>
                                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider border-r border-gray-200">Nama Kegiatan</th>
                                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider w-1/5 border-r border-gray-200">Tujuan Akhir</th>
                                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider w-1/5 border-r border-gray-200">Profil Lulusan</th>
                                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider w-1/6 border-r border-gray-200">Mapel Terkait</th>
                                            <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider w-16 border-r border-gray-200">Waktu</th>
                                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider w-1/6 border-r border-gray-200">Pelaksanaan</th>
                                            <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider w-20">Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {themes.filter(t => t.status === 'aktif').map((theme) => {
                                            const themeActivities = activities.filter(a => a.themeId === theme.id);
                                            return (
                                                <React.Fragment key={theme.id}>
                                                    <tr className="bg-indigo-50 border-b-2 border-indigo-100">
                                                        <td colSpan={8} className="px-4 py-3">
                                                            <div className="flex justify-between items-center">
                                                                <div>
                                                                    <span className="font-bold text-indigo-800 text-sm uppercase">TEMA: {theme.name}</span>
                                                                    {theme.description && <p className="text-xs text-indigo-600 mt-1 italic truncate max-w-3xl">{theme.description}</p>}
                                                                </div>
                                                                <span className="bg-indigo-200 text-indigo-800 text-xs font-bold px-2 py-1 rounded">
                                                                    Alokasi: {theme.totalJp || 0} JP
                                                                </span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                    {themeActivities.map((activity, aIndex) => (
                                                        <tr key={activity.id} className="hover:bg-gray-50">
                                                            <td className="px-4 py-4 text-center text-sm text-gray-500 align-top border-r border-gray-200">{aIndex + 1}</td>
                                                            <td className="px-4 py-4 text-sm text-gray-900 align-top border-r border-gray-200 font-semibold">{activity.name}</td>
                                                            <td className="px-4 py-4 text-sm text-gray-700 align-top border-r border-gray-200">{activity.goal}</td>
                                                            <td className="px-4 py-4 text-sm text-gray-700 align-top border-r border-gray-200">
                                                                <ul className="list-disc pl-4 space-y-1 text-xs">
                                                                    {activity.dimensions.map((dim, i) => (
                                                                        <li key={i}>
                                                                            <span className="font-semibold text-indigo-700">{dim.name}</span>
                                                                            <div className="text-gray-500 italic ml-1">- {dim.elements.join(', ')}</div>
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            </td>
                                                            <td className="px-4 py-4 text-sm text-gray-700 align-top border-r border-gray-200">
                                                                {activity.relatedSubjects && activity.relatedSubjects.length > 0 ? (
                                                                    <div className="flex flex-wrap gap-1">
                                                                        {activity.relatedSubjects.map((subj, i) => (
                                                                            <span key={i} className="bg-green-100 text-green-800 text-[10px] px-2 py-0.5 rounded-full font-medium">
                                                                                {subjectShortNames[subj] || subj}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                ) : <span className="text-gray-400 italic text-xs">-</span>}
                                                            </td>
                                                            <td className="px-4 py-4 text-sm text-gray-700 text-center align-top border-r border-gray-200">
                                                                <span className="font-semibold bg-gray-100 px-2 py-1 rounded">{activity.activityJp || 0} JP</span>
                                                            </td>
                                                            <td className="px-4 py-4 text-sm text-gray-700 align-top border-r border-gray-200">{activity.executionWeek || '-'}</td>
                                                            <td className="px-4 py-4 whitespace-nowrap text-center text-sm font-medium align-top">
                                                                <button type="button" onClick={(e) => handleEditActivityClick(e, activity)} className="text-indigo-600 hover:text-indigo-900 mr-2 p-1"><PencilIcon className="w-4 h-4"/></button>
                                                                <button type="button" onClick={(e) => handleDeleteActivityClick(e, activity)} className="text-red-600 hover:text-red-900 p-1"><TrashIcon className="w-4 h-4"/></button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    <tr>
                                                        <td colSpan={8} className="px-4 py-2 text-center border-b border-gray-200 bg-white">
                                                            <button onClick={() => handleAddActivityClick(theme.id)} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center justify-center w-full py-1 border border-dashed border-indigo-300 rounded hover:bg-indigo-50">
                                                                + Tambah Kegiatan untuk Tema Ini
                                                            </button>
                                                        </td>
                                                    </tr>
                                                </React.Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* TAB 3: PERENCANAAN */}
                {activeTab === 'perencanaan' && (
                    <div className="flex flex-col md:flex-row gap-6">
                        {/* Sidebar: Activity Selector */}
                        <div className="w-full md:w-1/3 bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden flex flex-col max-h-[800px]">
                            <div className="bg-indigo-50 px-4 py-3 border-b border-indigo-100 font-bold text-indigo-800">
                                Pilih Kegiatan
                            </div>
                            <div className="overflow-y-auto flex-1 p-2 space-y-4">
                                {themes.filter(t => t.status === 'aktif').length === 0 ? <p className="text-sm text-gray-500 text-center p-4">Tidak ada tema aktif.</p> :
                                themes.filter(t => t.status === 'aktif').map(theme => {
                                    const themeActs = activities.filter(a => a.themeId === theme.id);
                                    if (themeActs.length === 0) return null;
                                    return (
                                        <div key={theme.id} className="border border-gray-100 rounded-md">
                                            <div className="bg-gray-50 px-3 py-2 text-xs font-bold text-gray-600 uppercase tracking-wider border-b border-gray-100">
                                                {theme.name}
                                            </div>
                                            <div className="divide-y divide-gray-100">
                                                {themeActs.map(act => (
                                                    <button
                                                        key={act.id}
                                                        onClick={() => setActiveActivityId(act.id)}
                                                        className={`w-full text-left px-3 py-3 text-sm transition-colors ${activeActivityId === act.id ? 'bg-indigo-100 text-indigo-700 font-semibold border-l-4 border-indigo-500' : 'hover:bg-gray-50 text-gray-700'}`}
                                                    >
                                                        {act.name}
                                                        <div className="text-[10px] font-normal text-gray-500 mt-1">{act.executionWeek}</div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Main Editor */}
                        <div className="w-full md:w-2/3 bg-white border border-gray-200 rounded-lg shadow-sm p-6 max-h-[800px] overflow-y-auto">
                            {!activeActivityId ? (
                                <div className="h-full flex flex-col items-center justify-center text-gray-400 py-20">
                                    <SparklesIcon className="w-16 h-16 mb-4 opacity-20"/>
                                    <p>Pilih kegiatan di sebelah kiri untuk mulai merencanakan.</p>
                                </div>
                            ) : (
                                (() => {
                                    const activity = activities.find(a => a.id === activeActivityId);
                                    if (!activity) return <div>Kegiatan tidak ditemukan.</div>;
                                    const plan = planningData[activeActivityId] || { activityId: activeActivityId, modelPembelajaran: '', metodePembelajaran: '', ruangFisik: '', budayaBelajar: '', kemitraan: '', digital: '', kegiatanMingguan: [], asesmenFormatif: '', asesmenSumatif: '' };
                                    
                                    const totalWeeks = Math.ceil((activity.activityJp || 0) / phaseInfo.jpPerWeek) || 1;
                                    
                                    // Ensure kegiatanMingguan array matches totalWeeks
                                    const weeklyActivities = Array.from({ length: totalWeeks }, (_, i) => {
                                        const existing = plan.kegiatanMingguan?.find(k => k.mingguKe === i + 1);
                                        return existing || { mingguKe: i + 1, deskripsi: '' };
                                    });

                                    return (
                                        <div className="space-y-6">
                                            <div className="flex justify-between items-start border-b pb-4 sticky top-0 bg-white z-10 pt-2">
                                                <div>
                                                    <h3 className="text-xl font-bold text-gray-800">{activity.name}</h3>
                                                    <p className="text-sm text-gray-600 mt-1">Alokasi: {activity.activityJp} JP ({totalWeeks} Minggu) | Pelaksanaan: {activity.executionWeek}</p>
                                                </div>
                                                <div className="flex space-x-2">
                                                    <button onClick={handleGeneratePlanningAI} disabled={isGenerating} className="bg-purple-600 text-white px-3 py-1.5 rounded text-sm flex items-center hover:bg-purple-700 disabled:opacity-50">
                                                        {isGenerating ? <svg className="animate-spin h-4 w-4 mr-1 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : <SparklesIcon className="w-4 h-4 mr-1"/>} 
                                                        Generate Perencanaan Lengkap (AI)
                                                    </button>
                                                    <div className="relative">
                                                        <button 
                                                            onClick={() => setIsPdfDropdownOpen(!isPdfDropdownOpen)} 
                                                            disabled={isGeneratingPDF}
                                                            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-semibold shadow flex items-center space-x-2 disabled:bg-gray-400"
                                                        >
                                                            <ArrowDownTrayIcon className="w-4 h-4 mr-1"/> <span>{isGeneratingPDF ? '...' : 'PDF'}</span>
                                                        </button>
                                                        {isPdfDropdownOpen && (
                                                            <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10 border" onMouseLeave={() => setIsPdfDropdownOpen(false)}>
                                                                <ul className="py-1">
                                                                    <li><button onClick={() => handleDownloadTab3PDF('none')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Tanpa TTD</button></li>
                                                                    <li><button onClick={() => handleDownloadTab3PDF('teacher')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">TTD Wali Kelas</button></li>
                                                                    <li><button onClick={() => handleDownloadTab3PDF('both')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">TTD Wali Kelas & KS</button></li>
                                                                </ul>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <button onClick={handleSavePlanning} disabled={isSaving} className="bg-green-600 text-white px-3 py-1.5 rounded text-sm flex items-center hover:bg-green-700 disabled:opacity-50">
                                                        {isSaving ? 'Saving...' : 'Simpan'}
                                                    </button>
                                                </div>
                                            </div>

                                            {/* A. Dimensi (Read Only) */}
                                            <div className="bg-gray-50 p-4 rounded border">
                                                <h4 className="font-bold text-gray-700 mb-2">A. Dimensi Profil Lulusan</h4>
                                                <ul className="list-disc pl-5 text-sm text-gray-600">
                                                    {activity.dimensions.map((d, i) => (
                                                        <li key={i}><strong>{d.name}</strong>: {d.elements.join(', ')}</li>
                                                    ))}
                                                </ul>
                                            </div>

                                            {/* B. Tujuan (Read Only) */}
                                            <div className="bg-gray-50 p-4 rounded border">
                                                <h4 className="font-bold text-gray-700 mb-2">B. Tujuan Kegiatan</h4>
                                                <p className="text-sm text-gray-600">{activity.goal}</p>
                                            </div>

                                            {/* C. Praktik Pedagogis */}
                                            <div className="border p-4 rounded">
                                                <h4 className="font-bold text-gray-700 mb-3">C. Praktik Pedagogis</h4>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-sm font-medium mb-1">Model Pembelajaran</label>
                                                        <input type="text" className="w-full p-2 border rounded text-sm" value={plan.modelPembelajaran || ''} onChange={e => handlePlanChange('modelPembelajaran', e.target.value)} placeholder="Contoh: Project Based Learning" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium mb-1">Metode Pembelajaran</label>
                                                        <input type="text" className="w-full p-2 border rounded text-sm" value={plan.metodePembelajaran || ''} onChange={e => handlePlanChange('metodePembelajaran', e.target.value)} placeholder="Contoh: Diskusi, Observasi" />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* D. Lingkungan Belajar */}
                                            <div className="border p-4 rounded">
                                                <h4 className="font-bold text-gray-700 mb-3">D. Lingkungan Belajar</h4>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-sm font-medium mb-1">Ruang Fisik / Virtual</label>
                                                        <textarea className="w-full p-2 border rounded text-sm" rows={2} value={plan.ruangFisik || ''} onChange={e => handlePlanChange('ruangFisik', e.target.value)} placeholder="Contoh: Halaman sekolah, Kelas..." />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium mb-1">Budaya Belajar</label>
                                                        <textarea className="w-full p-2 border rounded text-sm" rows={2} value={plan.budayaBelajar || ''} onChange={e => handlePlanChange('budayaBelajar', e.target.value)} placeholder="Contoh: Saling menghargai, kolaboratif..." />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* E. Kemitraan */}
                                            <div className="border p-4 rounded">
                                                <h4 className="font-bold text-gray-700 mb-3">E. Kemitraan Pembelajaran</h4>
                                                <textarea className="w-full p-2 border rounded text-sm" rows={2} value={plan.kemitraan || ''} onChange={e => handlePlanChange('kemitraan', e.target.value)} placeholder="Pihak yang terlibat: Guru Kelas, Wali Murid, Narasumber..." />
                                            </div>

                                            {/* F. Digital */}
                                            <div className="border p-4 rounded">
                                                <h4 className="font-bold text-gray-700 mb-3">F. Pemanfaatan Digital</h4>
                                                <textarea className="w-full p-2 border rounded text-sm" rows={2} value={plan.digital || ''} onChange={e => handlePlanChange('digital', e.target.value)} placeholder="Teknologi yang digunakan: Kamera HP, Youtube, Canva..." />
                                            </div>

                                            {/* G. Kegiatan Mingguan */}
                                            <div className="border p-4 rounded bg-blue-50">
                                                <h4 className="font-bold text-gray-700 mb-3">G. Rincian Kegiatan Mingguan</h4>
                                                <div className="space-y-4">
                                                    {weeklyActivities.map((week, idx) => (
                                                        <div key={idx}>
                                                            <label className="block text-sm font-bold mb-1 text-indigo-700">Minggu ke-{week.mingguKe}</label>
                                                            <textarea 
                                                                className="w-full p-2 border rounded text-sm font-mono h-24"
                                                                value={week.deskripsi || ''}
                                                                onChange={e => handleWeeklyActivityChange(idx, e.target.value)}
                                                                placeholder="1. Langkah awal...&#10;2. Langkah selanjutnya..."
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* H. Asesmen */}
                                            <div className="border p-4 rounded">
                                                <h4 className="font-bold text-gray-700 mb-3">H. Asesmen</h4>
                                                <div className="grid grid-cols-1 gap-4">
                                                    <div>
                                                        <label className="block text-sm font-medium mb-1">Asesmen Formatif (Proses)</label>
                                                        <textarea className="w-full p-2 border rounded text-sm" rows={3} value={plan.asesmenFormatif || ''} onChange={e => handlePlanChange('asesmenFormatif', e.target.value)} placeholder="Teknik penilaian selama proses..." />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium mb-1">Asesmen Sumatif (Akhir)</label>
                                                        <textarea className="w-full p-2 border rounded text-sm" rows={3} value={plan.asesmenSumatif || ''} onChange={e => handlePlanChange('asesmenSumatif', e.target.value)} placeholder="Teknik penilaian hasil akhir..." />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Modal Konfirmasi Tarik Kokurikuler */}
            {isPullModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all animate-fade-in scale-100">
                        <div className="p-6">
                            <div className="flex items-center justify-center w-16 h-16 mx-auto bg-purple-100 rounded-full mb-4">
                                <SparklesIcon className="w-10 h-10 text-purple-600" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 text-center mb-2">Tarik Program Kokurikuler?</h3>
                            <p className="text-gray-600 text-center text-sm mb-6">
                                Anda akan menyalin data Program Kokurikuler dari Admin untuk Semester <span className="font-bold">{selectedSemester}</span>. 
                                <br/><br/>
                                <span className="text-red-600 font-bold">Peringatan:</span> Seluruh tema, kegiatan, dan perencanaan yang sudah Anda buat atau ubah sendiri untuk semester ini akan <span className="underline">ditimpa sepenuhnya</span>.
                            </p>
                            <div className="flex flex-col gap-2">
                                <button 
                                    onClick={handlePullFromMaster}
                                    disabled={isPulling}
                                    className="w-full py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-colors shadow-lg flex items-center justify-center gap-2"
                                >
                                    {isPulling ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : null}
                                    {isPulling ? 'SEDANG MENYALIN...' : 'YA, TARIK DATA SEKARANG'}
                                </button>
                                <button 
                                    onClick={() => setIsPullModalOpen(false)}
                                    disabled={isPulling}
                                    className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                                >
                                    BATALKAN
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* --- MODAL FOR THEME --- */}
            {isThemeModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setIsThemeModalOpen(false)}>
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="p-6">
                            <h3 className="text-lg font-bold text-gray-900 mb-4">{currentTheme ? 'Edit Tema' : 'Tambah Tema'}</h3>
                            <form onSubmit={handleSaveTheme}>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Nama Tema</label>
                                        <input type="text" className="w-full p-2 border rounded mt-1" value={themeForm.name} onChange={e => setThemeForm({...themeForm, name: e.target.value})} required />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Status</label>
                                        <select 
                                            value={themeForm.status} 
                                            onChange={e => setThemeForm({...themeForm, status: e.target.value as any})}
                                            className="w-full p-2 border rounded mt-1"
                                        >
                                            <option value="aktif">Aktif</option>
                                            <option value="tidak aktif">Tidak Aktif</option>
                                        </select>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <div className="flex-1">
                                            <label className="block text-sm font-medium text-gray-700">Alokasi JP</label>
                                            <input type="number" className="w-full p-2 border rounded mt-1" value={themeForm.totalJp} onChange={e => setThemeForm({...themeForm, totalJp: parseInt(e.target.value) || 0})} required min="0" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Deskripsi</label>
                                        <textarea className="w-full p-2 border rounded mt-1 h-24" value={themeForm.description} onChange={e => setThemeForm({...themeForm, description: e.target.value})} />
                                    </div>
                                </div>
                                <div className="mt-6 flex justify-end gap-2">
                                    <button type="button" onClick={() => setIsThemeModalOpen(false)} className="px-4 py-2 bg-gray-100 rounded">Batal</button>
                                    <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded">Simpan</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* --- MODAL FOR DELETE THEME --- */}
            {themeToDelete && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setThemeToDelete(null)}>
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6 text-center" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold mb-2">Hapus Tema?</h3>
                        <p className="text-sm text-gray-500 mb-6">"{themeToDelete.name}" akan dihapus permanen beserta kegiatannya.</p>
                        <div className="flex justify-center gap-2">
                            <button onClick={() => setThemeToDelete(null)} className="px-4 py-2 bg-gray-100 rounded">Batal</button>
                            <button onClick={confirmDeleteTheme} className="px-4 py-2 bg-red-600 text-white rounded">Hapus</button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- MODAL FOR DELETE ACTIVITY --- */}
            {activityToDelete && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setActivityToDelete(null)}>
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6 text-center" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold mb-2">Hapus Kegiatan?</h3>
                        <p className="text-sm text-gray-500 mb-6">Kegiatan "{activityToDelete.name}" akan dihapus permanen.</p>
                        <div className="flex justify-center gap-2">
                            <button type="button" onClick={() => setActivityToDelete(null)} className="px-4 py-2 bg-gray-100 rounded">Batal</button>
                            <button type="button" onClick={confirmDeleteActivity} className="px-4 py-2 bg-red-600 text-white rounded">Hapus</button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- MODAL FOR ACTIVITY --- */}
            {isActivityModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setIsActivityModalOpen(false)}>
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="p-6">
                            <h3 className="text-lg font-bold text-gray-900 mb-4">{currentActivity ? 'Edit Kegiatan' : 'Tambah Kegiatan'}</h3>
                            <form onSubmit={handleSaveActivity} className="space-y-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Nama Kegiatan</label>
                                    <input type="text" required className="mt-1 w-full p-2 border rounded" value={activityForm.name} onChange={e => setActivityForm({...activityForm, name: e.target.value})} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Tujuan Akhir Kegiatan</label>
                                    <textarea required className="mt-1 w-full p-2 border rounded" value={activityForm.goal} onChange={e => setActivityForm({...activityForm, goal: e.target.value})} />
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Alokasi Waktu (JP)</label>
                                        <input 
                                            type="number" 
                                            required 
                                            className="mt-1 w-full p-2 border rounded" 
                                            value={activityForm.activityJp} 
                                            onChange={e => setActivityForm({...activityForm, activityJp: parseInt(e.target.value) || 0})}
                                            min="0"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                            Kelipatan yang disarankan: {phaseInfo.jpPerWeek} JP.
                                        </p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Pelaksanaan</label>
                                        <input 
                                            type="text" 
                                            required 
                                            placeholder="Contoh: Minggu ke-1 s.d. Minggu ke-2"
                                            className="mt-1 w-full p-2 border rounded" 
                                            value={activityForm.executionWeek} 
                                            onChange={e => setActivityForm({...activityForm, executionWeek: e.target.value})} 
                                        />
                                        <p className="text-xs text-gray-500 mt-1">Isi dengan keterangan minggu efektif.</p>
                                    </div>
                                </div>

                                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                    <h4 className="text-sm font-bold text-gray-800 mb-2">Pilih Profil Lulusan (Minimal 2 Dimensi)</h4>
                                    
                                    <div className="flex gap-2 mb-2">
                                        <select 
                                            className="flex-1 p-2 border rounded text-sm"
                                            value={selectedDimKey}
                                            onChange={e => { setSelectedDimKey(e.target.value); setSelectedSubElements([]); }}
                                        >
                                            <option value="">-- Pilih Dimensi --</option>
                                            {DIMENSION_KEYS.map(key => <option key={key} value={key}>{key}</option>)}
                                        </select>
                                        <button 
                                            type="button" 
                                            onClick={handleAddDimensionToForm}
                                            disabled={!selectedDimKey || selectedSubElements.length === 0}
                                            className="px-3 py-2 bg-indigo-600 text-white rounded text-sm disabled:bg-gray-300"
                                        >
                                            + Tambah
                                        </button>
                                    </div>

                                    {selectedDimKey && (
                                        <div className="mb-4 pl-2">
                                            <p className="text-xs text-gray-500 mb-1">Pilih Sub-elemen:</p>
                                            <div className="grid grid-cols-1 gap-1">
                                                {DIMENSIONS_DATA[selectedDimKey]?.map(element => (
                                                    <label key={element} className="flex items-center text-sm">
                                                        <input 
                                                            type="checkbox" 
                                                            className="mr-2"
                                                            checked={selectedSubElements.includes(element)}
                                                            onChange={e => {
                                                                if (e.target.checked) setSelectedSubElements([...selectedSubElements, element]);
                                                                else setSelectedSubElements(selectedSubElements.filter(el => el !== element));
                                                            }}
                                                        />
                                                        {element}
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="space-y-2 mt-4">
                                        {activityForm.dimensions.map((dim, idx) => (
                                            <div key={idx} className="bg-white p-2 border rounded text-sm flex justify-between items-start">
                                                <div>
                                                    <div className="font-bold text-indigo-700">{dim.name}</div>
                                                    <ul className="list-disc pl-4 text-gray-600 text-xs">
                                                        {dim.elements.map((el, i) => <li key={i}>{el}</li>)}
                                                    </ul>
                                                </div>
                                                <button type="button" onClick={() => handleRemoveDimensionFromForm(dim.name)} className="text-red-500 hover:text-red-700">
                                                    <XCircleIcon className="w-5 h-5"/>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    {activityForm.dimensions.length < 2 && <p className="text-xs text-red-500 mt-1">* Harap tambahkan minimal 2 dimensi.</p>}
                                </div>

                                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                    <h4 className="text-sm font-bold text-gray-800 mb-2">Mata Pelajaran Terkait (Pilih Minimal 1)</h4>
                                    <div className="grid grid-cols-2 gap-2 text-sm max-h-40 overflow-y-auto">
                                        {subjects.map(subject => (
                                            <label key={subject.id} className="flex items-center">
                                                <input
                                                    type="checkbox"
                                                    className="mr-2"
                                                    checked={activityForm.relatedSubjects.includes(subject.name)}
                                                    onChange={() => handleSubjectToggle(subject.name)}
                                                />
                                                {subject.name}
                                            </label>
                                        ))}
                                    </div>
                                    {activityForm.relatedSubjects.length === 0 && <p className="text-xs text-red-500 mt-1">* Harap pilih minimal 1 mata pelajaran.</p>}
                                </div>

                                <div className="flex justify-end gap-2">
                                    <button type="button" onClick={() => setIsActivityModalOpen(false)} className="px-4 py-2 bg-gray-100 rounded">Batal</button>
                                    <button type="submit" disabled={isSaving || activityForm.dimensions.length < 2} className="px-4 py-2 bg-indigo-600 text-white rounded disabled:bg-indigo-300">Simpan</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProgramKokurikuler;
