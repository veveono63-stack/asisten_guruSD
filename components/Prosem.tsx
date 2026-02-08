
import React, { useState, useEffect, useMemo, useLayoutEffect, useRef } from 'react';
import { ProsemData, ProsemRow, ProsemBulanCheckboxes, Teacher, SchoolIdentity, ProtaData } from '../types';
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

const WrappingTextarea: React.FC<{ value: string; disabled: boolean; }> = ({ value, disabled }) => {
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
            className="w-full p-2 border-none bg-transparent focus:outline-none rounded resize-none overflow-hidden block"
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
        if (!finalSubjectIdForApi) {
            setProsemData({ rows: [] });
            setIsLoading(false);
            return;
        }
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const [data, teacherData, identityData] = await Promise.all([
                    getProsem(selectedYear, selectedClass, finalSubjectIdForApi, selectedSemester, userId),
                    getTeacherProfile(selectedYear, selectedClass, userId),
                    getSchoolIdentity(userId)
                ]);
                setProsemData(data);
                setTeacher(teacherData);
                setSchoolIdentity(identityData);
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

    const handleGenerateWithAI = async () => {
        if (prosemData.rows.length === 0) {
            setNotification({ message: 'ATP/PROTA belum diisi.', type: 'error' });
            return;
        }
        setIsGenerating(true);
        setNotification({ message: 'AI sedang menyusun jadwal, menghitung tanggal, dan membagi alokasi waktu...', type: 'info' });

        try {
            const [calendarEvents, classSchedule, protaData] = await Promise.all([
                getCalendarEvents(selectedYear, userId),
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
            
            // Generate a flat list of Available Teaching Sessions (granular date info)
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
                        
                        teachingSessions.push({
                            id: `session-${dateStr}`,
                            date: formattedDate,
                            jp: jpPerDay[dayName as keyof typeof jpPerDay],
                            weekKey: weekKey
                        });
                    }
                }
                currentDate.setUTCDate(currentDate.getUTCDate() + 1);
            }

            const protaRowsForSemester = selectedSemester === 'Ganjil' ? protaData.ganjilRows : protaData.genapRows;
            const protaMap = new Map(protaRowsForSemester.map(row => [row.id, row]));

            const groupedForPrompt = prosemData.rows.reduce((acc, row) => {
                if (!acc[row.protaRowId]) {
                    const protaRow = protaMap.get(row.protaRowId);
                    if (protaRow) {
                        acc[row.protaRowId] = {
                            totalProtaJP: protaRow.alokasiWaktu,
                            topic: protaRow.material,
                            subTopics: []
                        };
                    }
                }
                if (acc[row.protaRowId]) {
                    acc[row.protaRowId].subTopics.push({ 
                        id: row.id, 
                        isSLM: row.isSLM, 
                        text: row.lingkupMateri 
                    });
                }
                return acc;
            }, {} as Record<string, { totalProtaJP: number, topic: string, subTopics: { id: string, isSLM?: boolean, text: string }[] }>);

            const prompt = `
                Anda adalah ahli kurikulum Sekolah Dasar. Tugas Anda adalah membagi Lingkup Materi ke dalam sesi mengajar yang tersedia pada Program Semester (PROSEM).

                DAFTAR SESI MENGAJAR YANG TERSEDIA (SESUAI KALENDER & JADWAL):
                Sesi ini diurutkan berdasarkan tanggal. Gunakan sesi ini SATU PER SATU.
                ${JSON.stringify(teachingSessions, null, 2)}

                DATA MATERI YANG HARUS DIJADWALKAN:
                ${JSON.stringify(Object.values(groupedForPrompt), null, 2)}

                ATURAN PENJADWALAN (SANGAT KETAT):
                1. JANGAN PERNAH MENGGUNAKAN TANGGAL YANG SAMA UNTUK DUA BARIS MATERI YANG BERBEDA.
                2. Isikan jadwal secara BERURUTAN dari sub-materi pertama ke terakhir.
                3. Satu sub-materi dapat menggunakan satu atau lebih sesi mengajar tergantung jumlah JP yang dibutuhkan.
                4. Jika suatu sub-materi dialokasikan ke suatu sesi, maka sesi tersebut (tanggal tersebut) dianggap SUDAH TERPAKAI dan tidak boleh digunakan oleh sub-materi berikutnya.
                5. Total JP per materi (Topik) harus sesuai dengan 'totalProtaJP'.
                6. SUMATIF LINGKUP MATERI (isSLM: true) wajib dialokasikan TEPAT 2 JP pada satu sesi (tanggal) tersendiri di akhir materi tersebut.
                7. 'keterangan' diisi dengan tanggal sesi yang digunakan (format dd-mm-yyyy). Jika lebih dari satu tanggal, pisahkan dengan koma.

                FORMAT OUTPUT:
                Harus berupa Array JSON berisi objek untuk setiap sub-materi.
                Contoh:
                [
                  { "id": "row1_id", "alokasiWaktu": 4, "sessionIds": ["session-2024-07-15", "session-2024-07-17"], "keterangan": "15-07-2024, 17-07-2024" },
                  { "id": "row1_slm_id", "alokasiWaktu": 2, "sessionIds": ["session-2024-07-22"], "keterangan": "22-07-2024" }
                ]
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

            const results = JSON.parse(response.text.trim());
            if (!Array.isArray(results)) throw new Error("Format AI tidak valid.");

            const resultMap = new Map(results.map(item => [item.id, item]));
            const sessionToWeekMap = new Map(teachingSessions.map(s => [s.id, s.weekKey]));

            setProsemData(prev => ({
                rows: prev.rows.map(row => {
                    const aiResult = resultMap.get(row.id);
                    if (aiResult) {
                        const newPekan = { ...defaultCheckboxes };
                        if (Array.isArray(aiResult.sessionIds)) {
                            aiResult.sessionIds.forEach((sid: string) => {
                                const weekKey = sessionToWeekMap.get(sid);
                                if (weekKey && weekKey in newPekan) {
                                    newPekan[weekKey as keyof ProsemBulanCheckboxes] = true;
                                }
                            });
                        }

                        return { 
                            ...row, 
                            alokasiWaktu: aiResult.alokasiWaktu,
                            pekan: newPekan,
                            keterangan: sortDateString(aiResult.keterangan)
                        };
                    }
                    return row;
                })
            }));

            setNotification({ message: 'Penjadwalan Prosem berhasil! Tanggal tidak ada yang ganda.', type: 'success' });
        } catch (e: any) { 
            console.error(e);
            setNotification({ message: 'Gagal generate: ' + e.message, type: 'error' });
        } finally { 
            setIsGenerating(false); 
        }
    };
    
    const groupedRows = useMemo(() => {
        const groups = new Map<string, ProsemRow[]>();
        prosemData.rows.forEach(row => {
            const group = groups.get(row.protaRowId) || [];
            group.push(row);
            groups.set(row.protaRowId, group);
        });
        return Array.from(groups.values());
    }, [prosemData]);

    const monthHeaders = selectedSemester === 'Ganjil' ? ganjilMonths : genapMonths;

    const handleDownloadPDF = async (signatureOption: 'none' | 'teacher' | 'both') => {
        setIsGeneratingPDF(true);
        setIsPdfDropdownOpen(false);
        setNotification({ message: 'Mempersiapkan PDF...', type: 'info' });
        await new Promise(resolve => setTimeout(resolve, 50));

        if (!schoolIdentity || !teacher || prosemData.rows.length === 0) {
            setNotification({ message: 'Gagal membuat PDF: Data tidak lengkap.', type: 'error' });
            setIsGeneratingPDF(false);
            return;
        }

        try {
            const { jsPDF } = jspdf;
            const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [330, 215] });

            const margin = { top: 15, left: 10, right: 10, bottom: 15 };
            const pageWidth = 330;
            const pageHeight = 215;
            let y = margin.top;

            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(12);
            pdf.setTextColor(0, 0, 0);
            pdf.text(`PROGRAM SEMESTER (PROSEM)`, 165, y, { align: 'center' });
            y += 6;
            pdf.text(`${selectedSubjectName.toUpperCase()}`, 165, y, { align: 'center' });
            y += 6;
            pdf.setFontSize(11);
            pdf.text(`KELAS ${selectedClass.toUpperCase().replace('KELAS ', '')} SEMESTER ${selectedSemester.toUpperCase()} TAHUN AJARAN ${selectedYear}`, 165, y, { align: 'center' });
            y += 6;
            pdf.setFontSize(10);
            pdf.text(schoolIdentity.schoolName.toUpperCase(), 165, y, { align: 'center' });
            y += 10;

            const header1 = [
                { content: 'ATP', rowSpan: 3, styles: { valign: 'middle', halign: 'center' } },
                { content: 'Lingkup Materi', rowSpan: 3, styles: { valign: 'middle', halign: 'center' } },
                { content: 'JP', rowSpan: 3, styles: { valign: 'middle', halign: 'center' } },
                { content: 'PENJABARAN JP PER PEKAN', colSpan: 30, styles: { halign: 'center', fontStyle: 'bold' } },
                { content: 'Ket', rowSpan: 3, styles: { valign: 'middle', halign: 'center' } }
            ];

            const header2 = monthHeaders.map(m => ({ content: m.toUpperCase(), colSpan: 5, styles: { halign: 'center' } }));
            
            const header3: any[] = [];
            monthHeaders.forEach(() => {
                for (let i = 1; i <= 5; i++) header3.push({ content: i.toString(), styles: { halign: 'center', cellWidth: 4 } });
            });

            const head = [header1, header2, header3];
            const body: any[] = [];

            groupedRows.forEach((group) => {
                body.push([{ content: group[0].materi, colSpan: 34, styles: { fontStyle: 'bold', fillColor: [255, 255, 255] } }]);

                group.forEach(row => {
                    const rowData: any[] = [
                        row.atp,
                        row.lingkupMateri,
                        { content: row.alokasiWaktu > 0 ? row.alokasiWaktu : '', styles: { halign: 'center' } }
                    ];

                    for (let m = 1; m <= 6; m++) {
                        for (let w = 1; w <= 5; w++) {
                            const key = `b${m}_m${w}` as keyof ProsemBulanCheckboxes;
                            const isChecked = row.pekan[key];
                            rowData.push({ 
                                content: isChecked ? 'v' : '', 
                                styles: { halign: 'center', fillColor: isChecked ? [255, 255, 255] : [255, 255, 255] } 
                            });
                        }
                    }

                    rowData.push({ content: row.keterangan, styles: { fontSize: 5 } });
                    body.push(rowData);
                });
            });

            (pdf as any).autoTable({
                head, body, startY: y, theme: 'grid',
                headStyles: {
                    fillColor: [255, 255, 255], 
                    textColor: 0, 
                    fontStyle: 'bold',
                    halign: 'center', valign: 'middle', lineColor: 0, lineWidth: 0.1
                },
                styles: { 
                    fontSize: 6, 
                    lineColor: 0, 
                    lineWidth: 0.1, 
                    cellPadding: 1, 
                    valign: 'top',
                    textColor: 0
                },
                columnStyles: {
                    0: { cellWidth: 80 }, 
                    1: { cellWidth: 80 }, 
                    2: { cellWidth: 10 },
                    33: { cellWidth: 15 } 
                },
                margin: { left: margin.left, right: margin.right }
            });

            y = (pdf as any).lastAutoTable.finalY + 15;

            if (signatureOption !== 'none') {
                if (y > pageHeight - 50) {
                    pdf.addPage();
                    y = margin.top;
                }

                pdf.setFontSize(11);
                pdf.setFont('helvetica', 'normal');
                const formattedDate = new Date(signatureDate + 'T00:00:00Z').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
                
                const principalX = margin.left + 50;
                const teacherX = 330 - margin.right - 50;

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
            
            pdf.save(`Prosem-${selectedSubjectName.replace(/[\s/]/g, '_')}-${selectedClass.replace(' ', '_')}-Sem_${selectedSemester}-${selectedYear.replace('/', '-')}.pdf`);
            setNotification({ message: 'PDF berhasil dibuat.', type: 'success' });
        } catch (e) {
            console.error(e);
            setNotification({ message: 'Gagal membuat PDF.', type: 'error' });
        } finally {
            setIsGeneratingPDF(false);
        }
    };

    if (isLoading) return <div className="text-center p-8">Memuat data...</div>;
    
    return (
        <div className="bg-white p-8 rounded-xl shadow-lg">
            {notification && <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
            <div className="flex justify-between items-center mb-6 pb-6 border-b">
                <div className="flex items-center space-x-4">
                    <select value={selectedSubjectId} onChange={e => setSelectedSubjectId(e.target.value)} disabled={isEditing || isLoading} className="p-2 border-gray-300 rounded-md">
                        {subjectsForDropdown.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <select value={selectedSemester} onChange={e => setSelectedSemester(e.target.value as 'Ganjil' | 'Genap')} disabled={isEditing || isLoading} className="p-2 border-gray-300 rounded-md">
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
                                <button 
                                    onClick={() => setIsPullModalOpen(true)}
                                    disabled={isPulling}
                                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold shadow flex items-center space-x-2 disabled:bg-purple-400"
                                >
                                    {isPulling ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <SparklesIcon className="w-5 h-5" />}
                                    <span>Tarik dari Induk</span>
                                </button>
                            )}
                             <label htmlFor="signatureDate" className="text-sm font-medium text-gray-700 shrink-0">Tanggal Cetak:</label>
                             <input
                                type="date"
                                id="signatureDate"
                                value={signatureDate}
                                onChange={(e) => setSignatureDate(e.target.value)}
                                className="block w-auto px-2 py-1 border border-gray-300 rounded-md shadow-sm sm:text-sm"
                            />
                            <div className="relative">
                                <button onClick={() => setIsPdfDropdownOpen(!isPdfDropdownOpen)} disabled={isGeneratingPDF || isLoading} className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-semibold shadow flex items-center space-x-2 disabled:bg-gray-400">
                                    <ArrowDownTrayIcon/> <span>{isGeneratingPDF ? 'Memproses...' : 'Download PDF'}</span>
                                </button>
                                {isPdfDropdownOpen && (
                                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10 border" onMouseLeave={() => setIsPdfDropdownOpen(false)}>
                                        <ul className="py-1">
                                            <li><button onClick={() => handleDownloadPDF('none')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Tanpa TTD</button></li>
                                            <li><button onClick={() => handleDownloadPDF('teacher')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">TTD Guru</button></li>
                                            <li><button onClick={() => handleDownloadPDF('both')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">TTD Guru & KS</button></li>
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
                <p className="text-lg font-semibold uppercase">{schoolIdentity?.schoolName}</p>
                <p className="text-md text-gray-600">Semester {selectedSemester} - Tahun Ajaran {selectedYear}</p>
            </header>

            {isEditing && (
                <div className="mb-6 p-4 border-2 border-dashed border-purple-300 bg-purple-50 rounded-lg flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-semibold text-purple-800">Penjadwalan Otomatis (Tanpa Tanggal Ganda)</h3>
                        <p className="text-sm text-purple-700">AI akan menyusun jadwal sesi demi sesi sesuai kalender dan jadwal harian untuk memastikan setiap materi memiliki tanggal unik.</p>
                    </div>
                    <button onClick={handleGenerateWithAI} disabled={isSaving || isGenerating} className="btn-ai">
                        {isGenerating ? (<svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>) : <SparklesIcon />}
                        <span>{isGenerating ? 'Memproses...' : 'Generate Jadwal (AI)'}</span>
                    </button>
                </div>
            )}

            <div className="overflow-x-auto border rounded-lg">
                <table className="min-w-max text-xs border-collapse">
                    <thead className="bg-gray-100 text-center font-bold">
                        <tr>
                            <th className="p-1 border" rowSpan={3}>ATP</th>
                            <th className="p-1 border" rowSpan={3}>Lingkup Materi</th>
                            <th className="p-1 border w-10" rowSpan={3}>JP</th>
                            {monthHeaders.map((m, i) => (
                                <th key={i} className="p-1 border" colSpan={5}>{m}</th>
                            ))}
                            <th className="p-1 border" rowSpan={3}>Ket</th>
                        </tr>
                        <tr>
                            {monthHeaders.map((_, i) => (
                                <th key={`w-${i}`} className="p-1 border text-[10px]" colSpan={5}>Minggu Ke-</th>
                            ))}
                        </tr>
                        <tr>
                            {monthHeaders.map((_, i) => (
                                [1,2,3,4,5].map(w => <th key={`d-${i}-${w}`} className="p-1 border w-6">{w}</th>)
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {groupedRows.map((group, gIndex) => (
                            <React.Fragment key={gIndex}>
                                <tr className="bg-gray-50 font-bold">
                                    <td colSpan={34} className="p-2 border">{group[0].materi}</td>
                                </tr>
                                {group.map(row => (
                                    <tr key={row.id} className="hover:bg-gray-50">
                                        <td className="p-1 border align-middle"><div className="max-w-[200px] overflow-hidden text-ellipsis"><WrappingTextarea value={row.atp} disabled={true} /></div></td>
                                        <td className="p-1 border align-middle"><div className="max-w-[200px] overflow-hidden text-ellipsis"><WrappingTextarea value={row.lingkupMateri} disabled={true} /></div></td>
                                        <td className="p-1 border text-center align-middle">
                                            {isEditing ? <input type="number" value={row.alokasiWaktu} onChange={e => handleRowChange(row.id, 'alokasiWaktu', parseInt(e.target.value)||0)} className="w-full text-center border rounded p-1" /> : row.alokasiWaktu}
                                        </td>
                                        {[1,2,3,4,5,6].map(m => [1,2,3,4,5].map(w => {
                                            const key = `b${m}_m${w}` as keyof ProsemBulanCheckboxes;
                                            return (
                                                <td key={key} className="p-0 border text-center align-middle">
                                                    <input type="checkbox" checked={row.pekan[key]} onChange={() => isEditing && handleCheckboxChange(row.id, key)} disabled={!isEditing} className="w-3 h-3" />
                                                </td>
                                            )
                                        }))}
                                        <td className="p-1 border align-middle">
                                            {isEditing ? <input type="text" value={row.keterangan} onChange={e => handleRowChange(row.id, 'keterangan', e.target.value)} className="w-full border rounded p-1 text-xs" /> : <span className="text-[10px]">{row.keterangan}</span>}
                                        </td>
                                    </tr>
                                ))}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>

            {isPullModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all animate-fade-in scale-100">
                        <div className="p-6">
                            <div className="flex items-center justify-center w-16 h-16 mx-auto bg-purple-100 rounded-full mb-4">
                                <SparklesIcon className="w-10 h-10 text-purple-600" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 text-center mb-2">Tarik Program Semester?</h3>
                            <p className="text-gray-600 text-center text-sm mb-6">
                                Anda akan menyalin data Program Semester dari Admin untuk mata pelajaran <span className="font-bold">{selectedSubjectName}</span> Semester <span className="font-bold">{selectedSemester}</span>. 
                                <br/><br/>
                                <span className="text-red-600 font-bold">Peringatan:</span> Data Prosem yang sudah Anda buat atau ubah sendiri untuk pilihan ini akan <span className="underline">ditimpa sepenuhnya</span>.
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

             <style>{`.btn-primary{display:inline-flex;align-items:center;gap:.5rem;padding:.5rem 1rem;background-color:#4f46e5;color:#fff;border-radius:.5rem;font-weight:600}.btn-primary:disabled{opacity:.6;cursor:not-allowed}.btn-secondary{display:inline-flex;align-items:center;gap:.5rem;padding:.5rem 1rem;background-color:#e5e7eb;color:#1f2937;border-radius:.5rem;font-weight:600}.btn-ai{display:inline-flex;align-items:center;gap:.5rem;padding:.5rem 1rem;background-color:#9333ea;color:#fff;border-radius:.5rem;font-weight:600}.btn-ai:disabled{opacity:.6;cursor:not-allowed}`}</style>
        </div>
    );
};

export default Prosem;
