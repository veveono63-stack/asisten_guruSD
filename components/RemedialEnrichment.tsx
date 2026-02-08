
import React, { useState, useEffect, useMemo } from 'react';
import { getSubjects, getProsem, getSchoolIdentity, getTeacherProfile } from '../services/adminService';
import { SchoolIdentity, Teacher } from '../types';
import Notification, { NotificationType } from './Notification';
import { generateContentWithRotation } from '../services/geminiService';
import { Type } from '@google/genai';
import { SparklesIcon, ArrowDownTrayIcon, PrinterIcon } from './Icons';

/* COMMENT: Added missing jspdf declaration */
declare const jspdf: any;

interface RemedialEnrichmentProps {
    selectedClass: string;
    selectedYear: string;
    userId?: string;
}

interface RemedialContent {
    summary: string;
    questions: { question: string; answer: string }[];
}

interface EnrichmentContent {
    description: string;
    tasks: string[];
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

/* COMMENT: Added missing constant masterArtSubjects to fix error on line 53 */
const masterArtSubjects = ['Seni Rupa', 'Seni Musik', 'Seni Tari', 'Seni Teater'];

const getSortIndex = (subjectName: string): number => {
    const lowerName = subjectName.toLowerCase();
    if (lowerName.startsWith('seni')) return subjectSortOrder.indexOf('seni budaya');
    if (lowerName.startsWith('bahasa inggris')) return subjectSortOrder.indexOf('bahasa inggris');
    const index = subjectSortOrder.indexOf(lowerName);
    return index === -1 ? 99 : index;
};

const RemedialEnrichment: React.FC<RemedialEnrichmentProps> = ({ selectedClass, selectedYear, userId }) => {
    const [subjectsForDropdown, setSubjectsForDropdown] = useState<{ id: string, name: string }[]>([]);
    const [selectedSubjectId, setSelectedSubjectId] = useState('');
    const [activeArtTab, setActiveArtTab] = useState<string>(masterArtSubjects[0]);
    const [selectedSemester, setSelectedSemester] = useState<'Ganjil' | 'Genap'>('Ganjil');
    const [selectedMaterial, setSelectedMaterial] = useState<string>('');
    const [materialsList, setMaterialsList] = useState<string[]>([]);
    
    const [remedialData, setRemedialData] = useState<RemedialContent | null>(null);
    const [enrichmentData, setEnrichmentData] = useState<EnrichmentContent | null>(null);
    const [schoolIdentity, setSchoolIdentity] = useState<SchoolIdentity | null>(null);
    const [teacher, setTeacher] = useState<Teacher | null>(null);

    const [isLoading, setIsLoading] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    const [notification, setNotification] = useState<{ message: string; type: NotificationType } | null>(null);
    const [signatureDate, setSignatureDate] = useState(new Date().toISOString().split('T')[0]);

    useEffect(() => {
        const fetchInitial = async () => {
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
                        if (!regularSubjectsMap.has(s.name)) {
                            regularSubjectsMap.set(s.name, { id: s.code.toLowerCase(), name: s.name });
                        }
                    }
                });
                let dropdownSubjects = Array.from(regularSubjectsMap.values());
                if (fetchedSubjects.some(s => s.name.toLowerCase().startsWith('seni'))) {
                    dropdownSubjects.push({ id: 'seni-budaya-group', name: 'Seni Budaya' });
                }

                const sortedDropdown = dropdownSubjects.sort((a, b) => getSortIndex(a.name) - getSortIndex(b.name));

                setSubjectsForDropdown(sortedDropdown);
                if (sortedDropdown.length > 0) setSelectedSubjectId(sortedDropdown[0].id);
            } catch (e: any) { setNotification({ message: e.message, type: 'error' }); } 
            finally { setIsLoading(false); }
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
    }, [selectedSubjectId, subjectsForDropdown, activeArtTab]);

    useEffect(() => {
        if (!finalSubjectIdForApi) return;
        const fetchMaterials = async () => {
            setIsLoading(true);
            try {
                // SINKRONISASI: Pointing ke database guru
                const prosemData = await getProsem(selectedYear, selectedClass, finalSubjectIdForApi, selectedSemester, userId);
                const uniqueMaterials = Array.from(new Set(prosemData.rows.map(r => r.materi).filter(Boolean)));
                setMaterialsList(uniqueMaterials);
                if (uniqueMaterials.length > 0) setSelectedMaterial(uniqueMaterials[0]);
                else setSelectedMaterial('');
            } catch (error) {
                setMaterialsList([]);
            } finally {
                setIsLoading(false);
            }
        };
        fetchMaterials();
    }, [finalSubjectIdForApi, selectedSemester, selectedClass, selectedYear, userId]);

    const handleGenerate = async () => {
        if (!selectedMaterial) {
            setNotification({ message: 'Pilih materi terlebih dahulu.', type: 'error' });
            return;
        }
        setIsGenerating(true);
        setNotification({ message: 'AI sedang menyusun materi perbaikan dan pengayaan...', type: 'info' });

        try {
            const prompt = `
                Anda adalah guru SD profesional. Buatkan konten Program Remedial dan Pengayaan untuk:
                Kelas: ${selectedClass}, Mata Pelajaran: ${selectedSubjectName}, Materi: ${selectedMaterial}, Semester: ${selectedSemester}.

                Instruksi:
                1. Program Remedial: Fokus pada materi dasar. Berikan ringkasan materi (maks 150 kata) dan 5 soal latihan tingkat dasar.
                2. Program Pengayaan: Fokus pada pendalaman materi (HOTS). Berikan materi tambahan singkat (maks 150 kata) dan 3 tugas proyek singkat.
                3. Gunakan Bahasa Indonesia yang ramah anak SD.
                4. Pastikan konten ringkas agar muat dalam satu halaman F4 jika memungkinkan.

                Output JSON:
                {
                  "remedial": {
                    "summary": "Teks ringkasan...",
                    "questions": [ { "question": "...", "answer": "..." } ]
                  },
                  "enrichment": {
                    "description": "Teks materi pengayaan...",
                    "tasks": ["..."]
                  }
                }
            `;

            const response = await generateContentWithRotation({
                model: 'gemini-3-flash-preview',
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            remedial: {
                                type: Type.OBJECT,
                                properties: {
                                    summary: { type: Type.STRING },
                                    questions: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { question: { type: Type.STRING }, answer: { type: Type.STRING } } } }
                                }
                            },
                            enrichment: {
                                type: Type.OBJECT,
                                properties: {
                                    description: { type: Type.STRING },
                                    tasks: { type: Type.ARRAY, items: { type: Type.STRING } }
                                }
                            }
                        }
                    }
                }
            });

            const result = JSON.parse(response.text.trim());
            setRemedialData(result.remedial);
            setEnrichmentData(result.enrichment);
            setNotification({ message: 'Program Remedial & Pengayaan berhasil dibuat!', type: 'success' });

        } catch (e: any) {
            setNotification({ message: 'Gagal generate: ' + e.message, type: 'error' });
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDownloadCombinedPDF = async () => {
        if (!schoolIdentity || !teacher || !remedialData || !enrichmentData) {
            setNotification({ message: 'Data belum lengkap.', type: 'error' });
            return;
        }

        setIsGeneratingPDF(true);
        setNotification({ message: 'Mempersiapkan PDF Gabungan (F4)...', type: 'info' });
        await new Promise(r => setTimeout(r, 100));

        try {
            const { jsPDF } = jspdf;
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [215, 330] }); // F4
            const margin = { top: 15, left: 25, right: 15, bottom: 20 };
            const pageWidth = 215;
            const contentWidth = pageWidth - margin.left - margin.right;
            let y = margin.top;

            // HEADER
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(14);
            pdf.text('PROGRAM REMEDIAL DAN PENGAYAAN', pageWidth / 2, y, { align: 'center' });
            y += 7;
            pdf.setFontSize(12);
            pdf.text(schoolIdentity.schoolName.toUpperCase(), pageWidth / 2, y, { align: 'center' });
            y += 10;

            // INFO BARIS
            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'normal');
            pdf.text(`Mata Pelajaran : ${selectedSubjectName}`, margin.left, y);
            pdf.text(`Kelas / Semester : ${selectedClass.replace('Kelas ', '')} / ${selectedSemester}`, pageWidth - margin.right, y, { align: 'right' });
            y += 5;
            pdf.text(`Materi : ${selectedMaterial}`, margin.left, y);
            pdf.text(`Tahun Ajaran : ${selectedYear}`, pageWidth - margin.right, y, { align: 'right' });
            y += 8;
            pdf.setLineWidth(0.3);
            pdf.line(margin.left, y, pageWidth - margin.right, y);
            y += 10;

            // BAGIAN I: REMEDIAL
            pdf.setFont('helvetica', 'bold');
            pdf.setFillColor(240, 248, 255); // Light Blue
            pdf.rect(margin.left, y - 5, contentWidth, 7, 'F');
            pdf.text("I. PROGRAM REMEDIAL (PERBAIKAN)", margin.left + 2, y);
            y += 8;

            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(9);
            pdf.text("A. Ringkasan Materi Esensial", margin.left, y);
            y += 5;
            pdf.setFont('helvetica', 'normal');
            const summaryLines = pdf.splitTextToSize(remedialData.summary, contentWidth);
            pdf.text(summaryLines, margin.left, y);
            y += (summaryLines.length * 5) + 5;

            pdf.setFont('helvetica', 'bold');
            pdf.text("B. Soal Latihan Dasar", margin.left, y);
            y += 5;
            pdf.setFont('helvetica', 'normal');
            remedialData.questions.forEach((q, i) => {
                const qLines = pdf.splitTextToSize(`${i+1}. ${q.question}`, contentWidth);
                if (y + (qLines.length * 5) > 310) { pdf.addPage(); y = 20; }
                pdf.text(qLines, margin.left, y);
                y += (qLines.length * 5) + 2;
            });
            y += 10;

            // BAGIAN II: PENGAYAAN
            if (y > 280) { pdf.addPage(); y = 20; }
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(10);
            pdf.setFillColor(240, 255, 240); // Light Green
            pdf.rect(margin.left, y - 5, contentWidth, 7, 'F');
            pdf.text("II. PROGRAM PENGAYAAN (PENGEMBANGAN)", margin.left + 2, y);
            y += 8;

            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(9);
            pdf.text("A. Materi Pendalaman", margin.left, y);
            y += 5;
            pdf.setFont('helvetica', 'normal');
            const descLines = pdf.splitTextToSize(enrichmentData.description, contentWidth);
            pdf.text(descLines, margin.left, y);
            y += (descLines.length * 5) + 5;

            pdf.setFont('helvetica', 'bold');
            pdf.text("B. Tugas / Proyek Mandiri", margin.left, y);
            y += 5;
            pdf.setFont('helvetica', 'normal');
            enrichmentData.tasks.forEach((t, i) => {
                const tLines = pdf.splitTextToSize(`${i+1}. ${t}`, contentWidth);
                if (y + (tLines.length * 5) > 310) { pdf.addPage(); y = 20; }
                pdf.text(tLines, margin.left, y);
                y += (tLines.length * 5) + 2;
            });

            const sigY = Math.max(y + 20, 330 - margin.bottom - 40);
            if (sigY + 40 > 330) { pdf.addPage(); y = 20; } else { y = sigY; }

            const sigX = pageWidth - margin.right - 50;
            const formattedDate = new Date(signatureDate + 'T00:00:00Z').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
            
            pdf.setFontSize(10);
            pdf.text(`${schoolIdentity.city || 'Kota'}, ${formattedDate}`, sigX, y, { align: 'center' });
            y += 5;
            pdf.text(`Guru Kelas ${selectedClass.replace('Kelas ', '')}`, sigX, y, { align: 'center' });
            y += 25;
            pdf.setFont('helvetica', 'bold');
            pdf.text(teacher.fullName, sigX, y, { align: 'center' });
            y += 5;
            pdf.setFont('helvetica', 'normal');
            pdf.text(`NIP. ${teacher.nip}`, sigX, y, { align: 'center' });

            pdf.save(`Remedial-Pengayaan-${selectedSubjectName}-${selectedMaterial.substring(0, 15)}.pdf`);
            setNotification({ message: 'PDF Gabungan berhasil didownload.', type: 'success' });
        } catch (e: any) {
            setNotification({ message: 'Gagal membuat PDF: ' + e.message, type: 'error' });
        } finally {
            setIsGeneratingPDF(false);
        }
    };

    if (isLoading) return <div className="text-center p-10">Memuat data referensi...</div>;

    return (
        <div className="bg-white p-8 rounded-xl shadow-lg">
            {notification && <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 pb-8 border-b">
                <div className="lg:col-span-2 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Mata Pelajaran</label>
                            <select value={selectedSubjectId} onChange={e => setSelectedSubjectId(e.target.value)} className="w-full p-2.5 border rounded-md text-sm bg-gray-50">
                                {subjectsForDropdown.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Semester</label>
                            <select value={selectedSemester} onChange={e => setSelectedSemester(e.target.value as any)} className="w-full p-2.5 border rounded-md text-sm bg-gray-50">
                                <option>Ganjil</option><option>Genap</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Materi</label>
                        <select value={selectedMaterial} onChange={e => setSelectedMaterial(e.target.value)} className="w-full p-2.5 border rounded-md text-sm bg-gray-50">
                            {materialsList.length === 0 ? <option value="">-- Isi Prosem Terlebih Dahulu --</option> : 
                             materialsList.map((m, i) => <option key={i} value={m}>{m}</option>)}
                        </select>
                    </div>
                    <div className="flex items-center gap-3">
                        <label className="text-xs font-bold text-gray-500 uppercase">Tgl Cetak:</label>
                        <input type="date" value={signatureDate} onChange={e => setSignatureDate(e.target.value)} className="p-1.5 border rounded text-sm" />
                    </div>
                </div>

                <div className="bg-indigo-50 p-6 rounded-xl border border-indigo-100 flex flex-col justify-center">
                    <h4 className="font-bold text-indigo-800 mb-2 flex items-center gap-2">
                        <SparklesIcon className="w-5 h-5"/> Pembuat Program Otomatis
                    </h4>
                    <p className="text-xs text-indigo-600 mb-4 leading-relaxed">AI akan merancang program perbaikan dan pengayaan secara instan dalam satu dokumen.</p>
                    <button 
                        onClick={handleGenerate} 
                        disabled={isGenerating || !selectedMaterial}
                        className="w-full py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex justify-center items-center gap-2 font-bold shadow-lg transition-all disabled:bg-indigo-300"
                    >
                        {isGenerating ? 'Sedang Memproses...' : 'Generate Program'}
                    </button>
                </div>
            </div>

            {remedialData && enrichmentData && (
                <div className="space-y-6 animate-fade-in">
                    <div className="flex justify-between items-center bg-gray-100 p-4 rounded-xl border">
                        <h3 className="font-bold text-gray-700">Hasil Penyusunan Program</h3>
                        <button 
                            onClick={handleDownloadCombinedPDF} 
                            disabled={isGeneratingPDF}
                            className="px-6 py-2 bg-green-600 text-white rounded-lg font-bold flex items-center gap-2 hover:bg-green-700 shadow-md transition-all disabled:bg-gray-400"
                        >
                            {isGeneratingPDF ? 'Memproses PDF...' : <><ArrowDownTrayIcon className="w-5 h-5"/> Download PDF Gabungan (F4)</>}
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white border-2 border-blue-100 rounded-2xl overflow-hidden shadow-sm">
                            <div className="bg-blue-600 px-6 py-3 text-white font-bold flex items-center gap-2">
                                <span className="bg-white text-blue-600 w-6 h-6 rounded-full flex items-center justify-center text-xs">1</span>
                                REMEDIAL
                            </div>
                            <div className="p-6 space-y-4">
                                <div className="bg-blue-50 p-4 rounded-lg">
                                    <h4 className="text-xs font-bold text-blue-800 mb-2 uppercase tracking-wider">Ringkasan Materi</h4>
                                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{remedialData.summary}</p>
                                </div>
                                <div>
                                    <h4 className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-wider">Contoh Soal Latihan</h4>
                                    <div className="space-y-3">
                                        {remedialData.questions.map((q, i) => (
                                            <div key={i} className="text-sm p-3 bg-gray-50 rounded-lg border border-gray-200">
                                                <p className="font-semibold text-gray-700">{i+1}. {q.question}</p>
                                                <p className="mt-1 text-xs text-blue-600 italic">Kunci: {q.answer}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white border-2 border-green-100 rounded-2xl overflow-hidden shadow-sm">
                            <div className="bg-green-600 px-6 py-3 text-white font-bold flex items-center gap-2">
                                <span className="bg-white text-green-600 w-6 h-6 rounded-full flex items-center justify-center text-xs">2</span>
                                PENGAYAAN
                            </div>
                            <div className="p-6 space-y-4">
                                <div className="bg-green-50 p-4 rounded-lg">
                                    <h4 className="text-xs font-bold text-green-800 mb-2 uppercase tracking-wider">Materi Pendalaman</h4>
                                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{enrichmentData.description}</p>
                                </div>
                                <div>
                                    <h4 className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-wider">Tugas / Proyek</h4>
                                    <div className="space-y-3">
                                        {enrichmentData.tasks.map((t, i) => (
                                            <div key={i} className="flex gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm">
                                                <span className="font-bold text-green-600">{i+1}.</span>
                                                <p className="text-gray-700">{t}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RemedialEnrichment;
