
import React, { useState, useEffect, useLayoutEffect, useRef, ClipboardEvent, useMemo } from 'react';
import { Subject, LearningOutcomeElement, SchoolIdentity, Teacher } from '../types';
import { getSubjects, getLearningOutcomes, updateLearningOutcomes, getSchoolIdentity, getTeacherProfile, pullLearningOutcomesToTeacher } from '../services/adminService';
import Notification, { NotificationType } from './Notification';
import { PencilIcon, TrashIcon, SparklesIcon, ArrowDownTrayIcon, ArrowPathIcon } from './Icons';

import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

interface LearningOutcomesProps {
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
    'seni budaya', // Use 'seni budaya' for grouping art subjects
    'bahasa inggris',
    'bahasa jawa',
    'pendidikan lingkungan hidup',
    'koding dan kecerdasan artifisial',
    'koding dan kecerdasan artificial',
];

const masterArtSubjects = ['Seni Rupa', 'Seni Musik', 'Seni Tari', 'Seni Teater'];

const getSortIndex = (subjectName: string): number => {
    const lowerName = subjectName.toLowerCase();
    
    if (lowerName.startsWith('seni')) {
        return subjectSortOrder.indexOf('seni budaya');
    }
    
    if (lowerName.startsWith('bahasa inggris')) {
        return subjectSortOrder.indexOf('bahasa inggris');
    }
    
    const index = subjectSortOrder.indexOf(lowerName);
    return index === -1 ? 99 : index;
};

const WrappingTextarea = ({ value, onChange, disabled, placeholder, className = '', id, onKeyDown, onPaste, focusOnMount, onFocusSet }: {
    value: string;
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    disabled: boolean;
    placeholder?: string;
    className?: string;
    id?: string;
    onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    onPaste?: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
    focusOnMount?: boolean;
    onFocusSet?: () => void;
}) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useLayoutEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = `${textarea.scrollHeight}px`;
        }
    }, [value]);
    
    useEffect(() => {
        if (focusOnMount && textareaRef.current) {
            textareaRef.current.focus();
            onFocusSet?.();
        }
    }, [focusOnMount, onFocusSet]);

    return (
        <textarea
            ref={textareaRef}
            id={id}
            value={value}
            onChange={onChange}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            disabled={disabled}
            placeholder={placeholder}
            className={`w-full p-2 border-none bg-transparent focus:outline-none focus:bg-indigo-50 rounded resize-none overflow-hidden block ${className}`}
            rows={1}
        />
    );
};

const LearningOutcomes: React.FC<LearningOutcomesProps> = ({ selectedClass, selectedYear, userId }) => {
    const [subjectsForDropdown, setSubjectsForDropdown] = useState<{id: string, name: string}[]>([]);
    const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
    const [activeArtTab, setActiveArtTab] = useState<string>(masterArtSubjects[0]);
    
    const [elements, setElements] = useState<LearningOutcomeElement[]>([]);
    const [originalElements, setOriginalElements] = useState<LearningOutcomeElement[]>([]);
    
    const [schoolIdentity, setSchoolIdentity] = useState<SchoolIdentity | null>(null);
    const [teacher, setTeacher] = useState<Teacher | null>(null);

    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isPulling, setIsPulling] = useState(false);
    const [isPullModalOpen, setIsPullModalOpen] = useState(false);
    const [notification, setNotification] = useState<{ message: string; type: NotificationType } | null>(null);
    const [nextFocusId, setNextFocusId] = useState<string | null>(null);
    const [signatureDate, setSignatureDate] = useState(new Date().toISOString().split('T')[0]);
    const [isPdfDropdownOpen, setIsPdfDropdownOpen] = useState(false);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    
    const createEmptyElement = (): LearningOutcomeElement => ({
        id: crypto.randomUUID(),
        elementName: '',
        outcomes: [{ id: crypto.randomUUID(), text: '' }],
    });

    // Fetch and process subjects to build the dropdown and other required data
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
                let dropdownSubjects = Array.from(regularSubjectsMap.values());
                
                const hasArt = fetchedSubjects.some(s => s.name.toLowerCase().startsWith('seni'));
                if (hasArt) {
                    dropdownSubjects.push({ id: 'seni-budaya-group', name: 'Seni Budaya' });
                }
                
                const sorted = dropdownSubjects.sort((a, b) => getSortIndex(a.name) - getSortIndex(b.name));
                setSubjectsForDropdown(sorted);
                
                if (sorted.length > 0) {
                    setSelectedSubjectId(sorted[0].id);
                } else {
                    setSelectedSubjectId('');
                }

            } catch (error: any) {
                setNotification({ message: error.message || 'Gagal memuat data awal.', type: 'error' });
                setSubjectsForDropdown([]);
                setSelectedSubjectId('');
            }
        };
        fetchInitialData();
    }, [selectedClass, selectedYear, userId]);
    
    const finalSubjectIdForApi = useMemo(() => {
        if (selectedSubjectId !== 'seni-budaya-group') {
            return selectedSubjectId;
        }
        return activeArtTab.toLowerCase().replace(/\s+/g, '-');
    }, [selectedSubjectId, activeArtTab]);

    const selectedSubjectName = useMemo(() => {
        if (selectedSubjectId === 'seni-budaya-group') {
            return activeArtTab;
        }
        const subject = subjectsForDropdown.find(s => s.id === selectedSubjectId);
        return subject ? subject.name : '';
    }, [selectedSubjectId, subjectsForDropdown, activeArtTab]);


    useEffect(() => {
        if (!finalSubjectIdForApi) {
            setElements([createEmptyElement()]);
            setIsLoading(false);
            return;
        };

        const fetchOutcomes = async () => {
            setIsLoading(true);
            setNotification(null);
            try {
                const data = await getLearningOutcomes(selectedYear, selectedClass, finalSubjectIdForApi, userId);
                setElements(data.elements.length > 0 ? data.elements : [createEmptyElement()]);
            } catch (error: any) {
                setNotification({ message: error.message, type: 'error' });
                setElements([createEmptyElement()]);
            } finally {
                setIsLoading(false);
            }
        };
        fetchOutcomes();
    }, [finalSubjectIdForApi, selectedYear, selectedClass, userId]);
    
    const phaseInfo = useMemo(() => {
        const romanMap: { [key: string]: number } = {
            'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6
        };
        const roman = selectedClass.replace('Kelas ', '');
        const classNumber = romanMap[roman] || 0;

        if (classNumber <= 2) return { phase: 'A', classes: 'I dan II' };
        if (classNumber <= 4) return { phase: 'B', classes: 'III dan IV' };
        return { phase: 'C', classes: 'V dan VI' };
    }, [selectedClass]);

    const flatData = useMemo(() => elements.flatMap(el => 
      (el.outcomes.length > 0 ? el.outcomes : [{ id: `${el.id}-placeholder`, text: '' }]).map((outcome, index) => ({
        elementId: el.id,
        elementName: el.elementName,
        outcomeId: outcome.id,
        outcomeText: outcome.text,
        isFirst: index === 0,
        rowSpan: el.outcomes.length > 0 ? el.outcomes.length : 1,
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
        setNotification(null);
        try {
            await updateLearningOutcomes(selectedYear, selectedClass, finalSubjectIdForApi, { elements }, userId);
            const data = await getLearningOutcomes(selectedYear, selectedClass, finalSubjectIdForApi, userId);
            setElements(data.elements.length > 0 ? data.elements : [createEmptyElement()]);
            setNotification({ message: 'Capaian Pembelajaran berhasil disimpan.', type: 'success' });
            setIsEditing(false);
        } catch (error: any) {
            setNotification({ message: error.message, type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleElementChange = (elementId: string, newName: string) => {
        setElements(prev => prev.map(el => el.id === elementId ? { ...el, elementName: newName } : el));
    };

    const handleOutcomeChange = (elementId: string, outcomeId: string, newText: string) => {
        setElements(prev => prev.map(el => {
            if (el.id === elementId) {
                return {
                    ...el,
                    outcomes: el.outcomes.map(o => o.id === outcomeId ? { ...o, text: newText } : o)
                };
            }
            return el;
        }));
    };
    
    const handleAddElement = () => {
        setElements(prev => [...prev, createEmptyElement()]);
    };

    const handleRemoveElement = (elementId: string) => {
        setElements(prev => prev.filter(el => el.id !== elementId));
    };

    const handleAddOutcome = (elementId: string) => {
        setElements(prev => prev.map(el => {
            if (el.id === elementId) {
                const newOutcomes = el.outcomes.filter(o => o.text !== '');
                return {
                    ...el,
                    outcomes: [...newOutcomes, { id: crypto.randomUUID(), text: '' }]
                };
            }
            return el;
        }));
    };
    
    const handleSplitOutcome = (elementId: string, outcomeId: string, textBefore: string, textAfter: string) => {
        const newOutcomeId = crypto.randomUUID();
        setNextFocusId(newOutcomeId);

        setElements(prev => prev.map(el => {
            if (el.id === elementId) {
                const currentIndex = el.outcomes.findIndex(o => o.id === outcomeId);
                if (currentIndex === -1) return el;

                const updatedCurrentOutcome = { ...el.outcomes[currentIndex], text: textBefore.trim() };
                const newOutcome = { id: newOutcomeId, text: textAfter.trim() };

                const newOutcomes = [
                    ...el.outcomes.slice(0, currentIndex),
                    updatedCurrentOutcome,
                    newOutcome,
                    ...el.outcomes.slice(currentIndex + 1)
                ];

                return { ...el, outcomes: newOutcomes };
            }
            return el;
        }));
    };

    const handleRemoveOutcome = (elementId: string, outcomeId: string) => {
         setElements(prev => prev.map(el => {
            if (el.id === elementId) {
                return {
                    ...el,
                    outcomes: el.outcomes.filter(o => o.id !== outcomeId)
                };
            }
            return el;
        }));
    };
    
    const handleGlobalPaste = (e: ClipboardEvent<HTMLDivElement>) => {
        if (!isEditing) return;
        
        // If the user is focused on a textarea, let the contextual paste handle it (or default browser paste)
        const target = e.target as HTMLElement;
        if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
            return;
        }

        e.preventDefault();
        const pasteData = e.clipboardData.getData('text/plain');
        const rows = pasteData.split(/\r\n|\n/).filter(row => row.trim() !== '');

        if (rows.length === 0) return;

        const newElements: LearningOutcomeElement[] = [];
        let currentElement: LearningOutcomeElement | null = null;

        rows.forEach((row, index) => {
            const cells = row.split('\t');
            
            // If it's a 1-column paste but not the first row, maybe it's outcome only
            if (cells.length === 1 && currentElement && index > 0) {
                 const outcomeText = cells[0].trim();
                 if (outcomeText) {
                    currentElement.outcomes.push({ id: crypto.randomUUID(), text: outcomeText });
                 }
                 return;
            }

            const col1 = cells[0]?.trim() || '';
            const col2 = cells[1]?.trim() || '';

            if (col1 && col2) {
                currentElement = {
                    id: crypto.randomUUID(),
                    elementName: col1,
                    outcomes: [{ id: crypto.randomUUID(), text: col2 }]
                };
                newElements.push(currentElement);
            } else if (col1) {
                // If only 1 col provided, treat as Element Name unless it looks like a long CP text
                const looksLikeCP = col1.length > 50 || col1.includes(' ');
                if (looksLikeCP && !currentElement) {
                     currentElement = {
                        id: crypto.randomUUID(),
                        elementName: 'Elemen Baru',
                        outcomes: [{ id: crypto.randomUUID(), text: col1 }]
                    };
                    newElements.push(currentElement);
                } else if (looksLikeCP && currentElement) {
                    currentElement.outcomes.push({ id: crypto.randomUUID(), text: col1 });
                } else {
                    currentElement = {
                        id: crypto.randomUUID(),
                        elementName: col1,
                        outcomes: []
                    };
                    newElements.push(currentElement);
                }
            }
        });
        
        if (newElements.length > 0) {
            setElements(newElements);
            setNotification({ message: 'Data berhasil ditempelkan dan menimpa data yang ada.', type: 'info' });
        }
    };

    // Feature: Paste multi-line text into a CP box to create multiple CP rows
    const handleContextualPasteCP = (e: React.ClipboardEvent<HTMLTextAreaElement>, elementId: string, outcomeId: string) => {
        const pasteData = e.clipboardData.getData('text/plain');
        if (!pasteData.includes('\n')) return; // Let default single-line paste happen

        e.preventDefault();
        const lines = pasteData.split(/\r\n|\n/).map(l => l.trim()).filter(l => l !== '');
        if (lines.length === 0) return;

        setElements(prev => prev.map(el => {
            if (el.id !== elementId) return el;
            
            const targetIdx = el.outcomes.findIndex(o => o.id === outcomeId);
            if (targetIdx === -1) return el;

            const newOutcomeRows = lines.map(line => ({ id: crypto.randomUUID(), text: line }));
            
            // Replace the current row if it was empty, otherwise append
            const isCurrentEmpty = !el.outcomes[targetIdx].text.trim();
            const start = el.outcomes.slice(0, targetIdx);
            const end = el.outcomes.slice(targetIdx + (isCurrentEmpty ? 1 : 1));
            
            const updatedOutcomes = isCurrentEmpty 
                ? [...start, ...newOutcomeRows, ...end]
                : [...start, el.outcomes[targetIdx], ...newOutcomeRows, ...end];

            return { ...el, outcomes: updatedOutcomes };
        }));

        setNotification({ message: `${lines.length} baris CP berhasil ditambahkan.`, type: 'info' });
    };

    const handleSubjectDropdownChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newId = e.target.value;
        setSelectedSubjectId(newId);
        if (newId === 'seni-budaya-group') {
            setActiveArtTab(masterArtSubjects[0]);
        }
    };

    const handlePullFromMaster = async () => {
        if (!userId || !finalSubjectIdForApi) return;
        setIsPulling(true);
        setNotification(null);
        try {
            const pulledData = await pullLearningOutcomesToTeacher(selectedYear, selectedClass, finalSubjectIdForApi, userId);
            setElements(pulledData.elements.length > 0 ? pulledData.elements : [createEmptyElement()]);
            setNotification({ message: 'Data CP berhasil ditarik dari induk.', type: 'success' });
            setIsPullModalOpen(false);
        } catch (error: any) {
            setNotification({ message: error.message, type: 'error' });
        } finally {
            setIsPulling(false);
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
            // F4 size in mm: [215, 330]. Portrait.
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [215, 330] });

            const margin = { top: 5, left: 25, right: 5, bottom: 5 }; // Custom margins
            const contentWidth = 215 - margin.left - margin.right;
            const pageHeight = 330;
            let y = margin.top + 10; // Add some padding from absolute top edge

            // Header
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(12);
            pdf.setTextColor(0, 0, 0); // Black text
            pdf.text(`CAPAIAN PEMBELAJARAN ${selectedSubjectName.toUpperCase()}`, 107.5, y, { align: 'center' });
            y += 6;
            pdf.setFontSize(11);
            pdf.text(`FASE ${phaseInfo.phase} (KELAS ${phaseInfo.classes}) TAHUN AJARAN ${selectedYear}`, 107.5, y, { align: 'center' });
            y += 6;
            pdf.setFontSize(9);
            pdf.text('Berdasarkan Keputusan Kepala BSKAP Nomor: 046/H/KR/2025', 107.5, y, { align: 'center' });
            y += 10;

            // Table
            const head = [['Elemen', 'Capaian Pembelajaran']];
            const body: any[] = [];
            
            const filteredElements = elements.filter(el => el.elementName.trim() !== '');

            for (const el of filteredElements) {
                const outcomes = el.outcomes.filter(o => o.text.trim() !== '');
                if (outcomes.length === 0) {
                    body.push([{ content: el.elementName, rowSpan: 1 }, '']);
                } else {
                    outcomes.forEach((outcome, index) => {
                        const outcomeText = outcome.text; // Keep raw text
                        if (index === 0) {
                            body.push([{ content: el.elementName, rowSpan: outcomes.length }, outcomeText]);
                        } else {
                            body.push([outcomeText]);
                        }
                    });
                }
            }

            (pdf as any).autoTable({
                head, body, startY: y, theme: 'grid',
                headStyles: {
                    fillColor: [255, 255, 255], // White header background
                    textColor: 0, // Black text
                    fontStyle: 'bold',
                    halign: 'center', valign: 'middle', lineColor: 0, lineWidth: 0.1
                },
                styles: { 
                    fontSize: 10, 
                    lineColor: 0, // Black border
                    lineWidth: 0.1, 
                    cellPadding: 2, 
                    valign: 'top',
                    textColor: 0 // Black body text
                },
                columnStyles: {
                    0: { cellWidth: 60, fontStyle: 'bold' },
                    1: { cellWidth: 125 },
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
                    pdf.text(schoolIdentity?.principalName || '', principalX, y + 28, { align: 'center' });
                    pdf.setFont('helvetica', 'normal');
                    pdf.text(`NIP. ${schoolIdentity?.principalNip || ''}`, principalX, y + 34, { align: 'center' });
                }

                if (signatureOption === 'teacher' || signatureOption === 'both') {
                    pdf.text(`${schoolIdentity?.city || '...................'}, ${formattedDate}`, teacherX, y, { align: 'center' });
                    pdf.text(`Wali Kelas ${selectedClass.replace('Kelas ', '')}`, teacherX, y + 6, { align: 'center' });
                    pdf.setFont('helvetica', 'bold');
                    pdf.text(teacher?.fullName || '', teacherX, y + 28, { align: 'center' });
                    pdf.setFont('helvetica', 'normal');
                    pdf.text(`NIP. ${teacher?.nip || ''}`, teacherX, y + 34, { align: 'center' });
                }
            }
            
            pdf.save(`CP-${selectedSubjectName.replace(/[\s/]/g, '_')}-Fase_${phaseInfo.phase}-${selectedYear.replace('/', '-')}.pdf`);
            setNotification({ message: 'PDF berhasil dibuat.', type: 'success' });
        } catch (e) {
            console.error(e);
            setNotification({ message: 'Gagal membuat PDF.', type: 'error' });
        } finally {
            setIsGeneratingPDF(false);
        }
    };


    return (
        <div className="bg-white p-8 rounded-xl shadow-lg" onPaste={isEditing ? handleGlobalPaste : undefined}>
            {notification && <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}

            <div className="flex justify-between items-center mb-6 pb-6 border-b">
                <div className="flex items-center space-x-4">
                    <label htmlFor="subject-select" className="block text-sm font-medium text-gray-700">Mata Pelajaran:</label>
                    <select
                        id="subject-select"
                        value={selectedSubjectId}
                        onChange={handleSubjectDropdownChange}
                        className="block w-full max-w-xs pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                        disabled={isEditing || isLoading || isGeneratingPDF}
                    >
                        {subjectsForDropdown.length > 0 ? (
                            subjectsForDropdown.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)
                        ) : (
                            <option>Tidak ada mata pelajaran</option>
                        )}
                    </select>
                </div>
                <div className="flex items-center space-x-2">
                    {isEditing ? (
                        <>
                            <button onClick={handleCancel} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-semibold">Batal</button>
                            <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold disabled:bg-indigo-400">
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
                            <button onClick={handleEdit} disabled={isLoading} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold shadow flex items-center space-x-2">
                                <PencilIcon /> <span>Edit</span>
                            </button>
                        </>
                    )}
                </div>
            </div>

            {selectedSubjectId === 'seni-budaya-group' && (
                <div className="mb-6 border-b border-gray-200">
                    <nav className="-mb-px flex space-x-4" aria-label="Tabs">
                        {masterArtSubjects.map((artName) => (
                            <button
                                key={artName}
                                onClick={() => setActiveArtTab(artName)}
                                disabled={isEditing || isLoading || isGeneratingPDF}
                                className={`${
                                    activeArtTab === artName
                                        ? 'border-indigo-500 text-indigo-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                } whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                {artName}
                            </button>
                        ))}
                    </nav>
                </div>
            )}

            <header className="text-center mb-6">
                 <h1 className="text-xl font-bold uppercase">
                    Capaian Pembelajaran {selectedSubjectName}
                </h1>
                <p className="text-md text-gray-600">
                    Fase {phaseInfo.phase} (Kelas {phaseInfo.classes}) Tahun Ajaran {selectedYear}
                </p>
                <p className="text-sm text-gray-500 mt-1">Berdasarkan Keputusan Kepala BSKAP Nomor: 046/H/KR/2025</p>
            </header>

            {isLoading ? (
                <div className="text-center py-12 text-gray-500">Memuat data...</div>
            ) : (
                <>
                    {isEditing && (
                        <div className="bg-blue-50 border-l-4 border-blue-500 text-blue-800 p-4 mb-6 rounded-r-lg" role="alert">
                            <div className="flex">
                                <div className="py-1"><SparklesIcon className="h-5 w-5 text-blue-500 mr-3"/></div>
                                <div>
                                    <p className="font-bold">Pro Tip!</p>
                                    <p className="text-sm">Tekan `Enter` untuk memisahkan CP pada posisi kursor. Gunakan `Shift`+`Enter` untuk membuat baris baru. Menempelkan (Paste) daftar teks ke dalam kotak CP akan memecahnya menjadi baris CP baru.</p>
                                </div>
                            </div>
                        </div>
                    )}
                    <div className="overflow-x-auto border rounded-lg">
                        <table className="min-w-full">
                            <thead className="bg-gray-100">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider w-1/3">Elemen</th>
                                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Capaian Pembelajaran</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {flatData.map((row) => (
                                    <tr key={row.outcomeId}>
                                        {row.isFirst && (
                                            <td className="px-1 py-1 align-top border-r" rowSpan={row.rowSpan}>
                                                <div className="flex flex-col h-full">
                                                    <div className="flex-grow">
                                                        {isEditing ? (
                                                            <div className="flex items-start p-2">
                                                                <WrappingTextarea
                                                                    value={row.elementName}
                                                                    onChange={(e) => handleElementChange(row.elementId, e.target.value)}
                                                                    disabled={!isEditing}
                                                                    placeholder="Nama Elemen"
                                                                    className="font-semibold"
                                                                />
                                                                <button onClick={() => handleRemoveElement(row.elementId)} className="text-red-500 hover:text-red-700 p-1 mt-1">
                                                                    <TrashIcon className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <div className="px-3 py-2 font-semibold text-gray-800">{row.elementName}</div>
                                                        )}
                                                    </div>
                                                    {isEditing && (
                                                        <div className="px-3 pb-2 mt-auto">
                                                            <button onClick={() => handleAddOutcome(row.elementId)} className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold">
                                                                + Tambah CP
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        )}
                                        <td className="px-1 py-1 align-top">
                                            <div className="flex items-start">
                                                <span className="px-2 py-2 text-gray-500">&bull;</span>
                                                <div className="flex-grow">
                                                    <WrappingTextarea
                                                        value={row.outcomeText}
                                                        onChange={(e) => handleOutcomeChange(row.elementId, row.outcomeId, e.target.value)}
                                                        onPaste={(e) => handleContextualPasteCP(e, row.elementId, row.outcomeId)}
                                                        disabled={!isEditing}
                                                        placeholder="Deskripsi capaian pembelajaran"
                                                        id={row.outcomeId}
                                                        onKeyDown={(e) => {
                                                            if (isEditing && e.key === 'Enter' && !e.shiftKey) {
                                                                e.preventDefault();
                                                                const textarea = e.target as HTMLTextAreaElement;
                                                                const cursorPosition = textarea.selectionStart;
                                                                const textBefore = textarea.value.substring(0, cursorPosition);
                                                                const textAfter = textarea.value.substring(cursorPosition);
                                                                handleSplitOutcome(row.elementId, row.outcomeId, textBefore, textAfter);
                                                            }
                                                        }}
                                                        focusOnMount={nextFocusId === row.outcomeId}
                                                        onFocusSet={() => setNextFocusId(null)}
                                                    />
                                                </div>
                                                {isEditing && (
                                                    <button onClick={() => handleRemoveOutcome(row.elementId, row.outcomeId)} className="text-red-500 hover:text-red-700 p-1 mt-1">
                                                        <TrashIcon className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            {isEditing && (
                                <tfoot>
                                    <tr>
                                        <td colSpan={2} className="p-4 border-t">
                                            <button onClick={handleAddElement} className="text-sm text-indigo-600 hover:text-indigo-800 font-semibold">
                                                + Tambah Elemen Baru
                                            </button>
                                        </td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </>
            )}

            {/* Modal Konfirmasi Tarik CP */}
            {isPullModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all animate-fade-in scale-100">
                        <div className="p-6">
                            <div className="flex items-center justify-center w-16 h-16 mx-auto bg-purple-100 rounded-full mb-4">
                                <SparklesIcon className="w-10 h-10 text-purple-600" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 text-center mb-2">Tarik CP dari Induk?</h3>
                            <p className="text-gray-600 text-center text-sm mb-6">
                                Anda akan menyalin data Capaian Pembelajaran dari Admin untuk mata pelajaran <span className="font-bold">{selectedSubjectName}</span>. 
                                <br/><br/>
                                <span className="text-red-600 font-bold">Peringatan:</span> Data CP yang sudah Anda buat atau ubah sendiri untuk mapel ini akan <span className="underline">ditimpa sepenuhnya</span>.
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

export default LearningOutcomes;
