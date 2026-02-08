
import React, { useState, useEffect, useMemo, useLayoutEffect, useRef } from 'react';
import { ProtaData, ProtaRow, Teacher, SchoolIdentity, Subject } from '../types';
import { getProta, updateProta, getTeacherProfile, getSchoolIdentity, getSubjects, getCalendarEvents, getClassSchedule, pullProtaToTeacher } from '../services/adminService';
import Notification, { NotificationType } from './Notification';
import { PencilIcon, SparklesIcon, ArrowDownTrayIcon, ArrowPathIcon } from './Icons';
import { generateContentWithRotation } from '../services/geminiService';
import { Type } from '@google/genai';

declare const jspdf: any;

interface ProtaProps {
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

const Prota: React.FC<ProtaProps> = ({ selectedClass, selectedYear, userId }) => {
    const [subjectsForDropdown, setSubjectsForDropdown] = useState<{ id: string, name: string }[]>([]);
    const [selectedSubjectId, setSelectedSubjectId] = useState('');
    const [activeArtTab, setActiveArtTab] = useState<string>(masterArtSubjects[0]);
    const [protaData, setProtaData] = useState<ProtaData>({ ganjilRows: [], genapRows: [] });
    const [originalProtaData, setOriginalProtaData] = useState<ProtaData | null>(null);
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
                        if (!regularSubjectsMap.has(s.name)) {
                            regularSubjectsMap.set(s.name, { id: s.code.toLowerCase(), name: s.name });
                        }
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
            setProtaData({ ganjilRows: [], genapRows: [] });
            setIsLoading(false);
            return;
        }
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const [data, teacherData, identityData] = await Promise.all([
                    getProta(selectedYear, selectedClass, finalSubjectIdForApi, userId),
                    getTeacherProfile(selectedYear, selectedClass, userId),
                    getSchoolIdentity(userId)
                ]);
                setProtaData(data);
                setTeacher(teacherData);
                setSchoolIdentity(identityData);
            } catch (error: any) {
                setNotification({ message: error.message || 'Gagal memuat data.', type: 'error' });
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [finalSubjectIdForApi, selectedClass, selectedYear, userId]);

    const handleEdit = () => {
        setOriginalProtaData(JSON.parse(JSON.stringify(protaData)));
        setIsEditing(true);
    };

    const handleCancel = () => {
        if (originalProtaData) setProtaData(originalProtaData);
        setIsEditing(false);
    };

    const handleSave = async () => {
        if (!finalSubjectIdForApi || !protaData) return;
        setIsSaving(true);
        try {
            await updateProta(selectedYear, selectedClass, finalSubjectIdForApi, protaData, userId);
            setNotification({ message: 'PROTA berhasil disimpan.', type: 'success' });
            setIsEditing(false);
        } catch (e: any) { setNotification({ message: e.message, type: 'error' }); } 
        finally { setIsSaving(false); }
    };
    
    const handleRowChange = (id: string, value: number, semester: 'ganjil' | 'genap') => {
        setProtaData(prev => {
            const semesterKey = semester === 'ganjil' ? 'ganjilRows' : 'genapRows';
            const updatedRows = prev[semesterKey].map(row => 
                row.id === id ? { ...row, alokasiWaktu: value } : row
            );
            return { ...prev, [semesterKey]: updatedRows };
        });
    };

    const handlePullFromMaster = async () => {
        if (!userId || !finalSubjectIdForApi) return;
        setIsPulling(true);
        setNotification(null);
        try {
            await pullProtaToTeacher(selectedYear, selectedClass, finalSubjectIdForApi, userId);
            const refreshedData = await getProta(selectedYear, selectedClass, finalSubjectIdForApi, userId);
            setProtaData(refreshedData);
            setNotification({ message: 'Alokasi waktu PROTA berhasil ditarik dari induk.', type: 'success' });
            setIsPullModalOpen(false);
        } catch (error: any) {
            setNotification({ message: error.message, type: 'error' });
        } finally {
            setIsPulling(false);
        }
    };

    const handleGenerateWithAI = async () => {
        if (protaData.ganjilRows.length === 0 && protaData.genapRows.length === 0) {
            setNotification({ message: 'ATP belum diisi, tidak ada data untuk dianalisis.', type: 'error' });
            return;
        }
        setIsGenerating(true);
        setNotification({ message: 'AI sedang menganalisis data & menghitung alokasi waktu...', type: 'info' });
        try {
            const [calendarEvents, classSchedule] = await Promise.all([
                getCalendarEvents(selectedYear, userId),
                getClassSchedule(selectedYear, selectedClass, userId),
            ]);

            const jpPerDay: { [key: string]: number } = { senin: 0, selasa: 0, rabu: 0, kamis: 0, jumat: 0, sabtu: 0 };
            const dayMap: (keyof typeof jpPerDay | 'minggu')[] = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];

            classSchedule.timeSlots.forEach(slot => {
                for (const day in slot.subjects) {
                    if (slot.subjects[day as keyof typeof slot.subjects] === selectedSubjectName) {
                        jpPerDay[day as keyof typeof jpPerDay]++;
                    }
                }
            });

            const totalJpPerMingguFromSchedule = Object.values(jpPerDay).reduce((sum, jp) => sum + jp, 0);
            if (totalJpPerMingguFromSchedule === 0) {
                 throw new Error(`Jadwal pelajaran untuk ${selectedSubjectName} belum diatur. Silakan atur di menu Jadwal Pelajaran.`);
            }

            const nonEffectiveDates = new Set(calendarEvents.map(e => e.date));
            const [startYearNum] = selectedYear.split('/').map(Number);
            
            const effectiveDayCountsGanjil = { senin: 0, selasa: 0, rabu: 0, kamis: 0, jumat: 0, sabtu: 0 };
            const effectiveDayCountsGenap = { senin: 0, selasa: 0, rabu: 0, kamis: 0, jumat: 0, sabtu: 0 };

            let currentDateGanjil = new Date(Date.UTC(startYearNum, 6, 1));
            const endDateGanjil = new Date(Date.UTC(startYearNum, 11, 31));
            while (currentDateGanjil <= endDateGanjil) {
                const dayOfWeekIndex = currentDateGanjil.getUTCDay();
                if (dayOfWeekIndex !== 0) {
                    const dateStr = currentDateGanjil.toISOString().split('T')[0];
                    if (!nonEffectiveDates.has(dateStr)) {
                        const dayName = dayMap[dayOfWeekIndex];
                        if (dayName in effectiveDayCountsGanjil) {
                            effectiveDayCountsGanjil[dayName as keyof typeof effectiveDayCountsGanjil]++;
                        }
                    }
                }
                currentDateGanjil.setUTCDate(currentDateGanjil.getUTCDate() + 1);
            }

            let currentDateGenap = new Date(Date.UTC(startYearNum + 1, 0, 1));
            const endDateGenap = new Date(Date.UTC(startYearNum + 1, 5, 30));
             while (currentDateGenap <= endDateGenap) {
                const dayOfWeekIndex = currentDateGenap.getUTCDay();
                if (dayOfWeekIndex !== 0) {
                    const dateStr = currentDateGenap.toISOString().split('T')[0];
                    if (!nonEffectiveDates.has(dateStr)) {
                        const dayName = dayMap[dayOfWeekIndex];
                        if (dayName in effectiveDayCountsGenap) {
                            effectiveDayCountsGenap[dayName as keyof typeof effectiveDayCountsGenap]++;
                        }
                    }
                }
                currentDateGenap.setUTCDate(currentDateGenap.getUTCDate() + 1);
            }

            let maxJpGanjil = 0;
            for (const day in jpPerDay) {
                maxJpGanjil += effectiveDayCountsGanjil[day as keyof typeof effectiveDayCountsGanjil] * jpPerDay[day];
            }
            let maxJpGenap = 0;
            for (const day in jpPerDay) {
                maxJpGenap += effectiveDayCountsGenap[day as keyof typeof effectiveDayCountsGenap] * jpPerDay[day];
            }

            const ganjilRows = protaData.ganjilRows.map(r => ({ id: r.id, material: r.material, scope: r.materialScope, atp: r.learningGoalPathway }));
            const genapRows = protaData.genapRows.map(r => ({ id: r.id, material: r.material, scope: r.materialScope, atp: r.learningGoalPathway }));
            
            const prompt = `
                Alokasikan Jam Pelajaran (JP) untuk materi-materi berikut.
                BATASAN ANGGARAN:
                - SEMESTER GANJIL: Maks ${maxJpGanjil} JP.
                - SEMESTER GENAP: Maks ${maxJpGenap} JP.

                DATA MATERI:
                - Ganjil: ${JSON.stringify(ganjilRows)}
                - Genap: ${JSON.stringify(genapRows)}

                Aturan:
                1. Distribusi proporsional sesuai kompleksitas.
                2. Total per semester TIDAK BOLEH melebihi batasan anggaran.
                3. Alokasi harus bilangan bulat.
                Output JSON: [{"id": "...", "alokasiWaktu": number}, ...]
            `;

            const response = await generateContentWithRotation({
                model: 'gemini-2.5-flash', contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, alokasiWaktu: { type: Type.NUMBER } }, required: ["id", "alokasiWaktu"] }
                    },
                },
            });

            const results = JSON.parse(response.text.trim());
            if (!Array.isArray(results)) throw new Error("Format AI tidak valid.");

            setProtaData(prev => ({
                ganjilRows: prev.ganjilRows.map(row => {
                    const aiResult = results.find(res => res.id === row.id);
                    return aiResult ? { ...row, alokasiWaktu: aiResult.alokasiWaktu } : row;
                }),
                genapRows: prev.genapRows.map(row => {
                    const aiResult = results.find(res => res.id === row.id);
                    return aiResult ? { ...row, alokasiWaktu: aiResult.alokasiWaktu } : row;
                })
            }));
            setNotification({ message: 'Alokasi waktu berhasil dibuat oleh AI!', type: 'success' });
        } catch (e: any) { 
            setNotification({ message: 'Gagal generate: ' + e.message, type: 'error' });
        } finally { 
            setIsGenerating(false); 
        }
    };
    
    const handleDownloadPDF = async (signatureOption: 'none' | 'teacher' | 'both') => {
        setIsGeneratingPDF(true);
        setIsPdfDropdownOpen(false);
        setNotification({ message: 'Mempersiapkan PDF...', type: 'info' });
        await new Promise(resolve => setTimeout(resolve, 50));

        if (!schoolIdentity || !teacher || (protaData.ganjilRows.length === 0 && protaData.genapRows.length === 0)) {
            setNotification({ message: 'Gagal membuat PDF: Data tidak lengkap.', type: 'error' });
            setIsGeneratingPDF(false);
            return;
        }

        try {
            const { jsPDF } = jspdf;
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [215, 330] });
            const margin = { top: 5, left: 25, right: 5, bottom: 5 };
            const contentWidth = 215 - margin.left - margin.right;
            const pageHeight = 330;
            let y = margin.top + 10;

            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(12);
            pdf.setTextColor(0, 0, 0);
            pdf.text(`PROGRAM TAHUNAN (PROTA)`, 107.5, y, { align: 'center' });
            y += 6;
            pdf.text(`${selectedSubjectName.toUpperCase()}`, 107.5, y, { align: 'center' });
            y += 6;
            pdf.setFontSize(11);
            pdf.text(`KELAS ${selectedClass.toUpperCase().replace('KELAS ', '')} TAHUN AJARAN ${selectedYear}`, 107.5, y, { align: 'center' });
            y += 6;
            pdf.setFontSize(10);
            pdf.text(schoolIdentity.schoolName.toUpperCase(), 107.5, y, { align: 'center' });
            y += 10;

            const head = [['Materi/Tema', 'Alur Tujuan Pembelajaran', 'Lingkup Materi', 'Alokasi Waktu (JP)']];
            const body: any[] = [];
            const totalGanjil = protaData.ganjilRows.reduce((sum, row) => sum + (row.alokasiWaktu || 0), 0);
            const totalGenap = protaData.genapRows.reduce((sum, row) => sum + (row.alokasiWaktu || 0), 0);

            if (protaData.ganjilRows.length > 0) {
                body.push([{ content: 'SEMESTER I (GANJIL)', colSpan: 4, styles: { halign: 'center', fontStyle: 'bold', fillColor: [255, 255, 255] } }]);
                protaData.ganjilRows.forEach(row => {
                    body.push([row.material, row.learningGoalPathway, row.materialScope, { content: row.alokasiWaktu > 0 ? `${row.alokasiWaktu}` : '', styles: { halign: 'center' } }]);
                });
                body.push([{ content: 'JUMLAH JAM PELAJARAN SEMESTER I', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold' } }, { content: `${totalGanjil} JP`, styles: { halign: 'center', fontStyle: 'bold' } }]);
            }
            if (protaData.genapRows.length > 0) {
                body.push([{ content: 'SEMESTER II (GENAP)', colSpan: 4, styles: { halign: 'center', fontStyle: 'bold', fillColor: [255, 255, 255] } }]);
                protaData.genapRows.forEach(row => {
                    body.push([row.material, row.learningGoalPathway, row.materialScope, { content: row.alokasiWaktu > 0 ? `${row.alokasiWaktu}` : '', styles: { halign: 'center' } }]);
                });
                body.push([{ content: 'JUMLAH JAM PELAJARAN SEMESTER II', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold' } }, { content: `${totalGenap} JP`, styles: { halign: 'center', fontStyle: 'bold' } }]);
            }

            (pdf as any).autoTable({
                head, body, startY: y, theme: 'grid',
                headStyles: { fillColor: [255, 255, 255], textColor: 0, fontStyle: 'bold', halign: 'center', valign: 'middle', lineColor: 0, lineWidth: 0.1 },
                styles: { fontSize: 9, lineColor: 0, lineWidth: 0.1, cellPadding: 2, valign: 'top', textColor: 0 },
                columnStyles: { 0: { cellWidth: 35 }, 1: { cellWidth: 60 }, 2: { cellWidth: 60 }, 3: { cellWidth: 20 } },
                margin: { left: margin.left, right: margin.right, top: margin.top, bottom: margin.bottom }
            });

            y = (pdf as any).lastAutoTable.finalY + 15;
            if (signatureOption !== 'none') {
                if (y > pageHeight - 50) { pdf.addPage(); y = margin.top + 10; }
                pdf.setFontSize(11);
                pdf.setFont('helvetica', 'normal');
                const formattedDate = new Date(signatureDate + 'T00:00:00Z').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
                const principalX = margin.left + (contentWidth / 4);
                const teacherX = 215 - margin.right - (contentWidth / 4);
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
            pdf.save(`Prota-${selectedSubjectName.replace(/[\s/]/g, '_')}-${selectedYear.replace('/', '-')}.pdf`);
            setNotification({ message: 'PDF berhasil dibuat.', type: 'success' });
        } catch (e) { setNotification({ message: 'Gagal membuat PDF.', type: 'error' }); } finally { setIsGeneratingPDF(false); }
    };

    if (isLoading) return <div className="text-center p-8">Memuat data...</div>;
    
    return (
        <div className="bg-white p-6 rounded-xl shadow-lg">
            {notification && <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
            <div className="flex justify-between items-center mb-6 pb-6 border-b">
                <div className="flex items-center space-x-4">
                    <select value={selectedSubjectId} onChange={e => setSelectedSubjectId(e.target.value)} disabled={isEditing || isLoading} className="p-2 border-gray-300 rounded-md">
                        {subjectsForDropdown.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
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
                        <label className="text-sm font-medium">Tgl Cetak:</label>
                        <input type="date" value={signatureDate} onChange={e => setSignatureDate(e.target.value)} className="p-1 border border-gray-300 rounded-md"/>
                        <div className="relative">
                            <button onClick={() => setIsPdfDropdownOpen(!isPdfDropdownOpen)} disabled={isGeneratingPDF || isLoading} className="btn-secondary"><ArrowDownTrayIcon/> {isGeneratingPDF ? 'Memproses...' : 'Download PDF'}</button>
                            {isPdfDropdownOpen && <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10 border" onMouseLeave={() => setIsPdfDropdownOpen(false)}>
                                <ul>
                                    <li><button onClick={() => handleDownloadPDF('none')} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100">Tanpa TTD</button></li>
                                    <li><button onClick={() => handleDownloadPDF('teacher')} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100">TTD Guru</button></li>
                                    <li><button onClick={() => handleDownloadPDF('both')} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100">TTD Guru & KS</button></li>
                                </ul>
                            </div>}
                        </div>
                        <button onClick={handleEdit} disabled={isLoading} className="btn-primary"><PencilIcon/> Edit</button>
                        </>
                    )}
                </div>
            </div>
             {selectedSubjectId === 'seni-budaya-group' && <div className="mb-6 border-b"><nav className="-mb-px flex space-x-4">
                {masterArtSubjects.map(artName => <button key={artName} onClick={() => setActiveArtTab(artName)} disabled={isEditing || isLoading} className={`${activeArtTab === artName ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}>{artName}</button>)}
            </nav></div>}

            <header className="text-center mb-6">
                <h1 className="text-xl font-bold uppercase">PROGRAM TAHUNAN {selectedSubjectName}</h1>
                <p className="text-lg font-semibold uppercase">{schoolIdentity?.schoolName}</p>
                <p className="text-md text-gray-600">KELAS {selectedClass.replace('Kelas ', '')} TAHUN AJARAN {selectedYear}</p>
            </header>

            {isEditing && (
                <div className="mb-6 p-4 border-2 border-dashed border-purple-300 bg-purple-50 rounded-lg flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-semibold text-purple-800">Butuh Bantuan Alokasi Waktu?</h3>
                        <p className="text-sm text-purple-700">AI akan menghitung alokasi JP secara presisi berdasarkan jadwal pelajaran dan kalender pendidikan.</p>
                    </div>
                    <button onClick={handleGenerateWithAI} disabled={isSaving || isGenerating} className="btn-ai">
                        {isGenerating ? (<svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>) : <SparklesIcon />}
                        <span>{isGenerating ? 'Memproses...' : 'Generate Alokasi Waktu (AI)'}</span>
                    </button>
                </div>
            )}
            
            <div className="overflow-x-auto border rounded-lg">
                <table className="min-w-full text-sm border-collapse">
                    <thead className="bg-gray-100 text-center font-bold">
                        <tr>
                            <th className="p-2 border">Materi/Tema</th>
                            <th className="p-2 border">Alur Tujuan Pembelajaran</th>
                            <th className="p-2 border">Lingkup Materi</th>
                            <th className="p-2 border">Alokasi Waktu (JP)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {protaData.ganjilRows.length > 0 && (
                            <>
                                <tr className="bg-blue-100 font-bold">
                                    <td colSpan={4} className="p-2 border text-center">SEMESTER I (GANJIL)</td>
                                </tr>
                                {protaData.ganjilRows.map(row => (
                                    <tr key={row.id} className="align-top hover:bg-gray-50">
                                        <td className="p-1 border w-[20%] align-middle text-center"><WrappingTextarea value={row.material} disabled={true} /></td>
                                        <td className="p-1 border w-[35%]"><WrappingTextarea value={row.learningGoalPathway} disabled={true} /></td>
                                        <td className="p-1 border w-[35%]"><WrappingTextarea value={row.materialScope} disabled={true} /></td>
                                        <td className="p-1 border w-[10%] align-middle text-center">
                                            {isEditing ? (
                                                <input type="number" value={row.alokasiWaktu || ''} onChange={e => handleRowChange(row.id, parseInt(e.target.value, 10) || 0, 'ganjil')} className="w-full p-2 text-center border rounded" />
                                            ) : (
                                                row.alokasiWaktu > 0 ? `${row.alokasiWaktu} JP` : ''
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </>
                        )}
                        {protaData.genapRows.length > 0 && (
                             <>
                                <tr className="bg-green-100 font-bold">
                                    <td colSpan={4} className="p-2 border text-center">SEMESTER II (GENAP)</td>
                                </tr>
                                {protaData.genapRows.map(row => (
                                    <tr key={row.id} className="align-top hover:bg-gray-50">
                                        <td className="p-1 border w-[20%] align-middle text-center"><WrappingTextarea value={row.material} disabled={true} /></td>
                                        <td className="p-1 border w-[35%]"><WrappingTextarea value={row.learningGoalPathway} disabled={true} /></td>
                                        <td className="p-1 border w-[35%]"><WrappingTextarea value={row.materialScope} disabled={true} /></td>
                                        <td className="p-1 border w-[10%] align-middle text-center">
                                            {isEditing ? (
                                                <input type="number" value={row.alokasiWaktu || ''} onChange={e => handleRowChange(row.id, parseInt(e.target.value, 10) || 0, 'genap')} className="w-full p-2 text-center border rounded" />
                                            ) : (
                                                row.alokasiWaktu > 0 ? `${row.alokasiWaktu} JP` : ''
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </>
                        )}
                        {(protaData.ganjilRows.length === 0 && protaData.genapRows.length === 0) && (
                            <tr><td colSpan={4} className="text-center py-10 text-gray-500 border">Data ATP belum diisi.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal Konfirmasi Tarik PROTA */}
            {isPullModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all animate-fade-in scale-100">
                        <div className="p-6">
                            <div className="flex items-center justify-center w-16 h-16 mx-auto bg-purple-100 rounded-full mb-4">
                                <SparklesIcon className="w-10 h-10 text-purple-600" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 text-center mb-2">Tarik Alokasi Waktu?</h3>
                            <p className="text-gray-600 text-center text-sm mb-6">
                                Anda akan menyalin data alokasi waktu Program Tahunan dari Admin untuk mata pelajaran <span className="font-bold">{selectedSubjectName}</span>. 
                                <br/><br/>
                                <span className="text-red-600 font-bold">Peringatan:</span> Data alokasi waktu yang sudah Anda buat atau ubah sendiri untuk mapel ini akan <span className="underline">ditimpa sepenuhnya</span>.
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

export default Prota;
