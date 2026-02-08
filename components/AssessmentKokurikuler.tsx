
import React, { useState, useEffect, useMemo } from 'react';
import { Student, SchoolIdentity, Teacher, KokurikulerTheme, KokurikulerActivity } from '../types';
import { getStudents, getSchoolIdentity, getTeacherProfile, getKokurikulerThemes, getKokurikulerActivities } from '../services/adminService';
import Notification, { NotificationType } from './Notification';
import { ArrowDownTrayIcon, PrinterIcon } from './Icons';

declare const jspdf: any;

interface AssessmentKokurikulerProps {
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

const getSortIndex = (subjectName: string): number => {
    const lowerName = subjectName.toLowerCase();
    if (lowerName.startsWith('seni')) return subjectSortOrder.indexOf('seni budaya');
    if (lowerName.startsWith('bahasa inggris')) return subjectSortOrder.indexOf('bahasa inggris');
    const index = subjectSortOrder.indexOf(lowerName);
    return index === -1 ? 99 : index;
};

const AssessmentKokurikuler: React.FC<AssessmentKokurikulerProps> = ({ selectedClass, selectedYear, userId }) => {
    const [students, setStudents] = useState<Student[]>([]);
    const [schoolIdentity, setSchoolIdentity] = useState<SchoolIdentity | null>(null);
    const [teacher, setTeacher] = useState<Teacher | null>(null);
    const [themes, setThemes] = useState<KokurikulerTheme[]>([]);
    const [activities, setActivities] = useState<KokurikulerActivity[]>([]);
    
    const [selectedSemester, setSelectedSemester] = useState<'Ganjil' | 'Genap'>('Ganjil');
    const [selectedThemeId, setSelectedThemeId] = useState<string>('');
    const [selectedActivityId, setSelectedActivityId] = useState<string>('');
    
    const [isLoading, setIsLoading] = useState(true);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    const [notification, setNotification] = useState<{ message: string; type: NotificationType } | null>(null);
    const [signatureDate, setSignatureDate] = useState(new Date().toISOString().split('T')[0]);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                // SINKRONISASI: Mengambil data dari database guru jika userId tersedia
                const [studentsData, identity, teacherData, themesData, activitiesData] = await Promise.all([
                    getStudents(selectedYear, selectedClass, userId),
                    getSchoolIdentity(userId),
                    getTeacherProfile(selectedYear, selectedClass, userId),
                    getKokurikulerThemes(selectedYear, selectedClass, selectedSemester, userId),
                    getKokurikulerActivities(selectedYear, selectedClass, selectedSemester, userId)
                ]);
                
                setStudents(studentsData.filter(s => s.fullName));
                setSchoolIdentity(identity);
                setTeacher(teacherData);
                
                const activeThemes = themesData.filter(t => t.status === 'aktif');
                setThemes(activeThemes);
                setActivities(activitiesData);

                if (activeThemes.length > 0) {
                    setSelectedThemeId(activeThemes[0].id);
                } else {
                    setSelectedThemeId('');
                }
            } catch (error: any) {
                setNotification({ message: 'Gagal memuat data: ' + error.message, type: 'error' });
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [selectedClass, selectedYear, selectedSemester, userId]);

    const filteredActivities = useMemo(() => {
        const filtered = activities.filter(a => a.themeId === selectedThemeId);
        if (filtered.length > 0 && !filtered.find(f => f.id === selectedActivityId)) {
            setSelectedActivityId(filtered[0].id);
        }
        return filtered;
    }, [selectedThemeId, activities]);

    const currentActivity = useMemo(() => {
        const act = activities.find(a => a.id === selectedActivityId);
        if (act && act.relatedSubjects) {
            act.relatedSubjects.sort((a, b) => getSortIndex(a) - getSortIndex(b));
        }
        return act;
    }, [selectedActivityId, activities]);

    const handleDownloadPDF = async () => {
        if (!schoolIdentity || !teacher || !currentActivity) {
            setNotification({ message: 'Data belum lengkap untuk mencetak.', type: 'error' });
            return;
        }

        setIsGeneratingPDF(true);
        setNotification({ message: 'Mempersiapkan PDF Portrait...', type: 'info' });
        await new Promise(r => setTimeout(r, 100));

        try {
            const { jsPDF } = jspdf;
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [215, 330] });
            
            const margin = { top: 15, left: 25, right: 10, bottom: 15 };
            const pageWidth = 215;
            const contentWidth = pageWidth - margin.left - margin.right;
            let y = margin.top;

            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(12);
            pdf.text(`PENILAIAN KOKURIKULER KELAS ${selectedClass.replace('Kelas ', '').toUpperCase()} ${schoolIdentity.schoolName.toUpperCase()}`, pageWidth / 2, y, { align: 'center' });
            y += 6;
            pdf.text(`SEMESTER ${selectedSemester.toUpperCase()} TAHUN AJARAN ${selectedYear}`, pageWidth / 2, y, { align: 'center' });
            y += 10;

            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'normal');
            pdf.text(`Tema : ${themes.find(t => t.id === selectedThemeId)?.name || '-'}`, margin.left, y);
            y += 5;
            pdf.text(`Kegiatan : ${currentActivity.name}`, margin.left, y);
            y += 8;

            const dims = currentActivity.dimensions;
            const head = [
                [
                    { content: 'No', rowSpan: 3, styles: { halign: 'center', valign: 'middle' } },
                    { content: 'Nama Siswa', rowSpan: 3, styles: { valign: 'middle' } },
                    { content: 'Capaian Dimensi Profil Lulusan', colSpan: dims.length * 3, styles: { halign: 'center' } },
                ],
                [], 
                [] 
            ];

            dims.forEach(d => {
                const shortName = d.name.length > 20 ? d.name.substring(0, 17) + '...' : d.name;
                (head[1] as any).push({ content: shortName, colSpan: 3, styles: { halign: 'center', fontSize: 7 } });
            });

            dims.forEach(() => {
                (head[2] as any).push({ content: 'M', styles: { halign: 'center', fontSize: 6, fillColor: [240, 248, 255] } });
                (head[2] as any).push({ content: 'C', styles: { halign: 'center', fontSize: 6, fillColor: [240, 255, 240] } });
                (head[2] as any).push({ content: 'B', styles: { halign: 'center', fontSize: 6, fillColor: [255, 250, 240] } });
            });

            const sortedStudents = [...students].sort((a, b) => a.fullName.localeCompare(b.fullName));
            const body = sortedStudents.map((s, i) => {
                const row = [i + 1, s.fullName];
                dims.forEach(() => row.push('', '', ''));
                return row;
            });

            const noWidth = 8;
            const nameWidth = 45;
            const remainingWidth = contentWidth - noWidth - nameWidth;
            const subColWidth = remainingWidth / (dims.length * 3);

            const columnStyles: any = {
                0: { cellWidth: noWidth, halign: 'center' },
                1: { cellWidth: nameWidth },
            };

            for (let i = 0; i < dims.length * 3; i++) {
                columnStyles[i + 2] = { cellWidth: subColWidth, halign: 'center' };
            }

            (pdf as any).autoTable({
                head: head,
                body: body,
                startY: y,
                theme: 'grid',
                styles: { fontSize: 8, cellPadding: 1.2, lineColor: 0, lineWidth: 0.1, textColor: 0 },
                headStyles: { fillColor: [255, 255, 255], fontStyle: 'bold', textColor: 0 },
                columnStyles: columnStyles,
                margin: { left: margin.left, right: margin.right }
            });

            y = (pdf as any).lastAutoTable.finalY + 8;
            pdf.setFontSize(8);
            pdf.text("Keterangan: M = Mahir, C = Cakap, B = Berkembang", margin.left, y);
            y += 15;

            const principalX = margin.left + 35;
            const teacherX = pageWidth - margin.right - 45;
            const formattedDate = new Date(signatureDate + 'T00:00:00Z').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

            if (y + 40 > 320) { pdf.addPage(); y = 20; }

            pdf.setFontSize(10);
            pdf.text('Mengetahui,', principalX, y, { align: 'center' });
            pdf.text(`${schoolIdentity.city || '.......'}, ${formattedDate}`, teacherX, y, { align: 'center' });
            y += 5;
            pdf.text('Kepala Sekolah', principalX, y, { align: 'center' });
            pdf.text(`Guru Kelas ${selectedClass.replace('Kelas ', '')}`, teacherX, y, { align: 'center' });
            y += 25;

            pdf.setFont('helvetica', 'bold');
            pdf.text(schoolIdentity.principalName, principalX, y, { align: 'center' });
            pdf.text(teacher.fullName, teacherX, y, { align: 'center' });
            y += 5;
            pdf.setFont('helvetica', 'normal');
            pdf.text(`NIP. ${schoolIdentity.principalNip}`, principalX, y, { align: 'center' });
            pdf.text(`NIP. ${teacher.nip}`, teacherX, y, { align: 'center' });

            pdf.save(`Penilaian-Kokurikuler-${selectedClass.replace(' ', '_')}.pdf`);
            setNotification({ message: 'PDF Portrait berhasil didownload.', type: 'success' });
        } catch (e) {
            console.error(e);
            setNotification({ message: 'Gagal membuat PDF.', type: 'error' });
        } finally {
            setIsGeneratingPDF(false);
        }
    };

    if (isLoading) return <div className="text-center p-10">Memuat data penilaian...</div>;

    return (
        <div className="bg-white p-8 rounded-xl shadow-lg">
            {notification && <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
            
            <div className="flex flex-col gap-6 mb-8 border-b pb-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Semester</label>
                        <select 
                            value={selectedSemester} 
                            onChange={(e) => setSelectedSemester(e.target.value as any)}
                            className="w-full p-2 border rounded-md text-sm bg-gray-50 focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="Ganjil">Ganjil</option>
                            <option value="Genap">Genap</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Pilih Tema</label>
                        <select 
                            value={selectedThemeId} 
                            onChange={(e) => setSelectedThemeId(e.target.value)}
                            className="w-full p-2 border rounded-md text-sm bg-gray-50 focus:ring-2 focus:ring-indigo-500"
                        >
                            {themes.length === 0 ? <option value="">-- Tidak ada tema aktif --</option> : 
                             themes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Pilih Kegiatan</label>
                        <select 
                            value={selectedActivityId} 
                            onChange={(e) => setSelectedActivityId(e.target.value)}
                            className="w-full p-2 border rounded-md text-sm bg-gray-50 focus:ring-2 focus:ring-indigo-500"
                        >
                            {filteredActivities.length === 0 ? <option value="">-- Tidak ada kegiatan --</option> : 
                             filteredActivities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                    </div>
                </div>

                <div className="flex justify-between items-end">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tanggal Cetak</label>
                        <input type="date" value={signatureDate} onChange={e => setSignatureDate(e.target.value)} className="p-1.5 border rounded text-sm" />
                    </div>
                    <button 
                        onClick={handleDownloadPDF} 
                        disabled={isGeneratingPDF || !currentActivity}
                        className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold shadow-md transition-all disabled:bg-gray-400"
                    >
                        {isGeneratingPDF ? 'Memproses...' : <><ArrowDownTrayIcon className="w-5 h-5"/> Download Portrait (F4)</>}
                    </button>
                </div>
            </div>

            {currentActivity ? (
                <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 overflow-x-auto">
                    <div className="min-w-[900px] text-center mb-6">
                        <h2 className="text-xl font-bold text-gray-800 uppercase">PENILAIAN KOKURIKULER KELAS {selectedClass.replace('Kelas ', '')} {schoolIdentity?.schoolName}</h2>
                        <h2 className="text-lg font-bold text-gray-700 uppercase">SEMESTER {selectedSemester.toUpperCase()} TAHUN AJARAN {selectedYear}</h2>
                    </div>
                    
                    <table className="w-full border-collapse border border-gray-400 text-[10px] bg-white">
                        <thead className="bg-gray-100 text-center font-bold">
                            <tr>
                                <th className="border border-gray-400 p-2 w-8" rowSpan={3}>NO</th>
                                <th className="border border-gray-400 p-2 text-left" rowSpan={3}>NAMA SISWA</th>
                                <th className="border border-gray-400 p-1" colSpan={currentActivity.dimensions.length * 3}>CAPAIAN DIMENSI PROFIL LULUSAN</th>
                            </tr>
                            <tr>
                                {currentActivity.dimensions.map((d, i) => (
                                    <th key={i} className="border border-gray-400 p-1" colSpan={3}>{d.name}</th>
                                ))}
                            </tr>
                            <tr>
                                {currentActivity.dimensions.map((_, i) => (
                                    <React.Fragment key={i}>
                                        <th className="border border-gray-400 p-1 w-6 bg-blue-50">M</th>
                                        <th className="border border-gray-400 p-1 w-6 bg-green-50">C</th>
                                        <th className="border border-gray-400 p-1 w-6 bg-yellow-50">B</th>
                                    </React.Fragment>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {students.map((s, i) => (
                                <tr key={i}>
                                    <td className="border border-gray-400 p-2 text-center">{i+1}</td>
                                    <td className="border border-gray-400 p-2">{s.fullName}</td>
                                    {currentActivity.dimensions.map((_, j) => (
                                        <React.Fragment key={j}>
                                            <td className="border border-gray-400 bg-white"></td>
                                            <td className="border border-gray-400 bg-white"></td>
                                            <td className="border border-gray-400 bg-white"></td>
                                        </React.Fragment>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="mt-4 text-[10px] text-gray-500 italic">
                        * M: Mahir, C: Cakap, B: Berkembang
                    </div>
                </div>
            ) : (
                <div className="text-center py-20 bg-gray-50 rounded-lg border-2 border-dashed text-gray-400">
                    Silakan lengkapi data Tema & Kegiatan di menu <strong>Program Kokurikuler</strong> terlebih dahulu.
                </div>
            )}
        </div>
    );
};

export default AssessmentKokurikuler;
