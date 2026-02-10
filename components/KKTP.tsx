import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { Subject, KKTPData, KKTPIntervals, KKTPAchievementLevels, KKTPRow, SchoolIdentity, Teacher } from '../types';
import { getSubjects, getKKTP, updateKKTP, getSchoolIdentity, getTeacherProfile, pullKKTPToTeacher } from '../services/adminService';
import Notification, { NotificationType } from './Notification';
import { PencilIcon, SparklesIcon, ArrowDownTrayIcon, ArrowPathIcon } from './Icons';
import { Type } from '@google/genai';
import { generateContentWithRotation } from '../services/geminiService';

declare const jspdf: any;

interface KKTPProps {
    selectedClass: string;
    selectedYear: string;
    userId?: string;
}

const defaultKktpData: KKTPData = {
    intervals: { interval1: '< 60', interval2: '60 - 72', interval3: '73 - 86', interval4: '87 - 100' },
    rows: []
};

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

const WrappingTextarea: React.FC<{
    value: string; onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    disabled: boolean; placeholder?: string; className?: string;
}> = ({ value, onChange, disabled, placeholder, className = '' }) => {
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
            ref={textareaRef} value={value} onChange={onChange} disabled={disabled}
            placeholder={placeholder}
            className={`w-full p-2 border-none bg-transparent focus:outline-none focus:bg-indigo-50 rounded resize-none overflow-hidden block ${className}`}
            rows={1}
        />
    );
};

const LoadingSpinner: React.FC = () => (
    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

interface RenderRow extends KKTPRow {
    materialRowSpan?: number;
}

const KKTP: React.FC<KKTPProps> = ({ selectedClass, selectedYear, userId }) => {
    const [subjectsForDropdown, setSubjectsForDropdown] = useState<{ id: string, name: string }[]>([]);
    const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
    const [selectedSemester, setSelectedSemester] = useState<'Ganjil' | 'Genap'>('Ganjil');
    const [activeArtTab, setActiveArtTab] = useState<string>(masterArtSubjects[0]);
    const [kktpData, setKktpData] = useState<KKTPData>(defaultKktpData);
    const [originalKktpData, setOriginalKktpData] = useState<KKTPData | null>(null);
    const [schoolIdentity, setSchoolIdentity] = useState<SchoolIdentity | null>(null);
    const [teacher, setTeacher] = useState<Teacher | null>(null);
    
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
                const [fetchedSubjects, identityData, teacherData] = await Promise.all([
                    getSubjects(selectedYear, selectedClass, userId),
                    getSchoolIdentity(userId),
                    getTeacherProfile(selectedYear, selectedClass, userId)
                ]);
                
                setSchoolIdentity(identityData);
                setTeacher(teacherData);

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
            setKktpData(defaultKktpData);
            setIsLoading(false);
            return;
        }
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const data = await getKKTP(selectedYear, selectedClass, finalSubjectIdForApi, selectedSemester, userId);
                setKktpData(data);
            } catch (e: any) { 
                setNotification({ message: e.message, type: 'error' });
                setKktpData(defaultKktpData);
            } 
            finally { setIsLoading(false); }
        };
        fetchData();
    }, [finalSubjectIdForApi, selectedSemester, selectedYear, selectedClass, userId]);

    const handleEdit = () => {
        setOriginalKktpData(JSON.parse(JSON.stringify(kktpData)));
        setIsEditing(true);
    };
    const handleCancel = () => {
        if (originalKktpData) setKktpData(originalKktpData);
        setIsEditing(false);
    };
    const handleSave = async () => {
        if (!finalSubjectIdForApi || !kktpData) return;
        setIsSaving(true);
        try {
            await updateKKTP(selectedYear, selectedClass, finalSubjectIdForApi, selectedSemester, kktpData, userId);
            setNotification({ message: 'KKTP berhasil disimpan.', type: 'success' });
            setIsEditing(false);
        } catch (e: any) { setNotification({ message: e.message, type: 'error' }); } 
        finally { setIsSaving(false); }
    };
    
    const handlePullFromMaster = async () => {
        if (!userId || !finalSubjectIdForApi) return;
        setIsPulling(true);
        setNotification(null);
        try {
            await pullKKTPToTeacher(selectedYear, selectedClass, finalSubjectIdForApi, selectedSemester, userId);
            const refreshedData = await getKKTP(selectedYear, selectedClass, finalSubjectIdForApi, selectedSemester, userId);
            setKktpData(refreshedData);
            setNotification({ message: 'KKTP berhasil ditarik dari induk.', type: 'success' });
            setIsPullModalOpen(false);
        } catch (error: any) {
            setNotification({ message: error.message, type: 'error' });
        } finally {
            setIsPulling(false);
        }
    };

    const handleIntervalChange = (intervalKey: keyof KKTPIntervals, value: string) => {
        setKktpData(prev => {
            const newIntervals = { ...(prev?.intervals || defaultKktpData.intervals), [intervalKey]: value };
            return { ...prev, intervals: newIntervals };
        });
    };

    const handleKktpChange = (rowId: string, levelKey: keyof KKTPAchievementLevels, value: string) => {
        setKktpData(prev => ({
            ...prev,
            rows: prev.rows.map(row => {
                if (row.id === rowId) {
                    const newKktp = { 
                        ...(row.kktp || { belumTercapai: '', tercapaiSebagian: '', tuntas: '', tuntasPlus: '' }), 
                        [levelKey]: value 
                    };
                    return { ...row, kktp: newKktp as KKTPAchievementLevels };
                }
                return row;
            })
        }));
    };
    
    const handleGenerateAll = async () => {
        const atpsToGenerate = kktpData.rows.filter(row => row.learningGoalPathway.trim());
        if (atpsToGenerate.length === 0) {
            setNotification({ message: 'Tidak ada ATP untuk diproses.', type: 'error' });
            return;
        }
        setIsGenerating(true);
        setNotification({ message: 'AI sedang membuat semua kriteria, mohon tunggu...', type: 'info' });

        try {
            const prompt = `
                Anda adalah seorang guru ahli. Berdasarkan daftar Alur Tujuan Pembelajaran (ATP) berikut, buat deskripsi singkat dan sederhana untuk setiap tingkat kriteria ketercapaian untuk SETIAP ATP.
                
                Daftar ATP:
                ${atpsToGenerate.map(row => `- ID: "${row.id}", ATP: "${row.learningGoalPathway}"`).join('\n')}

                Untuk setiap ATP, buat deskripsi untuk 4 tingkat berikut:
                1. belumTercapai: Kondisi di mana siswa belum menunjukkan pemahaman.
                2. tercapaiSebagian: Kondisi di mana siswa menunjukkan pemahaman parsial.
                3. tuntas: Kondisi di mana siswa telah memahami dan mampu menerapkan sesuai ATP.
                4. tuntasPlus: Kondisi di mana siswa telah melampaui target ATP.
                
                Aturan:
                - Setiap deskripsi harus singkat (cukup 1 kalimat).
                - Jawaban HARUS dalam format array JSON yang valid, di mana setiap objek berisi 'id' and objek 'kktp' dengan keempat tingkat ketercapaian.
            `;
            const response = await generateContentWithRotation({
                model: 'gemini-3-flash-preview', contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                id: { type: Type.STRING },
                                kktp: {
                                    type: Type.OBJECT,
                                    properties: {
                                        belumTercapai: { type: Type.STRING },
                                        tercapaiSebagian: { type: Type.STRING },
                                        tuntas: { type: Type.STRING },
                                        tuntasPlus: { type: Type.STRING },
                                    },
                                    required: ["belumTercapai", "tercapaiSebagian", "tuntas", "tuntasPlus"]
                                }
                            },
                            required: ["id", "kktp"]
                        }
                    },
                },
            });
            const results = JSON.parse(response.text.trim());
            
            if (!Array.isArray(results)) {
                throw new Error("AI response is not in the expected array format.");
            }

            const resultMap = new Map<string, KKTPAchievementLevels>();
            results.forEach((item: any) => {
                if (item && typeof item === 'object' && item.id && item.kktp && typeof item.kktp === 'object') {
                    resultMap.set(item.id, item.kktp);
                }
            });
            
            setKktpData(prev => ({
                ...prev,
                rows: prev.rows.map(row => {
                    const newKktp = resultMap.get(row.id);
                    return newKktp ? { ...row, kktp: newKktp } : row;
                })
            }));
            setNotification({ message: 'Semua kriteria berhasil dibuat oleh AI!', type: 'success' });
        } catch (e: any) {
            setNotification({ message: e.message || 'Gagal generate kriteria.', type: 'error' });
        } finally {
            setIsGenerating(false);
        }
    };

    const renderRows: RenderRow[] = useMemo(() => {
        if (!kktpData?.rows) {
            return [];
        }
        
        const processed: RenderRow[] = [];
        const materialGroups = new Map<string, KKTPRow[]>();
        
        kktpData.rows.forEach(row => {
            const group = materialGroups.get(row.originalId) || [];
            group.push(row);
            materialGroups.set(row.originalId, group);
        });

        materialGroups.forEach(group => {
            group.forEach((row, index) => {
                processed.push({
                    ...row,
                    materialRowSpan: index === 0 ? group.length : 0,
                });
            });
        });

        return processed;
    }, [kktpData.rows]);

    const handleDownloadPDF = async (signatureOption: 'none' | 'teacher' | 'both') => {
        setIsGeneratingPDF(true);
        setIsPdfDropdownOpen(false);
        setNotification({ message: 'Mempersiapkan PDF...', type: 'info' });
        await new Promise(resolve => setTimeout(resolve, 50));

        if (!schoolIdentity || !teacher || !kktpData || kktpData.rows.length === 0) {
            setNotification({ message: 'Gagal membuat PDF: Data tidak lengkap.', type: 'error' });
            setIsGeneratingPDF(false);
            return;
        }

        try {
            const { jsPDF } = jspdf;
            const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [330, 215] }); 

            const margin = { top: 15, left: 25, right: 15, bottom: 7 }; 
            const pageWidth = 330;
            const pageHeight = 215;
            const contentWidth = pageWidth - margin.left - margin.right; 
            let y = margin.top;

            // Header
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(12);
            pdf.setTextColor(0, 0, 0);
            pdf.text(`KRITERIA KETERCAPAIAN TUJUAN PEMBELAJARAN (KKTP)`, pageWidth / 2, y, { align: 'center' });
            y += 6;
            pdf.text(`${selectedSubjectName.toUpperCase()}`, pageWidth / 2, y, { align: 'center' });
            y += 6;
            pdf.setFontSize(11);
            pdf.text(`KELAS ${selectedClass.toUpperCase().replace('Kelas ', '')} SEMESTER ${selectedSemester.toUpperCase()} TAHUN AJARAN ${selectedYear}`, pageWidth / 2, y, { align: 'center' });
            y += 6;
            pdf.setFontSize(10);
            pdf.text(schoolIdentity.schoolName.toUpperCase(), pageWidth / 2, y, { align: 'center' });
            y += 10;

            const head = [
                [
                    { content: 'Alur Tujuan Pembelajaran', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
                    { content: kktpData.intervals.interval1, styles: { halign: 'center', fontStyle: 'bold', fillColor: [255, 255, 255] } },
                    { content: kktpData.intervals.interval2, styles: { halign: 'center', fontStyle: 'bold', fillColor: [255, 255, 255] } },
                    { content: kktpData.intervals.interval3, styles: { halign: 'center', fontStyle: 'bold', fillColor: [255, 255, 255] } },
                    { content: kktpData.intervals.interval4, styles: { halign: 'center', fontStyle: 'bold', fillColor: [255, 255, 255] } },
                ],
                [
                    { content: 'Belum Tercapai\n(Remedial seluruhnya)', styles: { fontSize: 7, halign: 'center' } },
                    { content: 'Tercapai Sebagian\n(Remedial sebagian)', styles: { fontSize: 7, halign: 'center' } },
                    { content: 'Tuntas\n(Tidak remedial)', styles: { fontSize: 7, halign: 'center' } },
                    { content: 'Tuntas Plus\n(Pengayaan)', styles: { fontSize: 7, halign: 'center' } },
                ]
            ];
            
            const body: any[] = [];
            const materialGroups = new Map<string, KKTPRow[]>();
            
            kktpData.rows.forEach(row => {
                const group = materialGroups.get(row.originalId) || [];
                group.push(row);
                materialGroups.set(row.originalId, group);
            });

            materialGroups.forEach((group) => {
                body.push([{ 
                    content: `MATERI/TEMA: ${group[0].material.toUpperCase()}`, 
                    colSpan: 5, 
                    styles: { fontStyle: 'bold', fillColor: [245, 245, 245], textColor: [50, 50, 50] } 
                }]);
                
                group.forEach(row => {
                    const cleanTp = row.learningGoalPathway.replace(/^[0-9\.\-\s•]+/, '').trim();
                    /* COMMENT: Changed PDF numbering to bullet point */
                    body.push([
                        `• ${cleanTp}`,
                        row.kktp.belumTercapai,
                        row.kktp.tercapaiSebagian,
                        row.kktp.tuntas,
                        row.kktp.tuntasPlus
                    ]);
                });
            });

            const equalColWidth = contentWidth / 5;

            (pdf as any).autoTable({
                head, body, startY: y, theme: 'grid',
                headStyles: {
                    fillColor: [255, 255, 255], textColor: 0, fontStyle: 'bold',
                    halign: 'center', valign: 'middle', lineColor: 0, lineWidth: 0.1
                },
                styles: { 
                    fontSize: 8.5, lineColor: 0, lineWidth: 0.1, cellPadding: 2, valign: 'top', textColor: 0 
                },
                columnStyles: {
                    0: { cellWidth: equalColWidth }, 
                    1: { cellWidth: equalColWidth }, 
                    2: { cellWidth: equalColWidth },
                    3: { cellWidth: equalColWidth }, 
                    4: { cellWidth: equalColWidth },
                },
                margin: { left: margin.left, right: margin.right, bottom: margin.bottom },
                didDrawCell: (data: any) => {
                    if (data.column.index === 0 && data.section === 'body' && !data.row.raw[0].content?.startsWith('MATERI')) {
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
                if (y + 40 > pageHeight - margin.bottom) {
                    pdf.addPage();
                    y = margin.top + 10;
                }

                pdf.setFontSize(11);
                pdf.setFont('helvetica', 'normal');
                const formattedDate = new Date(signatureDate + 'T00:00:00Z').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
                
                const principalX = margin.left + 50;
                const teacherX = 330 - margin.right - 50;

                if (signatureOption === 'both') {
                    pdf.text('Mengetahui,', principalX, y, { align: 'center' });
                    pdf.text('Kepala Sekolah', principalX, y + 4.5, { align: 'center' }); 
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
                    pdf.text(`${schoolIdentity.city || '...................'}, ${formattedDate}`, teacherX, y, { align: 'center' });
                    pdf.text(`Wali Kelas ${selectedClass.replace('Kelas ', '')}`, teacherX, y + 4.5, { align: 'center' });
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
            
            pdf.save(`KKTP-${selectedSubjectName.replace(/[\s/]/g, '_')}-${selectedClass.replace(' ', '_')}-Sem_${selectedSemester}.pdf`);
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

            <div className="overflow-x-auto border rounded-lg">
                <table className="min-w-full text-sm border-collapse">
                    <thead className="bg-gray-100 text-center font-bold">
                        <tr>
                            <th className="py-2 px-2 border align-middle" rowSpan={3}>Materi/Tema</th>
                            <th className="py-2 px-2 border align-middle" rowSpan={3}>Alur Tujuan Pembelajaran</th>
                            <th className="py-2 px-2 border" colSpan={4}>
                                <div className="flex items-center justify-center space-x-4">
                                    <span>Kriteria Ketercapaian</span>
                                    {isEditing && (
                                        <button onClick={handleGenerateAll} disabled={isSaving || isGenerating} className="btn-ai">
                                            {isGenerating ? <LoadingSpinner/> : <SparklesIcon />}
                                            <span>Generate Semua</span>
                                        </button>
                                    )}
                                </div>
                            </th>
                        </tr>
                        <tr>
                            <td className="py-2 px-2 border">{isEditing ? <input type="text" value={kktpData.intervals.interval1} onChange={e => handleIntervalChange('interval1', e.target.value)} className="w-24 text-center font-semibold bg-yellow-100 border rounded" /> : kktpData.intervals.interval1}</td>
                            <td className="py-2 px-2 border">{isEditing ? <input type="text" value={kktpData.intervals.interval2} onChange={e => handleIntervalChange('interval2', e.target.value)} className="w-24 text-center font-semibold bg-yellow-100 border rounded" /> : kktpData.intervals.interval2}</td>
                            <td className="py-2 px-2 border">{isEditing ? <input type="text" value={kktpData.intervals.interval3} onChange={e => handleIntervalChange('interval3', e.target.value)} className="w-24 text-center font-semibold bg-yellow-100 border rounded" /> : kktpData.intervals.interval3}</td>
                            <td className="py-2 px-2 border">{isEditing ? <input type="text" value={kktpData.intervals.interval4} onChange={e => handleIntervalChange('interval4', e.target.value)} className="w-24 text-center font-semibold bg-yellow-100 border rounded" /> : kktpData.intervals.interval4}</td>
                        </tr>
                        <tr>
                            <th className="py-2 px-2 border align-middle text-xs font-semibold text-gray-600">Belum Tercapai,<br/>(remedial di seluruh bagian)</th>
                            <th className="py-2 px-2 border align-middle text-xs font-semibold text-gray-600">Tercapai di beberapa bagian,<br/>(remedial di bagian yang diperlukan)</th>
                            <th className="py-2 px-2 border align-middle text-xs font-semibold text-gray-600">Sudah mencapai ketuntasan<br/>(tidak perlu remedial)</th>
                            <th className="py-2 px-2 border align-middle text-xs font-semibold text-gray-600">Sudah mencapai ketuntasan<br/>(perlu pengayaan)</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white">
                        {renderRows.length > 0 ? (
                            renderRows.map(row => {
                                const cleanTp = row.learningGoalPathway.replace(/^[0-9\.\-\s•]+/, '').trim();
                                return (
                                    <tr key={row.id} className="align-top hover:bg-gray-50">
                                        {row.materialRowSpan && row.materialRowSpan > 0 ? (
                                            <td className="p-1 border text-center align-middle w-[15%]" rowSpan={row.materialRowSpan}>
                                                <WrappingTextarea value={row.material} onChange={() => {}} disabled={true} className="text-center font-medium" />
                                            </td>
                                        ) : null}
                                        <td className="p-1 border align-middle w-[25%]">
                                            <div className="flex items-start p-2">
                                                {/* COMMENT: Replaced numbering with bullet point in UI */}
                                                <span className="shrink-0 w-6 font-semibold text-center">•</span>
                                                <span className="flex-1">{cleanTp}</span>
                                            </div>
                                        </td>
                                        <td className="p-1 border w-[15%]"><WrappingTextarea value={row.kktp.belumTercapai} onChange={e => handleKktpChange(row.id, 'belumTercapai', e.target.value)} disabled={!isEditing} /></td>
                                        <td className="p-1 border w-[15%]"><WrappingTextarea value={row.kktp.tercapaiSebagian} onChange={e => handleKktpChange(row.id, 'tercapaiSebagian', e.target.value)} disabled={!isEditing} /></td>
                                        <td className="p-1 border w-[15%]"><WrappingTextarea value={row.kktp.tuntas} onChange={e => handleKktpChange(row.id, 'tuntas', e.target.value)} disabled={!isEditing} /></td>
                                        <td className="p-1 border w-[15%]"><WrappingTextarea value={row.kktp.tuntasPlus} onChange={e => handleKktpChange(row.id, 'tuntasPlus', e.target.value)} disabled={!isEditing} /></td>
                                    </tr>
                                )
                            })
                        ) : (
                            <tr><td colSpan={6} className="text-center py-10 text-gray-500 border">Data ATP belum diisi untuk mata pelajaran dan semester ini.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal Konfirmasi Tarik KKTP */}
            {isPullModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all animate-fade-in scale-100">
                        <div className="p-6">
                            <div className="flex items-center justify-center w-16 h-16 mx-auto bg-purple-100 rounded-full mb-4">
                                <SparklesIcon className="w-10 h-10 text-purple-600" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 text-center mb-2">Tarik KKTP dari Induk?</h3>
                            <p className="text-gray-600 text-center text-sm mb-6">
                                Anda akan menyalin data Kriteria Ketercapaian dari Admin untuk mata pelajaran <span className="font-bold">{selectedSubjectName}</span> Semester <span className="font-bold">{selectedSemester}</span>. 
                                <br/><br/>
                                <span className="text-red-600 font-bold">Peringatan:</span> Data KKTP yang sudah Anda buat atau ubah sendiri untuk pilihan ini akan <span className="underline">ditimpa sepenuhnya</span>.
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

            <style>{`.btn-primary{display:inline-flex;align-items:center;gap:.5rem;padding:.5rem 1rem;background-color:#4f46e5;color:#fff;border-radius:.5rem;font-weight:600}.btn-primary:hover{background-color:#4338ca}.btn-primary:disabled{opacity:.6;cursor:not-allowed}.btn-secondary{padding:.5rem 1rem;background-color:#e5e7eb;color:#1f2937;border-radius:.5rem;font-weight:600}.btn-ai{display:inline-flex;align-items:center;gap:.25rem;padding:.25rem .5rem;background-color:#9333ea;color:#fff;border-radius:.375rem;font-size:.75rem;font-weight:500}.btn-ai:disabled{opacity:.6;cursor:not-allowed}`}</style>
        </div>
    );
};

export default KKTP;