import React, { useState, useEffect, useMemo, useLayoutEffect, useRef } from 'react';
import { ProsemData, ProsemRow, ProsemBulanCheckboxes, Teacher, SchoolIdentity, ProtaData, AcademicEvent } from '../types';
import { getProsem, updateProsem, getTeacherProfile, getSchoolIdentity, getSubjects, getProta, getCalendarEvents, getClassSchedule, pullProsemToTeacher } from '../services/adminService';
import Notification, { NotificationType } from './Notification';
import { PencilIcon, SparklesIcon, ArrowDownTrayIcon, ArrowPathIcon } from './Icons';
import { generateContentWithRotation } from '../services/geminiService';
import { Type } from '@google/genai';

declare const jspdf: any;

interface ProsemProps {
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

const ganjilMonths = ['Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const genapMonths = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni'];

const defaultCheckboxes: ProsemBulanCheckboxes = {
    b1_m1: false, b1_m2: false, b1_m3: false, b1_m4: false, b1_m5: false,
    b2_m1: false, b2_m2: false, b2_m3: false, b2_m4: false, b2_m5: false,
    b3_m1: false, b3_m2: false, b3_m3: false, b3_m4: false, b3_m5: false,
    b4_m1: false, b4_m2: false, b4_m3: false, b4_m4: false, b4_m5: false,
    b5_m1: false, b5_m2: false, b5_m3: false, b5_m4: false, b5_m5: false,
    b6_m1: false, b6_m2: false, b6_m3: false, b6_m4: false, b6_m5: false,
};

const WrappingTextarea: React.FC<{ value: string; disabled: boolean; className?: string; }> = ({ value, disabled, className = "" }) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    useLayoutEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = `${textarea.scrollHeight}px`;
        }
    }, [value]);

    return (
        <textarea
            ref={textareaRef}
            value={value}
            disabled={disabled}
            className={`w-full p-2 border-none bg-transparent focus:outline-none rounded resize-none overflow-hidden block ${className}`}
            rows={1}
        />
    );
};

const sortDateString = (dateString: string): string => {
    if (!dateString || typeof dateString !== 'string') return '';
    const dates = dateString.split(',').map(d => d.trim()).filter(d => d);
    dates.sort((a, b) => {
        const partsA = a.split('-');
        const partsB = b.split('-');
        if (partsA.length !== 3 || partsB.length !== 3) return 0;
        const [dayA, monthA, yearA] = partsA.map(Number);
        const [dayB, monthB, yearB] = partsB.map(Number);
        const dateA = new Date(yearA, monthA - 1, dayA);
        const dateB = new Date(yearB, monthB - 1, dayB);
        return dateA.getTime() - dateB.getTime();
    });
    return dates.join(', ');
};

const Prosem: React.FC<ProsemProps> = ({ selectedClass, selectedYear, userId }) => {
    const [subjectsForDropdown, setSubjectsForDropdown] = useState<{ id: string, name: string }[]>([]);
    const [selectedSubjectId, setSelectedSubjectId] = useState('');
    const [activeArtTab, setActiveArtTab] = useState<string>(masterArtSubjects[0]);
    const [selectedSemester, setSelectedSemester] = useState<'Ganjil' | 'Genap'>('Ganjil');
    const [prosemData, setProsemData] = useState<ProsemData>({ rows: [] });
    const [originalProsemData, setOriginalProsemData] = useState<ProsemData | null>(null);
    const [teacher, setTeacher] = useState<Teacher | null>(null);
    const [schoolIdentity, setSchoolIdentity] = useState<SchoolIdentity | null>(null);
    const [calendarEvents, setCalendarEvents] = useState<AcademicEvent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isPulling, setIsPulling] = useState(false);
    const [isPullModalOpen, setIsPullModalOpen] = useState(false);
    const [notification, setNotification] = useState<{ message: string; type: NotificationType } | null>(null);
    const [signatureDate, setSignatureDate] = useState(new Date().toISOString().split('T')[0]);
    const [isPdfDropdownOpen, setIsPdfDropdownOpen] = useState(false);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

    useEffect(() => {
        const fetchSubjects = async () => {
            try {
                const fetchedSubjects = await getSubjects(selectedYear, selectedClass, userId);
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
                else setSelectedSubjectId('');
            } catch (e: any) { setNotification({ message: e.message, type: 'error' }); }
        };
        fetchSubjects();
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
            try {
                const [pData, teacherProfile, identity, events] = await Promise.all([
                    getProsem(selectedYear, selectedClass, finalSubjectIdForApi, selectedSemester, userId),
                    getTeacherProfile(selectedYear, selectedClass, userId),
                    getSchoolIdentity(userId),
                    getCalendarEvents(selectedYear, userId)
                ]);
                setProsemData(pData);
                setTeacher(teacherProfile);
                setSchoolIdentity(identity);
                setCalendarEvents(events);
            } catch (error: any) { setNotification({ message: error.message || 'Gagal memuat data.', type: 'error' }); } 
            finally { setIsLoading(false); }
        };
        fetchData();
    }, [finalSubjectIdForApi, selectedSemester, selectedClass, selectedYear, userId]);

    const handleEdit = () => {
        setOriginalProsemData(JSON.parse(JSON.stringify(prosemData)));
        setIsEditing(true);
    };
    const handleCancel = () => {
        setProsemData(originalProsemData!);
        setIsEditing(false);
    };
    const handleSave = async () => {
        if (!finalSubjectIdForApi || !prosemData) return;
        setIsSaving(true);
        try {
            await updateProsem(selectedYear, selectedClass, finalSubjectIdForApi, selectedSemester, prosemData, userId);
            setNotification({ message: 'PROSEM berhasil disimpan.', type: 'success' });
            setIsEditing(false);
        } catch (e: any) { setNotification({ message: e.message, type: 'error' }); } 
        finally { setIsSaving(false); }
    };

    const handleRowChange = (id: string, field: 'alokasiWaktu' | 'keterangan', value: string | number) => {
        setProsemData(prev => ({
            rows: prev.rows.map(row => row.id === id ? { ...row, [field]: value } : row)
        }));
    };

    const handleCheckboxChange = (id: string, pekanKey: keyof ProsemBulanCheckboxes) => {
        setProsemData(prev => ({
            rows: prev.rows.map(row => 
                row.id === id 
                ? { ...row, pekan: { ...row.pekan, [pekanKey]: !row.pekan[pekanKey] } } 
                : row
            )
        }));
    };
    
    const handlePullFromMaster = async () => {
        if (!userId || !finalSubjectIdForApi) return;
        setIsPulling(true);
        setNotification(null);
        try {
            await pullProsemToTeacher(selectedYear, selectedClass, finalSubjectIdForApi, selectedSemester, userId);
            const refreshedData = await getProsem(selectedYear, selectedClass, finalSubjectIdForApi, selectedSemester, userId);
            setProsemData(refreshedData);
            setNotification({ message: 'Data Program Semester berhasil ditarik dari induk.', type: 'success' });
            setIsPullModalOpen(false);
        } catch (error: any) {
            setNotification({ message: error.message, type: 'error' });
        } finally {
            setIsPulling(false);
        }
    };

    const groupedRows = useMemo(() => {
        const groups = new Map<string, ProsemRow[]>();
        prosemData.rows.forEach(row => {
            const group = groups.get(row.protaRowId) || [];
            group.push(row);
            groups.set(row.protaRowId, group);
        });
        
        const finalizedGroups: ProsemRow[][] = [];
        groups.forEach((rows, protaRowId) => {
            const slmIndex = rows.findIndex(r => r.isSLM || r.lingkupMateri === "SUMATIF LINGKUP MATERI");
            
            if (slmIndex === -1 && rows.length > 0) {
                const firstRow = rows[0];
                rows.push({
                    id: `${protaRowId}_slm`,
                    protaRowId: protaRowId,
                    materi: firstRow.materi,
                    atp: firstRow.atp,
                    lingkupMateri: "SUMATIF LINGKUP MATERI",
                    alokasiWaktu: 2, 
                    pekan: { ...defaultCheckboxes },
                    keterangan: "",
                    isSLM: true
                });
            } else if (slmIndex !== -1) {
                rows[slmIndex].isSLM = true;
                rows[slmIndex].lingkupMateri = "SUMATIF LINGKUP MATERI";
            }
            finalizedGroups.push(rows);
        });
        
        return finalizedGroups;
    }, [prosemData]);

    const handleGenerateWithAI = async () => {
        if (prosemData.rows.length === 0) {
            setNotification({ message: 'ATP/PROTA belum diisi.', type: 'error' });
            return;
        }
        setIsGenerating(true);
        setNotification({ message: 'AI sedang menyusun jadwal, menghitung tanggal, dan membagi alokasi waktu...', type: 'info' });

        try {
            const [classSchedule, protaData] = await Promise.all([
                getClassSchedule(selectedYear, selectedClass, userId),
                getProta(selectedYear, selectedClass, finalSubjectIdForApi, userId)
            ]);

            const jpPerDay: { [key: string]: number } = { senin: 0, selasa: 0, rabu: 0, kamis: 0, jumat: 0, sabtu: 0 };
            const dayIndexMap = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];

            classSchedule.timeSlots.forEach(slot => {
                for (const day in slot.subjects) {
                    if (slot.subjects[day as keyof typeof slot.subjects] === selectedSubjectName) {
                        jpPerDay[day as keyof typeof jpPerDay]++;
                    }
                }
            });

            const [startYearNum] = selectedYear.split('/').map(Number);
            let startDate: Date, endDate: Date;

            if (selectedSemester === 'Ganjil') {
                startDate = new Date(Date.UTC(startYearNum, 6, 1));
                endDate = new Date(Date.UTC(startYearNum, 11, 31));
            } else {
                startDate = new Date(Date.UTC(startYearNum + 1, 0, 1));
                endDate = new Date(Date.UTC(startYearNum + 1, 5, 30));
            }

            const nonEffectiveDates = new Set(calendarEvents.map(e => e.date));
            const teachingSessions: { id: string, date: string, jp: number, weekKey: string }[] = [];

            let currentDate = new Date(startDate);
            while (currentDate <= endDate) {
                const dateStr = currentDate.toISOString().split('T')[0];
                const dayIdx = currentDate.getUTCDay();
                const dayName = dayIndexMap[dayIdx];

                if (dayIdx !== 0 && jpPerDay[dayName as keyof typeof jpPerDay] > 0 && !nonEffectiveDates.has(dateStr)) {
                    let monthIndexInSemester = currentDate.getUTCMonth() - startDate.getUTCMonth();
                    if (monthIndexInSemester < 0) monthIndexInSemester += 12;
                    const dateNum = currentDate.getUTCDate();
                    const weekIndexInMonth = Math.floor((dateNum - 1) / 7);
                    
                    if (weekIndexInMonth < 5) {
                        const weekKey = `b${monthIndexInSemester + 1}_m${weekIndexInMonth + 1}`;
                        const formattedDate = new Date(currentDate).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
                        teachingSessions.push({ id: `session-${dateStr}`, date: formattedDate, jp: jpPerDay[dayName as keyof typeof jpPerDay], weekKey: weekKey });
                    }
                }
                currentDate.setUTCDate(currentDate.getUTCDate() + 1);
            }

            const protaRowsForSemester = selectedSemester === 'Ganjil' ? protaData.ganjilRows : protaData.genapRows;
            const protaMap = new Map(protaRowsForSemester.map(row => [row.id, row]));

            const allRowsWithSLM = groupedRows.flat();
            const groupedForPrompt = allRowsWithSLM.reduce((acc, row) => {
                if (!acc[row.protaRowId]) {
                    const protaRow = protaMap.get(row.protaRowId);
                    if (protaRow) {
                        acc[row.protaRowId] = { totalProtaJP: protaRow.alokasiWaktu, topic: protaRow.material, subTopics: [] };
                    }
                }
                if (acc[row.protaRowId]) {
                    acc[row.protaRowId].subTopics.push({ id: row.id, isSLM: row.isSLM, text: row.lingkupMateri });
                }
                return acc;
            }, {} as Record<string, { totalProtaJP: number, topic: string, subTopics: { id: string, isSLM?: boolean, text: string }[] }>);

            const prompt = `
                Peran: Ahli Penjadwalan Kurikulum Merdeka.
                Tugas: Susun jadwal PROSEM (Program Semester).
                
                Konteks:
                1. Semester: ${selectedSemester}
                2. Mata Pelajaran: ${selectedSubjectName}
                3. Tersedia Sesi Mengajar: ${JSON.stringify(teachingSessions, null, 2)}
                   (Keterangan: 'jp' adalah durasi jam pelajaran di hari tersebut)
                4. Daftar Materi & Target JP (dari PROTA):
                   ${JSON.stringify(Object.values(groupedForPrompt), null, 2)}
                   
                Aturan Penjadwalan (SANGAT KETAT):
                1. Urutan materi HARUS berurutan sesuai daftar yang diberikan.
                2. Setiap materi/tema memiliki 'totalProtaJP'. Anda harus membagi angka ini ke sub-topik (termasuk SLM) secara proporsional.
                3. 'SUMATIF LINGKUP MATERI' (isSLM: true) wajib ada di akhir setiap tema dengan alokasi 1-2 JP.
                4. Gunakan 'teachingSessions' secara berurutan. Satu sesi hanya boleh digunakan untuk SATU sub-topik hingga JP sesi habis atau sub-topik berganti.
                5. PENTING: Jika alokasi JP sebuah sub-topik lebih besar dari JP sesi saat ini, sub-topik tersebut HARUS mengambil satu atau lebih sesi berikutnya secara berurutan (sessionIds) hingga kebutuhannya terpenuhi.
                6. Kolom 'sessionIds' harus berisi array string ID sesi yang digunakan oleh sub-topik tersebut.
                7. Kolom 'keterangan' HARUS berisi daftar tanggal (format dd-mm-yyyy) dari SEMUA sesi yang digunakan, dipisahkan koma (contoh: "14-07-2025, 21-07-2025").
                8. JANGAN ADA TANGGAL YANG DIPAKAI DUA KALI UNTUK SUB-TOPIK YANG BERBEDA. 
                9. Pastikan jumlah alokasiWaktu untuk seluruh sub-topik dalam satu tema sama dengan 'totalProtaJP' tema tersebut.

                Output JSON: Array of objects [{"id": "...", "alokasiWaktu": number, "sessionIds": [...], "keterangan": "..."}]
            `;

            const response = await generateContentWithRotation({
                model: 'gemini-3-flash-preview',
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: { 
                        type: Type.ARRAY, 
                        items: { 
                            type: Type.OBJECT, 
                            properties: { 
                                id: { type: Type.STRING }, 
                                alokasiWaktu: { type: Type.NUMBER },
                                sessionIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                                keterangan: { type: Type.STRING }
                            }, 
                            required: ["id", "alokasiWaktu", "sessionIds", "keterangan"] 
                        } 
                    },
                },
            });

            interface AIProsemResult {
                id: string;
                alokasiWaktu: number;
                sessionIds: string[];
                keterangan: string;
            }

            const results: AIProsemResult[] = JSON.parse(response.text.trim());
            const resultMap = new Map<string, AIProsemResult>(results.map(item => [item.id, item]));
            const sessionToWeekMap = new Map<string, string>(teachingSessions.map(s => [s.id, s.weekKey]));

            setProsemData(prev => {
                const currentRows = groupedRows.flat();
                return {
                    rows: currentRows.map(row => {
                        const aiResult = resultMap.get(row.id);
                        if (aiResult) {
                            const newPekan = { ...defaultCheckboxes };
                            if (Array.isArray(aiResult.sessionIds)) {
                                aiResult.sessionIds.forEach((sid: string) => {
                                    const weekKey = sessionToWeekMap.get(sid);
                                    if (weekKey && weekKey in newPekan) newPekan[weekKey as keyof ProsemBulanCheckboxes] = true;
                                });
                            }
                            return { ...row, alokasiWaktu: aiResult.alokasiWaktu, pekan: newPekan, keterangan: sortDateString(aiResult.keterangan) };
                        }
                        return row;
                    })
                }
            });
            setNotification({ message: 'Penjadwalan Prosem berhasil!', type: 'success' });
        } catch (e: any) { 
            setNotification({ message: 'Gagal generate: ' + e.message, type: 'error' });
        } finally { setIsGenerating(false); }
    };

    const assessmentInfo = useMemo(() => {
        const label = selectedSemester === 'Ganjil' ? 'SUMATIF AKHIR SEMESTER' : 'SUMATIF AKHIR TAHUN';
        const keyword = selectedSemester === 'Ganjil' ? 'akhir semester' : 'akhir tahun';
        
        const filteredEvents = calendarEvents
            .filter(e => e.description.toLowerCase().includes(keyword))
            .sort((a, b) => a.date.localeCompare(b.date));

        if (filteredEvents.length === 0) return { label, dateRange: '' };

        const formatDate = (dateStr: string) => {
            const [y, m, d] = dateStr.split('-');
            return `${d}-${m}-${y}`;
        };

        const first = formatDate(filteredEvents[0].date);
        const last = formatDate(filteredEvents[filteredEvents.length - 1].date);
        
        return { 
            label, 
            dateRange: first === last ? first : `${first} sampai ${last}` 
        };
    }, [calendarEvents, selectedSemester]);

    const monthHeaders = selectedSemester === 'Ganjil' ? ganjilMonths : genapMonths;

    const handleDownloadPDF = async (signatureOption: 'none' | 'teacher' | 'both') => {
        setIsGeneratingPDF(true);
        setIsPdfDropdownOpen(false);
        setNotification({ message: 'Mempersiapkan PDF...', type: 'info' });
        await new Promise(resolve => setTimeout(resolve, 50));

        if (!schoolIdentity || !teacher || groupedRows.length === 0) {
            setNotification({ message: 'Gagal membuat PDF: Data tidak lengkap.', type: 'error' });
            setIsGeneratingPDF(false);
            return;
        }

        try {
            const { jsPDF } = jspdf;
            const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [330, 215] });

            const margin = { top: 15, left: 10, right: 10, bottom: 7 }; 
            const pageWidth = 330;
            const pageHeight = 215;
            let y = margin.top;

            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(12);
            pdf.text(`PROGRAM SEMESTER (PROSEM)`, pageWidth / 2, y, { align: 'center' });
            y += 6;
            pdf.text(`${selectedSubjectName.toUpperCase()}`, pageWidth / 2, y, { align: 'center' });
            y += 6;
            pdf.setFontSize(11);
            pdf.text(`KELAS ${selectedClass.toUpperCase().replace('KELAS ', '')} SEMESTER ${selectedSemester.toUpperCase()} TAHUN AJARAN ${selectedYear}`, pageWidth / 2, y, { align: 'center' });
            y += 6;
            pdf.setFontSize(10);
            pdf.text(schoolIdentity.schoolName.toUpperCase(), pageWidth / 2, y, { align: 'center' });
            y += 10;

            const header1 = [
                { content: 'Alur Tujuan Pembelajaran', rowSpan: 3, styles: { valign: 'middle', halign: 'center' } },
                { content: 'Lingkup Materi', rowSpan: 3, styles: { valign: 'middle', halign: 'center' } },
                { content: 'JP', rowSpan: 3, styles: { valign: 'middle', halign: 'center' } },
                { content: 'PENJABARAN JP PER PEKAN', colSpan: 30, styles: { halign: 'center', fontStyle: 'bold' } },
                { content: 'Ket', rowSpan: 3, styles: { valign: 'middle', halign: 'center' } }
            ];

            const header2 = monthHeaders.map(m => ({ 
                content: m.charAt(0).toUpperCase() + m.slice(1).toLowerCase(), 
                colSpan: 5, 
                styles: { halign: 'center' } 
            }));
            const header3: any[] = [];
            monthHeaders.forEach(() => {
                for (let i = 1; i <= 5; i++) header3.push({ content: i.toString(), styles: { halign: 'center', cellWidth: 4 } });
            });

            const head = [header1, header2, header3];
            const body: any[] = [];

            groupedRows.forEach((group) => {
                body.push([{ content: `MATERI/TEMA: ${group[0].materi.toUpperCase()}`, colSpan: 34, styles: { fontStyle: 'bold', fillColor: [245, 245, 245] } }]);
                
                const tps = (group[0].atp || '').split('\n').filter(l => l.trim());
                /* COMMENT: Changed PDF numbering to bullet points in ATP column */
                const formattedTps = tps.map(tp => {
                    const cleanTp = tp.replace(/^[0-9\.\-\s•]+/, '').trim();
                    return `• ${cleanTp}`;
                }).join('\n');

                group.forEach((row, index) => {
                    const rowData: any[] = [];
                    if (index === 0) {
                        rowData.push({ 
                            content: formattedTps, 
                            rowSpan: group.length,
                            styles: { cellPadding: { right: 4, left: 2, top: 2, bottom: 2 } } 
                        });
                    }
                    rowData.push({ 
                        content: row.lingkupMateri, 
                        styles: { fontStyle: row.isSLM ? 'bold' : 'normal', fillColor: row.isSLM ? [240, 240, 240] : [255, 255, 255] }
                    });
                    rowData.push({ 
                        content: row.alokasiWaktu > 0 ? row.alokasiWaktu : '', 
                        styles: { halign: 'center', fontStyle: row.isSLM ? 'bold' : 'normal' } 
                    });
                    for (let m = 1; m <= 6; m++) {
                        for (let w = 1; w <= 5; w++) {
                            const key = `b${m}_m${w}` as keyof ProsemBulanCheckboxes;
                            rowData.push({ content: row.pekan[key] ? 'v' : '', styles: { halign: 'center' } });
                        }
                    }
                    rowData.push({ content: row.keterangan, styles: { fontSize: 5 } });
                    body.push(rowData);
                });
            });

            body.push([
                { 
                    content: assessmentInfo.label, 
                    colSpan: 33, 
                    styles: { fontStyle: 'bold', fillColor: [255, 237, 213], halign: 'left' } 
                },
                { 
                    content: assessmentInfo.dateRange, 
                    styles: { fontSize: 6, halign: 'center', valign: 'middle', fontStyle: 'italic', fillColor: [255, 237, 213] } 
                }
            ]);

            (pdf as any).autoTable({
                head, body, startY: y, theme: 'grid',
                headStyles: { fillColor: [255, 255, 255], textColor: 0, fontStyle: 'bold', halign: 'center', valign: 'middle', lineColor: 0, lineWidth: 0.1 },
                styles: { fontSize: 8.5, lineColor: 0, lineWidth: 0.1, cellPadding: 1, valign: 'top', textColor: 0 },
                columnStyles: {
                    0: { cellWidth: 100 }, 
                    1: { cellWidth: 60 },  
                    2: { cellWidth: 10 },  
                    33: { cellWidth: 20 }  
                },
                margin: { left: margin.left, right: margin.right, bottom: margin.bottom },
                didDrawCell: (data: any) => {
                    if (data.column.index === 0 && data.section === 'body' && typeof data.cell.raw === 'object' && data.cell.raw.content && !data.cell.raw.content.startsWith('MATERI') && !data.cell.raw.content.startsWith('SUMATIF')) {
                        const doc = data.doc;
                        const cell = data.cell;
                        const padding = cell.styles.cellPadding;
                        const pLeft = (typeof padding === 'number') ? padding : (padding && typeof padding.left === 'number' ? padding.left : 0);
                        const pTop = (typeof padding === 'number') ? padding : (padding && typeof padding.top === 'number' ? padding.top : 0);
                        const startX = (cell.x || 0) + pLeft;
                        const scale = doc.internal.scaleFactor || 1;
                        const fs = doc.getFontSize() || 8.5;
                        let currentY = (cell.y || 0) + pTop + (fs / scale * 0.8);
                        const lines = Array.isArray(cell.text) ? cell.text : [cell.text];
                        if (!lines || lines.length === 0) return;

                        doc.setFillColor(cell.styles.fillColor || [255, 255, 255]);
                        doc.rect(cell.x, cell.y, cell.width, cell.height, 'F');
                        doc.setDrawColor(cell.styles.lineColor || 0);
                        doc.setLineWidth(cell.styles.lineWidth || 0.1);
                        doc.rect(cell.x, cell.y, cell.width, cell.height, 'S');

                        let currentHangingIndent = 0;
                        const lhFactor = (typeof cell.styles.lineHeight === 'number') ? cell.styles.lineHeight : 1.15;
                        const lineStep = (fs / scale) * lhFactor;

                        lines.forEach((line: any) => {
                            const textLine = String(line || '');
                            const cleanLine = textLine.trim();
                            if (!cleanLine) { currentY += lineStep; return; }
                            const match = cleanLine.match(/^(\d+[\.\)]|\-|\u2022|•)\s+/);
                            if (match) {
                                const prefix = match[0];
                                currentHangingIndent = doc.getStringUnitWidth(prefix) * fs / scale;
                                doc.text(textLine, startX, currentY);
                            } else {
                                doc.text(textLine, startX + currentHangingIndent, currentY);
                            }
                            currentY += lineStep;
                        });
                    }
                }
            });

            y = (pdf as any).lastAutoTable.finalY + 7; 
            if (signatureOption !== 'none') {
                if (y + 40 > pageHeight - margin.bottom) { pdf.addPage(); y = margin.top + 10; }
                pdf.setFontSize(11);
                pdf.setFont('helvetica', 'normal');
                const formattedDate = new Date(signatureDate + 'T00:00:00Z').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
                const principalX = 10 + 50;
                const teacherX = 330 - 10 - 50;

                if (signatureOption === 'both') {
                    pdf.text('Mengetahui,', principalX, y, { align: 'center' });
                    pdf.text('Kepala Sekolah', principalX, y + 5, { align: 'center' }); 
                    pdf.setFont('helvetica', 'bold');
                    const ksName = schoolIdentity.principalName || '.....................................';
                    pdf.text(ksName, principalX, y + 23, { align: 'center' });
                    const ksW = pdf.getStringUnitWidth(ksName) * 11 / pdf.internal.scaleFactor;
                    pdf.setLineWidth(0.2);
                    pdf.line(principalX - ksW/2, y + 23.5, principalX + ksW/2, y + 23.5); 
                    pdf.setFont('helvetica', 'normal');
                    pdf.text(`NIP. ${schoolIdentity.principalNip || '...................'}`, principalX, y + 27.5, { align: 'center' });
                }
                if (signatureOption === 'teacher' || signatureOption === 'both') {
                    pdf.text(`${schoolIdentity.city || '.......'}, ${formattedDate}`, teacherX, y, { align: 'center' });
                    pdf.text(`Wali Kelas ${selectedClass.replace('Kelas ', '')}`, teacherX, y + 5, { align: 'center' }); 
                    pdf.setFont('helvetica', 'bold');
                    const guruName = teacher.fullName || '.....................................';
                    pdf.text(guruName, teacherX, y + 23, { align: 'center' });
                    const gW = pdf.getStringUnitWidth(guruName) * 11 / pdf.internal.scaleFactor;
                    pdf.setLineWidth(0.2);
                    pdf.line(teacherX - gW/2, y + 23.5, teacherX + gW/2, y + 23.5); 
                    pdf.setFont('helvetica', 'normal');
                    pdf.text(`NIP. ${teacher.nip || '...................'}`, teacherX, y + 27.5, { align: 'center' });
                }
            }
            
            pdf.save(`Prosem-${selectedSubjectName.replace(/[\s/]/g, '_')}-${selectedSemester}.pdf`);
            setNotification({ message: 'PDF berhasil dibuat.', type: 'success' });
        } catch (e) { setNotification({ message: 'Gagal membuat PDF.', type: 'error' }); } 
        finally { setIsGeneratingPDF(false); }
    };

    if (isLoading) return <div className="text-center p-8 text-indigo-600 font-bold">Memuat data...</div>;

    return (
        <div className="bg-white p-8 rounded-xl shadow-lg">
            {notification && <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
            <div className="flex justify-between items-center mb-6 pb-6 border-b">
                <div className="flex items-center space-x-4">
                    <select value={selectedSubjectId} onChange={e => setSelectedSubjectId(e.target.value)} disabled={isEditing || isLoading} className="p-2 border-gray-300 rounded-md">
                        {subjectsForDropdown.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <select value={selectedSemester} onChange={e => setSelectedSemester(e.target.value as any)} disabled={isEditing || isLoading} className="p-2 border-gray-300 rounded-md">
                        <option>Ganjil</option><option>Genap</option>
                    </select>
                </div>
                <div className="flex items-center space-x-2">
                    {isEditing ? (
                        <><button onClick={handleCancel} className="btn-secondary">Batal</button>
                         <button onClick={handleSave} disabled={isSaving || isGenerating} className="btn-primary">{isSaving ? 'Menyimpan...' : 'Simpan'}</button></>
                    ) : (
                        <>
                            {userId && (
                                <button onClick={() => setIsPullModalOpen(true)} disabled={isPulling} className="btn-pull">
                                    {isPulling ? <ArrowPathIcon className="animate-spin" /> : <SparklesIcon />}
                                    <span>Tarik dari Induk</span>
                                </button>
                            )}
                            <input type="date" value={signatureDate} onChange={(e) => setSignatureDate(e.target.value)} className="p-1 border rounded text-xs" />
                            <div className="relative">
                                <button onClick={() => setIsPdfDropdownOpen(!isPdfDropdownOpen)} disabled={isGeneratingPDF} className="btn-pdf">
                                    <ArrowDownTrayIcon/> <span>{isGeneratingPDF ? '...' : 'PDF'}</span>
                                </button>
                                {isPdfDropdownOpen && (
                                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10 border" onMouseLeave={() => setIsPdfDropdownOpen(false)}>
                                        <ul className="py-1">
                                            <li><button onClick={() => handleDownloadPDF('none')} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100">Tanpa TTD</button></li>
                                            <li><button onClick={() => handleDownloadPDF('teacher')} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100">TTD Guru</button></li>
                                            <li><button onClick={() => handleDownloadPDF('both')} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100">TTD Guru & KS</button></li>
                                        </ul>
                                    </div>
                                )}
                            </div>
                            <button onClick={handleEdit} disabled={isLoading} className="btn-primary"><PencilIcon /> Edit</button>
                        </>
                    )}
                </div>
            </div>
            {selectedSubjectId === 'seni-budaya-group' && <div className="mb-6 border-b"><nav className="-mb-px flex space-x-4">
                {masterArtSubjects.map(artName => <button key={artName} onClick={() => setActiveArtTab(artName)} disabled={isEditing || isLoading} className={`${activeArtTab === artName ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}>{artName}</button>)}
            </nav></div>}

            <header className="text-center mb-6">
                <h1 className="text-xl font-bold uppercase">PROGRAM SEMESTER (PROSEM) - {selectedSubjectName}</h1>
                <p className="text-md text-gray-600">Semester {selectedSemester} - Tahun Ajaran {selectedYear}</p>
            </header>

            {isEditing && (
                <div className="mb-6 p-4 border-2 border-dashed border-purple-300 bg-purple-50 rounded-lg flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-semibold text-purple-800">Otomatisasi Penjadwalan</h3>
                        <p className="text-sm text-purple-700">AI akan menyesuaikan kalender dan jadwal ke kolom pekan. Alokasi per materi termasuk Sumatif Lingkup Materi.</p>
                    </div>
                    <button onClick={handleGenerateWithAI} disabled={isSaving || isGenerating} className="btn-ai">
                        {isGenerating ? (<svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>) : <SparklesIcon />}
                        <span>{isGenerating ? 'Memproses...' : 'Generate Jadwal (AI)'}</span>
                    </button>
                </div>
            )}

            <div className="overflow-x-auto border rounded-lg">
                <table className="min-w-max text-sm border-collapse">
                    <thead className="bg-gray-100 text-center font-bold">
                        <tr>
                            <th className="p-2 border" rowSpan={3} style={{ width: '400px' }}>Alur Tujuan Pembelajaran</th>
                            <th className="p-2 border" rowSpan={3} style={{ width: '250px' }}>Lingkup Materi</th>
                            <th className="p-2 border w-12" rowSpan={3}>JP</th>
                            {monthHeaders.map((m, i) => <th key={i} className="p-1 border" colSpan={5}>{m}</th>)}
                            <th className="p-2 border" rowSpan={3}>Ket</th>
                        </tr>
                        <tr>{monthHeaders.map((_, i) => <th key={`w-${i}`} className="p-1 border text-[10px]" colSpan={5}>Pekan Ke-</th>)}</tr>
                        <tr>{monthHeaders.map((_, i) => [1,2,3,4,5].map(w => <th key={`d-${i}-${w}`} className="p-1 border w-7 text-[10px]">{w}</th>))}</tr>
                    </thead>
                    <tbody>
                        {groupedRows.map((group, gIndex) => (
                            <React.Fragment key={gIndex}>
                                <tr className="bg-indigo-50 font-bold uppercase"><td colSpan={34} className="p-2 border text-[13px]">MATERI/TEMA: {group[0].materi}</td></tr>
                                {group.map((row, index) => {
                                    const tps = (row.atp || '').split('\n').filter(l => l.trim());

                                    return (
                                        <tr key={row.id} className={`hover:bg-gray-50 align-top ${row.isSLM ? 'bg-orange-50 font-bold' : ''}`}>
                                            {index === 0 && (
                                                <td className="p-1 border" rowSpan={group.length}>
                                                    <div className="space-y-1 p-1 pr-6">
                                                        {tps.map((tp, tpIdx) => (
                                                            <div key={tpIdx} className="flex items-start text-[14px]">
                                                                {/* COMMENT: Changed table numbering to bullet point in ATP column */}
                                                                <span className="shrink-0 w-8 font-bold text-center">•</span>
                                                                <span className="flex-1">{tp.replace(/^[0-9\.\-\s•]+/, '').trim()}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </td>
                                            )}
                                            <td className="p-1 border">
                                                <div className="text-[14px]">
                                                    <WrappingTextarea value={row.lingkupMateri} disabled={true} />
                                                </div>
                                            </td>
                                            <td className="p-1 border text-center align-middle">
                                                {isEditing ? <input type="number" value={row.alokasiWaktu} onChange={e => handleRowChange(row.id, 'alokasiWaktu', parseInt(e.target.value)||0)} className="w-full text-center border rounded p-1" /> : <span className="font-bold text-[14px]">{row.alokasiWaktu || ''}</span>}
                                            </td>
                                            {[1,2,3,4,5,6].map(m => [1,2,3,4,5].map(w => {
                                                const key = `b${m}_m${w}` as keyof ProsemBulanCheckboxes;
                                                return (
                                                    <td key={key} className="p-0 border text-center align-middle cursor-pointer hover:bg-indigo-50" onClick={() => isEditing && handleCheckboxChange(row.id, key)}>
                                                        {row.pekan[key] ? <span className="text-indigo-600 font-bold">v</span> : null}
                                                    </td>
                                                )
                                            }))}
                                            <td className="p-1 border align-middle">
                                                {isEditing ? <input type="text" value={row.keterangan} onChange={e => handleRowChange(row.id, 'keterangan', e.target.value)} className="w-full border rounded p-1 text-xs" /> : <span className="text-[11px] italic">{row.keterangan}</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </React.Fragment>
                        ))}
                        <tr className="bg-orange-100 font-bold uppercase">
                            <td colSpan={33} className="p-2 border text-[13px]">
                                {assessmentInfo.label}
                            </td>
                            <td className="p-2 border text-[10px] text-center italic align-middle">
                                {assessmentInfo.dateRange}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {isPullModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all animate-fade-in scale-100 p-6">
                        <h3 className="text-xl font-bold text-center mb-4">Tarik Program Semester?</h3>
                        <p className="text-gray-600 text-sm mb-6 text-center">Data lokal Anda akan ditimpa data terbaru dari Induk Admin.</p>
                        <div className="flex flex-col gap-2">
                            <button onClick={handlePullFromMaster} disabled={isPulling} className="w-full py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 shadow flex items-center justify-center gap-2">
                                {isPulling ? <ArrowPathIcon className="animate-spin" /> : null} YA, TARIK DATA
                            </button>
                            <button onClick={() => setIsPullModalOpen(false)} className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-bold">BATAL</button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`.btn-primary{display:inline-flex;align-items:center;gap:.5rem;padding:.5rem 1rem;background-color:#4f46e5;color:#fff;border-radius:.5rem;font-weight:600}.btn-secondary{padding:.5rem 1rem;background-color:#e5e7eb;color:#1f2937;border-radius:.5rem;font-weight:600}.btn-ai{display:inline-flex;align-items:center;gap:.5rem;padding:.5rem 1rem;background-color:#9333ea;color:#fff;border-radius:.5rem;font-weight:600}.btn-pdf{display:inline-flex;align-items:center;gap:.5rem;padding:.5rem 1rem;background-color:#4b5563;color:#fff;border-radius:.5rem;font-weight:600}.btn-pull{display:inline-flex;align-items:center;gap:.5rem;padding:.5rem 1rem;background-color:#7c3aed;color:#fff;border-radius:.5rem;font-weight:600;font-size:.875rem}.btn-primary:disabled,.btn-ai:disabled,.btn-pdf:disabled{opacity:.6;cursor:not-allowed}`}</style>
        </div>
    );
};

export default Prosem;