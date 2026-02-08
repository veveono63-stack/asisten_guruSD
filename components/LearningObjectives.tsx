
import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { Subject, LearningOutcomeElement, LearningObjectiveItem, LearningOutcomeItem } from '../types';
import { getSubjects, getLearningObjectives, updateLearningObjectives, getSchoolIdentity, getTeacherProfile, pullLearningObjectivesToTeacher } from '../services/adminService';
import Notification, { NotificationType } from './Notification';
import { PencilIcon, TrashIcon, SparklesIcon, ArrowDownTrayIcon, ArrowPathIcon } from './Icons';
import { GoogleGenAI, Type } from '@google/genai';

declare const jspdf: any;

interface LearningObjectivesProps {
    selectedClass: string;
    selectedYear: string;
    userId?: string;
}

const subjectSortOrder = [
    'pendidikan agama islam dan budi pekerti',
    'pendidikan pancasila',
    'bahasa indonesia',
    'matematika',
    'ilmu pengetahuan alam dan sosial',
    'pendidikan jasmani, olahraga, dan kesehatan',
    'seni budaya',
    'bahasa inggris',
    'bahasa jawa',
    'pendidikan lingkungan hidup',
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

const WrappingTextarea = ({ value, onChange, disabled, placeholder, className = '' }: {
    value: string;
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    disabled: boolean;
    placeholder?: string;
    className?: string;
}) => {
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
            onChange={onChange}
            disabled={disabled}
            placeholder={placeholder}
            className={`w-full p-2 border-none bg-transparent focus:outline-none focus:bg-indigo-50 rounded resize-none overflow-hidden block ${className}`}
            rows={1}
        />
    );
};

const LoadingSpinner = () => (
    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);


const LearningObjectives: React.FC<LearningObjectivesProps> = ({ selectedClass, selectedYear, userId }) => {
    const [subjectsForDropdown, setSubjectsForDropdown] = useState<{ id: string, name: string }[]>([]);
    const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
    const [activeArtTab, setActiveArtTab] = useState<string>(masterArtSubjects[0]);
    
    const [elements, setElements] = useState<LearningOutcomeElement[]>([]);
    const [originalElements, setOriginalElements] = useState<LearningOutcomeElement[]>([]);
    const [schoolIdentity, setSchoolIdentity] = useState<any>(null);
    const [teacher, setTeacher] = useState<any>(null);
    
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isPulling, setIsPulling] = useState(false);
    const [isPullModalOpen, setIsPullModalOpen] = useState(false);
    const [generatingState, setGeneratingState] = useState<Record<string, boolean>>({});
    const [notification, setNotification] = useState<{ message: string; type: NotificationType } | null>(null);
    const [signatureDate, setSignatureDate] = useState(new Date().toISOString().split('T')[0]);
    const [isPdfDropdownOpen, setIsPdfDropdownOpen] = useState(false);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

    const createEmptyObjective = (): LearningObjectiveItem => ({ id: crypto.randomUUID(), text: '' });
    
    // Effect 1: Fetch subjects for the dropdown and set the initial selection.
    useEffect(() => {
        let isMounted = true;
        const fetchInitialData = async () => {
            try {
                const [fetchedSubjects, identityData, teacherData] = await Promise.all([
                    getSubjects(selectedYear, selectedClass, userId),
                    getSchoolIdentity(userId),
                    getTeacherProfile(selectedYear, selectedClass, userId)
                ]);

                if (isMounted) {
                    setSchoolIdentity(identityData);
                    setTeacher(teacherData);
                }

                const regularSubjectsMap = new Map<string, { id: string; name: string }>();
                fetchedSubjects.forEach(s => {
                    if (!s.name.toLowerCase().startsWith('seni')) {
                        if (!regularSubjectsMap.has(s.name)) {
                            regularSubjectsMap.set(s.name, { id: s.code.toLowerCase(), name: s.name });
                        }
                    }
                });
                let dropdownSubjects = Array.from(regularSubjectsMap.values());

                const hasAnyArtSubject = fetchedSubjects.some(subject => subject.name.toLowerCase().startsWith('seni'));
                if (hasAnyArtSubject) {
                    dropdownSubjects.push({ id: 'seni-budaya-group', name: 'Seni Budaya' });
                }
                
                const sortedDropdownSubjects = dropdownSubjects.sort((a, b) => getSortIndex(a.name) - getSortIndex(b.name));
                
                if (isMounted) {
                    setSubjectsForDropdown(sortedDropdownSubjects);
                    if (sortedDropdownSubjects.length > 0) {
                        setSelectedSubjectId(sortedDropdownSubjects[0].id);
                    } else {
                        setSelectedSubjectId('');
                    }
                }
            } catch (error: any) {
                if (isMounted) {
                    setNotification({ message: error.message || 'Gagal memuat daftar mata pelajaran.', type: 'error' });
                }
            }
        };
    
        fetchInitialData();
        return () => { isMounted = false; };
    }, [selectedClass, selectedYear, userId]);


    const finalSubjectIdForApi = useMemo(() => {
        if (selectedSubjectId !== 'seni-budaya-group') return selectedSubjectId;
        return activeArtTab.toLowerCase().replace(/\s+/g, '-');
    }, [selectedSubjectId, activeArtTab]);
    
     const selectedSubjectName = useMemo(() => {
        if (selectedSubjectId === 'seni-budaya-group') {
            return activeArtTab;
        }
        const subject = subjectsForDropdown.find(s => s.id === selectedSubjectId);
        return subject ? subject.name : '';
    }, [selectedSubjectId, subjectsForDropdown, activeArtTab]);

    // Effect 2: Fetch the actual learning objectives based on the selected subject/tab.
    useEffect(() => {
        if (!finalSubjectIdForApi) {
            setElements([]);
            setIsLoading(false); 
            return;
        }
        let isMounted = true;
        const fetchObjectives = async () => {
            setIsLoading(true);
            try {
                const data = await getLearningObjectives(selectedYear, selectedClass, finalSubjectIdForApi, userId);
                if (isMounted) {
                    setElements(data.elements);
                }
            } catch (error: any) {
                if(isMounted) {
                    setNotification({ message: error.message, type: 'error' });
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };
        fetchObjectives();
        return () => { isMounted = false; };
    }, [finalSubjectIdForApi, selectedYear, selectedClass, userId]);
    
    const flatData = useMemo(() => elements.flatMap(el => 
      el.outcomes.map((outcome, index) => ({
        elementId: el.id,
        elementName: el.elementName,
        outcomeId: outcome.id,
        outcomeText: outcome.text,
        objectives: outcome.objectives || [],
        isFirst: index === 0,
        elementRowSpan: el.outcomes.length,
      }))
    ), [elements]);

    const handleEdit = () => {
        setOriginalElements(JSON.parse(JSON.stringify(elements)));
        setIsEditing(true);
    };

    const handleCancel = () => {
        setElements(originalElements);
        setIsEditing(false);
    };

    const handleSave = async () => {
        if (!finalSubjectIdForApi) return;
        setIsSaving(true);
        try {
            await updateLearningObjectives(selectedYear, selectedClass, finalSubjectIdForApi, { elements }, userId);
            setNotification({ message: 'Tujuan Pembelajaran berhasil disimpan.', type: 'success' });
            setIsEditing(false);
        } catch (error: any) {
            setNotification({ message: error.message, type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleObjectiveChange = (elementId: string, outcomeId: string, objectiveId: string, newText: string) => {
        setElements(prev => prev.map(el => {
            if (el.id !== elementId) return el;
            return {
                ...el,
                outcomes: el.outcomes.map(o => {
                    if (o.id !== outcomeId) return o;
                    return {
                        ...o,
                        objectives: (o.objectives || []).map(obj => obj.id === objectiveId ? { ...obj, text: newText } : obj)
                    };
                })
            };
        }));
    };
    
    const handleAddObjective = (elementId: string, outcomeId: string) => {
        setElements(prev => prev.map(el => {
            if (el.id !== elementId) return el;
            return {
                ...el,
                outcomes: el.outcomes.map(o => {
                    if (o.id !== outcomeId) return o;
                    return { ...o, objectives: [...(o.objectives || []), createEmptyObjective()] };
                })
            };
        }));
    };
    
    const handleRemoveObjective = (elementId: string, outcomeId: string, objectiveId: string) => {
        setElements(prev => prev.map(el => {
            if (el.id !== elementId) return el;
            return {
                ...el,
                outcomes: el.outcomes.map(o => {
                    if (o.id !== outcomeId) return o;
                    return { ...o, objectives: (o.objectives || []).filter(obj => obj.id !== objectiveId) };
                })
            };
        }));
    };

    const handlePullFromMaster = async () => {
        if (!userId || !finalSubjectIdForApi) return;
        setIsPulling(true);
        setNotification(null);
        try {
            await pullLearningObjectivesToTeacher(selectedYear, selectedClass, finalSubjectIdForApi, userId);
            const data = await getLearningObjectives(selectedYear, selectedClass, finalSubjectIdForApi, userId);
            setElements(data.elements);
            setNotification({ message: 'Tujuan Pembelajaran berhasil ditarik dari induk.', type: 'success' });
            setIsPullModalOpen(false);
        } catch (error: any) {
            setNotification({ message: error.message, type: 'error' });
        } finally {
            setIsPulling(false);
        }
    };

    const handleBulkGenerate = async (targetId: string, targetType: 'subject' | 'element', cpsToGenerate: {id: string, text: string, elementName: string}[]) => {
        setGeneratingState({ [targetId]: true });
        setNotification({message: "AI sedang membuat Tujuan Pembelajaran, mohon tunggu...", type: 'info'});
    
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
            const promptInput = cpsToGenerate.map(cp => `\n- Elemen: "${cp.elementName}"\n  CP (ID: ${cp.id}): "${cp.text}"`).join('');
            const prompt = `
                Anda adalah seorang ahli perancangan kurikulum. Berdasarkan daftar Capaian Pembelajaran (CP) berikut, buatkan Tujuan Pembelajaran (TP) yang relevan untuk setiap CP.

                Daftar CP untuk Mata Pelajaran ${selectedSubjectName}:
                ${promptInput}

                Aturan:
                1. Untuk setiap CP, buat daftar TP yang spesifik dan terukur.
                2. Setiap TP harus diawali dengan kata kerja operasional (misalnya: menjelaskan, mengidentifikasi, mempraktikkan).
                3. Pastikan TP merupakan turunan langsung dari CP yang bersangkutan.
                4. Kembalikan jawaban HANYA dalam format array JSON yang valid, sesuai dengan skema yang diberikan. Setiap objek dalam array harus berisi 'cp_id' dan 'generated_tps'.
            `;
    
            const schema = {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        cp_id: { type: Type.STRING, description: "The ID of the Capaian Pembelajaran." },
                        generated_tps: { type: Type.ARRAY, items: { type: Type.STRING }, description: "An array of Tujuan Pembelajaran strings generated for this CP." }
                    },
                    required: ["cp_id", "generated_tps"]
                }
            };
    
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: { responseMimeType: "application/json", responseSchema: schema },
            });
    
            const jsonText = response.text.trim();
            const results = JSON.parse(jsonText);
    
            if (!Array.isArray(results)) throw new Error("Format respons AI tidak valid.");
    
            const resultsMap = new Map<string, LearningObjectiveItem[]>();
            results.forEach((item: { cp_id: string, generated_tps: string[] }) => {
                if (item.cp_id && Array.isArray(item.generated_tps)) {
                    resultsMap.set(item.cp_id, item.generated_tps.map(text => ({ id: crypto.randomUUID(), text })));
                }
            });
    
            setElements(prev => prev.map(el => ({
                ...el,
                outcomes: el.outcomes.map(o => {
                    if (resultsMap.has(o.id)) {
                        return { ...o, objectives: resultsMap.get(o.id) };
                    }
                    return o;
                })
            })));
            setNotification({ message: `Tujuan Pembelajaran untuk ${targetType === 'subject' ? 'seluruh mata pelajaran' : 'elemen ini'} berhasil dibuat oleh AI!`, type: 'success' });
    
        } catch (error) {
            console.error(error);
            setNotification({ message: 'Gagal menghasilkan TP dengan AI. Silakan coba lagi.', type: 'error' });
        } finally {
            setGeneratingState({});
        }
    };

    const handleGenerateTPForSubject = () => {
        const allCps = elements.flatMap(el => el.outcomes.map(o => ({ ...o, elementName: el.elementName }))).filter(cp => cp.text.trim());
        if (allCps.length === 0) return;
        handleBulkGenerate('subject', 'subject', allCps);
    };

    const handleGenerateTPForElement = (elementId: string) => {
        const element = elements.find(el => el.id === elementId);
        if (!element) return;
        const elementCps = element.outcomes.map(o => ({...o, elementName: element.elementName})).filter(cp => cp.text.trim());
        if (elementCps.length === 0) return;
        handleBulkGenerate(elementId, 'element', elementCps);
    };
    
    const handleGenerateTPForSingle = async (elementId: string, outcomeId: string, cpText: string) => {
        setGeneratingState({ [outcomeId]: true });
        setNotification({message: "AI sedang membuat Tujuan Pembelajaran, mohon tunggu...", type: 'info'});
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
            const prompt = `
                Anda adalah seorang ahli perancangan kurikulum. Berdasarkan Capaian Pembelajaran (CP) berikut, buatlah daftar Tujuan Pembelajaran (TP) yang relevan, spesifik, dan terukur untuk siswa sekolah dasar.
                Capaian Pembelajaran (CP): "${cpText}"
                Aturan:
                1. Setiap TP harus diawali dengan kata kerja operasional (misalnya: menjelaskan, mengidentifikasi, mempraktikkan, membandingkan).
                2. Setiap TP harus merupakan turunan langsung dari CP yang diberikan.
                3. Gunakan bahasa yang jelas dan mudah dipahami.
                Format output: Berikan jawaban HANYA dalam format array JSON string yang valid. Contoh: ["Siswa dapat menjelaskan...", "Siswa mampu mengidentifikasi..."]
            `;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } },
                }
            });

            const jsonText = response.text.trim();
            const generatedObjectives = JSON.parse(jsonText);
            
            if (Array.isArray(generatedObjectives) && generatedObjectives.every(item => typeof item === 'string')) {
                const newObjectives: LearningObjectiveItem[] = generatedObjectives.map(text => ({ id: crypto.randomUUID(), text }));
                setElements(prev => prev.map(el => {
                    if (el.id !== elementId) return el;
                    return { ...el, outcomes: el.outcomes.map(o => o.id === outcomeId ? { ...o, objectives: newObjectives } : o) };
                }));
                setNotification({ message: 'Tujuan Pembelajaran berhasil dibuat oleh AI!', type: 'success' });
            } else {
                throw new Error("Format respons AI tidak valid.");
            }
        } catch (error) {
            console.error(error);
            setNotification({ message: 'Gagal menghasilkan TP dengan AI. Silakan coba lagi.', type: 'error' });
        } finally {
            setGeneratingState({});
        }
    };

    const handleDownloadPDF = async (signatureOption: 'none' | 'teacher' | 'both') => {
        setIsGeneratingPDF(true);
        setIsPdfDropdownOpen(false);
        setNotification({ message: 'Mempersiapkan PDF...', type: 'info' });
        await new Promise(resolve => setTimeout(resolve, 50));

        if (!schoolIdentity || !teacher || elements.length === 0) {
            setNotification({ message: 'Gagal membuat PDF: Data tidak lengkap.', type: 'error' });
            setIsGeneratingPDF(false);
            return;
        }

        try {
            const { jsPDF } = jspdf;
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [215, 330] });

            const margin = { top: 5, left: 25, right: 5, bottom: 5 }; // Custom margins
            const contentWidth = 215 - margin.left - margin.right;
            const pageHeight = 330;
            let y = margin.top + 10;

            // Header
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(12);
            pdf.setTextColor(0, 0, 0);
            pdf.text(`TUJUAN PEMBELAJARAN ${selectedSubjectName.toUpperCase()}`, 107.5, y, { align: 'center' });
            y += 6;
            pdf.setFontSize(11);
            pdf.text(`KELAS ${selectedClass.toUpperCase().replace('KELAS ', '')} TAHUN AJARAN ${selectedYear}`, 107.5, y, { align: 'center' });
            y += 6;
            pdf.setFontSize(10);
            pdf.text(schoolIdentity.schoolName.toUpperCase(), 107.5, y, { align: 'center' });
            y += 10;

            // Table
            const head = [['Elemen', 'Capaian Pembelajaran', 'Tujuan Pembelajaran']];
            const body: any[] = [];
            
            const filteredElements = elements.filter(el => el.elementName.trim() !== '');

            for (const el of filteredElements) {
                const outcomes = el.outcomes.filter(o => o.text.trim() !== '');
                if (outcomes.length === 0) {
                    body.push([{ content: el.elementName, rowSpan: 1 }, '', '']);
                } else {
                    outcomes.forEach((outcome, index) => {
                        const objectives = outcome.objectives?.filter(o => o.text.trim() !== '') || [];
                        const objectivesText = objectives.length > 0 
                            ? objectives.map((o, i) => `${i + 1}. ${o.text}`).join('\n') 
                            : '';

                        if (index === 0) {
                            body.push([
                                { content: el.elementName, rowSpan: outcomes.length },
                                outcome.text,
                                objectivesText
                            ]);
                        } else {
                            body.push([outcome.text, objectivesText]);
                        }
                    });
                }
            }

            (pdf as any).autoTable({
                head, body, startY: y, theme: 'grid',
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
                    0: { cellWidth: 40, fontStyle: 'bold' },
                    1: { cellWidth: 65 },
                    2: { cellWidth: 80 },
                },
                margin: { left: margin.left, right: margin.right, top: margin.top, bottom: margin.bottom }
            });

            y = (pdf as any).lastAutoTable.finalY + 15;

            // Signatures
            if (signatureOption !== 'none') {
                if (y > pageHeight - 50) {
                    pdf.addPage();
                    y = margin.top + 10;
                }

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
            
            pdf.save(`TP-${selectedSubjectName.replace(/[\s/]/g, '_')}-${selectedClass.replace(' ', '_')}-${selectedYear.replace('/', '-')}.pdf`);
            setNotification({ message: 'PDF berhasil dibuat.', type: 'success' });
        } catch (e) {
            console.error(e);
            setNotification({ message: 'Gagal membuat PDF.', type: 'error' });
        } finally {
            setIsGeneratingPDF(false);
        }
    };

    if (isLoading) return <div className="text-center p-8">Memuat data...</div>;

    const isAnyGenerationRunning = Object.values(generatingState).some(s => s);

    return (
        <div className="bg-white p-8 rounded-xl shadow-lg">
            {notification && <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
            
            <div className="flex justify-between items-center mb-6 pb-6 border-b">
                <div className="flex items-center space-x-4">
                    <label className="text-sm font-medium text-gray-700">Mata Pelajaran:</label>
                    <select
                        value={selectedSubjectId}
                        onChange={(e) => {
                            setSelectedSubjectId(e.target.value);
                            if (e.target.value === 'seni-budaya-group') setActiveArtTab(masterArtSubjects[0]);
                        }}
                        className="p-2 border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                        disabled={isEditing || isLoading}
                    >
                        {subjectsForDropdown.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>
                <div className="flex items-center space-x-2">
                    {isEditing ? (
                        <>
                            <button onClick={handleCancel} className="btn-secondary">Batal</button>
                            <button onClick={handleSave} disabled={isSaving || isAnyGenerationRunning} className="btn-primary">{isSaving ? 'Menyimpan...' : 'Simpan'}</button>
                        </>
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

             {selectedSubjectId === 'seni-budaya-group' && (
                <div className="mb-6 border-b border-gray-200">
                    <nav className="-mb-px flex space-x-4">
                        {masterArtSubjects.map(artName => (
                            <button
                                key={artName}
                                onClick={() => setActiveArtTab(artName)}
                                disabled={isEditing || isLoading}
                                className={`${activeArtTab === artName ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                {artName}
                            </button>
                        ))}
                    </nav>
                </div>
            )}
            
            <header className="text-center mb-6">
                <h1 className="text-xl font-bold uppercase">Tujuan Pembelajaran - {selectedSubjectName}</h1>
            </header>

            <div className="overflow-x-auto border rounded-lg">
                <table className="min-w-full text-sm">
                    <thead className="bg-gray-100">
                        <tr>
                            <th className="p-3 text-left font-bold text-gray-600 w-[25%]">Elemen</th>
                            <th className="p-3 text-left font-bold text-gray-600 w-[35%]">Capaian Pembelajaran</th>
                            <th className="p-3 text-left font-bold text-gray-600 w-[40%]">
                                <div className="flex justify-between items-center">
                                    <span>Tujuan Pembelajaran</span>
                                    {isEditing && (
                                        <button onClick={handleGenerateTPForSubject} disabled={isSaving || isAnyGenerationRunning} className="btn-ai-small">
                                            {generatingState['subject'] ? <LoadingSpinner/> : <SparklesIcon/>}
                                            <span>Generate Semua</span>
                                        </button>
                                    )}
                                </div>
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {flatData.map(row => (
                            <tr key={row.outcomeId}>
                                {row.isFirst && 
                                    <td className="p-3 align-top font-semibold border-r" rowSpan={row.elementRowSpan}>
                                        <div className="flex flex-col h-full justify-between">
                                            <span>{row.elementName}</span>
                                            {isEditing && (
                                                 <button onClick={() => handleGenerateTPForElement(row.elementId)} disabled={isSaving || isAnyGenerationRunning} className="btn-ai-small mt-2">
                                                    {generatingState[row.elementId] ? <LoadingSpinner/> : <SparklesIcon/>}
                                                    <span>Generate TP Elemen Ini</span>
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                }
                                <td className="p-3 align-top border-r">
                                    <div className="flex flex-col h-full justify-between">
                                        <p className="text-gray-800 flex-grow">{row.outcomeText}</p>
                                        {isEditing && (
                                            <div className="mt-2">
                                                <button onClick={() => handleGenerateTPForSingle(row.elementId, row.outcomeId, row.outcomeText)} disabled={isSaving || isAnyGenerationRunning} className="btn-ai">
                                                     {generatingState[row.outcomeId] ? <LoadingSpinner/> : <SparklesIcon />}
                                                    <span>{generatingState[row.outcomeId] ? 'Memproses...' : 'Generate TP'}</span>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </td>
                                <td className="p-1 align-top">
                                    <div className="space-y-1">
                                        {row.objectives.map((obj, objIndex) => (
                                            <div key={obj.id} className="flex items-start">
                                                <span className="px-2 py-2 text-gray-500">{objIndex + 1}.</span>
                                                <WrappingTextarea
                                                    value={obj.text}
                                                    onChange={(e) => handleObjectiveChange(row.elementId, row.outcomeId, obj.id, e.target.value)}
                                                    disabled={!isEditing}
                                                    placeholder="Tujuan Pembelajaran"
                                                />
                                                {isEditing && (
                                                    <button onClick={() => handleRemoveObjective(row.elementId, row.outcomeId, obj.id)} className="text-red-500 hover:text-red-700 p-1 mt-1">
                                                        <TrashIcon className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    {isEditing && (
                                        <div className="px-3 pb-2 mt-2">
                                            <button onClick={() => handleAddObjective(row.elementId, row.outcomeId)} className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold">
                                                + Tambah TP
                                            </button>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Modal Konfirmasi Tarik TP */}
            {isPullModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all animate-fade-in scale-100">
                        <div className="p-6">
                            <div className="flex items-center justify-center w-16 h-16 mx-auto bg-purple-100 rounded-full mb-4">
                                <SparklesIcon className="w-10 h-10 text-purple-600" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 text-center mb-2">Tarik TP dari Induk?</h3>
                            <p className="text-gray-600 text-center text-sm mb-6">
                                Anda akan menyalin data Tujuan Pembelajaran dari Admin untuk mata pelajaran <span className="font-bold">{selectedSubjectName}</span>. 
                                <br/><br/>
                                <span className="text-red-600 font-bold">Peringatan:</span> Data TP yang sudah Anda buat atau ubah sendiri untuk mapel ini akan <span className="underline">ditimpa sepenuhnya</span>.
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

             <style>{`
                .btn-primary { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; background-color: #4f46e5; color: white; border-radius: 0.5rem; font-weight: 600; }
                .btn-secondary { padding: 0.5rem 1rem; background-color: #e5e7eb; color: #1f2937; border-radius: 0.5rem; font-weight: 600; }
                .btn-ai { display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.25rem 0.5rem; background-color: #9333ea; color: white; border-radius: 0.375rem; font-size: 0.75rem; font-weight: 500; }
                .btn-ai-small { display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.125rem 0.375rem; background-color: #a78bfa; color: white; border-radius: 0.375rem; font-size: 0.65rem; font-weight: 500; }
                .btn-primary:disabled, .btn-secondary:disabled, .btn-ai:disabled, .btn-ai-small:disabled { opacity: 0.6; cursor: not-allowed; }
            `}</style>
        </div>
    );
};

export default LearningObjectives;
