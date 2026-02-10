import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { Subject, ATPRow, ATPData, LearningOutcomeItem, LearningOutcomeElement, LearningObjectiveItem, SchoolIdentity, Teacher } from '../types';
import { getSubjects, getATPData, updateATPData, getLearningObjectives, getTeacherProfile, getSchoolIdentity, pullATPDataToTeacher } from '../services/adminService';
import Notification, { NotificationType } from './Notification';
import { SparklesIcon, ArrowDownTrayIcon, PencilIcon, TrashIcon, ArrowPathIcon } from './Icons';
import { Type } from '@google/genai';
import { generateContentWithRotation } from '../services/geminiService';

declare const jspdf: any;

interface LearningGoalsPathwayProps {
    selectedClass: string;
    selectedYear: string;
    userId?: string;
}

// Modal Component to select TPs
const TPSelectorModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (selection: { elements: { id: string; name: string }[]; tps: { id: string; text: string }[] }) => void;
    subjectId: string;
    selectedClass: string;
    selectedYear: string;
    userId?: string;
}> = ({ isOpen, onClose, onConfirm, subjectId, selectedClass, selectedYear, userId }) => {
    const [tpData, setTpData] = useState<LearningOutcomeElement[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selection, setSelection] = useState<Record<string, Set<string>>>({}); 

    useEffect(() => {
        if (isOpen && subjectId) {
            const fetchData = async () => {
                setIsLoading(true);
                try {
                    const data = await getLearningObjectives(selectedYear, selectedClass, subjectId, userId);
                    setTpData(data.elements);
                } catch (error) {
                    console.error("Failed to fetch TPs for modal:", error);
                } finally {
                    setIsLoading(false);
                }
            };
            fetchData();
        }
    }, [isOpen, subjectId, selectedClass, selectedYear, userId]);

    if (!isOpen) return null;

    const handleElementToggle = (elementId: string, objectives: LearningObjectiveItem[], checked: boolean) => {
        setSelection(prev => {
            const newSelection = { ...prev };
            if (checked) {
                newSelection[elementId] = new Set(objectives.map(o => o.id));
            } else {
                delete newSelection[elementId];
            }
            return newSelection;
        });
    };
    
    const handleTpToggle = (elementId: string, objectiveId: string, checked: boolean) => {
        setSelection(prev => {
            const newSelection = { ...prev };
            const elementSet = new Set(newSelection[elementId] || []);
            if (checked) {
                elementSet.add(objectiveId);
            } else {
                elementSet.delete(objectiveId);
            }

            if (elementSet.size > 0) {
                newSelection[elementId] = elementSet;
            } else {
                delete newSelection[elementId];
            }
            return newSelection;
        });
    };
    
    const handleConfirmClick = () => {
        const selectedElements: { id: string; name: string }[] = [];
        const selectedTps: { id: string; text: string }[] = [];

        for (const elementId in selection) {
            const element = tpData.find(e => e.id === elementId);
            if (!element) continue;

            selectedElements.push({ id: element.id, name: element.elementName });

            const tpIds = selection[elementId];
            const allObjectives = element.outcomes.flatMap(o => o.objectives || []);
            
            for (const tpId of tpIds) {
                const tp = allObjectives.find(t => t.id === tpId);
                if (tp) {
                    selectedTps.push(tp);
                }
            }
        }
        
        onConfirm({ elements: selectedElements, tps: selectedTps });
        setSelection({}); 
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-2xl p-6 w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-xl font-bold text-gray-800 mb-4">Pilih Elemen dan Tujuan Pembelajaran</h2>
                <div className="flex-grow overflow-y-auto border-t border-b py-4">
                    {isLoading ? (
                        <p>Memuat Tujuan Pembelajaran...</p>
                    ) : tpData.length > 0 ? (
                        tpData.map(element => {
                            const allObjectives = element.outcomes.flatMap(o => o.objectives || []);
                            const isElementSelected = selection[element.id] && selection[element.id].size === allObjectives.length && allObjectives.length > 0;
                            const isElementIndeterminate = selection[element.id] && selection[element.id].size > 0 && selection[element.id].size < allObjectives.length;
                            
                            return (
                                <div key={element.id} className="mb-4">
                                    <div className="font-semibold bg-gray-100 p-2 rounded-md">
                                        <label className="flex items-center">
                                            <input
                                                type="checkbox"
                                                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                checked={isElementSelected}
                                                ref={el => { if (el) {el.indeterminate = isElementIndeterminate;} }}
                                                onChange={e => handleElementToggle(element.id, allObjectives, e.target.checked)}
                                            />
                                            <span className="ml-2">{element.elementName}</span>
                                        </label>
                                    </div>
                                    <div className="pl-6 mt-2 space-y-2">
                                        {allObjectives.map(tp => (
                                            <label key={tp.id} className="flex items-start text-sm">
                                                <input
                                                    type="checkbox"
                                                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 mt-1"
                                                    checked={selection[element.id]?.has(tp.id) || false}
                                                    onChange={e => handleTpToggle(element.id, tp.id, e.target.checked)}
                                                />
                                                <span className="ml-2 text-gray-700">{tp.text}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <p>Tidak ada Tujuan Pembelajaran yang ditemukan untuk mata pelajaran ini.</p>
                    )}
                </div>
                <div className="mt-6 flex justify-end space-x-3">
                    <button onClick={onClose} className="px-4 py-2 border rounded-md hover:bg-gray-100">Batal</button>
                    <button onClick={handleConfirmClick} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">Tambahkan ke ATP</button>
                </div>
            </div>
        </div>
    );
};


const WrappingTextarea: React.FC<{ value: string; onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void; disabled: boolean; placeholder?: string; className?: string; }> = ({ value, onChange, disabled, placeholder, className = '' }) => {
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
            className={`w-full p-2 border-none bg-transparent focus:outline-none ${!disabled ? 'focus:bg-indigo-50' : ''} rounded resize-none overflow-hidden block ${className}`}
            rows={1}
        />
    );
};

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

const LANGUAGE_SUBJECT_NAMES = ['bahasa indonesia', 'bahasa jawa', 'bahasa inggris'];
const isLanguageSubject = (subjectName: string): boolean => {
    if (!subjectName) return false;
    const lowerName = subjectName.toLowerCase();
    return LANGUAGE_SUBJECT_NAMES.some(lang => lowerName.startsWith(lang));
};

const getPhaseInfo = (className: string) => {
    const romanMap: { [key: string]: number } = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6 };
    const roman = className.replace('Kelas ', '');
    const classNumber = romanMap[roman] || 0;

    if (classNumber <= 2) return { name: 'A', classes: ['Kelas I', 'Kelas II'] };
    if (classNumber <= 4) return { name: 'B', classes: ['Kelas III', 'Kelas IV'] };
    return { name: 'C', classes: ['Kelas V', 'Kelas VI'] };
};

interface AtpState {
    ganjil: ATPRow[];
    genap: ATPRow[];
}

const LearningGoalsPathway: React.FC<LearningGoalsPathwayProps> = ({ selectedClass, selectedYear, userId }) => {
    const [subjectsForDropdown, setSubjectsForDropdown] = useState<{id: string, name: string}[]>([]);
    const [selectedSubjectId, setSelectedSubjectId] = useState('');
    const [activeArtTab, setActiveArtTab] = useState<string>(masterArtSubjects[0]);
    const [selectedSemester, setSelectedSemester] = useState<'Ganjil' | 'Genap'>('Ganjil');
    
    const [atpData, setAtpData] = useState<AtpState>({ ganjil: [], genap: [] });
    const [originalAtpData, setOriginalAtpData] = useState<AtpState | null>(null);
    
    const [isTpModalOpen, setIsTpModalOpen] = useState(false);
    const [targetSemesterForImport, setTargetSemesterForImport] = useState<'ganjil' | 'genap'>('ganjil');

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
        const fetchInitialData = async () => {
            setIsLoading(true);
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
                let finalDropdownSubjects = Array.from(regularSubjectsMap.values());

                const hasAnyArtSubject = fetchedSubjects.some(subject => subject.name.toLowerCase().startsWith('seni'));
                if (hasAnyArtSubject) {
                    finalDropdownSubjects.push({ id: 'seni-budaya-group', name: 'Seni Budaya' });
                }
                
                const sortedDropdownSubjects = finalDropdownSubjects.sort((a, b) => getSortIndex(a.name) - getSortIndex(b.name));
                setSubjectsForDropdown(sortedDropdownSubjects);
                
                if (sortedDropdownSubjects.length > 0) {
                    setSelectedSubjectId(sortedDropdownSubjects[0].id);
                } else {
                    setSelectedSubjectId('');
                }

            } catch (error: any) {
                setNotification({ message: error.message || 'Gagal memuat data awal.', type: 'error' });
            }
        };
        fetchInitialData();
    }, [selectedClass, selectedYear, userId]);

    const finalSubjectIdForApi = useMemo(() => {
        if (selectedSubjectId !== 'seni-budaya-group') return selectedSubjectId;
        return activeArtTab.toLowerCase().replace(/\s+/g, '-');
    }, [selectedSubjectId, activeArtTab]);

    useEffect(() => {
        if (!finalSubjectIdForApi) {
            setAtpData({ ganjil: [], genap: [] });
            setIsLoading(false);
            return;
        }
        const fetchATP = async () => {
            setIsLoading(true);
            try {
                const [ganjilData, genapData] = await Promise.all([
                    getATPData(selectedYear, selectedClass, finalSubjectIdForApi, 'Ganjil', userId),
                    getATPData(selectedYear, selectedClass, finalSubjectIdForApi, 'Genap', userId)
                ]);
                setAtpData({
                    ganjil: ganjilData.rows.length > 0 ? ganjilData.rows : [createEmptyRow()],
                    genap: genapData.rows.length > 0 ? genapData.rows : [createEmptyRow()]
                });
            } catch (error: any) {
                setNotification({ message: error.message, type: 'error' });
                setAtpData({ ganjil: [createEmptyRow()], genap: [createEmptyRow()] });
            } finally {
                setIsLoading(false);
            }
        };
        fetchATP();
    }, [finalSubjectIdForApi, selectedClass, selectedYear, userId]);

    const selectedSubjectName = useMemo(() => {
        if (selectedSubjectId === 'seni-budaya-group') return activeArtTab;
        const subject = subjectsForDropdown.find(s => s.id === selectedSubjectId);
        return subject ? subject.name : '';
    }, [subjectsForDropdown, selectedSubjectId, activeArtTab]);
    
    const createEmptyRow = (): ATPRow => ({
        id: crypto.randomUUID(), element: '', learningGoalPathway: '', material: '', materialScope: ''
    });

    const handleEdit = () => {
        setOriginalAtpData(JSON.parse(JSON.stringify(atpData)));
        setIsEditing(true);
    };

    const handleCancel = () => {
        if (originalAtpData) setAtpData(originalAtpData);
        setIsEditing(false);
    };

    const handleSave = async () => {
        setIsSaving(true);
        setNotification(null);
        try {
            await Promise.all([
                updateATPData(selectedYear, selectedClass, finalSubjectIdForApi, 'Ganjil', { rows: atpData.ganjil }, userId),
                updateATPData(selectedYear, selectedClass, finalSubjectIdForApi, 'Genap', { rows: atpData.genap }, userId)
            ]);
            setNotification({ message: 'ATP berhasil disimpan.', type: 'success' });
            setIsEditing(false);
        } catch (error: any) {
            setNotification({ message: error.message, type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    const handlePullFromMaster = async () => {
        if (!userId || !finalSubjectIdForApi) return;
        setIsPulling(true);
        setNotification(null);
        try {
            const pulledData = await pullATPDataToTeacher(selectedYear, selectedClass, finalSubjectIdForApi, userId);
            setAtpData({
                ganjil: pulledData.ganjil.rows.length > 0 ? pulledData.ganjil.rows : [createEmptyRow()],
                genap: pulledData.genap.rows.length > 0 ? pulledData.genap.rows : [createEmptyRow()]
            });
            setNotification({ message: 'Alur Tujuan Pembelajaran berhasil ditarik dari induk.', type: 'success' });
            setIsPullModalOpen(false);
        } catch (error: any) {
            setNotification({ message: error.message, type: 'error' });
        } finally {
            setIsPulling(false);
        }
    };
    
    const handleRowChange = (semester: 'ganjil' | 'genap', rowIndex: number, field: keyof ATPRow, value: string) => {
        setAtpData(prev => {
            const newRows = [...prev[semester]];
            (newRows[rowIndex] as any)[field] = value;
            return { ...prev, [semester]: newRows };
        });
    };

    const handleLineChange = (semester: 'ganjil' | 'genap', rowIndex: number, field: 'learningGoalPathway' | 'materialScope', lineIndex: number, value: string) => {
        setAtpData(prev => {
            const newRows = [...prev[semester]];
            const currentRow = { ...newRows[rowIndex] };
            const lines = (currentRow[field] || '').split('\n');
            lines[lineIndex] = value;
            currentRow[field] = lines.join('\n');
            newRows[rowIndex] = currentRow;
            return { ...prev, [semester]: newRows };
        });
    };

    const handleAddLine = (semester: 'ganjil' | 'genap', rowIndex: number, field: 'learningGoalPathway' | 'materialScope') => {
        setAtpData(prev => {
            const newRows = [...prev[semester]];
            const currentRow = { ...newRows[rowIndex] };
            const currentContent = (currentRow[field] || '').trim();
            const lines = currentContent === '' ? [''] : (currentRow[field] || '').split('\n');
            lines.push(''); 
            currentRow[field] = lines.join('\n');
            newRows[rowIndex] = currentRow;
            return { ...prev, [semester]: newRows };
        });
    };

    const handleRemoveLine = (semester: 'ganjil' | 'genap', rowIndex: number, field: 'learningGoalPathway' | 'materialScope', lineIndex: number) => {
        setAtpData(prev => {
            const newRows = [...prev[semester]];
            const currentRow = { ...newRows[rowIndex] };
            const lines = (currentRow[field] || '').split('\n');
            lines.splice(lineIndex, 1);
            currentRow[field] = lines.join('\n');
            newRows[rowIndex] = currentRow;
            return { ...prev, [semester]: newRows };
        });
    };

    const handleAddRow = (semester: 'ganjil' | 'genap') => {
        setAtpData(prev => ({
            ...prev,
            [semester]: [...prev[semester], createEmptyRow()]
        }));
    };

    const handleRemoveRow = (semester: 'ganjil' | 'genap', id: string) => {
        setAtpData(prev => ({
            ...prev,
            [semester]: prev[semester].filter(row => row.id !== id)
        }));
    };
    
    const handleOpenImportModal = (semester: 'ganjil' | 'genap') => {
        setTargetSemesterForImport(semester);
        setIsTpModalOpen(true);
    };

    const handleConfirmImport = (selection: { elements: { id: string; name: string }[], tps: { id: string; text: string }[] }) => {
        if (selection.tps.length === 0) {
            setIsTpModalOpen(false);
            return;
        }

        const uniqueElementNames = [...new Set(selection.elements.map(el => el.name))];
        const tpTexts = selection.tps.map(tp => tp.text);
        
        const newRow: ATPRow = {
            id: crypto.randomUUID(),
            element: uniqueElementNames.join(', '),
            learningGoalPathway: tpTexts.join('\n'),
            material: '',
            materialScope: '',
        };
        
        setAtpData(prev => {
            const targetRows = prev[targetSemesterForImport];
            const cleanedRows = targetRows.filter(row => row.element || row.learningGoalPathway || row.material || row.materialScope);
            return {
                ...prev,
                [targetSemesterForImport]: [...cleanedRows, newRow]
            };
        });
        setIsTpModalOpen(false);
    };

    const handleGenerateWithAI = async () => {
        setIsGenerating(true);
        setNotification({ message: 'AI sedang membuat ATP untuk satu tahun ajaran, mohon tunggu...', type: 'info' });
        
        try {
            const phaseInfo = getPhaseInfo(selectedClass);
            const isBahasa = isLanguageSubject(selectedSubjectName);
            const materialType = isBahasa ? 'Topik Sastra/Teks' : 'Materi';
            const scopeType = isBahasa ? 'Kegiatan/Keterampilan Bahasa' : 'Lingkup Materi';
    
            const prompt = `
                Anda adalah seorang ahli perancangan kurikulum untuk Sekolah Dasar di Indonesia yang menggunakan Kurikulum Merdeka.
                Tugas Anda adalah membuat Alur Tujuan Pembelajaran (ATP) untuk mata pelajaran "${selectedSubjectName}" kelas ${selectedClass} (Fase ${phaseInfo.name}) untuk SATU TAHUN AJARAN (Semester 1 dan Semester 2).
    
                Aturan Penting:
                1. Buat ATP yang terstruktur, logis, dan mengalir dari yang sederhana ke yang kompleks.
                2. Pisahkan ATP untuk Semester 1 (Ganjil) dan Semester 2 (Genap).
                3. Setiap baris ATP harus mencakup: Elemen, Alur Tujuan Pembelajaran (TP), ${materialType}, dan ${scopeType}.
                4. "Alur Tujuan Pembelajaran" berisi teks-teks TP tanpa nomor atau bullet (pisahkan dengan newline \\n).
                5. "${scopeType}" berisi poin-poin materi (pisahkan dengan newline \\n).
                6. Buat sekitar 4 hingga 6 baris ATP untuk SETIAP semester.
    
                Berikan jawaban HANYA dalam format JSON yang valid sesuai skema berikut:
                {
                    "ganjil": [ { "element": "...", "learningGoalPathway": "...", "material": "...", "materialScope": "..." }, ... ],
                    "genap": [ { "element": "...", "learningGoalPathway": "...", "material": "...", "materialScope": "..." }, ... ]
                }
            `;
            const schema = {
                type: Type.OBJECT,
                properties: {
                    ganjil: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                element: { type: Type.STRING },
                                learningGoalPathway: { type: Type.STRING },
                                material: { type: Type.STRING },
                                materialScope: { type: Type.STRING },
                            },
                            required: ['element', 'learningGoalPathway', 'material', 'materialScope']
                        }
                    },
                    genap: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                element: { type: Type.STRING },
                                learningGoalPathway: { type: Type.STRING },
                                material: { type: Type.STRING },
                                materialScope: { type: Type.STRING },
                            },
                            required: ['element', 'learningGoalPathway', 'material', 'materialScope']
                        }
                    }
                },
                required: ['ganjil', 'genap']
            };
    
            const response = await generateContentWithRotation({
                model: 'gemini-3-flash-preview',
                contents: prompt,
                config: { responseMimeType: "application/json", responseSchema: schema },
            });
    
            const jsonText = response.text.trim();
            const generatedData = JSON.parse(jsonText);
    
            if (generatedData && Array.isArray(generatedData.ganjil) && Array.isArray(generatedData.genap)) {
                setAtpData({
                    ganjil: generatedData.ganjil.map((row: any) => ({ ...row, id: crypto.randomUUID() })),
                    genap: generatedData.genap.map((row: any) => ({ ...row, id: crypto.randomUUID() }))
                });
                setNotification({ message: `ATP satu tahun untuk ${selectedSubjectName} berhasil dibuat oleh AI!`, type: 'success' });
            } else {
                throw new Error("Format respons AI tidak valid.");
            }
        } catch (error) {
            console.error(error);
            setNotification({ message: 'Gagal membuat ATP dengan AI. Silakan coba lagi.', type: 'error' });
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDownloadPDF = async (signatureOption: 'none' | 'teacher' | 'both') => {
        setIsGeneratingPDF(true);
        setIsPdfDropdownOpen(false);
        setNotification({ message: 'Mempersiapkan PDF...', type: 'info' });
        await new Promise(resolve => setTimeout(resolve, 50));

        if (!schoolIdentity || !teacher || (atpData.ganjil.length === 0 && atpData.genap.length === 0)) {
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
            let y = margin.top;

            // Header
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(12);
            pdf.setTextColor(0, 0, 0);
            pdf.text(`ALUR TUJUAN PEMBELAJARAN - ${selectedSubjectName.toUpperCase()}`, 165, y, { align: 'center' });
            y += 6;
            pdf.text(schoolIdentity.schoolName.toUpperCase(), 165, y, { align: 'center' });
            y += 6;
            pdf.setFontSize(11);
            pdf.text(`KELAS ${selectedClass.toUpperCase().replace('KELAS ', '')} - SEMESTER ${selectedSemester.toUpperCase()} - TAHUN AJARAN ${selectedYear}`, 165, y, { align: 'center' });
            y += 10;

            const isBahasa = isLanguageSubject(selectedSubjectName);
            const head = [['Elemen', 'Alur Tujuan Pembelajaran', isBahasa ? 'Topik Sastra/Teks' : 'Materi', isBahasa ? 'Kegiatan/Keterampilan Bahasa' : 'Lingkup Materi']];
            const body: any[] = [];
            
            const targetRows = selectedSemester === 'Ganjil' ? atpData.ganjil : atpData.genap;
            
            targetRows.forEach(row => {
                const tps = (row.learningGoalPathway || '').split('\n').filter(l => l.trim());
                /* COMMENT: Replaced numbering with bullets (•) in PDF export */
                const formattedTps = tps.map(tp => {
                    const cleanTp = tp.replace(/^[0-9\.\-\s•]+/, '').trim();
                    return `• ${cleanTp}`;
                }).join('\n');

                const scopes = (row.materialScope || '').split('\n').filter(l => l.trim());
                const formattedScopes = scopes.map(sc => {
                    const cleanSc = sc.replace(/^[\-\s\u2022]+/, '').trim();
                    return `- ${cleanSc}`;
                }).join('\n');

                body.push([row.element, formattedTps, row.material, formattedScopes]);
            });

            (pdf as any).autoTable({
                head, body, startY: y, theme: 'grid',
                headStyles: {
                    fillColor: [255, 255, 255], textColor: 0, fontStyle: 'bold',
                    halign: 'center', valign: 'middle', lineColor: 0, lineWidth: 0.1
                },
                styles: { 
                    fontSize: 9, lineColor: 0, lineWidth: 0.1, cellPadding: 2, 
                    valign: 'top', textColor: 0
                },
                columnStyles: {
                    0: { cellWidth: 40 },
                    1: { cellWidth: 110 },
                    2: { cellWidth: 60 },
                    3: { cellWidth: 70 },
                },
                margin: { left: margin.left, right: margin.right, bottom: margin.bottom },
                didDrawCell: (data: any) => {
                    if ((data.column.index === 1 || data.column.index === 3) && data.section === 'body') {
                        const doc = data.doc;
                        const cell = data.cell;
                        const padding = cell.styles.cellPadding;
                        const pLeft = (typeof padding === 'number') ? padding : (padding && typeof padding.left === 'number' ? padding.left : 0);
                        const pTop = (typeof padding === 'number') ? padding : (padding && typeof padding.top === 'number' ? padding.top : 0);
                        const startX = (cell.x || 0) + pLeft;
                        const scale = doc.internal.scaleFactor || 1;
                        const fs = doc.getFontSize() || 9;
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

            // Signatures
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
            
            pdf.save(`ATP-${selectedSubjectName.replace(/[\s/]/g, '_')}-${selectedSemester}-${selectedYear.replace('/', '-')}.pdf`);
            setNotification({ message: 'PDF berhasil dibuat.', type: 'success' });
        } catch (e) {
            console.error(e);
            setNotification({ message: 'Gagal membuat PDF.', type: 'error' });
        } finally {
            setIsGeneratingPDF(false);
        }
    };

    if (isLoading) return <div className="text-center p-8">Memuat data...</div>;
    
    const displayRows = selectedSemester === 'Ganjil' ? atpData.ganjil : atpData.genap;

    return (
        <div className="bg-white p-8 rounded-xl shadow-lg">
            {isTpModalOpen && (
                <TPSelectorModal
                    isOpen={isTpModalOpen}
                    onClose={() => setIsTpModalOpen(false)}
                    onConfirm={handleConfirmImport}
                    subjectId={finalSubjectIdForApi}
                    selectedClass={selectedClass}
                    selectedYear={selectedYear}
                    userId={userId}
                />
            )}
            {notification && <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
            <div className="flex justify-between items-center mb-6 pb-6 border-b">
                 <div className="flex items-center space-x-4">
                    <select value={selectedSubjectId} onChange={e => setSelectedSubjectId(e.target.value)} disabled={isEditing || isLoading} className="p-2 border-gray-300 rounded-md">
                        {subjectsForDropdown.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <select value={selectedSemester} onChange={e => setSelectedSemester(e.target.value as any)} disabled={isEditing || isLoading} className="p-2 border-gray-300 rounded-md">
                        <option value="Ganjil">Ganjil</option>
                        <option value="Genap">Genap</option>
                    </select>
                </div>
                <div className="flex items-center space-x-2">
                    {isEditing ? (
                        <>
                            <button onClick={handleCancel} className="px-4 py-2 border rounded-md hover:bg-gray-100">Batal</button>
                            <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold shadow disabled:bg-indigo-400">
                                {isSaving ? 'Menyimpan...' : 'Simpan'}
                            </button>
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
                            <button onClick={handleEdit} disabled={isLoading} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold shadow flex items-center space-x-2"><PencilIcon/> Edit</button>
                        </>
                    )}
                </div>
            </div>

            {selectedSubjectId === 'seni-budaya-group' && (
                <div className="mb-6 border-b">
                    <nav className="-mb-px flex space-x-4">
                        {masterArtSubjects.map(artName => (
                            <button
                                key={artName}
                                onClick={() => setActiveArtTab(artName)}
                                disabled={isEditing || isLoading}
                                className={`${activeArtTab === artName ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}
                            >{artName}</button>
                        ))}
                    </nav>
                </div>
            )}
             <header className="text-center mb-6">
                <h1 className="text-xl font-bold uppercase">ALUR TUJUAN PEMBELAJARAN - {selectedSubjectName.toUpperCase()}</h1>
                <p className="text-lg font-bold uppercase">{schoolIdentity?.schoolName}</p>
                <p className="text-md text-gray-600 uppercase">KELAS {selectedClass.replace('Kelas ', '')} - SEMESTER {selectedSemester.toUpperCase()} - TAHUN AJARAN {selectedYear}</p>
            </header>
            {isEditing && (
                <div className="mb-6 p-4 border-2 border-dashed border-purple-300 bg-purple-50 rounded-lg flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-semibold text-purple-800">Generate ATP 1 Tahun</h3>
                        <p className="text-sm text-purple-700">Gunakan AI untuk membuat ATP Semester 1 & 2 sekaligus.</p>
                    </div>
                    <button onClick={handleGenerateWithAI} disabled={isSaving || isGenerating} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2">
                        {isGenerating ? (<svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>) : (<SparklesIcon />)}
                        <span>{isGenerating ? 'Memproses...' : 'Generate AI'}</span>
                    </button>
                </div>
            )}

            <div className="overflow-x-auto border rounded-lg">
                <table className="min-w-full text-sm border-collapse">
                    <thead className="bg-gray-100 text-center font-bold">
                        <tr>
                            <th className="p-2 border">Elemen</th>
                            <th className="p-2 border">Alur Tujuan Pembelajaran</th>
                            <th className="p-2 border">{isLanguageSubject(selectedSubjectName) ? "Topik Sastra/Teks" : "Materi"}</th>
                            <th className="p-2 border">{isLanguageSubject(selectedSubjectName) ? "Kegiatan/Keterampilan Bahasa" : "Lingkup Materi"}</th>
                            {isEditing && <th className="p-2 border w-12"></th>}
                        </tr>
                    </thead>
                    <tbody className="bg-white">
                        {displayRows.length > 0 ? displayRows.map((row, index) => {
                            const tps = isEditing ? (row.learningGoalPathway || '').split('\n') : (row.learningGoalPathway || '').split('\n').filter(l => l.trim());
                            const materialScopes = isEditing ? (row.materialScope || '').split('\n') : (row.materialScope || '').split('\n').filter(l => l.trim());
                            
                            return (
                            <tr key={row.id} className="align-top hover:bg-gray-50">
                                <td className="p-1 border w-[15%]">
                                    <WrappingTextarea 
                                        value={row.element} 
                                        onChange={e => handleRowChange(selectedSemester === 'Ganjil' ? 'ganjil' : 'genap', index, 'element', e.target.value)} 
                                        disabled={!isEditing} 
                                        placeholder="Nama Elemen"
                                    />
                                </td>
                                <td className="p-1 border w-[35%]">
                                    {!isEditing ? (
                                        <div className="space-y-1 p-2">
                                            {tps.map((line, lIdx) => {
                                                /* COMMENT: Replaced numbering with bullets (•) in UI display */
                                                const cleanTp = line.replace(/^[0-9\.\-\s•]+/, '').trim();
                                                return (
                                                    <div key={lIdx} className="flex items-start">
                                                        <span className="shrink-0 w-6 font-semibold text-center">•</span>
                                                        <span className="flex-1">{cleanTp}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="space-y-1">
                                            {tps.map((line, lineIndex) => (
                                                <div key={lineIndex} className="flex items-start group">
                                                    <WrappingTextarea 
                                                        value={line} 
                                                        onChange={e => handleLineChange(selectedSemester === 'Ganjil' ? 'ganjil' : 'genap', index, 'learningGoalPathway', lineIndex, e.target.value)} 
                                                        disabled={!isEditing} 
                                                        placeholder="Tujuan Pembelajaran"
                                                    />
                                                    <button onClick={() => handleRemoveLine(selectedSemester === 'Ganjil' ? 'ganjil' : 'genap', index, 'learningGoalPathway', lineIndex)} className="text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity"><TrashIcon className="w-3 h-3"/></button>
                                                </div>
                                            ))}
                                            <button onClick={() => handleAddLine(selectedSemester === 'Ganjil' ? 'ganjil' : 'genap', index, 'learningGoalPathway')} className="text-[10px] text-indigo-600 font-bold px-2 py-1">+ BARIS TP</button>
                                        </div>
                                    )}
                                </td>
                                <td className="p-1 border w-[20%]">
                                    <WrappingTextarea 
                                        value={row.material} 
                                        onChange={e => handleRowChange(selectedSemester === 'Ganjil' ? 'ganjil' : 'genap', index, 'material', e.target.value)} 
                                        disabled={!isEditing} 
                                        placeholder="Pokok Materi"
                                    />
                                </td>
                                <td className="p-1 border w-[30%]">
                                    {!isEditing ? (
                                        <div className="space-y-1 p-2">
                                            {materialScopes.map((line, sIdx) => {
                                                const cleanSc = line.replace(/^[\-\s\u2022]+/, '').trim();
                                                return (
                                                    <div key={sIdx} className="flex items-start">
                                                        <span className="shrink-0 w-4">-</span>
                                                        <span className="flex-1">{cleanSc}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="space-y-1">
                                            {materialScopes.map((line, lineIndex) => (
                                                <div key={lineIndex} className="flex items-start group">
                                                    <WrappingTextarea 
                                                        value={line} 
                                                        onChange={e => handleLineChange(selectedSemester === 'Ganjil' ? 'ganjil' : 'genap', index, 'materialScope', lineIndex, e.target.value)} 
                                                        disabled={!isEditing} 
                                                        placeholder="Lingkup Materi"
                                                    />
                                                    <button onClick={() => handleRemoveLine(selectedSemester === 'Ganjil' ? 'ganjil' : 'genap', index, 'materialScope', lineIndex)} className="text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity"><TrashIcon className="w-3 h-3"/></button>
                                                </div>
                                            ))}
                                            <button onClick={() => handleAddLine(selectedSemester === 'Ganjil' ? 'ganjil' : 'genap', index, 'materialScope')} className="text-[10px] text-indigo-600 font-bold px-2 py-1">+ BARIS LINGKUP</button>
                                        </div>
                                    )}
                                </td>
                                {isEditing && <td className="p-1 border text-center align-middle"><button onClick={() => handleRemoveRow(selectedSemester === 'Ganjil' ? 'ganjil' : 'genap', row.id)} className="text-red-500 p-1"><TrashIcon className="w-4 h-4" /></button></td>}
                            </tr>
                        )}) : (
                            <tr><td colSpan={isEditing ? 5 : 4} className="text-center py-4 text-gray-500">Belum ada data {selectedSemester}.</td></tr>
                        )}
                        {isEditing && (
                            <tr>
                                <td colSpan={5} className="p-2 border bg-gray-50">
                                    <div className="flex space-x-2">
                                        <button onClick={() => handleAddRow(selectedSemester === 'Ganjil' ? 'ganjil' : 'genap')} className="text-sm text-indigo-600 hover:text-indigo-800 font-semibold">+ Baris Baru ({selectedSemester})</button>
                                        <button onClick={() => handleOpenImportModal(selectedSemester === 'Ganjil' ? 'ganjil' : 'genap')} className="text-sm text-green-600 hover:text-green-800 font-semibold ml-4">Import dari TP ({selectedSemester})</button>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Tarik Data Induk Modal */}
            {isPullModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all animate-fade-in scale-100">
                        <div className="p-6">
                            <div className="flex items-center justify-center w-16 h-16 mx-auto bg-purple-100 rounded-full mb-4">
                                <SparklesIcon className="w-10 h-10 text-purple-600" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 text-center mb-2">Tarik ATP dari Induk?</h3>
                            <p className="text-gray-600 text-center text-sm mb-6">
                                Anda akan menyalin data Alur Tujuan Pembelajaran dari Admin untuk mata pelajaran <span className="font-bold">{selectedSubjectName}</span>. 
                                <br/><br/>
                                <span className="text-red-600 font-bold">Peringatan:</span> Data ATP yang sudah Anda buat atau ubah sendiri untuk mapel ini akan <span className="underline">ditimpa sepenuhnya</span>.
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
        </div>
    );
};

export default LearningGoalsPathway;