
import React, { useState, useEffect, useMemo } from 'react';
import { getSubjects, getProsem, getSchoolIdentity, getTeacherProfile } from '../services/adminService';
import { SchoolIdentity, Teacher } from '../types';
import Notification, { NotificationType } from './Notification';
import { generateContentWithRotation } from '../services/geminiService';
import { Type } from '@google/genai';
import { SparklesIcon, ArrowDownTrayIcon } from './Icons';

declare const jspdf: any;

interface BankSoalProps {
    selectedClass: string;
    selectedYear: string;
    userId?: string;
}

interface Question {
    type: 'pg' | 'isian' | 'uraian';
    question: string;
    options?: string[];
    answer: string;
}

interface GeneratedData {
    pg: Question[];
    isian: Question[];
    uraian: Question[];
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

const BankSoal: React.FC<BankSoalProps> = ({ selectedClass, selectedYear, userId }) => {
    const [subjectsForDropdown, setSubjectsForDropdown] = useState<{ id: string, name: string }[]>([]);
    const [selectedSubjectId, setSelectedSubjectId] = useState('');
    const [activeArtTab, setActiveArtTab] = useState<string>(masterArtSubjects[0]);
    const [selectedSemester, setSelectedSemester] = useState<'Ganjil' | 'Genap'>('Ganjil');
    const [selectedMaterial, setSelectedMaterial] = useState<string>('');
    const [materialsList, setMaterialsList] = useState<string[]>([]);
    
    // Config
    const [numPG, setNumPG] = useState(10);
    const [numIsian, setNumIsian] = useState(5);
    const [numUraian, setNumUraian] = useState(5);

    // Data
    const [generatedData, setGeneratedData] = useState<GeneratedData | null>(null);
    const [schoolIdentity, setSchoolIdentity] = useState<SchoolIdentity | null>(null);
    const [teacher, setTeacher] = useState<Teacher | null>(null);

    // States
    const [isLoading, setIsLoading] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    const [activeTab, setActiveTab] = useState<'soal' | 'kunci'>('soal');
    const [notification, setNotification] = useState<{ message: string; type: NotificationType } | null>(null);

    // Fetch Subjects & Identity
    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                // SINKRONISASI: Mengambil data dari database guru jika userId tersedia
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
            finally { setIsLoading(false); }
        };
        fetchData();
    }, [selectedClass, selectedYear, userId]);

    const finalSubjectIdForApi = useMemo(() => {
        if (selectedSubjectId !== 'seni-budaya-group') return selectedSubjectId;
        return activeArtTab.toLowerCase().replace(/\s+/g, '-');
    }, [selectedSubjectId, activeArtTab]);

    const selectedSubjectName = useMemo(() => {
        if (selectedSubjectId === 'seni-budaya-group') return activeArtTab;
        const subject = subjectsForDropdown.find(s => s.id === selectedSubjectId);
        return subject ? subject.name : '';
    }, [selectedSubjectId, subjectsForDropdown, activeArtTab]);

    // Fetch Materials from Prosem
    useEffect(() => {
        if (!finalSubjectIdForApi) {
            setMaterialsList([]);
            return;
        }
        const fetchMaterials = async () => {
            setIsLoading(true);
            try {
                const prosemData = await getProsem(selectedYear, selectedClass, finalSubjectIdForApi, selectedSemester, userId);
                const uniqueMaterials = Array.from(new Set(prosemData.rows.map(r => r.materi).filter(Boolean)));
                setMaterialsList(uniqueMaterials);
                if (uniqueMaterials.length > 0) setSelectedMaterial(uniqueMaterials[0]);
                else setSelectedMaterial('');
            } catch (error) {
                console.error(error);
                setMaterialsList([]);
            } finally {
                setIsLoading(false);
            }
        };
        fetchMaterials();
    }, [finalSubjectIdForApi, selectedSemester, selectedClass, selectedYear, userId]);

    const handleGenerate = async () => {
        if (!selectedMaterial) {
            setNotification({ message: 'Pilih materi terlebih dahulu (isi Prosem jika kosong).', type: 'error' });
            return;
        }
        setIsGenerating(true);
        setNotification({ message: 'AI sedang membuat soal...', type: 'info' });

        try {
            const prompt = `
                Anda adalah guru SD profesional. Buatkan bank soal untuk:
                Kelas: ${selectedClass}
                Mata Pelajaran: ${selectedSubjectName}
                Materi: ${selectedMaterial}
                Semester: ${selectedSemester}

                Jumlah Soal:
                - Pilihan Ganda (PG): ${numPG} soal (dengan opsi A, B, C, D).
                - Isian Singkat: ${numIsian} soal.
                - Uraian: ${numUraian} soal.

                Aturan:
                1. Soal harus sesuai tingkat pemahaman siswa SD kelas tersebut.
                2. Gunakan Bahasa Indonesia yang baik dan benar.
                3. Sertakan kunci jawaban untuk semua soal.
                
                Output JSON Wajib:
                {
                  "pg": [ { "question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], "answer": "A" } ],
                  "isian": [ { "question": "...", "answer": "..." } ],
                  "uraian": [ { "question": "...", "answer": "..." } ]
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
                            pg: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        question: { type: Type.STRING },
                                        options: { type: Type.ARRAY, items: { type: Type.STRING } },
                                        answer: { type: Type.STRING }
                                    },
                                    required: ["question", "options", "answer"]
                                }
                            },
                            isian: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        question: { type: Type.STRING },
                                        answer: { type: Type.STRING }
                                    },
                                    required: ["question", "answer"]
                                }
                            },
                            uraian: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        question: { type: Type.STRING },
                                        answer: { type: Type.STRING }
                                    },
                                    required: ["question", "answer"]
                                }
                            }
                        },
                        required: ["pg", "isian", "uraian"]
                    }
                }
            });

            const result = JSON.parse(response.text.trim());
            // Add type info to result
            const processed: GeneratedData = {
                pg: (result.pg || []).map((q: any) => ({ ...q, type: 'pg' })),
                isian: (result.isian || []).map((q: any) => ({ ...q, type: 'isian' })),
                uraian: (result.uraian || []).map((q: any) => ({ ...q, type: 'uraian' }))
            };

            setGeneratedData(processed);
            setNotification({ message: 'Soal berhasil dibuat!', type: 'success' });

        } catch (e: any) {
            setNotification({ message: 'Gagal generate soal: ' + e.message, type: 'error' });
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDownloadPDF = async () => {
        if (!generatedData || !schoolIdentity || !teacher) {
            setNotification({ message: 'Data tidak lengkap untuk PDF.', type: 'error' });
            return;
        }
        setIsGeneratingPDF(true);
        setNotification({ message: 'Menyiapkan PDF...', type: 'info' });
        await new Promise(r => setTimeout(r, 50));

        try {
            const { jsPDF } = jspdf;
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            
            const margin = { top: 20, left: 20, right: 20, bottom: 20 };
            const pageWidth = 210;
            const contentWidth = pageWidth - margin.left - margin.right;
            let y = margin.top;

            // --- PAGE 1: SOAL ---
            // Header
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(12);
            pdf.text('BANK SOAL / LATIHAN SOAL', pageWidth / 2, y, { align: 'center' });
            y += 6;
            pdf.setFontSize(11);
            pdf.text(schoolIdentity.schoolName.toUpperCase(), pageWidth / 2, y, { align: 'center' });
            y += 10;

            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(10);
            
            // Metadata Table-like
            pdf.text(`Mata Pelajaran: ${selectedSubjectName}`, margin.left, y);
            pdf.text(`Kelas/Semester: ${selectedClass.replace('Kelas ', '')} / ${selectedSemester}`, pageWidth - margin.right, y, { align: 'right' });
            y += 5;
            pdf.text(`Materi: ${selectedMaterial}`, margin.left, y);
            pdf.text(`Tahun Ajaran: ${selectedYear}`, pageWidth - margin.right, y, { align: 'right' });
            y += 8;
            pdf.setLineWidth(0.5);
            pdf.line(margin.left, y, pageWidth - margin.right, y);
            y += 8;

            const printQuestion = (q: Question, index: number, startNum: number) => {
                const num = `${startNum + index}.`;
                
                // Question Text
                const qLines = pdf.splitTextToSize(`${num} ${q.question}`, contentWidth);
                if (y + (qLines.length * 5) > 280) { pdf.addPage(); y = margin.top + 10; }
                pdf.text(qLines, margin.left, y);
                y += (qLines.length * 5);

                // Options for PG
                if (q.type === 'pg' && q.options) {
                    q.options.forEach(opt => {
                        if (y + 5 > 280) { pdf.addPage(); y = margin.top + 10; }
                        pdf.text(opt, margin.left + 5, y);
                        y += 5;
                    });
                } else if (q.type === 'isian' || q.type === 'uraian') {
                    y += 5; // Extra space for answer
                }
                y += 2;
            };

            if (generatedData.pg.length > 0) {
                pdf.setFont('helvetica', 'bold');
                pdf.text('I. Berilah tanda silang (x) pada huruf A, B, C, atau D di depan jawaban yang benar!', margin.left, y);
                y += 6;
                pdf.setFont('helvetica', 'normal');
                generatedData.pg.forEach((q, i) => printQuestion(q, i, 1));
            }

            if (generatedData.isian.length > 0) {
                y += 5;
                if (y > 270) { pdf.addPage(); y = margin.top + 10; }
                pdf.setFont('helvetica', 'bold');
                pdf.text('II. Isilah titik-titik di bawah ini dengan jawaban yang tepat!', margin.left, y);
                y += 6;
                pdf.setFont('helvetica', 'normal');
                generatedData.isian.forEach((q, i) => printQuestion(q, i, 1));
            }

            if (generatedData.uraian.length > 0) {
                y += 5;
                if (y > 270) { pdf.addPage(); y = margin.top + 10; }
                pdf.setFont('helvetica', 'bold');
                pdf.text('III. Jawablah pertanyaan-pertanyaan di bawah ini dengan benar!', margin.left, y);
                y += 6;
                pdf.setFont('helvetica', 'normal');
                generatedData.uraian.forEach((q, i) => printQuestion(q, i, 1));
            }

            // --- PAGE 2: KUNCI JAWABAN ---
            pdf.addPage();
            y = margin.top;
            
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(12);
            pdf.text('KUNCI JAWABAN', pageWidth / 2, y, { align: 'center' });
            y += 10;
            pdf.setFontSize(10);

            if (generatedData.pg.length > 0) {
                pdf.text('I. Pilihan Ganda', margin.left, y);
                y += 6;
                pdf.setFont('helvetica', 'normal');
                // Create multi-column layout for key
                let colX = margin.left;
                let startY = y;
                generatedData.pg.forEach((q, i) => {
                    if (y > 280) {
                        colX += 40;
                        y = startY;
                    }
                    pdf.text(`${i + 1}. ${q.answer}`, colX, y);
                    y += 5;
                });
                y = Math.max(y, startY + 5) + 10;
            }

            if (generatedData.isian.length > 0) {
                pdf.setFont('helvetica', 'bold');
                pdf.text('II. Isian Singkat', margin.left, y);
                y += 6;
                pdf.setFont('helvetica', 'normal');
                generatedData.isian.forEach((q, i) => {
                    if (y > 280) { pdf.addPage(); y = margin.top + 10; }
                    const ansLines = pdf.splitTextToSize(`${i+1}. ${q.answer}`, contentWidth);
                    pdf.text(ansLines, margin.left, y);
                    y += (ansLines.length * 5);
                });
                y += 10;
            }

            if (generatedData.uraian.length > 0) {
                pdf.setFont('helvetica', 'bold');
                pdf.text('III. Uraian', margin.left, y);
                y += 6;
                pdf.setFont('helvetica', 'normal');
                generatedData.uraian.forEach((q, i) => {
                    if (y > 280) { pdf.addPage(); y = margin.top + 10; }
                    const ansLines = pdf.splitTextToSize(`${i+1}. ${q.answer}`, contentWidth);
                    pdf.text(ansLines, margin.left, y);
                    y += (ansLines.length * 5) + 2;
                });
            }

            pdf.save(`BankSoal-${selectedSubjectName.replace(/[\s/]/g, '_')}-${selectedMaterial.substring(0, 20)}.pdf`);
            setNotification({ message: 'PDF berhasil diunduh.', type: 'success' });

        } catch (e) {
            console.error(e);
            setNotification({ message: 'Gagal membuat PDF.', type: 'error' });
        } finally {
            setIsGeneratingPDF(false);
        }
    };

    return (
        <div className="bg-white p-8 rounded-xl shadow-lg">
            {notification && <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
            
            {/* Header & Controls */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 pb-6 border-b">
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Semester</label>
                        <select value={selectedSemester} onChange={e => setSelectedSemester(e.target.value as any)} className="mt-1 block w-full p-2 border border-gray-300 rounded-md">
                            <option>Ganjil</option><option>Genap</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Mata Pelajaran</label>
                        <select value={selectedSubjectId} onChange={e => { setSelectedSubjectId(e.target.value); if(e.target.value==='seni-budaya-group') setActiveArtTab(masterArtSubjects[0]); }} className="mt-1 block w-full p-2 border border-gray-300 rounded-md">
                            {subjectsForDropdown.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                    {selectedSubjectId === 'seni-budaya-group' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Sub Mapel Seni</label>
                            <div className="flex space-x-2 mt-1">
                                {masterArtSubjects.map(art => (
                                    <button key={art} onClick={() => setActiveArtTab(art)} className={`px-2 py-1 text-xs rounded border ${activeArtTab === art ? 'bg-indigo-100 border-indigo-500 text-indigo-700' : 'bg-white text-gray-600'}`}>
                                        {art}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Materi (dari Prosem)</label>
                        {isLoading ? <p className="text-xs text-gray-500">Memuat materi...</p> : (
                            <select value={selectedMaterial} onChange={e => setSelectedMaterial(e.target.value)} className="mt-1 block w-full p-2 border border-gray-300 rounded-md">
                                {materialsList.length === 0 && <option value="">Tidak ada materi di Prosem</option>}
                                {materialsList.map((m, i) => <option key={i} value={m}>{m}</option>)}
                            </select>
                        )}
                    </div>
                </div>

                <div className="space-y-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <h3 className="font-bold text-gray-800">Konfigurasi Soal</h3>
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-700">Jml PG</label>
                            <input type="number" value={numPG} onChange={e => setNumPG(parseInt(e.target.value)||0)} className="w-full p-2 border rounded" min="0" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700">Jml Isian</label>
                            <input type="number" value={numIsian} onChange={e => setNumIsian(parseInt(e.target.value)||0)} className="w-full p-2 border rounded" min="0" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700">Jml Uraian</label>
                            <input type="number" value={numUraian} onChange={e => setNumUraian(parseInt(e.target.value)||0)} className="w-full p-2 border rounded" min="0" />
                        </div>
                    </div>
                    <button 
                        onClick={handleGenerate} 
                        disabled={isGenerating || !selectedMaterial}
                        className="w-full py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 flex justify-center items-center gap-2 disabled:bg-purple-300"
                    >
                        {isGenerating ? 'Memproses...' : <><SparklesIcon className="w-5 h-5"/> Generate Soal & Kunci (AI)</>}
                    </button>
                </div>
            </div>

            {/* Result Area */}
            {generatedData && (
                <div className="border rounded-lg overflow-hidden">
                    <div className="bg-gray-100 p-3 flex justify-between items-center border-b">
                        <div className="flex gap-4">
                            <button onClick={() => setActiveTab('soal')} className={`font-bold pb-1 ${activeTab === 'soal' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-600'}`}>Soal</button>
                            <button onClick={() => setActiveTab('kunci')} className={`font-bold pb-1 ${activeTab === 'kunci' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-600'}`}>Kunci Jawaban</button>
                        </div>
                        <button onClick={handleDownloadPDF} disabled={isGeneratingPDF} className="px-3 py-1 bg-green-600 text-white rounded text-sm flex items-center gap-1 hover:bg-green-700 disabled:bg-green-400">
                            <ArrowDownTrayIcon className="w-4 h-4"/> Download PDF
                        </button>
                    </div>
                    
                    <div className="p-6 bg-white min-h-[400px] overflow-y-auto max-h-[600px]">
                        {activeTab === 'soal' ? (
                            <div className="space-y-6">
                                {generatedData.pg.length > 0 && (
                                    <div>
                                        <h4 className="font-bold mb-2">I. Pilihan Ganda</h4>
                                        {generatedData.pg.map((q, i) => (
                                            <div key={i} className="mb-3 text-sm">
                                                <p>{i+1}. {q.question}</p>
                                                <ul className="pl-4 mt-1 space-y-1">
                                                    {q.options?.map((opt, oi) => <li key={oi}>{opt}</li>)}
                                                </ul>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {generatedData.isian.length > 0 && (
                                    <div>
                                        <h4 className="font-bold mb-2">II. Isian Singkat</h4>
                                        {generatedData.isian.map((q, i) => (
                                            <div key={i} className="mb-2 text-sm"><p>{i+1}. {q.question}</p></div>
                                        ))}
                                    </div>
                                )}
                                {generatedData.uraian.length > 0 && (
                                    <div>
                                        <h4 className="font-bold mb-2">III. Uraian</h4>
                                        {generatedData.uraian.map((q, i) => (
                                            <div key={i} className="mb-2 text-sm"><p>{i+1}. {q.question}</p></div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {generatedData.pg.length > 0 && (
                                    <div>
                                        <h4 className="font-bold mb-2">Kunci Jawaban Pilihan Ganda</h4>
                                        <div className="grid grid-cols-5 gap-2 text-sm">
                                            {generatedData.pg.map((q, i) => (
                                                <div key={i}>{i+1}. {q.answer}</div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {generatedData.isian.length > 0 && (
                                    <div>
                                        <h4 className="font-bold mb-2">Kunci Jawaban Isian</h4>
                                        <ul className="list-decimal pl-5 text-sm space-y-1">
                                            {generatedData.isian.map((q, i) => <li key={i}>{q.answer}</li>)}
                                        </ul>
                                    </div>
                                )}
                                {generatedData.uraian.length > 0 && (
                                    <div>
                                        <h4 className="font-bold mb-2">Kunci Jawaban Uraian</h4>
                                        <ul className="list-decimal pl-5 text-sm space-y-2">
                                            {generatedData.uraian.map((q, i) => <li key={i}>{q.answer}</li>)}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default BankSoal;
