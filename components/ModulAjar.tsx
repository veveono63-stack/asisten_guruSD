
import React, { useState, useEffect, useMemo } from 'react';
import { Teacher, SchoolIdentity, ModulAjarData, ModulAjar, ProsemData, ProsemRow } from '../types';
import { getModulAjar, updateModulAjar, getTeacherProfile, getSchoolIdentity, getSubjects, getProsem, pullModulAjarToTeacher } from '../services/adminService';
import Notification, { NotificationType } from './Notification';
import { PencilIcon, SparklesIcon, ArrowDownTrayIcon, ArrowPathIcon } from './Icons';
import { generateContentWithRotation } from '../services/geminiService';
import { Type } from '@google/genai';

declare const jspdf: any;

interface ModulAjarProps {
    selectedClass: string;
    selectedYear: string;
    userId?: string;
}

const subjectSortOrder = [
    'pendidikan agama islam dan budi pekerti', 'pendidikan pancasila', 'bahasa indonesia',
    'matematika', 'ilmu pengetahuan alam dan sosial', 'pendidikan jasmani, olahraga, dan kesehatan',
    'seni budaya', 'bahasa inggris', 'bahasa jawa', 'pendidikan lingkungan hidup',
    'koding dan kecerdasan artifisial',
];
const masterArtSubjects = ['Seni Rupa', 'Seni Musik', 'Seni Tari', 'Seni Teater'];
const getSortIndex = (subjectName: string): number => {
    const lowerName = subjectName.toLowerCase();
    if (lowerName.startsWith('seni')) return subjectSortOrder.indexOf('seni budaya');
    if (lowerName.startsWith('bahasa inggris')) return subjectSortOrder.indexOf('bahasa inggris');
    const index = subjectSortOrder.indexOf(lowerName);
    return index === -1 ? 99 : index;
};

const PROFIL_LULUSAN_OPTIONS = [
    "Keimanan dan Ketakwaan",
    "Kewargaan",
    "Penalaran Kritis",
    "Kreativitas",
    "Kolaborasi",
    "Kemandirian",
    "Kesehatan",
    "Komunikasi"
];

const emptyModulAjar = (id: string, defaultTp: string = ''): ModulAjar => ({
    id,
    identifikasi: [],
    tujuanPembelajaran: defaultTp,
    modelPembelajaran: '',
    metodePembelajaran: '',
    kemitraan: '',
    lingkunganFisik: '',
    lingkunganBudaya: '',
    digital: '',
    pengalaman: '',
    asesmenAwal: '',
    asesmenFormatif: '',
    asesmenSumatif: '',
});

const ModulAjarComponent: React.FC<ModulAjarProps> = ({ selectedClass, selectedYear, userId }) => {
    const [subjectsForDropdown, setSubjectsForDropdown] = useState<{ id: string, name: string }[]>([]);
    const [selectedSubjectId, setSelectedSubjectId] = useState('');
    const [activeArtTab, setActiveArtTab] = useState<string>(masterArtSubjects[0]);
    const [selectedSemester, setSelectedSemester] = useState<'Ganjil' | 'Genap'>('Ganjil');
    
    const [prosemData, setProsemData] = useState<ProsemData>({ rows: [] });
    const [modulAjarData, setModulAjarData] = useState<ModulAjarData>({});
    const [activeEditorId, setActiveEditorId] = useState<string | null>(null);
    
    const [teacher, setTeacher] = useState<Teacher | null>(null);
    const [schoolIdentity, setSchoolIdentity] = useState<SchoolIdentity | null>(null);
    
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isPulling, setIsPulling] = useState(false);
    const [isPullModalOpen, setIsPullModalOpen] = useState(false);
    const [notification, setNotification] = useState<{ message: string; type: NotificationType } | null>(null);
    const [signatureDate, setSignatureDate] = useState(new Date().toISOString().split('T')[0]);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

    useEffect(() => {
        const fetchInitial = async () => {
            try {
                const [fetchedSubjects, teacherData, identityData] = await Promise.all([
                    getSubjects(selectedYear, selectedClass, userId),
                    getTeacherProfile(selectedYear, selectedClass, userId),
                    getSchoolIdentity(userId)
                ]);
                setTeacher(teacherData);
                setSchoolIdentity(identityData);

                const regularSubjectsMap = new Map<string, { id: string; name: string }>();
                fetchedSubjects.forEach(s => {
                    if (!s.name.toLowerCase().startsWith('seni')) {
                        if (!regularSubjectsMap.has(s.name)) regularSubjectsMap.set(s.name, { id: s.code.toLowerCase(), name: s.name });
                    }
                });
                let dropdownSubjects = Array.from(regularSubjectsMap.values());
                if (fetchedSubjects.some(s => s.name.toLowerCase().startsWith('seni'))) {
                    dropdownSubjects.push({ id: 'seni-budaya-group', name: 'Seni Budaya' });
                }
                const sorted = dropdownSubjects.sort((a, b) => getSortIndex(a.name) - getSortIndex(b.name));
                setSubjectsForDropdown(sorted);
                if (sorted.length > 0) setSelectedSubjectId(sorted[0].id);
            } catch (e: any) { setNotification({ message: e.message, type: 'error' }); }
        };
        fetchInitial();
    }, [selectedClass, selectedYear, userId]);

    const finalSubjectIdForApi = useMemo(() => {
        if (selectedSubjectId !== 'seni-budaya-group') return selectedSubjectId;
        return activeArtTab.toLowerCase().replace(/\s+/g, '-');
    }, [selectedSubjectId, activeArtTab]);

    const selectedSubjectName = useMemo(() => {
        if (selectedSubjectId === 'seni-budaya-group') return activeArtTab;
        const subject = subjectsForDropdown.find(s => s.id === selectedSubjectId);
        return subject ? subject.name : '';
    }, [subjectsForDropdown, selectedSubjectId, activeArtTab]);

    useEffect(() => {
        if (!finalSubjectIdForApi) return;
        const fetchData = async () => {
            setIsLoading(true);
            setActiveEditorId(null);
            try {
                const [pData, mAjarData] = await Promise.all([
                    getProsem(selectedYear, selectedClass, finalSubjectIdForApi, selectedSemester, userId),
                    getModulAjar(selectedYear, selectedClass, finalSubjectIdForApi, selectedSemester, userId)
                ]);
                setProsemData(pData);
                
                const sanitizedModulData = { ...mAjarData };
                Object.keys(sanitizedModulData).forEach(key => {
                    if (!Array.isArray(sanitizedModulData[key].identifikasi)) {
                        sanitizedModulData[key].identifikasi = [];
                    }
                });
                setModulAjarData(sanitizedModulData || {});
            } catch (error: any) {
                setNotification({ message: error.message || 'Gagal memuat data.', type: 'error' });
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [finalSubjectIdForApi, selectedSemester, selectedClass, selectedYear, userId]);

    const groupedTopics = useMemo(() => {
        const groups = new Map<string, { topic: string, totalJp: number, subTopics: ProsemRow[], meetingDates: string[] }>();
        prosemData.rows.forEach(row => {
            if (!groups.has(row.protaRowId)) {
                groups.set(row.protaRowId, {
                    topic: row.materi,
                    totalJp: 0,
                    subTopics: [],
                    meetingDates: []
                });
            }
            const group = groups.get(row.protaRowId)!;
            group.subTopics.push(row);
            group.totalJp += row.alokasiWaktu;
            if (row.keterangan) {
                const dates = row.keterangan.split(',').map(d => d.trim()).filter(d => d);
                group.meetingDates.push(...dates);
            }
        });
        groups.forEach(group => {
            const uniqueDates = Array.from(new Set(group.meetingDates));
            uniqueDates.sort((a, b) => {
                 const [da, ma, ya] = a.split('-').map(Number);
                 const [db, mb, yb] = b.split('-').map(Number);
                 return new Date(ya, ma-1, da).getTime() - new Date(yb, mb-1, db).getTime();
            });
            group.meetingDates = uniqueDates;
        });
        return Array.from(groups.entries());
    }, [prosemData]);

    const handleEditClick = (topicId: string, defaultATPs: string) => {
        if (activeEditorId === topicId) {
            setActiveEditorId(null);
        } else {
            const formattedTP = defaultATPs.replace(/^\s*\d+[\.\)]\s*/gm, '• ');
            if (!modulAjarData[topicId]) {
                setModulAjarData(prev => ({ ...prev, [topicId]: emptyModulAjar(topicId, formattedTP) }));
            }
            setActiveEditorId(topicId);
        }
    };

    const handleFormChange = (topicId: string, field: keyof ModulAjar, value: any) => {
        setModulAjarData(prev => ({
            ...prev,
            [topicId]: { ...prev[topicId], [field]: value }
        }));
    };

    const handleDimensionToggle = (topicId: string, dimension: string) => {
        setModulAjarData(prev => {
            const currentList = prev[topicId]?.identifikasi || [];
            const newList = currentList.includes(dimension)
                ? currentList.filter(d => d !== dimension)
                : [...currentList, dimension];
            return { ...prev, [topicId]: { ...prev[topicId], identifikasi: newList } };
        });
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await updateModulAjar(selectedYear, selectedClass, finalSubjectIdForApi, selectedSemester, modulAjarData, userId);
            setNotification({ message: 'Modul Ajar berhasil disimpan.', type: 'success' });
        } catch (e: any) {
            setNotification({ message: e.message, type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    const handlePullFromMaster = async () => {
        if (!userId || !finalSubjectIdForApi) return;
        setIsPulling(true);
        setNotification(null);
        try {
            await pullModulAjarToTeacher(selectedYear, selectedClass, finalSubjectIdForApi, selectedSemester, userId);
            const refreshedData = await getModulAjar(selectedYear, selectedClass, finalSubjectIdForApi, selectedSemester, userId);
            setModulAjarData(refreshedData);
            setNotification({ message: 'Modul Ajar berhasil ditarik dari induk.', type: 'success' });
            setIsPullModalOpen(false);
        } catch (error: any) {
            setNotification({ message: error.message, type: 'error' });
        } finally {
            setIsPulling(false);
        }
    };

    const handleGenerateAI = async (topicId: string, topicData: { topic: string, totalJp: number, subTopics: ProsemRow[], meetingDates: string[] }) => {
        setIsGenerating(true);
        setNotification({ message: 'AI sedang menyusun Modul Ajar, mohon tunggu...', type: 'info' });

        try {
            const atpList = Array.from(new Set(topicData.subTopics.map(s => s.atp))).join('\n');
            
            const meetingDetails: string[] = [];
            const materialUsageCount = new Map<string, number>();

            topicData.meetingDates.forEach((date, index) => {
                const matchingSubTopic = topicData.subTopics.find(st => st.keterangan?.includes(date));
                const materialName = matchingSubTopic ? matchingSubTopic.lingkupMateri : topicData.topic;
                
                const currentCount = (materialUsageCount.get(materialName) || 0) + 1;
                materialUsageCount.set(materialName, currentCount);

                const label = currentCount > 1 ? `${materialName} (Lanjutan)` : materialName;
                meetingDetails.push(`Pertemuan ${index + 1}: ${label}`);
            });

            const totalMeetings = meetingDetails.length || 1;

            const prompt = `
                Peran: Guru SD profesional.
                Tugas: Buat konten Modul Ajar untuk Topik: "${topicData.topic}".
                
                JUMLAH PERTEMUAN WAJIB: TEPAT ${totalMeetings} BLOK PERTEMUAN. 
                JANGAN MENAMBAH ATAU MENGURANGI JUMLAH PERTEMUAN INI.

                Rencana Materi Per Pertemuan:
                ${meetingDetails.join('\n')}

                INSTRUKSI FORMAT (SANGAT KETAT):
                1. Judul Pertemuan format: "PERTEMUAN [X] : [Materi]".
                2. Struktur kegiatan di setiap pertemuan:
                   1. Pendahuluan:
                      a. [Butir 1]
                      b. [Butir 2]
                   2. Inti:
                      a. [Butir 1]
                      b. [Butir 2]
                   3. Penutup:
                      a. [Butir 1]
                      b. [Butir 2]
                3. **WAJIB & KRITIKAL**: Gunakan karakter newline (\\n) secara eksplisit di SETIAP akhir baris teks. Pastikan judul pertemuan, sub-judul (Pendahuluan, Inti, Penutup), dan setiap butir kegiatan (a, b, c) berada di baris baru masing-masing. JANGAN biarkan teks menjadi satu blok paragraf panjang.
                4. Bagian IDENTIFIKASI: Pilih minimal 3 dimensi profil lulusan dari: ${PROFIL_LULUSAN_OPTIONS.join(', ')}.
                5. Bagian ASESMEN: Tulis poin-poin instrumen yang dipisahkan dengan \\n di setiap akhir butir soal/instrumen.

                Output JSON:
                {
                  "identifikasi": ["Dimensi 1", "Dimensi 2", "Dimensi 3"],
                  "modelPembelajaran": "...",
                  "metodePembelajaran": "...",
                  "kemitraan": "...",
                  "lingkunganFisik": "...",
                  "lingkunganBudaya": "...",
                  "digital": "...",
                  "pengalaman": "PERTEMUAN 1: [Materi]\\n1. Pendahuluan:\\na. [Kegiatan...]\\nb. [Kegiatan...]\\n2. Inti:\\na. [Kegiatan...]\\nb. [Kegiatan...]\\n3. Penutup:\\na. [Kegiatan...]\\n\\nPERTEMUAN 2: ...",
                  "asesmenAwal": "1. [Pertanyaan...]\\n2. [Pertanyaan...]",
                  "asesmenFormatif": "1. [Instrumen...]\\n2. [Instrumen...]",
                  "asesmenSumatif": "1. [Soal...]\\n2. [Soal...]"
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
                            identifikasi: { type: Type.ARRAY, items: { type: Type.STRING } },
                            modelPembelajaran: { type: Type.STRING },
                            metodePembelajaran: { type: Type.STRING },
                            kemitraan: { type: Type.STRING },
                            lingkunganFisik: { type: Type.STRING },
                            lingkunganBudaya: { type: Type.STRING },
                            digital: { type: Type.STRING },
                            pengalaman: { 
                                type: Type.STRING, 
                                description: "Rincian langkah pembelajaran setiap pertemuan yang WAJIB dipisahkan dengan baris baru (\\n) untuk setiap judul, sub-judul, dan poin kegiatan guna menjaga struktur dokumen." 
                            },
                            asesmenAwal: { type: Type.STRING, description: "Poin-poin asesmen awal yang dipisahkan dengan \\n." },
                            asesmenFormatif: { type: Type.STRING, description: "Poin-poin asesmen proses yang dipisahkan dengan \\n." }, 
                            asesmenSumatif: { type: Type.STRING, description: "Poin-poin asesmen akhir yang dipisahkan dengan \\n." },  
                        },
                        required: ["identifikasi", "modelPembelajaran", "metodePembelajaran", "kemitraan", "lingkunganFisik", "lingkunganBudaya", "digital", "pengalaman", "asesmenAwal", "asesmenFormatif", "asesmenSumatif"]
                    }
                }
            });

            const result = JSON.parse(response.text.trim());
            const formattedTP = atpList.replace(/^\s*\d+[\.\)]\s*/gm, '• ');

            setModulAjarData(prev => ({
                ...prev,
                [topicId]: {
                    ...prev[topicId],
                    ...result,
                    id: topicId,
                    tujuanPembelajaran: prev[topicId]?.tujuanPembelajaran || formattedTP
                }
            }));
            setNotification({ message: 'Modul Ajar berhasil digenerate!', type: 'success' });

        } catch (error: any) {
            setNotification({ message: 'Gagal generate AI. ' + error.message, type: 'error' });
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDownloadPDF = async (topicId: string, topicData: { topic: string, totalJp: number, subTopics: ProsemRow[], meetingDates: string[] }) => {
        const data = modulAjarData[topicId];
        if (!data) return;
        setIsGeneratingPDF(true);
        setNotification({ message: 'Mempersiapkan PDF...', type: 'info' });
        await new Promise(r => setTimeout(r, 50));

        try {
            const { jsPDF } = jspdf;
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [215, 330] });

            const margin = { top: 10, right: 10, bottom: 10, left: 25 };
            const pageWidth = 215;
            const contentWidth = pageWidth - margin.left - margin.right;
            let y = margin.top;

            // Robust Page Break Helper
            const checkPageBreak = (neededHeight: number) => {
                if (y + neededHeight > 310) {
                    pdf.addPage();
                    y = margin.top + 10;
                    return true;
                }
                return false;
            };

            const addTitle = (text: string) => {
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(11); 
                pdf.text(text, pageWidth / 2, y, { align: 'center' });
                y += 8;
            };

            const addSectionHeader = (text: string) => {
                checkPageBreak(12);
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(11); 
                pdf.text(text, margin.left, y);
                y += 6;
            };

            const addLabelValue = (label: string, value: string) => {
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(11); 
                pdf.text(label, margin.left, y);
                const colonPrefix = ": ";
                const valX = margin.left + 50;
                const colonWidth = pdf.getStringUnitWidth(colonPrefix) * 11 / pdf.internal.scaleFactor;
                const availableWidth = contentWidth - 50 - colonWidth;
                const lines = pdf.splitTextToSize(value || "-", availableWidth);
                pdf.text(colonPrefix + lines[0], valX, y);
                y += 6;
                for (let i = 1; i < lines.length; i++) {
                    checkPageBreak(6);
                    pdf.text(lines[i], valX + colonWidth, y);
                    y += 6;
                }
            };

            const addSubField = (label: string, value: string, indent: number = 5) => {
                checkPageBreak(10);
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(11); 
                pdf.text(label, margin.left + indent, y);
                const colonPrefix = ": ";
                const textX = margin.left + indent + 45;
                const colonWidth = pdf.getStringUnitWidth(colonPrefix) * 11 / pdf.internal.scaleFactor;
                const availableWidth = contentWidth - (indent + 45) - colonWidth;
                const lines = pdf.splitTextToSize(value || "-", availableWidth);
                pdf.text(colonPrefix + lines[0], textX, y);
                y += 6;
                for (let i = 1; i < lines.length; i++) {
                    checkPageBreak(6);
                    pdf.text(lines[i], textX + colonWidth, y);
                    y += 6;
                }
            };

            const printMixedText = (text: string, x: number, startY: number, maxWidth: number, lineHeight: number): number => {
                const lines = (text || "").split('\n');
                let cursorY = startY;

                lines.forEach(line => {
                    const cleanLine = line.trim();
                    if (!cleanLine) {
                        cursorY += lineHeight;
                        return;
                    }

                    const mainListMatch = cleanLine.match(/^(\d+[\.\)])\s+/);
                    const subListMatch = cleanLine.match(/^([a-zA-Z][\.\)])\s+/);
                    
                    let currentX = x;
                    let currentMaxWidth = maxWidth;
                    let hangingIndent = 0;

                    if (mainListMatch) {
                        const marker = mainListMatch[0];
                        hangingIndent = pdf.getStringUnitWidth(marker) * 11 / pdf.internal.scaleFactor;
                    } else if (subListMatch) {
                        const level1MarkerWidth = 6; 
                        currentX = x + level1MarkerWidth;
                        currentMaxWidth = maxWidth - level1MarkerWidth;
                        const marker = subListMatch[0];
                        hangingIndent = pdf.getStringUnitWidth(marker) * 11 / pdf.internal.scaleFactor;
                    }

                    const wrappedLines = pdf.splitTextToSize(cleanLine, currentMaxWidth);
                    wrappedLines.forEach((wl: string, idx: number) => {
                        if (cursorY + lineHeight > 315) {
                            pdf.addPage();
                            cursorY = margin.top + 10;
                        }
                        pdf.setFont('helvetica', 'normal');
                        pdf.setFontSize(11);
                        const printX = (idx > 0) ? currentX + hangingIndent : currentX;
                        pdf.text(wl, printX, cursorY);
                        cursorY += lineHeight;
                    });
                });
                return cursorY;
            };

            addTitle("PERENCANAAN PEMBELAJARAN MENDALAM");
            y += 2;
            const phase = selectedClass.includes('I') || selectedClass.includes('II') ? 'A' : (selectedClass.includes('III') || selectedClass.includes('IV') ? 'B' : 'C');
            addLabelValue("Satuan Pendidikan", schoolIdentity?.schoolName || "");
            addLabelValue("Nama Penyusun", teacher?.fullName || "");
            addLabelValue("Mata Pelajaran", selectedSubjectName);
            addLabelValue("Materi/Tema", topicData.topic);
            addLabelValue("Kelas/Fase/Semester", `${selectedClass.replace('Kelas ', '')} / ${phase} / ${selectedSemester}`);
            addLabelValue("Tahun Pelajaran", selectedYear); // Positioned above Alokasi Waktu
            addLabelValue("Alokasi Waktu", `${topicData.totalJp} JP (${topicData.meetingDates.length} Kali Pertemuan)`); // Now at the bottom
            y += 5;

            addSectionHeader("A. IDENTIFIKASI PEMBELAJARAN");
            pdf.setFont('helvetica', 'normal'); pdf.setFontSize(11);
            pdf.text("Dimensi Profil Lulusan:", margin.left, y); y += 6;
            const dims = PROFIL_LULUSAN_OPTIONS;
            dims.forEach((dim, index) => {
                checkPageBreak(6);
                const isChecked = data.identifikasi?.includes(dim);
                const currentX = index % 2 === 0 ? margin.left + 5 : margin.left + 90;
                pdf.setDrawColor(0); pdf.setLineWidth(0.2);
                pdf.rect(currentX, y - 4, 4, 4);
                if (isChecked) { pdf.setFont('zapfdingbats'); pdf.text('3', currentX + 0.5, y - 0.5); }
                pdf.setFont('helvetica', 'normal'); pdf.setFontSize(11);
                pdf.text(dim, currentX + 6, y);
                if (index % 2 !== 0 || index === dims.length - 1) y += 6;
            });
            y += 5;

            addSectionHeader("B. DESAIN PEMBELAJARAN");
            pdf.setFont('helvetica', 'bold'); pdf.text("Tujuan Pembelajaran:", margin.left, y); y += 6;
            const tpLines = (data.tujuanPembelajaran || "").split('\n').filter(t => t.trim());
            tpLines.forEach(tp => { checkPageBreak(6); y = printMixedText(tp, margin.left, y, contentWidth, 6); });
            y += 2; pdf.setFont('helvetica', 'bold'); pdf.text("Praktik Pedagogis", margin.left, y); y += 6;
            addSubField("Model", data.modelPembelajaran); addSubField("Metode", data.metodePembelajaran);
            y += 2; pdf.setFont('helvetica', 'bold'); pdf.text("Kemitraan Pembelajaran", margin.left, y); y += 6;
            y = printMixedText(data.kemitraan || "-", margin.left, y, contentWidth, 6);
            y += 2; pdf.setFont('helvetica', 'bold'); pdf.text("Lingkungan Pembelajaran", margin.left, y); y += 6;
            addSubField("Ruang Fisik/Virtual", data.lingkunganFisik); addSubField("Budaya Belajar", data.lingkunganBudaya);
            y += 2; pdf.setFont('helvetica', 'bold'); pdf.text("Pemanfaatan Digital", margin.left, y); y += 6;
            y = printMixedText(data.digital || "-", margin.left, y, contentWidth, 6);
            y += 6;

            addSectionHeader("C. PENGALAMAN BELAJAR");
            const processFormattedText = (textBlock: string) => {
                const lines = textBlock.split('\n');
                let firstMeeting = true;
                lines.forEach((line) => {
                    let cleanLine = line.trim();
                    if (!cleanLine) return;
                    const upperPlainText = cleanLine.replace(/\*\*/g, '').toUpperCase();
                    const isMeetingHeader = upperPlainText.startsWith('PERTEMUAN');
                    const isHeader = isMeetingHeader || upperPlainText.startsWith('PENDAHULUAN') || upperPlainText.startsWith('INTI') || upperPlainText.startsWith('PENUTUP');
                    if (isHeader) {
                        if (isMeetingHeader) { if (!firstMeeting) { y += 6; } firstMeeting = false; }
                        checkPageBreak(10); 
                        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11);
                        pdf.text(cleanLine.replace(/\*\*/g, ''), margin.left, y); y += 6;
                    } else {
                        y = printMixedText(line, margin.left, y, contentWidth, 6);
                    }
                });
            };
            processFormattedText(data.pengalaman);
            y += 5;

            addSectionHeader("D. ASESMEN PEMBELAJARAN");
            
            checkPageBreak(10);
            pdf.setFont('helvetica', 'bold'); pdf.text("Asesmen Awal Pembelajaran", margin.left, y); y += 6;
            y = printMixedText(data.asesmenAwal, margin.left, y, contentWidth, 6); y += 2;
            
            checkPageBreak(10);
            pdf.setFont('helvetica', 'bold'); pdf.text("Asesmen Proses Pembelajaran", margin.left, y); y += 6;
            y = printMixedText(data.asesmenFormatif, margin.left, y, contentWidth, 6); y += 2;
            
            checkPageBreak(10);
            pdf.setFont('helvetica', 'bold'); pdf.text("Asesmen Akhir Pembelajaran", margin.left, y); y += 6;
            y = printMixedText(data.asesmenSumatif, margin.left, y, contentWidth, 6);

            // FINAL SIGNATURE SECTION
            y += 10; 
            const signatureBlockHeight = 45;
            if (y + signatureBlockHeight > 320) { 
                pdf.addPage(); 
                y = margin.top + 15; 
            }
            
            let finalIndoDate: string;
            if (topicData.meetingDates && topicData.meetingDates.length > 0) {
                const firstDateFromProsem = topicData.meetingDates[0];
                const [d, m, yParts] = firstDateFromProsem.split('-').map(Number);
                const dateObj = new Date(yParts, m - 1, d);
                finalIndoDate = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
            } else {
                finalIndoDate = new Date(signatureDate + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
            }

            pdf.setFont('helvetica', 'normal'); pdf.setFontSize(11);
            pdf.text('Mengetahui,', margin.left + 20, y);
            pdf.text(`${schoolIdentity?.city || 'Kota'}, ${finalIndoDate}`, pageWidth - margin.right - 60, y);
            y += 6;
            pdf.text('Kepala Sekolah', margin.left + 20, y);
            pdf.text(`Guru Kelas ${selectedClass.replace('Kelas ', '')}`, pageWidth - margin.right - 60, y);
            y += 25;
            pdf.setFont('helvetica', 'bold');
            pdf.text(schoolIdentity?.principalName || ".....................", margin.left + 20, y);
            pdf.text(teacher?.fullName || ".....................", pageWidth - margin.right - 60, y);
            y += 6;
            pdf.setFont('helvetica', 'normal');
            pdf.text(`NIP. ${schoolIdentity?.principalNip || "....................."}`, margin.left + 20, y);
            pdf.text(`NIP. ${teacher?.nip || "....................."}`, pageWidth - margin.right - 60, y);

            pdf.save(`ModulAjar-${topicData.topic.replace(/[\s/]/g, '_')}.pdf`);
            setNotification({ message: 'PDF berhasil dibuat.', type: 'success' });
        } catch (error) { 
            console.error("PDF Error:", error);
            setNotification({ message: 'Gagal membuat PDF.', type: 'error' }); 
        } finally { 
            setIsGeneratingPDF(false); 
        }
    };

    if (isLoading) return <div className="text-center p-8">Memuat data...</div>;

    return (
        <div className="bg-white p-8 rounded-xl shadow-lg">
            {notification && <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
            <div className="flex flex-wrap justify-between items-center mb-6 pb-6 border-b gap-4">
                <div className="flex items-center space-x-4">
                    <select value={selectedSubjectId} onChange={e => setSelectedSubjectId(e.target.value)} disabled={isLoading} className="p-2 border-gray-300 rounded-md text-sm">
                        {subjectsForDropdown.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <select value={selectedSemester} onChange={e => setSelectedSemester(e.target.value as any)} disabled={isLoading} className="p-2 border-gray-300 rounded-md text-sm">
                        <option>Ganjil</option><option>Genap</option>
                    </select>
                </div>
                <div className="flex items-center space-x-2">
                    {userId && (
                        <button onClick={() => setIsPullModalOpen(true)} disabled={isPulling} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold shadow flex items-center space-x-2 text-sm">
                            {isPulling ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <SparklesIcon className="w-4 h-4" />}
                            <span>Tarik dari Induk</span>
                        </button>
                    )}
                    <label className="text-sm font-medium text-gray-700">Tgl Cetak (Fallback):</label>
                    <input type="date" value={signatureDate} onChange={e => setSignatureDate(e.target.value)} className="border rounded p-2 text-sm" />
                    <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold shadow text-sm">
                        {isSaving ? 'Menyimpan...' : 'Simpan Semua'}
                    </button>
                </div>
            </div>

            {selectedSubjectId === 'seni-budaya-group' && <div className="mb-6 border-b"><nav className="-mb-px flex space-x-4">
                {masterArtSubjects.map(artName => <button key={artName} onClick={() => setActiveArtTab(artName)} disabled={isLoading} className={`${activeArtTab === artName ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}>{artName}</button>)}
            </nav></div>}

            <header className="text-center mb-8">
                <h1 className="text-xl font-bold uppercase">MODUL AJAR / RPP - {selectedSubjectName}</h1>
                <p className="text-gray-600">Semester {selectedSemester} - Tahun Ajaran {selectedYear}</p>
            </header>

            <div className="space-y-6">
                {groupedTopics.length === 0 ? <p className="text-center text-gray-500">Belum ada data materi dari Prosem.</p> :
                groupedTopics.map(([topicId, data]) => (
                    <div key={topicId} className="border rounded-lg p-4 bg-gray-50 shadow-sm">
                        <div className="flex justify-between items-center mb-2">
                            <div>
                                <h3 className="font-bold text-lg text-gray-800">{data.topic}</h3>
                                <p className="text-sm text-gray-600">{data.totalJp} JP - {data.meetingDates.length} Pertemuan</p>
                                {data.meetingDates.length > 0 && (
                                    <p className="text-[10px] text-indigo-600 font-medium">Otomatisasi Tgl Cetak: {data.meetingDates[0]}</p>
                                )}
                            </div>
                            <div className="flex space-x-2">
                                <button onClick={() => handleDownloadPDF(topicId, data)} className="text-gray-600 hover:text-gray-800" title="Download PDF">
                                    <ArrowDownTrayIcon className="w-6 h-6" />
                                </button>
                                <button onClick={() => handleEditClick(topicId, Array.from(new Set(data.subTopics.map(s => s.atp))).join('\n'))} className={`px-3 py-1 rounded text-sm font-semibold flex items-center ${activeEditorId === topicId ? 'bg-red-100 text-red-600' : 'bg-white border text-indigo-600'}`}>
                                    <PencilIcon className="w-4 h-4 mr-1"/> {activeEditorId === topicId ? 'Tutup' : 'Edit'}
                                </button>
                            </div>
                        </div>

                        {activeEditorId === topicId && (
                            <div className="mt-4 bg-white border-t pt-4 animate-fade-in">
                                <div className="flex justify-between items-center mb-4 bg-purple-50 p-3 rounded">
                                    <div><h4 className="font-semibold text-purple-800">Generator AI</h4><p className="text-xs text-purple-600">Buat draf RPP lengkap otomatis.</p></div>
                                    <button onClick={() => handleGenerateAI(topicId, data)} disabled={isGenerating} className="px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 text-sm flex items-center disabled:opacity-50">
                                        {isGenerating ? 'Memproses...' : <><SparklesIcon className="w-4 h-4 mr-1"/> Generate With AI</>}
                                    </button>
                                </div>
                                <div className="grid gap-6">
                                    <Section title="A. IDENTIFIKASI PEMBELAJARAN">
                                        <label className="block text-sm font-medium mb-2">Dimensi Profil Lulusan</label>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                            {PROFIL_LULUSAN_OPTIONS.map(option => (
                                                <label key={option} className="flex items-center space-x-2 text-sm">
                                                    <input type="checkbox" checked={modulAjarData[topicId]?.identifikasi?.includes(option) || false} onChange={() => handleDimensionToggle(topicId, option)} className="rounded text-indigo-600 focus:ring-indigo-500"/>
                                                    <span>{option}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </Section>
                                    <Section title="B. DESAIN PEMBELAJARAN">
                                        <div className="grid grid-cols-1 gap-4">
                                            <Field label="Tujuan Pembelajaran (dari ATP)" value={modulAjarData[topicId]?.tujuanPembelajaran} onChange={v => handleFormChange(topicId, 'tujuanPembelajaran', v)} />
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <Field label="Model Pembelajaran" value={modulAjarData[topicId]?.modelPembelajaran} onChange={v => handleFormChange(topicId, 'modelPembelajaran', v)} />
                                                <Field label="Metode Pembelajaran" value={modulAjarData[topicId]?.metodePembelajaran} onChange={v => handleFormChange(topicId, 'metodePembelajaran', v)} />
                                            </div>
                                            <Field label="Kemitraan Pembelajaran" value={modulAjarData[topicId]?.kemitraan} onChange={v => handleFormChange(topicId, 'kemitraan', v)} />
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <Field label="Ruang Fisik/Virtual" value={modulAjarData[topicId]?.lingkunganFisik} onChange={v => handleFormChange(topicId, 'lingkunganFisik', v)} />
                                                <Field label="Budaya Belajar" value={modulAjarData[topicId]?.lingkunganBudaya} onChange={v => handleFormChange(topicId, 'lingkunganBudaya', v)} />
                                            </div>
                                            <Field label="Pemanfaatan Digital" value={modulAjarData[topicId]?.digital} onChange={v => handleFormChange(topicId, 'digital', v)} />
                                        </div>
                                    </Section>
                                    <Section title="C. PENGALAMAN BELAJAR">
                                        <textarea className="w-full p-2 border rounded mt-1 h-64 font-mono text-sm" value={modulAjarData[topicId]?.pengalaman || ''} onChange={e => handleFormChange(topicId, 'pengalaman', e.target.value)} />
                                    </Section>
                                    <Section title="D. ASESMEN PEMBELAJARAN">
                                        <div className="grid grid-cols-1 gap-4">
                                            <Field label="Asesmen Awal" value={modulAjarData[topicId]?.asesmenAwal} onChange={v => handleFormChange(topicId, 'asesmenAwal', v)} />
                                            <Field label="Asesmen Proses" value={modulAjarData[topicId]?.asesmenFormatif} onChange={v => handleFormChange(topicId, 'asesmenFormatif', v)} />
                                            <Field label="Asesmen Akhir" value={modulAjarData[topicId]?.asesmenSumatif} onChange={v => handleFormChange(topicId, 'asesmenSumatif', v)} />
                                        </div>
                                    </Section>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {isPullModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden p-6">
                        <h3 className="text-xl font-bold text-gray-900 text-center mb-2">Tarik Modul Ajar?</h3>
                        <p className="text-gray-600 text-center text-sm mb-6">Seluruh perencanaan yang sudah Anda buat akan ditimpa sepenuhnya.</p>
                        <div className="flex flex-col gap-2">
                            <button onClick={handlePullFromMaster} disabled={isPulling} className="w-full py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 shadow-lg flex items-center justify-center gap-2">
                                {isPulling ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : null} YA, TARIK DATA
                            </button>
                            <button onClick={() => setIsPullModalOpen(false)} disabled={isPulling} className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200">BATALKAN</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const Section: React.FC<{ title: string, children: React.ReactNode }> = ({ title, children }) => (
    <div className="border p-4 rounded-lg">
        <h5 className="font-bold text-gray-800 mb-3 border-b pb-1">{title}</h5>
        {children}
    </div>
);

const Field: React.FC<{ label: string, value?: string, onChange: (val: string) => void, placeholder?: string, className?: string }> = ({ label, value, onChange, placeholder, className }) => (
    <div className={className}>
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        <textarea className="w-full p-2 border rounded mt-1 h-24 text-sm" value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
);

export default ModulAjarComponent;
