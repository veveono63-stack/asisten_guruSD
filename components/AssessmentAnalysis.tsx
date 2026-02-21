
import React, { useState, useEffect, useMemo } from 'react';
import { Student, SchoolIdentity, Teacher, Subject, LearningOutcomeElement } from '../types';
import { getStudents, getSchoolIdentity, getTeacherProfile, getSubjects, getLearningObjectives } from '../services/adminService';
import Notification, { NotificationType } from './Notification';
import { ArrowDownTrayIcon, PrinterIcon } from './Icons';

import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

interface AssessmentAnalysisProps {
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

const AssessmentAnalysis: React.FC<AssessmentAnalysisProps> = ({ selectedClass, selectedYear, userId }) => {
    const [students, setStudents] = useState<Student[]>([]);
    const [schoolIdentity, setSchoolIdentity] = useState<SchoolIdentity | null>(null);
    const [teacher, setTeacher] = useState<Teacher | null>(null);
    const [subjectsForDropdown, setSubjectsForDropdown] = useState<{id: string, name: string}[]>([]);
    const [tpList, setTpList] = useState<{id: string, text: string}[]>([]);
    
    const [selectedSemester, setSelectedSemester] = useState<'Ganjil' | 'Genap'>('Ganjil');
    const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
    const [activeArtTab, setActiveArtTab] = useState<string>(masterArtSubjects[0]);
    const [selectedTp, setSelectedTp] = useState<string>('');
    
    const [isLoading, setIsLoading] = useState(true);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    const [notification, setNotification] = useState<{ message: string; type: NotificationType } | null>(null);
    const [signatureDate, setSignatureDate] = useState(new Date().toISOString().split('T')[0]);

    useEffect(() => {
        const fetchMeta = async () => {
            setIsLoading(true);
            try {
                // SINKRONISASI: Mengambil data dari database guru jika userId tersedia
                const [fetchedSubjects, identity, teacherData, studentsData] = await Promise.all([
                    getSubjects(selectedYear, selectedClass, userId),
                    getSchoolIdentity(userId),
                    getTeacherProfile(selectedYear, selectedClass, userId),
                    getStudents(selectedYear, selectedClass, userId)
                ]);
                
                setStudents(studentsData.filter(s => s.fullName));
                setSchoolIdentity(identity);
                setTeacher(teacherData);

                const regularSubjectsMap = new Map<string, { id: string; name: string }>();
                fetchedSubjects.forEach(s => {
                    if (!s.name.toLowerCase().startsWith('seni')) {
                        if (!regularSubjectsMap.has(s.name)) {
                            regularSubjectsMap.set(s.name, { id: s.id, name: s.name });
                        }
                    }
                });
                let dropdownList = Array.from(regularSubjectsMap.values());
                if (fetchedSubjects.some(s => s.name.toLowerCase().startsWith('seni'))) {
                    dropdownList.push({ id: 'seni-budaya-group', name: 'Seni Budaya' });
                }

                const sortedDropdown = dropdownList.sort((a, b) => getSortIndex(a.name) - getSortIndex(b.name));
                
                setSubjectsForDropdown(sortedDropdown);
                if (sortedDropdown.length > 0) setSelectedSubjectId(sortedDropdown[0].id);

            } catch (error: any) {
                setNotification({ message: 'Gagal memuat mata pelajaran.', type: 'error' });
            } finally {
                setIsLoading(false);
            }
        };
        fetchMeta();
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

        const fetchTP = async () => {
            try {
                // SINKRONISASI: Pointing ke database guru
                const tpData = await getLearningObjectives(selectedYear, selectedClass, finalSubjectIdForApi, userId);
                const flattenedTps: {id: string, text: string}[] = [];
                
                if (tpData && tpData.elements) {
                    tpData.elements.forEach(el => {
                        if (el.outcomes) {
                            el.outcomes.forEach(out => {
                                if (out.objectives) {
                                    out.objectives.forEach(obj => {
                                        if (obj.text.trim()) {
                                            flattenedTps.push({ id: obj.id, text: obj.text });
                                        }
                                    });
                                }
                            });
                        }
                    });
                }
                
                setTpList(flattenedTps);
                if (flattenedTps.length > 0) setSelectedTp(flattenedTps[0].text);
                else setSelectedTp('');
            } catch (error) {
                console.error("Gagal sinkronisasi TP:", error);
                setTpList([]);
                setSelectedTp('');
            }
        };
        fetchTP();
    }, [finalSubjectIdForApi, selectedClass, selectedYear, userId]);

    const handleDownloadPDF = async () => {
        if (!schoolIdentity || !teacher) {
            setNotification({ message: 'Identitas sekolah belum lengkap.', type: 'error' });
            return;
        }

        setIsGeneratingPDF(true);
        setNotification({ message: 'Mempersiapkan PDF...', type: 'info' });
        await new Promise(r => setTimeout(r, 100));

        try {
            const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [330, 215] });
            
            const margin = { top: 15, left: 20, right: 10, bottom: 15 };
            const pageWidth = 330;
            let y = margin.top;

            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(14);
            pdf.text("ANALISIS HASIL PENILAIAN SUMATIF", pageWidth / 2, y, { align: 'center' });
            y += 7;
            pdf.setFontSize(12);
            pdf.text(schoolIdentity.schoolName.toUpperCase(), pageWidth / 2, y, { align: 'center' });
            y += 10;

            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'normal');
            pdf.text(`Mata Pelajaran : ${selectedSubjectName}`, margin.left, y);
            pdf.text(`Kelas / Semester : ${selectedClass.replace('Kelas ', '')} / ${selectedSemester}`, pageWidth - margin.right, y, { align: 'right' });
            y += 5;
            
            const tpLines = pdf.splitTextToSize(`Tujuan Pembelajaran : ${selectedTp || '-'}`, 180);
            pdf.text(tpLines, margin.left, y);
            pdf.text(`Tahun Pelajaran : ${selectedYear}`, pageWidth - margin.right, y, { align: 'right' });
            y += (tpLines.length * 5) + 3;

            const head = [
                [
                    { content: 'No', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
                    { content: 'Nama Siswa', rowSpan: 2, styles: { valign: 'middle' } },
                    { content: 'Skor Perolehan Per Nomor Soal', colSpan: 10, styles: { halign: 'center' } },
                    { content: 'Jml\nSkor', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
                    { content: 'Nilai\nAkhir', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
                    { content: 'Ketuntasan', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
                ],
                ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']
            ];

            const sortedStudents = [...students].sort((a, b) => a.fullName.localeCompare(b.fullName));
            const body = sortedStudents.map((s, i) => [
                i + 1,
                s.fullName,
                '', '', '', '', '', '', '', '', '', '', 
                '', '', ''
            ]);

            body.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
            body.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);

            (pdf as any).autoTable({
                head, body, startY: y, theme: 'grid',
                styles: { fontSize: 8, cellPadding: 1.5, lineColor: 0, lineWidth: 0.1, textColor: 0 },
                headStyles: { fillColor: [240, 240, 240], fontStyle: 'bold', halign: 'center' },
                columnStyles: {
                    0: { cellWidth: 10, halign: 'center' },
                    1: { cellWidth: 60 },
                    12: { cellWidth: 15 },
                    13: { cellWidth: 15 },
                    14: { cellWidth: 25 },
                },
                margin: { left: margin.left, right: margin.right }
            });

            y = (pdf as any).lastAutoTable.finalY + 10;
            pdf.setFontSize(9);
            pdf.text("Keterangan: Skor Maksimal Per Soal: ..........", margin.left, y);
            y += 5;
            pdf.text("Statistik: Rata-rata: ..........  Tertinggi: ..........  Terendah: ..........  % Ketuntasan: ..........", margin.left, y);
            y += 15;

            const principalX = margin.left + 40;
            const teacherX = pageWidth - margin.right - 60;
            const formattedDate = new Date(signatureDate + 'T00:00:00Z').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

            if (y + 35 > 215) { pdf.addPage(); y = 20; }

            pdf.text('Mengetahui,', principalX, y, { align: 'center' });
            pdf.text(`${schoolIdentity.city || '.......'}, ${formattedDate}`, teacherX, y, { align: 'center' });
            y += 5;
            pdf.text('Kepala Sekolah', principalX, y, { align: 'center' });
            pdf.text(`Guru Kelas ${selectedClass.replace('Kelas ', '')}`, teacherX, y, { align: 'center' });
            y += 20;

            pdf.setFont('helvetica', 'bold');
            pdf.text(schoolIdentity.principalName, principalX, y, { align: 'center' });
            pdf.text(teacher.fullName, teacherX, y, { align: 'center' });
            y += 5;
            pdf.setFont('helvetica', 'normal');
            pdf.text(`NIP. ${schoolIdentity.principalNip}`, principalX, y, { align: 'center' });
            pdf.text(`NIP. ${teacher.nip}`, teacherX, y, { align: 'center' });

            pdf.save(`Analisis-${selectedSubjectName}.pdf`);
            setNotification({ message: 'PDF Berhasil didownload.', type: 'success' });
        } catch (e) {
            setNotification({ message: 'Gagal membuat PDF.', type: 'error' });
        } finally {
            setIsGeneratingPDF(false);
        }
    };

    if (isLoading) return <div className="text-center p-10">Memuat format analisis...</div>;

    return (
        <div className="bg-white p-8 rounded-xl shadow-lg">
            {notification && <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
            
            <div className="flex flex-col gap-6 mb-8 border-b pb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Mata Pelajaran</label>
                            <select 
                                value={selectedSubjectId} 
                                onChange={(e) => setSelectedSubjectId(e.target.value)}
                                className="w-full p-2 border rounded-md text-sm bg-gray-50 focus:ring-2 focus:ring-indigo-500"
                                disabled={isGeneratingPDF}
                            >
                                {subjectsForDropdown.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div className="w-32">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Semester</label>
                            <select 
                                value={selectedSemester} 
                                onChange={(e) => setSelectedSemester(e.target.value as any)}
                                className="w-full p-2 border rounded-md text-sm bg-gray-50 focus:ring-2 focus:ring-indigo-500"
                                disabled={isGeneratingPDF}
                            >
                                <option>Ganjil</option>
                                <option>Genap</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tujuan Pembelajaran (TP)</label>
                        <select 
                            value={selectedTp} 
                            onChange={(e) => setSelectedTp(e.target.value)}
                            className="w-full p-2 border rounded-md text-sm bg-gray-50 focus:ring-2 focus:ring-indigo-500"
                            disabled={isGeneratingPDF}
                        >
                            {tpList.length === 0 ? (
                                <option value="">-- List TP Masih Kosong (Isi menu TP dulu) --</option>
                            ) : (
                                tpList.map((tp, i) => <option key={i} value={tp.text}>{tp.text}</option>)
                            )}
                        </select>
                    </div>
                </div>

                {selectedSubjectId === 'seni-budaya-group' && (
                    <div className="flex space-x-2 p-1 bg-gray-100 rounded-lg w-fit">
                        {masterArtSubjects.map(art => (
                            <button
                                key={art}
                                onClick={() => setActiveArtTab(art)}
                                className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${activeArtTab === art ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                {art}
                            </button>
                        ))}
                    </div>
                )}

                <div className="flex justify-between items-end">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tanggal Cetak</label>
                        <input type="date" value={signatureDate} onChange={e => setSignatureDate(e.target.value)} className="p-1.5 border rounded text-sm" />
                    </div>
                    <button 
                        onClick={handleDownloadPDF} 
                        disabled={isGeneratingPDF}
                        className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold shadow-md transition-all disabled:bg-gray-400"
                    >
                        {isGeneratingPDF ? 'Memproses...' : <><ArrowDownTrayIcon className="w-5 h-5"/> Download Format (F4)</>}
                    </button>
                </div>
            </div>

            <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 overflow-x-auto">
                <div className="min-w-[900px] text-center mb-6">
                    <h2 className="text-xl font-bold text-gray-800 uppercase underline">PRATINJAU FORMAT ANALISIS</h2>
                    <div className="mt-2 text-sm text-gray-600 space-y-1">
                        <p><strong>Mata Pelajaran:</strong> {selectedSubjectName}</p>
                        <p className="truncate max-w-2xl mx-auto"><strong>TP Terpilih:</strong> {selectedTp || '-'}</p>
                    </div>
                </div>
                
                <table className="w-full border-collapse border border-gray-400 text-[10px] bg-white">
                    <thead className="bg-gray-100 text-center font-bold">
                        <tr>
                            <th className="border border-gray-400 p-2 w-8" rowSpan={2}>NO</th>
                            <th className="border border-gray-400 p-2 text-left" rowSpan={2}>NAMA SISWA</th>
                            <th className="border border-gray-400 p-1" colSpan={10}>SKOR BUTIR SOAL</th>
                            <th className="border border-gray-400 p-1 w-12" rowSpan={2}>JML</th>
                            <th className="border border-gray-400 p-1 w-12" rowSpan={2}>NILAI</th>
                            <th className="border border-gray-400 p-1 w-20" rowSpan={2}>KETUNTASAN</th>
                        </tr>
                        <tr>
                            {[1,2,3,4,5,6,7,8,9,10].map(n => <th key={n} className="border border-gray-400 p-1 w-6">{n}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {students.map((s, i) => (
                            <tr key={i}>
                                <td className="border border-gray-400 p-2 text-center">{i+1}</td>
                                <td className="border border-gray-400 p-2">{s.fullName}</td>
                                {[...Array(10)].map((_, j) => <td key={j} className="border border-gray-400 bg-gray-50"></td>)}
                                <td className="border border-gray-400"></td>
                                <td className="border border-gray-400"></td>
                                <td className="border border-gray-400"></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AssessmentAnalysis;
